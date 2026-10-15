import os
import uuid
from datetime import datetime, timezone
from flask import Blueprint, request, jsonify, send_from_directory
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import Project, ProjectStage, ProjectAttachment, DailyReport, ReportAttachment, Team, User, SubStage
from app.utils import (
    get_scope, is_any_admin, is_admin_or_above, is_superadmin,
    log_audit, has_permission, FULL_ACCESS_ROLES,
    allowed_pages_for_user, scope_user_ids,
)
from app.services import events

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.dirname(__file__))), 'uploads')
ALLOWED_EXTENSIONS = {'doc', 'docx', 'xls', 'xlsx', 'pdf', 'txt', 'png', 'jpg', 'jpeg', 'zip', 'rar', 'pptx'}


def parse_datetime(s):
    return datetime.fromisoformat(s.replace('Z', '+00:00'))


projects_bp = Blueprint('projects', __name__)

STAGE_STATUSES = ('pending', 'in_progress', 'review', 'completed')


def can_create_project():
    """Loyiha yaratish huquqi — boshqarma rahbari, yuqori rollar va bo'lim
       rahbari (o'z bo'limi doirasida), hamda "Loyiha yaratish" sahifasi
       ochib berilgan har qanday xodim (rol yoki xodim darajasida).

    Ilgari faqat rol tekshirilardi: /roles sahifasidan xodimga "Loyiha
       yaratish" sahifasi ochilsa ham backend saqlashni 403 bilan rad etardi."""
    if is_any_admin(get_jwt().get('role', '')):
        return True
    try:
        user = User.query.get(int(get_jwt_identity()))
    except (TypeError, ValueError):
        user = None
    return user is not None and 'create_project' in allowed_pages_for_user(user)


def _my_scope():
    role, dept_id, div_id = get_scope(get_jwt())
    me = int(get_jwt_identity())
    return role, me, scope_user_ids(role, dept_id, div_id, me)


def can_manage_project(project):
    """Mavjud loyihani boshqarish (tahrirlash, bosqich qo'shish/o'chirish,
       ijroni tekshirish, yakunlash) huquqi:
       - superadmin/direksiya: barcha loyihalar
       - boshqarma rahbari: o'z boshqarmasi xodimlari yaratgan loyihalar
       - bo'lim rahbari: o'z bo'limi xodimlari yaratgan loyihalar
       - yaratuvchining o'zi
       - "Loyihani tahrirlash" huquqi berilgan xodim: o'ziga ko'rinadigan loyiha
         (rol berish oynasidagi qo'shimcha huquq)

    Ilgari boshqarma rahbari tashkilotdagi BARCHA loyihalarni tahrirlay va
    o'chira olardi.
    """
    if project is None:
        return False
    claims = get_jwt()
    role, me, scope = _my_scope()
    if role in FULL_ACCESS_ROLES:
        return True
    # Yaratuvchi o'zi yaratgan loyihani doim boshqara oladi — bo'lim rahbari
    # ham, "Loyiha yaratish" sahifasi ochilgan oddiy xodim ham. Aks holda
    # xodim loyihasini yaratardiyu, unga bosqich qo'sha/tahrirlay olmasdi.
    if project.created_by == me:
        return True
    if is_any_admin(role) and project.created_by in scope:
        return True
    return has_permission('project.edit', claims) and can_view_project(project)


def can_view_project(project):
    if project is None:
        return False
    role, dept_id, div_id = get_scope(get_jwt())
    return _scoped_projects_query(role, dept_id, div_id, int(get_jwt_identity())) \
        .filter(Project.id == project.id).first() is not None


def _get_visible_project(project_id):
    """Loyiha topilmasa yoki ko'rish huquqi bo'lmasa None."""
    project = Project.query.get(project_id)
    return project if can_view_project(project) else None


def _sees_all_reports(project):
    """Boshqa ijrochilarning hisobotlari faqat loyihani boshqaradigan
    rahbarga ko'rinadi — oddiy xodim faqat o'z hisobotini ko'radi."""
    role, me, _scope = _my_scope()
    if role in FULL_ACCESS_ROLES or project.created_by == me:
        return True
    return is_any_admin(role) and can_manage_project(project)


def _stage_of(project_id, stage_id):
    """Bosqich aynan shu loyihaniki bo'lishi shart (ilgari boshqa loyihaning
    bosqichini o'z loyihasi URL'i orqali o'chirish mumkin edi)."""
    return ProjectStage.query.filter_by(id=stage_id, project_id=project_id).first()


def _check_division_scope(user_ids, team_ids=()):
    """Rahbar bosqichga faqat o'z ko'lamidagi xodimlarni (va o'zini)
       biriktira oladi: bo'lim rahbari — o'z bo'limi, boshqarma rahbari —
       o'z boshqarmasi. Superadmin/direksiya va "Loyiha yaratish" sahifasi
       ochilgan oddiy xodimga bu cheklov tegishli emas.
       Muammo bo'lsa tayyor xato javobini qaytaradi (aks holda None)."""
    role, dept_id, div_id = get_scope(get_jwt())
    if role not in ('admin', 'department_admin'):
        return None

    me = int(get_jwt_identity())
    ids = {int(x) for x in user_ids if x} - {me}
    tids = {int(x) for x in team_ids if x}
    if not ids and not tids:
        return None
    if role == 'department_admin' and not div_id:
        return jsonify({'error': "Sizga bo'lim biriktirilmagan"}), 400
    if role == 'admin' and not dept_id:
        return jsonify({'error': "Sizga boshqarma biriktirilmagan"}), 400

    scope = scope_user_ids(role, dept_id, div_id, me)
    unit = "bo'lim" if role == 'department_admin' else 'boshqarma'
    if ids:
        outsiders = User.query.filter(User.id.in_(ids - scope)).all()
        if outsiders:
            names = ', '.join(u.full_name for u in outsiders)
            return jsonify({'error': f"Faqat o'z {unit}ngiz xodimlariga biriktira olasiz: {names}"}), 400

    for tid in tids:
        team = Team.query.get(tid)
        if team and any(m.id not in scope for m in team.members):
            return jsonify({'error': f"'{team.name}' guruhida boshqa {unit} xodimlari bor — uni tanlay olmaysiz"}), 400
    return None


