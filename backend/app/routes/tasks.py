import os
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import Task, TaskReport, TaskAttachment, ReportAttachment, Team, User
from app.utils import (
    get_scope, is_any_admin, is_admin_or_above, is_superadmin,
    dept_user_ids, div_user_ids, log_audit,
)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads')
ALLOWED_EXTENSIONS = {'doc', 'docx', 'xls', 'xlsx', 'pdf', 'txt', 'png', 'jpg', 'jpeg', 'zip', 'rar', 'pptx'}

tasks_bp = Blueprint('tasks', __name__)


def parse_datetime(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


def _scoped_tasks(role, dept_id, div_id, user_id):
    """Rol bo'yicha ko'rinadigan vazifalar (ro'yxat va statistika uchun umumiy).
       Bo'lim rahbari faqat o'z bo'limi, boshqarma rahbari faqat o'z boshqarmasi.
    """
    if is_superadmin(role):
        return Task.query.order_by(Task.created_at.desc()).all()
    if role == 'admin' and dept_id:
        uid_set = dept_user_ids(dept_id); uid_set.add(user_id)
    elif role == 'department_admin' and div_id:
        uid_set = div_user_ids(div_id); uid_set.add(user_id)
    else:
        user = User.query.get(user_id)
        team_ids = {t.id for t in user.teams} if user else set()
        return Task.query.filter(
            db.or_(
                Task.assignee_id == user_id,
                Task.assignees.any(User.id == user_id),
                Task.team_id.in_(team_ids) if team_ids else db.false(),
            )
        ).order_by(Task.created_at.desc()).all()
    return Task.query.filter(
        db.or_(
            Task.created_by.in_(uid_set),
            Task.assignee_id.in_(uid_set),
            Task.assignees.any(User.id.in_(uid_set)),
        )
    ).order_by(Task.created_at.desc()).all()


@tasks_bp.route('', methods=['GET'])
@jwt_required()
def get_tasks():
    user_id = int(get_jwt_identity())
    role, dept_id, div_id = get_scope(get_jwt())
    tasks = _scoped_tasks(role, dept_id, div_id, user_id)
    return jsonify([t.to_list_dict() for t in tasks])


@tasks_bp.route('', methods=['POST'])
@jwt_required()
def create_task():
    claims = get_jwt()
    if not is_any_admin(claims.get('role', '')):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    user_id = int(get_jwt_identity())

    import json
    is_multipart = request.content_type and 'multipart' in request.content_type
    if is_multipart:
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '')
        start_date = request.form.get('start_date')
        deadline = request.form.get('deadline')
        team_id = request.form.get('team_id')
        assignee_id = request.form.get('assignee_id')
        assignee_ids = json.loads(request.form.get('assignee_ids', '[]'))
        files = request.files.getlist('files')
    else:
        data = request.get_json()
        name = data.get('name', '').strip()
        description = data.get('description', '')
        start_date = data.get('start_date')
        deadline = data.get('deadline')
        team_id = data.get('team_id')
        assignee_id = data.get('assignee_id')
        assignee_ids = data.get('assignee_ids', [])
        files = []

    if not name:
        return jsonify({'error': 'Vazifa nomi kiritilishi shart'}), 400

    task = Task(
        name=name,
        description=description,
        start_date=parse_datetime(start_date) if start_date else None,
        deadline=parse_datetime(deadline) if deadline else None,
        team_id=int(team_id) if team_id else None,
        assignee_id=int(assignee_id) if assignee_id else None,
        created_by=user_id,
    )
    db.session.add(task)
    db.session.flush()

    for uid in assignee_ids:
        u = User.query.get(int(uid))
        if u:
            task.assignees.append(u)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    for f in files:
        if f and f.filename:
            ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
            if ext not in ALLOWED_EXTENSIONS:
                continue
            safe_name = f'{uuid.uuid4().hex}.{ext}'
            f.save(os.path.join(UPLOAD_DIR, safe_name))
            attachment = TaskAttachment(
                task_id=task.id,
                filename=safe_name,
                original_name=f.filename,
                file_size=os.path.getsize(os.path.join(UPLOAD_DIR, safe_name)),
            )
            db.session.add(attachment)

    db.session.commit()
    return jsonify(task.to_dict()), 201


@tasks_bp.route('/<int:task_id>', methods=['GET'])
@jwt_required()
def get_task(task_id):
    task = Task.query.get_or_404(task_id)
    return jsonify(task.to_dict())


