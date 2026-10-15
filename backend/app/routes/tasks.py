import os
import json
import uuid
from datetime import datetime, timezone, date as _date
from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import (
    Task, TaskReport, TaskAttachment, ReportAttachment, Team, User, Vacation, team_members,
)
from app.utils import (
    get_scope, is_any_admin, is_admin_or_above,
    log_audit, has_permission, scope_user_ids, FULL_ACCESS_ROLES,
)
from app.services import events

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads')
ALLOWED_EXTENSIONS = {'doc', 'docx', 'xls', 'xlsx', 'pdf', 'txt', 'png', 'jpg', 'jpeg', 'zip', 'rar', 'pptx'}

# Vazifa qabul qiladigan holatlar. Ilgari istalgan matn status sifatida
# yozilardi va bunday vazifa birorta holat oynasiga tushmay yo'qolib qolardi.
TASK_STATUSES = ('active', 'in_progress', 'review', 'returned', 'completed', 'cancelled')

tasks_bp = Blueprint('tasks', __name__)


def parse_datetime(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


# =========================================================================
# KIM NIMA QILA OLADI
#
#   superadmin/direksiya — barcha vazifalar
#   boshqarma rahbari    — o'z boshqarmasi vazifalari
#   bo'lim rahbari       — o'z bo'limi vazifalari
#   oddiy xodim          — o'ziga biriktirilgan va o'zi yaratgan vazifalar;
#                          faqat o'zi uchun vazifa yaratadi va uni tahrirlaydi
#
# Vazifa rahbarning ko'lamiga tegishli: yaratuvchisi uning ko'lamida yoki
# barcha ijrochilari uning ko'lamida bo'lsa.
# =========================================================================

class _Actor:
    """Joriy foydalanuvchi va uning ko'lami — bitta so'rov ichida bir marta."""

    def __init__(self):
        claims = get_jwt()
        self.claims = claims
        self.role, self.dept_id, self.div_id = get_scope(claims)
        self.id = int(get_jwt_identity())
        self.scope = scope_user_ids(self.role, self.dept_id, self.div_id, self.id)
        self.is_full = self.role in FULL_ACCESS_ROLES
        self.is_leader = is_any_admin(self.role)
        self._user = None

    @property
    def user(self):
        if self._user is None:
            self._user = User.query.get(self.id)
        return self._user

    def team_ids(self):
        return {t.id for t in self.user.teams} if self.user else set()


def _worker_ids(task):
    """Vazifa ijrochilari: yakka mas'ul, ko'p ijrochi yoki (ular bo'lmasa) guruh."""
    ids = {a.id for a in task.assignees}
    if task.assignee_id:
        ids.add(task.assignee_id)
    if not ids and task.team:
        ids = {m.id for m in task.team.members}
    return ids


def _is_assignee(task, actor):
    if task.assignee_id == actor.id or actor.id in {a.id for a in task.assignees}:
        return True
    return bool(task.team_id) and task.team_id in actor.team_ids()


def _is_self_task(task):
    """Xodim o'zi uchun yaratgan vazifa (yaratuvchi = yagona ijrochi)."""
    return _worker_ids(task) == {task.created_by}


def _in_leader_scope(task, actor):
    """Vazifa rahbarning ko'lamiga tegishlimi (boshqarish uchun)."""
    if actor.is_full:
        return True
    if not actor.is_leader:
        return False
    if task.created_by in actor.scope:
        return True
    workers = _worker_ids(task)
    return bool(workers) and workers <= actor.scope


def _can_view(task, actor):
    if actor.is_full or task.created_by == actor.id or _is_assignee(task, actor):
        return True
    if actor.is_leader:
        people = _worker_ids(task) | {task.created_by}
        if task.team:
            people |= {m.id for m in task.team.members}
        return bool(people & actor.scope)
    return False


def _can_manage(task, actor):
    """Tasdiqlash, qaytarish, bekor qilish, qayta yuklash, o'chirish."""
    return _in_leader_scope(task, actor)


def _can_edit(task, actor):
    """Nomi, tavsifi va muddatlarini tahrirlash."""
    if _can_manage(task, actor):
        return True
    # Xodim o'zi uchun yaratgan vazifasini tahrirlaydi (yakunlanguncha)
    if task.created_by == actor.id and _is_self_task(task) and task.status != 'completed':
        return True
    # Rol berish oynasida "Vazifani tahrirlash" huquqi — faqat ko'ra oladigan vazifa
    return _can_view(task, actor) and has_permission('task.edit', actor.claims)


def _can_approve(task, actor):
    """Tekshiruvdagi ishni qabul qilish/qaytarish. Rahbar o'zi yagona ijrochi
    bo'lgan vazifani o'zi tasdiqlamaydi — uni yuqori rahbar ko'radi."""
    if not _can_manage(task, actor):
        return False
    return actor.is_full or _worker_ids(task) != {actor.id}


def _can_delete(task, actor):
    if _can_manage(task, actor):
        return True
    # Xodim o'z vazifasini hali tekshiruvga yubormagan bo'lsa o'chira oladi
    return (task.created_by == actor.id and _is_self_task(task)
            and task.status in ('active', 'in_progress', 'returned'))


def _can_see_all_reports(task, actor):
    """Boshqa ijrochilarning hisobotlari faqat rahbarga ko'rinadi — oddiy
    xodim guruh vazifasida ham faqat o'z hisobotini ko'radi."""
    if actor.is_full:
        return True
    if not actor.is_leader:
        return False
    # Vazifani bergan rahbar yoki ijrochilardan kamida biri bo'ysunuvchisi
    others = (_worker_ids(task) | {task.created_by}) - {actor.id}
    return task.created_by == actor.id or bool(others & actor.scope)


def _task_perms(task, actor):
    manage = _can_manage(task, actor)
    approve = _can_approve(task, actor)
    return {
        'edit': _can_edit(task, actor),
        'delete': _can_delete(task, actor),
        'manage': manage,
        'approve': approve and task.status == 'review',
        'return_completed': approve and task.status == 'completed' and is_admin_or_above(actor.role),
        'cancel': manage and task.status not in ('completed', 'cancelled'),
        'reopen': manage and task.status == 'cancelled',
        'reassign': manage and task.status not in ('completed', 'cancelled', 'review'),
        'report': _is_assignee(task, actor) and task.status not in ('completed', 'cancelled'),
    }


def _visible_reports(task, actor):
    reports = list(task.reports)
    if not _can_see_all_reports(task, actor):
        reports = [r for r in reports if r.user_id == actor.id]
    return reports


def _task_payload(task, actor):
    data = task.to_dict()
    data['reports'] = [r.to_dict() for r in _visible_reports(task, actor)]
    data['perms'] = _task_perms(task, actor)
    data['is_self_task'] = _is_self_task(task)
    return data


def _get_visible_task(task_id, actor):
    """Vazifa topilmasa yoki ko'rish huquqi bo'lmasa — 404 (mavjudligi ham
    oshkor qilinmaydi)."""
    task = Task.query.get_or_404(task_id)
    if not _can_view(task, actor):
        return None
    return task


def _scoped_query(actor):
    """Rol bo'yicha ko'rinadigan vazifalar so'rovi (ro'yxat va statistika uchun)."""
    q = Task.query
    if actor.is_full:
        return q
    conds = [
        Task.created_by == actor.id,
        Task.assignee_id == actor.id,
        Task.assignees.any(User.id == actor.id),
    ]
    team_ids = actor.team_ids()
    if team_ids:
        conds.append(Task.team_id.in_(team_ids))
    if actor.is_leader and actor.scope:
        # Guruhga berilgan vazifa — guruhda rahbarning xodimi bo'lsa
        scoped_teams = db.session.query(team_members.c.team_id).filter(
            team_members.c.user_id.in_(actor.scope))
        conds += [
            Task.created_by.in_(actor.scope),
            Task.assignee_id.in_(actor.scope),
            Task.assignees.any(User.id.in_(actor.scope)),
            Task.team_id.in_(scoped_teams),
        ]
    return q.filter(db.or_(*conds))


# =========================================================================
# RO'YXATLAR
# =========================================================================

@tasks_bp.route('', methods=['GET'])
@jwt_required()
def get_tasks():
    tasks = _scoped_query(_Actor()).order_by(Task.created_at.desc()).all()
    return jsonify([t.to_list_dict() for t in tasks])


@tasks_bp.route('/counts', methods=['GET'])
@jwt_required()
def task_counts():
    """Holat oynalari sarlavhasidagi sonlar (rol scope'i bo'yicha).
       Har rolga ochiq — foydalanuvchi faqat o'ziga ko'rinadigan vazifalar
       sonini oladi."""
    tasks = _scoped_query(_Actor()).all()
    return jsonify({
        'total': len(tasks),
        'active': sum(1 for t in tasks if (t.status or 'active') in Task.ACTIVE_STATUSES),
        'completed': sum(1 for t in tasks if t.status == 'completed'),
        'cancelled': sum(1 for t in tasks if t.status == 'cancelled'),
        'review': sum(1 for t in tasks if t.status == 'review'),
        'returned': sum(1 for t in tasks if t.status == 'returned'),
        'overdue': sum(1 for t in tasks if t.is_overdue),
    })


@tasks_bp.route('/browse', methods=['GET'])
@jwt_required()
def browse_tasks():
    """Kengaytirilgan ro'yxat: filtr + guruhlash + paginatsiya.

    Query params:
      status  = active|in_progress|review|returned|completed|all  (default: all)
      group   = department|team|none  (default: none)
      q       = xodim ismi yoki tabel raqami (search)
      from    = YYYY-MM-DD  — sana oralig'i (deadline yoki completed_at bo'yicha)
      to      = YYYY-MM-DD
      page    = 1..N   (default: 1)
      per_page= 12     (default: 12)
    """
    from app.models import Department

    all_tasks = _scoped_query(_Actor()).order_by(Task.created_at.desc()).all()

    # Status
    # 'active' — barcha ishdagi (active/in_progress/review/returned);
    #            tugallangan va bekor qilinganlar bunga kirmaydi
    # boshqa qiymatlar — aynan shu status
    status = (request.args.get('status') or 'all').strip()
    if status == 'active':
        all_tasks = [t for t in all_tasks if (t.status or 'active') in Task.ACTIVE_STATUSES]
    elif status and status != 'all':
        all_tasks = [t for t in all_tasks if (t.status or '') == status]

    # Xodim/tabel qidiruv
    q = (request.args.get('q') or '').strip().lower()
    if q:
        def match(t):
            names = []
            if t.assignee:
                names.append(t.assignee.full_name.lower())
                names.append((t.assignee.tab_number or '').lower())
            for a in t.assignees:
                names.append(a.full_name.lower())
                names.append((a.tab_number or '').lower())
            if t.team:
                for m in t.team.members:
                    names.append(m.full_name.lower())
                    names.append((m.tab_number or '').lower())
            return any(q in n for n in names)
        all_tasks = [t for t in all_tasks if match(t)]

    # Sana oralig'i — deadline yoki completed_at (mavjud bo'lganini olamiz)
    def _pd(s):
        try:
            return _date.fromisoformat(s[:10]) if s else None
        except Exception:
            return None
    d_from = _pd(request.args.get('from'))
    d_to = _pd(request.args.get('to'))
    if d_from or d_to:
        def in_range(t):
            ref = None
            for value in (t.completed_at, t.cancelled_at, t.deadline, t.start_date):
                if value:
                    ref = value.date() if hasattr(value, 'date') else value
                    break
            if not ref:
                return False
            if d_from and ref < d_from:
                return False
            if d_to and ref > d_to:
                return False
            return True
        all_tasks = [t for t in all_tasks if in_range(t)]

    total = len(all_tasks)

    # Guruhlash
    group = (request.args.get('group') or 'none').strip()
    groups = []
    if group == 'department':
        dept_names = {d.id: d.name for d in Department.query.all()}
        by = {}
        for t in all_tasks:
            key_ids = set()
            if t.assignee and t.assignee.department_id:
                key_ids.add(t.assignee.department_id)
            for a in t.assignees:
                if a.department_id:
                    key_ids.add(a.department_id)
            if not key_ids:
                key_ids.add(0)
            for did in key_ids:
                by.setdefault((did, dept_names.get(did)), []).append(t)
        # Har guruh alohida paginatsiya qilinmaydi — jami natijaga
        for (did, dname), ts in sorted(by.items(), key=lambda x: (x[0][1] or '')):
            groups.append({
                'key': did, 'label': dname or 'Belgilanmagan',
                'count': len(ts),
                'tasks': [t.to_list_dict() for t in ts],
            })
    elif group == 'team':
        by = {}
        for t in all_tasks:
            if t.team:
                by.setdefault((t.team.id, t.team.name), []).append(t)
            else:
                by.setdefault((0, 'Guruhsiz'), []).append(t)
        for (tid, tname), ts in sorted(by.items(), key=lambda x: x[0][1] or ''):
            groups.append({
                'key': tid, 'label': tname or 'Guruhsiz',
                'count': len(ts),
                'tasks': [t.to_list_dict() for t in ts],
            })
    else:
        # Guruhlashsiz — paginatsiya
        try:
            page = max(1, int(request.args.get('page', 1)))
            per_page = min(100, max(1, int(request.args.get('per_page', 12))))
        except ValueError:
            page = 1; per_page = 12
        pages = (total + per_page - 1) // per_page or 1
        page = min(page, pages)
        start = (page - 1) * per_page
        end = start + per_page
        return jsonify({
            'total': total,
            'page': page,
            'per_page': per_page,
            'pages': pages,
            'tasks': [t.to_list_dict() for t in all_tasks[start:end]],
        })

    return jsonify({'total': total, 'groups': groups, 'group': group})


# =========================================================================
# YARATISH
# =========================================================================

def _vacation_error(user_ids):
    if not user_ids:
        return None
    today = _date.today()
    vac = Vacation.query.filter(
        Vacation.user_id.in_(user_ids),
        Vacation.from_date <= today,
        Vacation.to_date >= today,
    ).all()
    if vac:
        names = ', '.join(v.user.full_name for v in vac if v.user)
        return f"Tatildagi xodim(lar)ga vazifa yuklab bo'lmaydi: {names}"
    return None


def _int_or_none(v):
    try:
        return int(v) if v not in (None, '', 'null') else None
    except (TypeError, ValueError):
        return None


@tasks_bp.route('', methods=['POST'])
@jwt_required()
def create_task():
    actor = _Actor()

    is_multipart = request.content_type and 'multipart' in request.content_type
    if is_multipart:
        form = request.form
        try:
            raw_ids = json.loads(form.get('assignee_ids') or '[]')
        except ValueError:
            return jsonify({'error': "assignee_ids noto'g'ri"}), 400
        files = request.files.getlist('files')
    else:
        form = request.get_json(silent=True) or {}
        raw_ids = form.get('assignee_ids') or []
        files = []

    name = (form.get('name') or '').strip()
    description = form.get('description') or ''
    start_date = form.get('start_date')
    deadline = form.get('deadline')
    team_id = _int_or_none(form.get('team_id'))
    assignee_id = _int_or_none(form.get('assignee_id'))
    assignee_ids = [i for i in (_int_or_none(x) for x in (raw_ids or [])) if i]

    if not name:
        return jsonify({'error': 'Vazifa nomi kiritilishi shart'}), 400

    if not actor.is_leader:
        # Oddiy xodim faqat o'zi uchun vazifa yaratadi — kimga biriktirish
        # so'ralganidan qat'i nazar ijrochi o'zi bo'ladi
        team_id = None
        assignee_id = actor.id
        assignee_ids = []
    else:
        # Rahbar faqat o'z ko'lamidagi xodim va guruhga vazifa beradi
        # (ilgari bo'lim rahbari API orqali istalgan xodimga yuklay olardi)
        wanted = set(assignee_ids)
        if assignee_id:
            wanted.add(assignee_id)
        if wanted and not actor.is_full:
            allowed = {w.id for w in _task_assignable_workers(
                actor.role, actor.dept_id, actor.div_id, actor.id)}
            if not wanted <= allowed:
                return jsonify({'error': "Ba'zi xodimlarga vazifani yuklash huquqingiz yo'q"}), 403
        if team_id and not actor.is_full:
            team = Team.query.get(team_id)
            if not team:
                return jsonify({'error': 'Guruh topilmadi'}), 404
            outsiders = [m.full_name for m in team.members if m.id not in actor.scope]
            if outsiders:
                return jsonify({'error': "Guruhda sizning ko'lamingizdan tashqari xodimlar bor: "
                                         + ', '.join(outsiders)}), 403

    check_ids = set(assignee_ids)
    if assignee_id:
        check_ids.add(assignee_id)
    if actor.is_leader:
        err = _vacation_error(check_ids)
        if err:
            return jsonify({'error': err}), 400

    try:
        task = Task(
            name=name,
            description=description,
            start_date=parse_datetime(start_date) if start_date else None,
            deadline=parse_datetime(deadline) if deadline else None,
            team_id=team_id,
            assignee_id=assignee_id,
            created_by=actor.id,
        )
    except ValueError:
        return jsonify({'error': "Sana formati noto'g'ri"}), 400
    db.session.add(task)
    db.session.flush()

    for uid in assignee_ids:
        u = User.query.get(uid)
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

    log_audit('create', 'task', task.id, entity_label=task.name,
              details="o'zi uchun" if not actor.is_leader else '')
    events.task_assigned(task)
    db.session.commit()
    return jsonify(_task_payload(task, actor)), 201


# =========================================================================
# BITTA VAZIFA
# =========================================================================

@tasks_bp.route('/<int:task_id>', methods=['GET'])
@jwt_required()
def get_task(task_id):
    actor = _Actor()
    task = _get_visible_task(task_id, actor)
    if task is None:
        return jsonify({'error': 'Vazifa topilmadi'}), 404
    return jsonify(_task_payload(task, actor))


@tasks_bp.route('/<int:task_id>', methods=['PUT'])
@jwt_required()
def update_task(task_id):
    actor = _Actor()
    task = _get_visible_task(task_id, actor)
    if task is None:
        return jsonify({'error': 'Vazifa topilmadi'}), 404
    data = request.get_json(silent=True) or {}

    new_status = data.get('status')
    if new_status:
        if new_status not in TASK_STATUSES:
            return jsonify({'error': "Noto'g'ri holat"}), 400

        is_assignee = _is_assignee(task, actor)
        manage = _can_manage(task, actor)

        if new_status == 'review':
            # Ijrochi (rahbar bo'lsa ham) "bajardim" deb yuboradi
            if not is_assignee:
                return jsonify({'error': 'Sizda bu vazifani bajarildi deb yuborish huquqi yo\'q'}), 403
            if task.status in ('cancelled', 'completed'):
                return jsonify({'error': "Bu holatdagi vazifa bo'yicha ish yuborib bo'lmaydi"}), 400
            if not TaskReport.query.filter_by(task_id=task.id).first():
                return jsonify({'error': 'Avval hisobot topshiring'}), 400
            task.completed_at = None
        elif new_status == 'cancelled':
            # Vazifani faqat ko'lamidagi rahbar bekor qiladi
            if not manage:
                return jsonify({'error': 'Faqat rahbar vazifani bekor qiladi'}), 403
            if task.status == 'completed':
                return jsonify({'error': "Tugallangan vazifani bekor qilib bo'lmaydi"}), 400
            task.cancelled_at = datetime.now(timezone.utc)
            task.cancel_reason = (data.get('cancel_reason') or '').strip()
            task.completed_at = None
            log_audit('cancel', 'task', task.id, entity_label=task.name,
                      details=task.cancel_reason)
        elif new_status in ('completed', 'returned'):
            if not _can_approve(task, actor):
                if manage:
                    return jsonify({'error': "O'zingiz bajargan vazifani o'zingiz tasdiqlay olmaysiz"}), 403
                return jsonify({'error': 'Faqat rahbar tasdiqlaydi'}), 403
            # 'review' holatidan ko'lamidagi har qanday rahbar amal qiladi.
            # Tugallangan vazifani qaytarish faqat boshqarma rahbari va yuqori rollarga
            # ruxsat (bo'lim rahbari tasdiqlagan ishda kamchilik topsa qayta yuklaydi).
            if task.status == 'review':
                pass
            elif task.status == 'completed' and new_status == 'returned':
                if not is_admin_or_above(actor.role):
                    return jsonify({'error': "Tugallangan vazifani qayta yuklash faqat boshqarma rahbari huquqi"}), 403
            else:
                return jsonify({'error': 'Bu holatda amal qilib bo\'lmaydi'}), 400
            task.completed_at = datetime.now(timezone.utc) if new_status == 'completed' else None
            log_audit('approve' if new_status == 'completed' else 'return', 'task',
                      task.id, entity_label=task.name,
                      details=(data.get('return_reason') or '').strip()[:200])
        else:
            # active / in_progress
            if task.status == 'cancelled':
                # Bekor qilingan vazifani ishga qaytarish — faqat rahbar
                if not manage:
                    return jsonify({'error': 'Faqat rahbar vazifani qayta ochadi'}), 403
                log_audit('update', 'task', task.id, entity_label=task.name,
                          details='bekor qilingan vazifa qayta ochildi')
            elif task.status in ('completed', 'review') and not manage:
                # Ijrochi tasdiqlangan yoki tekshiruvdagi vazifani o'zicha
                # qayta ocha olmaydi (ilgari `completed_at` saqlanib qolardi)
                return jsonify({'error': "Bu holatdagi vazifani o'zgartira olmaysiz"}), 403
            elif not manage and not is_assignee:
                return jsonify({'error': 'Ruxsat yo\'q'}), 403
            task.completed_at = None

        if new_status != 'cancelled':
            task.cancelled_at = None
            task.cancel_reason = ''

        task.status = new_status
        events.task_status_changed(task, new_status,
                                   reason=(data.get('return_reason') or '').strip())

    # Vazifa ma'lumotlarini tahrirlash — ko'lamidagi rahbar, o'z vazifasini
    # tahrirlayotgan xodim va "Vazifani tahrirlash" huquqi berilgan xodim
    edit_keys = {'name', 'description', 'start_date', 'deadline'} & set(data)
    if edit_keys:
        if not _can_edit(task, actor):
            if not new_status:
                return jsonify({'error': "Vazifani tahrirlash huquqingiz yo'q"}), 403
        else:
            changed = []
            try:
                if 'name' in data and (data['name'] or '').strip():
                    task.name = data['name'].strip()
                    changed.append('nomi')
                if 'description' in data:
                    task.description = data['description'] or ''
                    changed.append('tavsifi')
                if 'start_date' in data:
                    task.start_date = parse_datetime(data['start_date']) if data['start_date'] else None
                    changed.append('boshlash sanasi')
                if 'deadline' in data:
                    task.deadline = parse_datetime(data['deadline']) if data['deadline'] else None
                    changed.append('muddati')
            except (ValueError, AttributeError):
                db.session.rollback()
                return jsonify({'error': "Sana formati noto'g'ri"}), 400
            if changed:
                log_audit('update', 'task', task.id, entity_label=task.name,
                          details=', '.join(changed))

    db.session.commit()
    return jsonify(_task_payload(task, actor))


def _task_assignable_workers(role, dept_id, div_id, user_id=None):
    """Vazifani kimga yuklash mumkin — ierarxiya bo'yicha:
       - superadmin/direksiya: barcha faol xodimlar (user + dept_admin)
       - boshqarma rahbari (admin): o'z boshqarmasidagi bo'lim rahbarlari va user'lar
         (bevosita department_id yoki bo'lim orqali division.department_id ham hisoblanadi)
       - bo'lim rahbari (department_admin): o'z bo'limidagi xodimlar (user) va o'zi
         (bitta vazifani rahbar o'ziga ham, xodimlariga ham biriktira oladi)

    Bugun tatilda bo'lgan xodimlar ro'yxatdan chiqarib tashlanadi.
    """
    from app.models import Division
    q = User.query.filter(User.is_active == True, User.role.in_(['user', 'department_admin']))
    if role in FULL_ACCESS_ROLES:
        pass  # hamma
    elif role == 'admin' and dept_id:
        div_ids = [d.id for d in Division.query.filter_by(department_id=dept_id).all()]
        cond = User.department_id == dept_id
        if div_ids:
            cond = db.or_(cond, User.division_id.in_(div_ids))
        q = q.filter(cond)
    elif role == 'department_admin' and div_id:
        cond = db.and_(User.division_id == div_id, User.role == 'user')
        if user_id:
            # Bo'lim rahbari o'zini ham ijrochi qilib qo'sha olsin
            cond = db.or_(cond, User.id == user_id)
        q = q.filter(cond)
    else:
        return []
    # Bugungi tatildagilar chiqarilsin
    today = _date.today()
    on_vacation = {v.user_id for v in Vacation.query.filter(
        Vacation.from_date <= today, Vacation.to_date >= today
    ).all()}
    if on_vacation:
        q = q.filter(~User.id.in_(on_vacation))
    return q.order_by(User.full_name).all()


@tasks_bp.route('/by-departments', methods=['GET'])
@jwt_required()
def tasks_by_departments():
    """Boshqarmalar kesimidagi vazifalar.
       Superadmin/direksiya — barcha boshqarmalar; boshqarma rahbari — faqat
       o'z boshqarmasi (ilgari boshqa boshqarmalarnikini ham ko'rardi).
    """
    from app.models import Department
    actor = _Actor()
    if not is_admin_or_above(actor.role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    q = Department.query.order_by(Department.name)
    if not actor.is_full:
        q = q.filter(Department.id == actor.dept_id) if actor.dept_id else q.filter(db.false())
    departments = q.all()
    all_tasks = _scoped_query(actor).order_by(Task.created_at.desc()).all()

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
            'is_own': d.id == actor.dept_id,
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
    user_id = int(get_jwt_identity())
    return jsonify([w.to_brief() for w in _task_assignable_workers(role, dept_id, div_id, user_id)])


@tasks_bp.route('/<int:task_id>/reassign', methods=['POST'])
@jwt_required()
def reassign_task(task_id):
    """Vazifani boshqa xodimga yuklash (assignee_id o'zgaradi).

    Ruxsat: vazifa ko'lamidagi rahbar. Xodim ierarxiyaga mos bo'lishi shart:
    boshqarma rahbari -> o'z boshqarmasi ichida; bo'lim rahbari -> o'z
    bo'limi ichida.
    """
    actor = _Actor()
    if not actor.is_leader:
        return jsonify({'error': "Ruxsat yo'q"}), 403

    task = _get_visible_task(task_id, actor)
    if task is None:
        return jsonify({'error': 'Vazifa topilmadi'}), 404
    if not _can_manage(task, actor):
        return jsonify({'error': "Bu vazifa sizning ko'lamingizga tegishli emas"}), 403
    if task.status == 'completed':
        return jsonify({'error': "Yakunlangan vazifani qayta yuklab bo'lmaydi"}), 400
    if task.status == 'cancelled':
        return jsonify({'error': "Bekor qilingan vazifani yuklab bo'lmaydi"}), 400
    if task.status == 'review':
        return jsonify({'error': "Tekshiruvdagi vazifa avval tasdiqlansin yoki qaytarilsin"}), 400

    data = request.get_json(silent=True) or {}
    # Bir yoki bir nechta xodim: user_ids (ro'yxat) ustunroq, user_id (bitta) — moslik uchun
    raw_ids = data.get('user_ids')
    if not raw_ids and data.get('user_id'):
        raw_ids = [data.get('user_id')]
    if not raw_ids:
        return jsonify({'error': 'user_ids yoki user_id majburiy'}), 400

    ids = [i for i in (_int_or_none(x) for x in raw_ids) if i]
    if not ids:
        return jsonify({'error': "Kamida bitta xodim tanlansin"}), 400

    # Tatildagi xodimga vazifa yuklab bo'lmaydi (aniqroq xabar uchun oldin tekshiramiz)
    err = _vacation_error(ids)
    if err:
        return jsonify({'error': err}), 400

    allowed = {w.id for w in _task_assignable_workers(actor.role, actor.dept_id, actor.div_id, actor.id)}
    for uid in ids:
        if uid not in allowed:
            return jsonify({'error': "Ba'zi xodimlarga vazifani yuklash huquqingiz yo'q"}), 403

    workers = User.query.filter(User.id.in_(ids), User.is_active == True).all()
    if len(workers) != len(set(ids)):
        return jsonify({'error': "Ba'zi xodimlar topilmadi yoki faol emas"}), 404

    prev_name = task.assignee.full_name if task.assignee else \
                (', '.join(a.full_name for a in task.assignees) if task.assignees else '—')

    if len(workers) == 1:
        # Bitta xodim — assignee_id, M2M tozalanadi
        task.assignee_id = workers[0].id
        task.assignees = []
    else:
        # Bir nechta xodim — M2M ga, assignee_id bo'shatiladi (yagona mas'ul yo'q)
        task.assignee_id = None
        task.assignees = list(workers)
    if task.status == 'returned':
        task.status = 'active'

    new_name = ', '.join(w.full_name for w in workers)
    log_audit('assign', 'task', task.id, entity_label=task.name,
              details=f"{prev_name} -> {new_name}")
    events.task_assigned(task, [w.id for w in workers])
    db.session.commit()
    return jsonify(_task_payload(task, actor))


@tasks_bp.route('/<int:task_id>', methods=['DELETE'])
@jwt_required()
def delete_task(task_id):
    actor = _Actor()
    task = _get_visible_task(task_id, actor)
    if task is None:
        return jsonify({'error': 'Vazifa topilmadi'}), 404
    if not _can_delete(task, actor):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    log_audit('delete', 'task', task.id, entity_label=task.name)
    # Vazifa bilan birga unga ishora qiluvchi bildirishnomalar ham ketsin —
    # aks holda xodim ularni bosganda bo'sh sahifaga tushardi.
    events.task_deleted(task.id)
    # Hisobot fayllari yozuvlari kaskadsiz — yetim qolmasin
    for r in task.reports:
        for f in list(r.files):
            db.session.delete(f)
    db.session.delete(task)
    db.session.commit()
    return jsonify({'message': 'Vazifa o\'chirildi'})


# =========================================================================
# HISOBOTLAR VA FAYLLAR
# =========================================================================

@tasks_bp.route('/<int:task_id>/reports', methods=['GET'])
@jwt_required()
def get_task_reports(task_id):
    actor = _Actor()
    task = _get_visible_task(task_id, actor)
    if task is None:
        return jsonify({'error': 'Vazifa topilmadi'}), 404
    return jsonify([r.to_dict() for r in _visible_reports(task, actor)])


@tasks_bp.route('/<int:task_id>/reports', methods=['POST'])
@jwt_required()
def create_task_report(task_id):
    actor = _Actor()
    task = _get_visible_task(task_id, actor)
    if task is None:
        return jsonify({'error': 'Vazifa topilmadi'}), 404

    is_multipart = request.content_type and 'multipart' in request.content_type
    if is_multipart:
        content = (request.form.get('content') or '').strip()
    else:
        content = ((request.get_json(silent=True) or {}).get('content') or '').strip()

    if not content:
        return jsonify({'error': 'Hisobot matni kiritilishi shart'}), 400

    # Rol emas, ijrochi ekanligiga qarab tekshiramiz. Bo'lim/boshqarma rahbari
    # ham o'ziga vazifa yuklangan bo'lsa hisobot topshirishi kerak — natija
    # yuqori rahbarga ko'rinadi va statistikaga qo'shiladi.
    assignee_ids = {a.id for a in task.assignees}
    can = task.assignee_id == actor.id or actor.id in assignee_ids \
        or (not task.assignee_id and not assignee_ids and task.team_id in actor.team_ids())
    if not can:
        return jsonify({'error': 'Sizda hisobot topshirish huquqi yo\'q'}), 403
    if task.status in ('completed', 'cancelled'):
        return jsonify({'error': "Yakunlangan yoki bekor qilingan vazifaga hisobot topshirib bo'lmaydi"}), 400

    report = TaskReport(
        task_id=task_id,
        user_id=actor.id,
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
            path = os.path.join(report_upload_dir, saved_name)
            f.save(path)
            attachment = ReportAttachment(
                task_report_id=report.id,
                filename=saved_name,
                original_name=f.filename,
                file_size=os.path.getsize(path),
            )
            db.session.add(attachment)

    # Hisobot topshirilganda vazifa avtomatik tekshiruvga o'tadi — u shu
    # ondayoq "Xodim hisobotlari" jadvaliga ham tushadi (employee_reports)
    if task.status in ('active', 'in_progress', 'returned'):
        task.status = 'review'
        task.completed_at = None
        events.task_status_changed(task, 'review')

    db.session.commit()
    return jsonify(report.to_dict()), 201


@tasks_bp.route('/files/<filename>', methods=['GET'])
@jwt_required()
def download_task_file(filename):
    """Vazifa fayli — faqat vazifani ko'ra oladiganlarga."""
    actor = _Actor()
    att = TaskAttachment.query.filter_by(filename=filename).first()
    task = Task.query.get(att.task_id) if att else None
    if task is None or not _can_view(task, actor):
        return jsonify({'error': 'Fayl topilmadi'}), 404
    return send_from_directory(UPLOAD_DIR, filename, as_attachment=True,
                               download_name=att.original_name)


def can_view_task_report_file(att):
    """Vazifa hisobotiga biriktirilgan fayl (projects.py dagi umumiy yo'ldan
    chaqiriladi): vazifani ko'ra oladigan va hisobotni ko'rishi mumkin
    bo'lgan foydalanuvchiga."""
    actor = _Actor()
    report = TaskReport.query.get(att.task_report_id) if att.task_report_id else None
    task = Task.query.get(report.task_id) if report else None
    if task is None or not _can_view(task, actor):
        return False
    return report.user_id == actor.id or _can_see_all_reports(task, actor)


@tasks_bp.route('/stats', methods=['GET'])
@jwt_required()
def task_stats():
    tasks = _scoped_query(_Actor()).all()
    return jsonify({
        'total': len(tasks),
        'active': sum(1 for t in tasks if t.status == 'active'),
        'in_progress': sum(1 for t in tasks if t.status == 'in_progress'),
        'review': sum(1 for t in tasks if t.status == 'review'),
        'returned': sum(1 for t in tasks if t.status == 'returned'),
        'completed': sum(1 for t in tasks if t.status == 'completed'),
        'cancelled': sum(1 for t in tasks if t.status == 'cancelled'),
        'overdue': sum(1 for t in tasks if t.is_overdue),
    })


def _strip_tz(dt):
    if dt and dt.tzinfo:
        return dt.replace(tzinfo=None)
    return dt


@tasks_bp.route('/full-stats', methods=['GET'])
@jwt_required()
def task_full_stats():
    actor = _Actor()
    if not actor.is_leader:
        return jsonify({'error': "Ruxsat yo'q"}), 403

    # Bo'lim/boshqarma rahbari faqat o'z scope'idagi vazifalar statistikasini ko'radi
    tasks = _scoped_query(actor).order_by(Task.created_at.desc()).all()

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
        # Bekor qilingan vazifa samaradorlikka kirmaydi — u bajarilishi
        # kutilmagan, jami ishga qo'shilsa ko'rsatkich nohaq pasayardi
        if t.status != 'cancelled':
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
        'cancelled': sum(1 for t in tasks if t.status == 'cancelled'),
        'overdue': sum(1 for t in tasks if t.is_overdue),
        'performance': list(perf.values()),
        'tasks': task_list,
    })