def _stage_assignee_ids(stage):
    """Bosqichga biriktirilgan xodimlar (yakka mas'ul + ko'p ijrochi)."""
    ids = {a.id for a in stage.assignees}
    if stage.assignee_id:
        ids.add(stage.assignee_id)
    return ids


def _check_no_vacation(user_ids):
    """Berilgan xodimlar ichida bugun tatilda bo'lganlar bor bo'lsa,
       xato javob qaytaradi (aks holda None)."""
    from app.models import Vacation
    from datetime import date as _date
    ids = {int(x) for x in user_ids if x}
    if not ids:
        return None
    today = _date.today()
    vac = Vacation.query.filter(
        Vacation.user_id.in_(ids),
        Vacation.from_date <= today,
        Vacation.to_date >= today,
    ).all()
    if vac:
        names = ', '.join(v.user.full_name for v in vac if v.user)
        return jsonify({'error': f"Tatildagi xodim(lar)ga vazifa yuklab bo'lmaydi: {names}"}), 400
    return None


def _scoped_projects_query(role, dept_id, div_id, user_id):
    """Rol bo'yicha ko'rinadigan loyihalar so'rovi.
       - Superadmin/direksiya: barcha loyihalar
       - "Barcha loyihalarni ko'rish" huquqi berilgan xodim: barcha loyihalar
       - Boshqarma rahbari: o'z boshqarmasi xodimlari yaratgan yoki ishtirok
         etayotgan loyihalar
       - Bo'lim rahbari: o'z bo'limi xodimlari yaratgan yoki ishtirok
         etayotgan loyihalar
       - Oddiy xodim: faqat biriktirilgan loyihalar (o'ziga, guruhiga yoki
         bosqichda ijrochilikka biriktirilgan) va o'zi yaratganlari

    Ilgari boshqarma rahbari superadmin yaratgan barcha loyihalarni ham
    ko'rardi, bo'lim rahbari esa o'z bo'limi loyihalarini ko'rmasdi.
    """
    if is_superadmin(role) or has_permission('project.view_all'):
        return Project.query
    user = User.query.get(user_id)
    team_ids = [t.id for t in user.teams] if user else []
    conds = [
        Project.stages.any(ProjectStage.assignee_id == user_id),
        Project.stages.any(ProjectStage.assignees.any(User.id == user_id)),
        # O'zi yaratgan loyiha bosqichlarida ijrochi bo'lmasa ham ko'rinsin
        # (bo'lim rahbari, hamda "Loyiha yaratish" huquqi berilgan oddiy xodim)
        Project.created_by == user_id,
    ]
    if team_ids:
        conds.append(Project.teams.any(Team.id.in_(team_ids)))
    if role in ('admin', 'department_admin'):
        scope = scope_user_ids(role, dept_id, div_id, user_id)
        conds += [
            Project.created_by.in_(scope),
            Project.stages.any(ProjectStage.assignee_id.in_(scope)),
            Project.stages.any(ProjectStage.assignees.any(User.id.in_(scope))),
        ]
    return Project.query.filter(db.or_(*conds))


def _scoped_projects(role, dept_id, div_id, user_id):
    """Ro'yxat va statistika uchun — yangi loyihalar birinchi."""
    return _scoped_projects_query(role, dept_id, div_id, user_id) \
        .order_by(Project.created_at.desc()).all()


@projects_bp.route('', methods=['GET'])
@jwt_required()
def get_projects():
    role, dept_id, div_id = get_scope(get_jwt())
    projects = _scoped_projects(role, dept_id, div_id, int(get_jwt_identity()))


    return jsonify([p.to_list_dict() for p in projects])


def _project_dept_ids(project):
    """Loyiha qaysi boshqarmalarga tegishli — yaratuvchi va ijrochilar bo'yicha."""
    ids = set()
    if project.creator and project.creator.department_id:
        ids.add(project.creator.department_id)
    for s in project.stages:
        if s.assignee and s.assignee.department_id:
            ids.add(s.assignee.department_id)
        for a in s.assignees:
            if a.department_id:
                ids.add(a.department_id)
    for team in project.teams:
        for m in team.members:
            if m.department_id:
                ids.add(m.department_id)
    return ids


def _project_ref_date(p):
    """Sana filtri uchun tayanch sana: yakunlangan/bekor qilingan sana,
       aks holda muddat yoki boshlanish sanasi."""
    for value in (p.completed_at, p.cancelled_at, p.deadline, p.start_date, p.created_at):
        if value:
            return value.date() if hasattr(value, 'date') else value
    return None


@projects_bp.route('/browse', methods=['GET'])
@jwt_required()
def browse_projects():
    """Loyihalar sahifasi uchun ro'yxat: holat oynalari + paginatsiya.

    Query params:
      status  = active|completed|cancelled|inactive|all   (default: active)
      group   = department|none  (default: none — completed uchun department
                tanlansa boshqarmalar kesimida guruhlanadi)
      q       = loyiha nomi yoki ishtirokchi ismi
      from/to = YYYY-MM-DD  — sana oralig'i
      page    = 1..N   (default: 1)
      per_page= 12     (default: 12)
    """
    from datetime import date as _date
    from app.models import Department

    role, dept_id, div_id = get_scope(get_jwt())
    projects = _scoped_projects(role, dept_id, div_id, int(get_jwt_identity()))

    status = (request.args.get('status') or 'active').strip()
    if status and status != 'all':
        projects = [p for p in projects if (p.status or 'active') == status]

    q = (request.args.get('q') or '').strip().lower()
    if q:
        def match(p):
            names = [p.name.lower()]
            if p.creator:
                names.append(p.creator.full_name.lower())
            for team in p.teams:
                names.append(team.name.lower())
                names.extend(m.full_name.lower() for m in team.members)
            for s in p.stages:
                if s.assignee:
                    names.append(s.assignee.full_name.lower())
                names.extend(a.full_name.lower() for a in s.assignees)
            return any(q in n for n in names)
        projects = [p for p in projects if match(p)]

    def _pd(s):
        try:
            return _date.fromisoformat(s[:10]) if s else None
        except ValueError:
            return None
    d_from = _pd(request.args.get('from'))
    d_to = _pd(request.args.get('to'))
    if d_from or d_to:
        def in_range(p):
            ref = _project_ref_date(p)
            if not ref:
                return False
            if d_from and ref < d_from:
                return False
            if d_to and ref > d_to:
                return False
            return True
        projects = [p for p in projects if in_range(p)]

    total = len(projects)

    # Boshqarmalar kesimida guruhlash (asosan tugallangan loyihalar uchun)
    if (request.args.get('group') or 'none').strip() == 'department':
        departments = {d.id: d.name for d in Department.query.order_by(Department.name).all()}
        by = {}
        for p in projects:
            keys = _project_dept_ids(p) or {0}
            for did in keys:
                by.setdefault(did, []).append(p)
        groups = [{
            'key': did,
            'label': departments.get(did) or 'Belgilanmagan',
            'count': len(items),
            'projects': [p.to_list_dict() for p in items],
        } for did, items in by.items()]
        groups.sort(key=lambda g: (g['key'] == 0, g['label']))
        return jsonify({'total': total, 'group': 'department', 'groups': groups})

    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(100, max(1, int(request.args.get('per_page', 12))))
    except ValueError:
        page, per_page = 1, 12
    pages = (total + per_page - 1) // per_page or 1
    page = min(page, pages)
    start = (page - 1) * per_page

    return jsonify({
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': pages,
        'projects': [p.to_list_dict() for p in projects[start:start + per_page]],
    })