@tasks_bp.route('/<int:task_id>', methods=['PUT'])
@jwt_required()
def update_task(task_id):
    task = Task.query.get_or_404(task_id)
    user_id = int(get_jwt_identity())
    claims = get_jwt()
    data = request.get_json()

    new_status = data.get('status')
    if new_status:
        # Ijrochi ekanini tekshiramiz (rol emas — chunki bo'lim rahbari ham
        # o'ziga yuklangan vazifani "bajardim" deb yuborishi mumkin)
        user = User.query.get(user_id)
        user_team_ids = {t.id for t in user.teams} if user else set()
        assignee_ids = {a.id for a in task.assignees}
        is_assignee = task.assignee_id == user_id or user_id in assignee_ids or (task.team_id in user_team_ids)
        is_admin = is_any_admin(claims.get('role', ''))

        if new_status == 'review':
            # Ijrochi (rahbar bo'lsa ham) "bajardim" deb yuboradi
            if not is_assignee:
                return jsonify({'error': 'Sizda bu vazifani bajarildi deb yuborish huquqi yo\'q'}), 403
            if not TaskReport.query.filter_by(task_id=task.id).first():
                return jsonify({'error': 'Avval hisobot topshiring'}), 400
        elif new_status in ('completed', 'returned'):
            # Faqat rahbar tasdiqlaydi/qaytaradi
            if not is_admin:
                return jsonify({'error': 'Faqat rahbar tasdiqlaydi'}), 403
            role_val = claims.get('role', '')
            # 'review' holatidan har qanday rahbar amal qiladi.
            # Tugallangan vazifani qaytarish faqat boshqarma rahbari va yuqori rollarga
            # ruxsat (bo'lim rahbari tasdiqlagan ishda kamchilik topsa qayta yuklaydi).
            if task.status == 'review':
                pass
            elif task.status == 'completed' and new_status == 'returned':
                if not is_admin_or_above(role_val):
                    return jsonify({'error': "Tugallangan vazifani qayta yuklash faqat boshqarma rahbari huquqi"}), 403
            else:
                return jsonify({'error': 'Bu holatda amal qilib bo\'lmaydi'}), 400
            if new_status == 'completed':
                task.completed_at = datetime.now(timezone.utc)
            else:
                task.completed_at = None
        else:
            # active/in_progress kabi holatlarga faqat rahbar (yoki o'zi ijrochi)
            if not is_admin and not is_assignee:
                return jsonify({'error': 'Ruxsat yo\'q'}), 403

        task.status = new_status

    if is_any_admin(claims.get('role', '')):
        if 'name' in data:
            task.name = data['name']
        if 'description' in data:
            task.description = data['description']

    db.session.commit()
    return jsonify(task.to_dict())


def _task_assignable_workers(role, dept_id, div_id):
    """Vazifani kimga yuklash mumkin — ierarxiya bo'yicha:
       - superadmin/direksiya: barcha faol xodimlar (user + dept_admin)
       - boshqarma rahbari (admin): o'z boshqarmasidagi bo'lim rahbarlari va user'lar
         (bevosita department_id yoki bo'lim orqali division.department_id ham hisoblanadi)
       - bo'lim rahbari (department_admin): o'z bo'limidagi xodimlar (user)
    """
    from app.models import Division
    q = User.query.filter(User.is_active == True, User.role.in_(['user', 'department_admin']))
    if role in ('superadmin', 'director', 'deputy_director'):
        pass  # hamma
    elif role == 'admin' and dept_id:
        # Boshqarma xodimlari: bevosita department_id yoki bo'lim orqali
        # (dept_admin ba'zan bevosita department_id ga biriktirilmagan, faqat division bor)
        div_ids = [d.id for d in Division.query.filter_by(department_id=dept_id).all()]
        cond = User.department_id == dept_id
        if div_ids:
            cond = db.or_(cond, User.division_id.in_(div_ids))
        q = q.filter(cond)
    elif role == 'department_admin' and div_id:
        q = q.filter_by(division_id=div_id, role='user')
    else:
        return []
    return q.order_by(User.full_name).all()


