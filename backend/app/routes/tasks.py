import os
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import Task, TaskReport, TaskAttachment, ReportAttachment, Team, User
from app.utils import get_scope, is_any_admin, is_superadmin, dept_user_ids, div_user_ids

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
        if not is_any_admin(claims.get('role', '')):
            if new_status == 'review':
                user = User.query.get(user_id)
                user_team_ids = {t.id for t in user.teams} if user else set()
                assignee_ids = {a.id for a in task.assignees}
                can = task.assignee_id == user_id or user_id in assignee_ids or (task.team_id in user_team_ids)
                if not can:
                    return jsonify({'error': 'Sizda bu vazifani bajarildi deb yuborish huquqi yo\'q'}), 403
                if not TaskReport.query.filter_by(task_id=task.id).first():
                    return jsonify({'error': 'Avval hisobot topshiring'}), 400
            else:
                return jsonify({'error': 'Faqat admin status o\'zgartirishi mumkin'}), 403
        else:
            if new_status == 'completed' and task.status != 'review':
                return jsonify({'error': 'Avval hodim bajarildi deb yuborishi kerak'}), 400
            if new_status == 'returned' and task.status != 'review':
                return jsonify({'error': 'Faqat tekshiruvdagi vazifani qaytarish mumkin'}), 400
            if new_status == 'completed':
                task.completed_at = datetime.now(timezone.utc)
            else:
                task.completed_at = None

        task.status = new_status

    if is_any_admin(claims.get('role', '')):
        if 'name' in data:
            task.name = data['name']
        if 'description' in data:
            task.description = data['description']

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

    if is_any_admin(claims.get('role', '')):
        return jsonify({'error': 'Adminlar hisobot topshirmaydi'}), 403

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