@projects_bp.route('/counts', methods=['GET'])
@jwt_required()
def project_counts():
    """Holat oynalari sarlavhasidagi sonlar (rol scope'i bo'yicha).
       Har rolga ochiq — foydalanuvchi baribir faqat o'zi ko'radigan
       loyihalar sonini oladi."""
    role, dept_id, div_id = get_scope(get_jwt())
    projects = _scoped_projects(role, dept_id, div_id, int(get_jwt_identity()))
    return jsonify({
        'total': len(projects),
        'active': sum(1 for p in projects if (p.status or 'active') == 'active'),
        'completed': sum(1 for p in projects if p.status == 'completed'),
        'cancelled': sum(1 for p in projects if p.status == 'cancelled'),
        'inactive': sum(1 for p in projects if p.status in ('inactive', 'on_hold')),
    })


@projects_bp.route('/<int:project_id>', methods=['GET'])
@jwt_required()
def get_project(project_id):
    project = _get_visible_project(project_id)
    if project is None:
        return jsonify({'error': 'Loyiha topilmadi'}), 404
    data = project.to_dict()
    data['perms'] = {
        'manage': can_manage_project(project),
        'delete': _can_delete_project(project),
        'see_all_reports': _sees_all_reports(project),
    }

    team_stats = []
    teams_in_project = {}
    for stage in project.stages:
        if stage.team_id and stage.team:
            tid = stage.team_id
            if tid not in teams_in_project:
                teams_in_project[tid] = {
                    'team_id': tid,
                    'team_name': stage.team.name,
                    'total_stages': 0,
                    'completed': 0,
                    'on_time': 0,
                    'late': 0,
                    'in_progress': 0,
                    'pending': 0,
                }
            t = teams_in_project[tid]
            t['total_stages'] += 1
            if stage.status == 'completed':
                t['completed'] += 1
                if stage.deadline and stage.completed_at:
                    if stage.completed_at <= stage.deadline:
                        t['on_time'] += 1
                    else:
                        t['late'] += 1
                else:
                    t['on_time'] += 1
            elif stage.status == 'in_progress':
                t['in_progress'] += 1
                if stage.is_overdue:
                    t['late'] += 1
            else:
                t['pending'] += 1

    team_stats = list(teams_in_project.values())

    all_members = set()
    for team in project.teams:
        for m in team.members:
            all_members.add(m.id)

    data['team_stats'] = team_stats
    data['total_participants'] = len(all_members)

    return jsonify(data)


@projects_bp.route('', methods=['POST'])
@jwt_required()
def create_project():
    if not can_create_project():
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    import json
    if request.content_type and 'multipart' in request.content_type:
        name = request.form.get('name', '').strip()
        description = request.form.get('description', '').strip()
        start_date = request.form.get('start_date')
        deadline = request.form.get('deadline')
        stages_data = json.loads(request.form.get('stages', '[]'))
        files = request.files.getlist('files')
    else:
        data = request.get_json(silent=True) or {}
        name = (data.get('name') or '').strip()
        description = (data.get('description') or '').strip()
        start_date = data.get('start_date')
        deadline = data.get('deadline')
        stages_data = data.get('stages', [])
        files = []

    if not name:
        return jsonify({'error': 'Loyiha nomi kiritilishi shart'}), 400
    if not stages_data:
        return jsonify({'error': 'Kamida bitta etap kiritilishi shart'}), 400

    project = Project(
        name=name,
        description=description,
        start_date=parse_datetime(start_date) if start_date else None,
        deadline=parse_datetime(deadline) if deadline else None,
        created_by=int(get_jwt_identity()),
    )
    db.session.add(project)
    db.session.flush()

    # Barcha bosqichlar ijrochilarini birlashtirib tatilda emasligini tekshiramiz
    all_stage_users = set()
    all_stage_teams = set()
    for st in stages_data:
        if isinstance(st, dict):
            if st.get('assignee_id'):
                all_stage_users.add(int(st['assignee_id']))
            for uid in st.get('assignee_ids', []):
                if uid:
                    all_stage_users.add(int(uid))
            if st.get('team_id'):
                all_stage_teams.add(int(st['team_id']))
    scope_err = _check_division_scope(all_stage_users, all_stage_teams)
    if scope_err:
        return scope_err
    vac_err = _check_no_vacation(all_stage_users)
    if vac_err:
        return vac_err

    all_team_ids = set()
    created_stages = []
    for i, stage_obj in enumerate(stages_data):
        s_name = stage_obj.get('name', '').strip() if isinstance(stage_obj, dict) else str(stage_obj).strip()
        s_start_date = stage_obj.get('start_date') if isinstance(stage_obj, dict) else None
        s_deadline = stage_obj.get('deadline') if isinstance(stage_obj, dict) else None
        s_team_id = stage_obj.get('team_id') if isinstance(stage_obj, dict) else None
        s_assignee_id = stage_obj.get('assignee_id') if isinstance(stage_obj, dict) else None
        s_assignee_ids = stage_obj.get('assignee_ids', []) if isinstance(stage_obj, dict) else []
        if s_team_id:
            all_team_ids.add(s_team_id)
        stage = ProjectStage(
            project_id=project.id,
            name=s_name,
            order=i + 1,
            status='in_progress' if i == 0 else 'pending',
            start_date=parse_datetime(s_start_date) if s_start_date else None,
            deadline=parse_datetime(s_deadline) if s_deadline else None,
            team_id=s_team_id,
            assignee_id=s_assignee_id,
        )
        for uid in s_assignee_ids:
            u = User.query.get(int(uid))
            if u:
                stage.assignees.append(u)
        db.session.add(stage)
        created_stages.append(stage)

    # Bosqich ID'lari bildirishnomada kerak — avval yozib olamiz
    db.session.flush()
    for stage in created_stages:
        events.stage_assigned(stage, project)

    for tid in all_team_ids:
        team = Team.query.get(tid)
        if team:
            project.teams.append(team)

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    for f in files:
        if f.filename:
            _save_project_file(project, f)

    log_audit('create', 'project', project.id, entity_label=project.name,
              details=f"{len(stages_data)} ta bosqich")
    db.session.commit()
    return jsonify(project.to_dict()), 201