@tasks_bp.route('/by-departments', methods=['GET'])
@jwt_required()
def tasks_by_departments():
    """Barcha boshqarmalar vazifalari, boshqarma bo'yicha guruhlangan.
       Faqat rahbarlar uchun (ko'rish uchun, read-only).
       O'z boshqarmasi ham ro'yxatda birinchi qatorda ko'rinadi.
    """
    from app.models import Department
    role, my_dept_id, _ = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    departments = Department.query.order_by(Department.name).all()
    all_tasks = Task.query.order_by(Task.created_at.desc()).all()

    # Vazifani boshqarmaga bog'lash: yaratuvchi yoki ijrochi(lar) qaysi boshqarmadan
    def task_dept_ids(t):
        ids = set()
        if t.creator and t.creator.department_id:
            ids.add(t.creator.department_id)
        if t.assignee and t.assignee.department_id:
            ids.add(t.assignee.department_id)
        for a in t.assignees:
            if a.department_id:
                ids.add(a.department_id)
        return ids

    groups = []
    for d in departments:
        dept_tasks = [t.to_list_dict() for t in all_tasks if d.id in task_dept_ids(t)]
        groups.append({
            'department_id': d.id,
            'department_name': d.name,
            'is_own': d.id == my_dept_id,
            'task_count': len(dept_tasks),
            'tasks': dept_tasks,
        })
    # O'z boshqarmasi birinchi
    groups.sort(key=lambda g: (not g['is_own'], g['department_name']))
    return jsonify(groups)


@tasks_bp.route('/assignable-workers', methods=['GET'])
@jwt_required()
def task_assignable_workers():
    """Joriy rahbar vazifani yuklab bera oladigan xodimlar ro'yxati."""
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify([])
    return jsonify([w.to_dict() for w in _task_assignable_workers(role, dept_id, div_id)])


@tasks_bp.route('/<int:task_id>/reassign', methods=['POST'])
@jwt_required()
def reassign_task(task_id):
    """Vazifani boshqa xodimga yuklash (assignee_id o'zgaradi).

    Ruxsat: rahbarlar (admin/department_admin/superadmin). Xodim ierarxiyaga
    mos bo'lishi shart: boshqarma rahbari -> o'z boshqarmasi ichida;
    bo'lim rahbari -> o'z bo'limi ichida.
    """
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    task = Task.query.get_or_404(task_id)
    if task.status == 'completed':
        return jsonify({'error': "Yakunlangan vazifani qayta yuklab bo'lmaydi"}), 400
    if task.status == 'review':
        return jsonify({'error': "Tekshiruvdagi vazifa avval tasdiqlansin yoki qaytarilsin"}), 400

    data = request.get_json() or {}
    worker_id = data.get('user_id')
    if not worker_id:
        return jsonify({'error': 'user_id majburiy'}), 400

    allowed = {w.id for w in _task_assignable_workers(role, dept_id, div_id)}
    if int(worker_id) not in allowed:
        return jsonify({'error': "Bu xodimga vazifani yuklash huquqingiz yo'q"}), 403

    worker = User.query.get(int(worker_id))
    if not worker or not worker.is_active:
        return jsonify({'error': 'Xodim topilmadi'}), 404

    prev_name = task.assignee.full_name if task.assignee else \
                (', '.join(a.full_name for a in task.assignees) if task.assignees else '—')

    task.assignee_id = worker.id
    task.assignees = []  # M2M tozalanadi — yagona ijrochi bo'ladi
    if task.status == 'returned':
        task.status = 'active'  # yangi xodim uchun toza boshlash

    log_audit('assign', 'task', task.id, entity_label=task.name,
              details=f"{prev_name} -> {worker.full_name}")
    db.session.commit()
    return jsonify(task.to_dict())


@tasks_bp.route('/<int:task_id>', methods=['DELETE'])
@jwt_required()
def delete_task(task_id):
    claims = get_jwt()
    if not is_any_admin(claims.get('role', '')):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    task = Task.query.get_or_404(task_id)
    db.session.delete(task)
    db.session.commit()
    return jsonify({'message': 'Vazifa o\'chirildi'})


@tasks_bp.route('/<int:task_id>/reports', methods=['GET'])
@jwt_required()
def get_task_reports(task_id):
    reports = TaskReport.query.filter_by(task_id=task_id)\
        .order_by(TaskReport.created_at.desc()).all()
    return jsonify([r.to_dict() for r in reports])