@projects_bp.route('/<int:project_id>', methods=['PUT'])
@jwt_required()
def update_project(project_id):
    project = Project.query.get_or_404(project_id)
    if not can_manage_project(project):
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    data = request.get_json(silent=True) or {}

    if 'name' in data and (data['name'] or '').strip():
        project.name = data['name'].strip()
    if 'description' in data:
        project.description = (data['description'] or '').strip()
    if 'status' in data and data['status'] != project.status:
        err = _apply_project_status(project, data['status'], data.get('cancel_reason', ''))
        if err:
            return err
    if 'start_date' in data:
        project.start_date = parse_datetime(data['start_date']) if data['start_date'] else None
    if 'deadline' in data:
        project.deadline = parse_datetime(data['deadline']) if data['deadline'] else None
    if 'team_ids' in data:
        project.teams = []
        for tid in data['team_ids']:
            team = Team.query.get(tid)
            if team:
                project.teams.append(team)

    log_audit('update', 'project', project.id, entity_label=project.name)
    db.session.commit()
    return jsonify(project.to_dict())


def _apply_project_status(project, new_status, reason=''):
    """Loyiha holatini o'zgartiradi va sana ustunlarini moslaydi.

    Muammo bo'lsa tayyor xato javobini qaytaradi (aks holda None).
    Yakunlash sharti: barcha bosqichlar tasdiqlangan bo'lishi kerak.
    """
    if new_status not in Project.STATUSES:
        return jsonify({'error': "Noto'g'ri holat"}), 400

    now = datetime.now(timezone.utc)

    if new_status == Project.STATUS_COMPLETED:
        if not project.stages:
            return jsonify({'error': "Bosqichsiz loyihani yakunlab bo'lmaydi"}), 400
        if not project.all_stages_done():
            left = sum(1 for s in project.stages if s.status != 'completed')
            return jsonify({
                'error': f"Avval barcha bosqichlar tasdiqlansin — {left} ta bosqich qoldi"
            }), 400
        project.completed_at = now
        project.cancelled_at = None
    elif new_status == Project.STATUS_CANCELLED:
        project.cancelled_at = now
        project.completed_at = None
        project.cancel_reason = (reason or '').strip()
    else:
        # Faol / nofaol holatga qaytarilganda yakunlash izlari tozalanadi
        project.completed_at = None
        project.cancelled_at = None
        project.cancel_reason = ''

    project.status = new_status
    log_audit('update', 'project', project.id, entity_label=project.name,
              details=f"holat: {Project.STATUS_LABELS.get(new_status, new_status)}"
                      + (f" — {reason.strip()}" if reason and reason.strip() else ''))
    return None


@projects_bp.route('/<int:project_id>/status', methods=['POST'])
@jwt_required()
def change_project_status(project_id):
    """Loyihani yakunlash / bekor qilish / nofaol qilish / qayta faollashtirish.

    Ruxsat loyihani tahrirlash huquqi bilan bir xil — yakunlash tahrirlash
    funksiyasining bir qismi.
    """
    project = Project.query.get_or_404(project_id)
    if not can_manage_project(project):
        return jsonify({'error': "Loyihani boshqarish huquqingiz yo'q"}), 403

    data = request.get_json() or {}
    err = _apply_project_status(project, data.get('status', ''), data.get('reason', ''))
    if err:
        return err

    db.session.commit()
    return jsonify(project.to_dict())


def _can_delete_project(project):
    """Boshqarma rahbari va yuqori yoki "Loyihani o'chirish" huquqi berilgan
    xodim — faqat o'zi boshqara oladigan loyihani."""
    claims = get_jwt()
    role = claims.get('role', '')
    if not is_admin_or_above(role) and not has_permission('project.delete', claims):
        return False
    return can_manage_project(project)