@tasks_bp.route('/<int:task_id>/reports', methods=['POST'])
@jwt_required()
def create_task_report(task_id):
    user_id = int(get_jwt_identity())
    claims = get_jwt()
    task = Task.query.get_or_404(task_id)

    is_multipart = request.content_type and 'multipart' in request.content_type
    content = request.form.get('content', '').strip() if is_multipart else (request.get_json() or {}).get('content', '').strip()

    if not content:
        return jsonify({'error': 'Hisobot matni kiritilishi shart'}), 400

    # Rol emas, ijrochi ekanligiga qarab tekshiramiz. Bo'lim/boshqarma rahbari
    # ham o'ziga vazifa yuklangan bo'lsa hisobot topshirishi kerak — natija
    # yuqori rahbarga ko'rinadi va statistikaga qo'shiladi.
    user = User.query.get(user_id)
    user_team_ids = {t.id for t in user.teams} if user else set()
    assignee_ids = {a.id for a in task.assignees}
    can = task.assignee_id == user_id or user_id in assignee_ids \
        or (not task.assignee_id and not assignee_ids and task.team_id in user_team_ids)
    if not can:
        return jsonify({'error': 'Sizda hisobot topshirish huquqi yo\'q'}), 403

    report = TaskReport(
        task_id=task_id,
        user_id=user_id,
        content=content,
    )
    db.session.add(report)
    db.session.flush()

    report_upload_dir = os.path.join(UPLOAD_DIR, 'reports')
    os.makedirs(report_upload_dir, exist_ok=True)

    files = request.files.getlist('files') if is_multipart else []
    for f in files:
        if f and f.filename:
            ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
            if ext not in ALLOWED_EXTENSIONS:
                continue
            saved_name = f"{uuid.uuid4().hex}.{ext}"
            f.save(os.path.join(report_upload_dir, saved_name))
            attachment = ReportAttachment(
                task_report_id=report.id,
                filename=saved_name,
                original_name=f.filename,
                file_size=f.content_length or 0,
            )
            db.session.add(attachment)

    # Hisobot topshirilganda vazifa avtomatik tekshiruvga o'tadi
    if task.status in ('active', 'in_progress', 'returned'):
        task.status = 'review'
        task.completed_at = None

    db.session.commit()
    return jsonify(report.to_dict()), 201


@tasks_bp.route('/files/<filename>', methods=['GET'])
@jwt_required()
def download_task_file(filename):
    return send_from_directory(UPLOAD_DIR, filename, as_attachment=True)


@tasks_bp.route('/stats', methods=['GET'])
@jwt_required()
def task_stats():
    tasks = Task.query.all()
    return jsonify({
        'total': len(tasks),
        'active': sum(1 for t in tasks if t.status == 'active'),
        'in_progress': sum(1 for t in tasks if t.status == 'in_progress'),
        'review': sum(1 for t in tasks if t.status == 'review'),
        'returned': sum(1 for t in tasks if t.status == 'returned'),
        'completed': sum(1 for t in tasks if t.status == 'completed'),
        'overdue': sum(1 for t in tasks if t.is_overdue),
    })


def _strip_tz(dt):
    if dt and dt.tzinfo:
        return dt.replace(tzinfo=None)
    return dt


@tasks_bp.route('/full-stats', methods=['GET'])
@jwt_required()
def task_full_stats():
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    # Bo'lim/boshqarma rahbari faqat o'z scope'idagi vazifalar statistikasini ko'radi
    tasks = _scoped_tasks(role, dept_id, div_id, int(get_jwt_identity()))

    in_work_statuses = ('active', 'in_progress', 'review', 'returned')
    perf = {}
    task_list = []
    for t in tasks:
        if t.assignee:
            label = t.assignee.full_name
        elif t.assignees:
            label = ', '.join(a.full_name for a in t.assignees)
        elif t.team:
            label = t.team.name
        else:
            label = 'Belgilanmagan'
        if label not in perf:
            perf[label] = {
                'name': label,
                'is_team': not t.assignee_id and bool(t.team_id),
                'total': 0, 'completed': 0, 'on_time': 0, 'late': 0, 'in_work': 0,
            }
        p = perf[label]
        p['total'] += 1
        if t.status == 'completed':
            p['completed'] += 1
            dl = _strip_tz(t.deadline)
            ca = _strip_tz(t.completed_at)
            if dl and ca and ca > dl:
                p['late'] += 1
            else:
                p['on_time'] += 1
        elif t.status in in_work_statuses:
            p['in_work'] += 1

        task_list.append({
            'id': t.id,
            'name': t.name,
            'status': t.status,
            'assignee_name': t.assignee.full_name if t.assignee else None,
            'team_name': t.team.name if t.team else None,
            'start_date': t.start_date.isoformat() if t.start_date else None,
            'deadline': t.deadline.isoformat() if t.deadline else None,
            'completed_at': t.completed_at.isoformat() if t.completed_at else None,
            'is_overdue': t.is_overdue,
            'report_count': len(t.reports),
        })

    return jsonify({
        'total': len(tasks),
        'active': sum(1 for t in tasks if t.status == 'active'),
        'in_progress': sum(1 for t in tasks if t.status == 'in_progress'),
        'review': sum(1 for t in tasks if t.status == 'review'),
        'returned': sum(1 for t in tasks if t.status == 'returned'),
        'completed': sum(1 for t in tasks if t.status == 'completed'),
        'overdue': sum(1 for t in tasks if t.is_overdue),
        'performance': list(perf.values()),
        'tasks': task_list,
    })