@projects_bp.route('/<int:project_id>', methods=['DELETE'])
@jwt_required()
def delete_project(project_id):
    # Loyihani o'chirish — boshqarma rahbari va yuqori rollarga, hamda
    # "Loyihani o'chirish" huquqi alohida berilgan xodimga (/roles sahifasida
    # rol yoki xodim darajasida beriladi). Bo'lim rahbari bu huquqsiz faqat
    # tahrirlaydi, o'chira olmaydi.
    project = Project.query.get_or_404(project_id)
    if not _can_delete_project(project):
        return jsonify({'error': "Loyihani o'chirish huquqingiz yo'q"}), 403

    log_audit('delete', 'project', project.id, entity_label=project.name)
    # Bosqichlar kaskad bilan o'chadi — ularga ishora qiluvchi bildirishnomalar
    # esa o'z-o'zidan ketmaydi (tashqi kalit yo'q), qo'lda tozalaymiz.
    events.stages_deleted([s.id for s in project.stages])
    for att in project.attachments:
        filepath = os.path.join(UPLOAD_DIR, att.filename)
        if os.path.exists(filepath):
            os.remove(filepath)
    db.session.delete(project)
    db.session.commit()
    return jsonify({'message': 'Loyiha o\'chirildi'})


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>', methods=['PUT'])
@jwt_required()
def update_stage(project_id, stage_id):
    user_id = int(get_jwt_identity())
    stage = _stage_of(project_id, stage_id)
    if stage is None:
        return jsonify({'error': 'Bosqich topilmadi'}), 404
    # Bosqich tahrirlash (nomi/muddati/ijrochilari) va ijroni qabul qilish —
    # loyihani boshqarish huquqi bo'lganlarga (bo'lim rahbari uchun: o'zi
    # yaratgan loyiha). Status yuborish (review) esa ijrochi tomonidan.
    is_admin = can_manage_project(stage.project)

    data = request.get_json(silent=True) or {}

    if 'status' in data:
        new_status = data['status']
        now = datetime.now(timezone.utc)
        if new_status not in STAGE_STATUSES:
            return jsonify({'error': "Noto'g'ri holat"}), 400

        if not is_admin:
            if new_status == 'review':
                user = User.query.get(user_id)
                user_team_ids = {t.id for t in user.teams} if user else set()
                stage_assignee_ids = {a.id for a in stage.assignees}
                can_submit = (stage.assignee_id == user_id) or (user_id in stage_assignee_ids) or \
                             (not stage.assignee_id and not stage_assignee_ids and stage.team_id in user_team_ids)
                if not can_submit:
                    return jsonify({'error': 'Sizda bu etapni yuborish huquqi yo\'q'}), 403
                if stage.status != 'in_progress':
                    return jsonify({'error': 'Faqat jarayondagi etapni yuborish mumkin'}), 400
            else:
                return jsonify({'error': 'Ruxsat yo\'q'}), 403

        if is_admin:
            if new_status == 'completed' and stage.status != 'review':
                return jsonify({'error': 'Avval xodim bajarildi deb yuborishi kerak'}), 400

        if new_status == 'in_progress' and not stage.started_at:
            stage.started_at = now
        if new_status != 'completed':
            stage.completed_at = None
        if new_status == 'completed':
            stage.completed_at = now
            next_stage = ProjectStage.query.filter_by(
                project_id=project_id, order=stage.order + 1
            ).first()
            if next_stage and next_stage.status == 'pending':
                next_stage.status = 'in_progress'
                next_stage.started_at = now

        stage.status = new_status
        STATUS_UZ = {'in_progress': 'jarayonda', 'review': 'tekshiruvda',
                     'completed': 'tugallandi', 'pending': 'kutilmoqda'}
        log_audit('update', 'project_stage', stage.id, entity_label=stage.name,
                  details=f"holat: {STATUS_UZ.get(new_status, new_status)}")
        events.stage_status_changed(stage, stage.project, new_status)

    if is_admin:
        candidate_ids = set()
        if 'assignee_id' in data and data['assignee_id']:
            candidate_ids.add(int(data['assignee_id']))
        if 'assignee_ids' in data:
            for uid in data.get('assignee_ids', []):
                if uid:
                    candidate_ids.add(int(uid))
        # Bo'lim rahbari o'z bo'limidan tashqariga biriktira olmaydi
        scope_err = _check_division_scope(candidate_ids, [data.get('team_id')])
        if scope_err:
            return scope_err
        # Tatildagi xodimga biriktirib bo'lmaydi
        if candidate_ids:
            vac_err = _check_no_vacation(candidate_ids)
            if vac_err:
                return vac_err

        if 'name' in data and (data['name'] or '').strip():
            stage.name = data['name'].strip()
        if 'start_date' in data:
            stage.start_date = parse_datetime(data['start_date']) if data['start_date'] else None
        if 'deadline' in data:
            stage.deadline = parse_datetime(data['deadline']) if data['deadline'] else None
        if 'team_id' in data:
            stage.team_id = data['team_id'] or None
            # Yangi guruh loyiha ro'yxatida ham bo'lsin — aks holda uning
            # a'zolari loyihani ko'rmay qolardi
            if stage.team_id:
                team = Team.query.get(stage.team_id)
                if team and team not in stage.project.teams:
                    stage.project.teams.append(team)
        # Faqat yangi qo'shilganlarga xabar ketsin — ilgari ham biriktirilgan
        # xodim har tahrirda takroriy bildirishnoma olmasligi kerak
        before_ids = set(_stage_assignee_ids(stage))
        if 'assignee_id' in data:
            stage.assignee_id = data['assignee_id'] or None
        if 'assignee_ids' in data:
            stage.assignees = []
            for uid in data['assignee_ids']:
                u = User.query.get(int(uid))
                if u:
                    stage.assignees.append(u)
        newly_assigned = [uid for uid in _stage_assignee_ids(stage) if uid not in before_ids]
        if newly_assigned:
            events.stage_assigned(stage, stage.project, newly_assigned)

    db.session.commit()

    return jsonify(stage.project.to_dict())


@projects_bp.route('/<int:project_id>/stages', methods=['POST'])
@jwt_required()
def add_stage(project_id):
    project = Project.query.get_or_404(project_id)
    if not can_manage_project(project):
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Bosqich nomi kiritilishi shart'}), 400

    # Tatildagi xodimga biriktirib bo'lmaydi
    candidate_ids = set()
    if data.get('assignee_id'):
        candidate_ids.add(int(data['assignee_id']))
    for uid in data.get('assignee_ids', []):
        if uid:
            candidate_ids.add(int(uid))
    scope_err = _check_division_scope(candidate_ids, [data.get('team_id')])
    if scope_err:
        return scope_err
    if candidate_ids:
        vac_err = _check_no_vacation(candidate_ids)
        if vac_err:
            return vac_err

    max_order = max((s.order for s in project.stages), default=0)
    # Oldingi bosqichlarning barchasi tugagan bo'lsa yangi bosqich darhol
    # ishga tushadi — aks holda "kutilmoqda"da qotib qolardi
    starts_now = all(s.status == 'completed' for s in project.stages)
    stage = ProjectStage(
        project_id=project_id,
        name=name,
        order=max_order + 1,
        status='in_progress' if starts_now else 'pending',
        started_at=datetime.now(timezone.utc) if starts_now else None,
        start_date=parse_datetime(data['start_date']) if data.get('start_date') else None,
        deadline=parse_datetime(data['deadline']) if data.get('deadline') else None,
        team_id=data.get('team_id') or None,
        assignee_id=data.get('assignee_id') or None,
    )
    for uid in data.get('assignee_ids', []):
        u = User.query.get(int(uid))
        if u:
            stage.assignees.append(u)

    if data.get('team_id'):
        team = Team.query.get(data['team_id'])
        if team and team not in project.teams:
            project.teams.append(team)

    db.session.add(stage)
    db.session.flush()
    log_audit('create', 'project_stage', stage.id, entity_label=stage.name,
              details=f"loyiha: {project.name}")
    events.stage_assigned(stage, project)
    db.session.commit()
    return jsonify(project.to_dict()), 201


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>', methods=['DELETE'])
@jwt_required()
def delete_stage(project_id, stage_id):
    project = Project.query.get_or_404(project_id)
    if not can_manage_project(project):
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    if len(project.stages) <= 1:
        return jsonify({'error': 'Kamida bitta bosqich bo\'lishi kerak'}), 400

    stage = _stage_of(project_id, stage_id)
    if stage is None:
        return jsonify({'error': 'Bosqich topilmadi'}), 404
    was_active = stage.status in ('in_progress', 'review')
    log_audit('delete', 'project_stage', stage.id, entity_label=stage.name,
              details=f"loyiha: {project.name}")
    events.stages_deleted(stage.id)
    db.session.delete(stage)
    db.session.flush()

    remaining = ProjectStage.query.filter_by(project_id=project_id).order_by(ProjectStage.order).all()
    for i, s in enumerate(remaining):
        s.order = i + 1
    # Jarayondagi bosqich o'chirilsa keyingisi ishga tushadi — aks holda
    # loyiha "kutilmoqda" bosqichlar bilan qotib qolardi
    if was_active and not any(s.status in ('in_progress', 'review') for s in remaining):
        nxt = next((s for s in remaining if s.status == 'pending'), None)
        if nxt:
            nxt.status = 'in_progress'
            nxt.started_at = datetime.now(timezone.utc)

    db.session.commit()
    return jsonify(project.to_dict())


@projects_bp.route('/<int:project_id>/reports', methods=['GET'])
@jwt_required()
def get_reports(project_id):
    project = _get_visible_project(project_id)
    if project is None:
        return jsonify({'error': 'Loyiha topilmadi'}), 404
    q = DailyReport.query.filter_by(project_id=project_id)
    if not _sees_all_reports(project):
        q = q.filter_by(user_id=int(get_jwt_identity()))
    reports = q.order_by(DailyReport.created_at.desc()).all()
    return jsonify([r.to_dict() for r in reports])


@projects_bp.route('/<int:project_id>/reports', methods=['POST'])
@jwt_required()
def create_report(project_id):
    user_id = int(get_jwt_identity())
    claims = get_jwt()

    if request.content_type and 'multipart' in request.content_type:
        content = (request.form.get('content') or '').strip()
        stage_id = request.form.get('stage_id')
    else:
        body = request.get_json(silent=True) or {}
        content = (body.get('content') or '').strip()
        stage_id = body.get('stage_id')

    if not content:
        return jsonify({'error': 'Hisobot matni kiritilishi shart'}), 400

    # Rahbar hisobot topshirmaydi. Bo'lim rahbari esa bosqichga ijrochi
    # sifatida biriktirilgan bo'lsa — pastdagi tekshiruvdan o'tadi.
    if is_admin_or_above(claims.get('role', '')):
        return jsonify({'error': 'Admin hisobot topshira olmaydi'}), 403

    project = Project.query.get_or_404(project_id)
    user = User.query.get(user_id)
    user_team_ids = {t.id for t in user.teams} if user else set()
    assignee_stages = [s for s in project.stages if s.assignee_id == user_id or user_id in {a.id for a in s.assignees}]
    stages_no_assignee = [s for s in project.stages if not s.assignee_id and not s.assignees and s.team_id in user_team_ids]

    can_report = len(assignee_stages) > 0 or len(stages_no_assignee) > 0
    if not can_report:
        return jsonify({'error': 'Sizda hisobot topshirish huquqi yo\'q'}), 403

    try:
        stage_id = int(stage_id) if stage_id else None
    except (TypeError, ValueError):
        stage_id = None
    # Bosqich shu loyihaniki bo'lishi shart; ko'rsatilmasa — xodimning
    # jarayondagi bosqichi (hisobot "Xodim hisobotlari"da bosqich nomi bilan chiqsin)
    if stage_id and not _stage_of(project_id, stage_id):
        return jsonify({'error': 'Bosqich topilmadi'}), 404
    if not stage_id:
        mine = [s for s in assignee_stages + stages_no_assignee if s.status in ('in_progress', 'review')]
        stage_id = mine[0].id if mine else None

    report = DailyReport(
        project_id=project_id,
        user_id=user_id,
        content=content,
        stage_id=stage_id,
    )
    db.session.add(report)
    db.session.flush()

    report_upload_dir = os.path.join(UPLOAD_DIR, 'reports')
    os.makedirs(report_upload_dir, exist_ok=True)

    files = request.files.getlist('files')
    for f in files:
        if f and f.filename:
            ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
            if ext not in ALLOWED_EXTENSIONS:
                continue
            saved_name = f"{uuid.uuid4().hex}.{ext}"
            path = os.path.join(report_upload_dir, saved_name)
            f.save(path)
            attachment = ReportAttachment(
                report_id=report.id,
                filename=saved_name,
                original_name=f.filename,
                file_size=os.path.getsize(path),
            )
            db.session.add(attachment)

    db.session.commit()
    return jsonify(report.to_dict()), 201


def _save_project_file(project, f):
    """Bitta faylni diskka yozib, ProjectAttachment yozuvini qaytaradi.
    Ruxsat etilmagan kengaytma bo'lsa None."""
    ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
    if ext not in ALLOWED_EXTENSIONS:
        return None
    safe_name = f'{uuid.uuid4().hex}.{ext}'
    path = os.path.join(UPLOAD_DIR, safe_name)
    f.save(path)
    att = ProjectAttachment(
        project_id=project.id,
        filename=safe_name,
        original_name=f.filename,
        file_size=os.path.getsize(path),
    )
    db.session.add(att)
    return att


@projects_bp.route('/<int:project_id>/attachments', methods=['POST'])
@jwt_required()
def add_attachments(project_id):
    """Loyiha yaratilgandan keyin ham fayl biriktirish.

    Ilgari fayl faqat yaratish paytida qo'shilardi — tahrirlashda loyihaga
    hujjat qo'shib bo'lmasdi.
    """
    project = Project.query.get_or_404(project_id)
    if not can_manage_project(project):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    files = request.files.getlist('files')
    if not files:
        return jsonify({'error': 'Fayl tanlanmagan'}), 400

    os.makedirs(UPLOAD_DIR, exist_ok=True)
    saved = []
    skipped = []
    for f in files:
        if not f.filename:
            continue
        att = _save_project_file(project, f)
        (saved if att else skipped).append(f.filename)

    if not saved:
        return jsonify({
            'error': "Fayl turi ruxsat etilmagan: " + ', '.join(sorted(ALLOWED_EXTENSIONS))
        }), 400

    log_audit('create', 'project_attachment', project.id, entity_label=project.name,
              details=f"{len(saved)} ta fayl: " + ', '.join(saved))
    db.session.commit()
    return jsonify(project.to_dict()), 201


@projects_bp.route('/<int:project_id>/attachments/<int:att_id>', methods=['DELETE'])
@jwt_required()
def delete_attachment(project_id, att_id):
    project = Project.query.get_or_404(project_id)
    if not can_manage_project(project):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    att = ProjectAttachment.query.filter_by(id=att_id, project_id=project_id).first_or_404()
    filepath = os.path.join(UPLOAD_DIR, att.filename)
    if os.path.exists(filepath):
        os.remove(filepath)

    log_audit('delete', 'project_attachment', project.id, entity_label=project.name,
              details=att.original_name)
    db.session.delete(att)
    db.session.commit()
    return jsonify(project.to_dict())


@projects_bp.route('/files/<filename>', methods=['GET'])
@jwt_required()
def download_file(filename):
    """Loyiha fayli — faqat loyihani ko'ra oladiganlarga."""
    att = ProjectAttachment.query.filter_by(filename=filename).first()
    if att is None or not can_view_project(Project.query.get(att.project_id)):
        return jsonify({'error': 'Fayl topilmadi'}), 404
    return send_from_directory(UPLOAD_DIR, filename, as_attachment=True,
                               download_name=att.original_name)


@projects_bp.route('/report-files/<filename>', methods=['GET'])
@jwt_required()
def download_report_file(filename):
    """Hisobotga biriktirilgan fayl (loyiha va vazifa hisobotlari uchun umumiy
    yo'l). Hisobotni ko'ra oladigan foydalanuvchiga beriladi."""
    from app.routes.tasks import can_view_task_report_file
    att = ReportAttachment.query.filter_by(filename=filename).first()
    allowed = False
    if att is not None and att.task_report_id:
        allowed = can_view_task_report_file(att)
    elif att is not None and att.report_id:
        report = DailyReport.query.get(att.report_id)
        project = Project.query.get(report.project_id) if report else None
        allowed = can_view_project(project) and (
            report.user_id == int(get_jwt_identity()) or _sees_all_reports(project))
    if not allowed:
        return jsonify({'error': 'Fayl topilmadi'}), 404
    report_upload_dir = os.path.join(UPLOAD_DIR, 'reports')
    return send_from_directory(report_upload_dir, filename, as_attachment=True,
                               download_name=att.original_name)


@projects_bp.route('/stats', methods=['GET'])
@jwt_required()
def get_stats():
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    # Rol scope'iga qarab loyihalar
    projects = _scoped_projects(role, dept_id, div_id, int(get_jwt_identity()))
    total = len(projects)
    active = sum(1 for p in projects if p.status == 'active')
    completed = sum(1 for p in projects if p.status == 'completed')
    cancelled = sum(1 for p in projects if p.status == 'cancelled')
    inactive = sum(1 for p in projects if p.status in ('inactive', 'on_hold'))
    scoped_ids = {p.id for p in projects}

    team_performance = {}
    all_stages = [s for s in ProjectStage.query.filter(ProjectStage.team_id.isnot(None)).all()
                  if s.project_id in scoped_ids]
    for stage in all_stages:
        tid = stage.team_id
        if tid not in team_performance:
            team = Team.query.get(tid)
            team_performance[tid] = {
                'team_id': tid,
                'team_name': team.name if team else '?',
                'total': 0,
                'completed': 0,
                'on_time': 0,
                'late': 0,
            }
        tp = team_performance[tid]
        tp['total'] += 1
        if stage.status == 'completed':
            tp['completed'] += 1
            if stage.deadline and stage.completed_at and stage.completed_at <= stage.deadline:
                tp['on_time'] += 1
            elif stage.deadline and stage.completed_at and stage.completed_at > stage.deadline:
                tp['late'] += 1
            else:
                tp['on_time'] += 1

    return jsonify({
        'total': total,
        'active': active,
        'completed': completed,
        'cancelled': cancelled,
        'inactive': inactive,
        'team_performance': list(team_performance.values()),
    })


@projects_bp.route('/full-stats', methods=['GET'])
@jwt_required()
def get_full_stats():
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    # Bo'lim/boshqarma rahbari faqat o'z scope'idagi loyihalar statistikasini ko'radi
    projects = _scoped_projects(role, dept_id, div_id, int(get_jwt_identity()))
    scoped_ids = {p.id for p in projects}
    all_stages = [s for s in ProjectStage.query.filter(ProjectStage.team_id.isnot(None)).all()
                  if s.project_id in scoped_ids]

    team_perf = {}
    for stage in all_stages:
        tid = stage.team_id
        if tid not in team_perf:
            team = Team.query.get(tid)
            team_perf[tid] = {
                'team_id': tid,
                'team_name': team.name if team else '?',
                'member_count': len(team.members) if team else 0,
                'total_stages': 0,
                'completed': 0,
                'on_time': 0,
                'late': 0,
                'in_progress': 0,
                'avg_days': [],
            }
        tp = team_perf[tid]
        tp['total_stages'] += 1
        if stage.status == 'completed':
            tp['completed'] += 1
            if stage.started_at and stage.completed_at:
                sa = stage.started_at.replace(tzinfo=None) if stage.started_at.tzinfo else stage.started_at
                ca = stage.completed_at.replace(tzinfo=None) if stage.completed_at.tzinfo else stage.completed_at
                tp['avg_days'].append((ca - sa).days)
            if stage.deadline and stage.completed_at:
                dl = stage.deadline.replace(tzinfo=None) if stage.deadline.tzinfo else stage.deadline
                ca2 = stage.completed_at.replace(tzinfo=None) if stage.completed_at.tzinfo else stage.completed_at
                if ca2 <= dl:
                    tp['on_time'] += 1
                else:
                    tp['late'] += 1
            else:
                tp['on_time'] += 1
        elif stage.status in ('in_progress', 'review'):
            tp['in_progress'] += 1

    for tp in team_perf.values():
        days = tp.pop('avg_days')
        tp['avg_completion_days'] = round(sum(days) / len(days), 1) if days else 0

    project_stats = []
    for p in projects:
        project_stats.append({
            'id': p.id,
            'name': p.name,
            'status': p.status,
            'start_date': p.start_date.isoformat() if p.start_date else None,
            'deadline': p.deadline.isoformat() if p.deadline else None,
            'progress': p.progress_percent(),
            'stage_count': len(p.stages),
            'completed_stages': sum(1 for s in p.stages if s.status == 'completed'),
            'teams': [{'id': t.id, 'name': t.name} for t in p.teams],
            'total_reports': len(p.reports),
        })

    return jsonify({
        'team_performance': list(team_perf.values()),
        'projects': project_stats,
        'total_projects': len(projects),
        'active_projects': sum(1 for p in projects if p.status == 'active'),
        'completed_projects': sum(1 for p in projects if p.status == 'completed'),
    })


def _can_work_on_stage(stage, user_id):
    """Ichki etaplar: loyihani boshqaruvchi rahbar yoki shu bosqich ijrochisi."""
    if can_manage_project(stage.project):
        return True
    user = User.query.get(user_id)
    user_team_ids = {t.id for t in user.teams} if user else set()
    stage_assignee_ids = {a.id for a in stage.assignees}
    return (stage.assignee_id == user_id) or (user_id in stage_assignee_ids) or \
        (not stage.assignee_id and not stage_assignee_ids and stage.team_id in user_team_ids)


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>/substages', methods=['GET'])
@jwt_required()
def get_substages(project_id, stage_id):
    stage = _stage_of(project_id, stage_id)
    if stage is None or not can_view_project(stage.project):
        return jsonify({'error': 'Bosqich topilmadi'}), 404
    return jsonify([ss.to_dict() for ss in sorted(stage.sub_stages, key=lambda x: x.order)])


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>/substages', methods=['POST'])
@jwt_required()
def create_substage(project_id, stage_id):
    user_id = int(get_jwt_identity())
    stage = _stage_of(project_id, stage_id)
    if stage is None:
        return jsonify({'error': 'Bosqich topilmadi'}), 404
    if not _can_work_on_stage(stage, user_id):
        return jsonify({'error': 'Sizda ichki etap yaratish huquqi yo\'q'}), 403

    data = request.get_json(silent=True) or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Ichki etap nomi kiritilishi shart'}), 400

    max_order = max([ss.order for ss in stage.sub_stages], default=0)
    sub = SubStage(
        stage_id=stage_id,
        name=name,
        order=max_order + 1,
        status='pending' if stage.sub_stages else 'in_progress',
        created_by=user_id,
    )
    db.session.add(sub)
    db.session.commit()

    return jsonify(stage.project.to_dict()), 201


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>/substages/<int:sub_id>', methods=['PUT'])
@jwt_required()
def update_substage(project_id, stage_id, sub_id):
    user_id = int(get_jwt_identity())
    stage = _stage_of(project_id, stage_id)
    sub = SubStage.query.filter_by(id=sub_id, stage_id=stage_id).first() if stage else None
    if sub is None:
        return jsonify({'error': 'Ichki etap topilmadi'}), 404
    if not _can_work_on_stage(stage, user_id):
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    data = request.get_json(silent=True) or {}
    if 'status' in data:
        now = datetime.now(timezone.utc)
        new_status = data['status']
        if new_status not in ('pending', 'in_progress', 'completed'):
            return jsonify({'error': "Noto'g'ri holat"}), 400
        if new_status == 'completed':
            sub.completed_at = now
            next_sub = SubStage.query.filter_by(stage_id=stage_id, order=sub.order + 1).first()
            if next_sub and next_sub.status == 'pending':
                next_sub.status = 'in_progress'
        elif new_status == 'in_progress':
            sub.completed_at = None
        sub.status = new_status
    if 'name' in data and (data['name'] or '').strip():
        sub.name = data['name'].strip()

    db.session.commit()
    return jsonify(stage.project.to_dict())


@projects_bp.route('/<int:project_id>/stages/<int:stage_id>/substages/<int:sub_id>', methods=['DELETE'])
@jwt_required()
def delete_substage(project_id, stage_id, sub_id):
    user_id = int(get_jwt_identity())
    stage = _stage_of(project_id, stage_id)
    sub = SubStage.query.filter_by(id=sub_id, stage_id=stage_id).first() if stage else None
    if sub is None:
        return jsonify({'error': 'Ichki etap topilmadi'}), 404
    if not _can_work_on_stage(stage, user_id):
        return jsonify({'error': 'Ruxsat yo\'q'}), 403

    db.session.delete(sub)
    remaining = SubStage.query.filter_by(stage_id=stage_id).order_by(SubStage.order).all()
    for i, ss in enumerate(remaining):
        ss.order = i + 1
    db.session.commit()

    return jsonify(stage.project.to_dict())
