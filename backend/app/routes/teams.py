from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import Team, User
from app.utils import is_any_admin, get_scope, is_superadmin, dept_user_ids, log_audit

teams_bp = Blueprint('teams', __name__)


@teams_bp.route('', methods=['GET'])
@jwt_required()
def get_teams():
    """Barcha adminlar barcha guruhlarni ko'ra oladi"""
    teams = Team.query.order_by(Team.name).all()
    return jsonify([t.to_dict() for t in teams])


def _validate_members_scope(role, dept_id, div_id, member_ids):
    """A'zolar rahbarning ko'lamiga (boshqarma/bo'lim) tegishli ekanini tekshirish.

    Boshqarma rahbari — faqat o'z boshqarmasi xodimlari, bo'lim rahbari —
    faqat o'z bo'limi xodimlari. Muammo bo'lsa xato matnini qaytaradi.
    """
    ids = [int(x) for x in (member_ids or []) if x]
    if is_superadmin(role) or not ids:
        return None

    users = User.query.filter(User.id.in_(ids)).all()

    if role == 'admin':
        if not dept_id:
            return "Sizga boshqarma biriktirilmagan"
        # Xodim boshqarmaga bo'limi orqali ham tegishli bo'lishi mumkin —
        # `users.department_id` to'ldirilmay qolgan hollarni ham qamraydi
        allowed = dept_user_ids(dept_id)
        for u in users:
            if u.id not in allowed and u.department_id != dept_id:
                return f"{u.full_name} sizning boshqarmangizga tegishli emas"
    elif role == 'department_admin':
        if not div_id:
            return "Sizga bo'lim biriktirilmagan"
        for u in users:
            if u.division_id != div_id:
                return f"{u.full_name} sizning bo'limingizga tegishli emas"
    return None


def _can_manage_team(team, role, dept_id, div_id, user_id):
    """Guruhni tahrirlash/o'chirish huquqi.

    - superadmin/direksiya: barcha guruhlar
    - boshqarma rahbari: o'z boshqarmasi guruhlari (va boshqarmasi
      belgilanmagan eski guruhlar)
    - bo'lim rahbari: o'z bo'limi guruhlari; bo'limi belgilanmagan eski
      guruhlar uchun — o'zi yaratganlari
    """
    if is_superadmin(role):
        return True
    if role == 'admin':
        return not team.department_id or team.department_id == dept_id
    if role == 'department_admin':
        if team.division_id:
            return bool(div_id) and team.division_id == div_id
        return team.created_by == user_id
    return False


@teams_bp.route('', methods=['POST'])
@jwt_required()
def create_team():
    role, dept_id, div_id = get_scope(get_jwt())
    user_id = int(get_jwt_identity())

    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    data = request.get_json()
    name = data.get('name', '').strip()
    member_ids = data.get('member_ids', [])

    if not name:
        return jsonify({'error': 'Guruh nomi kiritilishi shart'}), 400

    err = _validate_members_scope(role, dept_id, div_id, member_ids)
    if err:
        return jsonify({'error': err}), 403

    # Guruh qaysi boshqarma/bo'limga tegishli ekanini aniqlash — keyinchalik
    # o'sha rahbar uni tahrirlay va o'chira olishi shunga bog'liq
    creator = User.query.get(user_id)
    team_dept_id = None
    team_div_id = None
    if role == 'admin':
        team_dept_id = dept_id
    elif role == 'department_admin':
        team_div_id = div_id
        team_dept_id = (creator.department_id if creator else None) or \
            (creator.division.department_id if creator and creator.division else None)
    elif member_ids:
        first_user = User.query.get(member_ids[0])
        if first_user:
            team_dept_id = first_user.department_id

    team = Team(name=name, created_by=user_id,
                department_id=team_dept_id, division_id=team_div_id)
    for uid in member_ids:
        user = User.query.get(uid)
        if user:
            team.members.append(user)

    db.session.add(team)
    db.session.flush()
    log_audit('create', 'team', team.id, entity_label=team.name,
              details=f"{len(team.members)} ta a'zo")
    db.session.commit()
    return jsonify(team.to_dict()), 201


@teams_bp.route('/<int:team_id>', methods=['PUT'])
@jwt_required()
def update_team(team_id):
    role, dept_id, div_id = get_scope(get_jwt())
    user_id = int(get_jwt_identity())

    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    team = Team.query.get_or_404(team_id)

    if not _can_manage_team(team, role, dept_id, div_id, user_id):
        return jsonify({'error': "Bu guruhni tahrirlash huquqingiz yo'q"}), 403

    data = request.get_json()

    if 'name' in data:
        new_name = data['name'].strip()
        if not new_name:
            return jsonify({'error': 'Guruh nomi kiritilishi shart'}), 400
        team.name = new_name
    if 'member_ids' in data:
        err = _validate_members_scope(role, dept_id, div_id, data['member_ids'])
        if err:
            return jsonify({'error': err}), 403
        team.members = []
        for uid in data['member_ids']:
            user = User.query.get(uid)
            if user:
                team.members.append(user)

    log_audit('update', 'team', team.id, entity_label=team.name,
              details=f"{len(team.members)} ta a'zo")
    db.session.commit()
    return jsonify(team.to_dict())


@teams_bp.route('/<int:team_id>', methods=['DELETE'])
@jwt_required()
def delete_team(team_id):
    role, dept_id, div_id = get_scope(get_jwt())
    user_id = int(get_jwt_identity())

    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    team = Team.query.get_or_404(team_id)

    if not _can_manage_team(team, role, dept_id, div_id, user_id):
        return jsonify({'error': "Bu guruhni o'chirish huquqingiz yo'q"}), 403

    # Guruh loyiha bosqichi yoki vazifaga biriktirilgan bo'lsa, o'chirish
    # tashqi kalit xatosi bilan tugaydi — avval tushunarli xabar beramiz
    from app.models import ProjectStage, Task
    stages_used = ProjectStage.query.filter_by(team_id=team.id).count()
    tasks_used = Task.query.filter_by(team_id=team.id).count()
    if stages_used or tasks_used:
        parts = []
        if stages_used:
            parts.append(f"{stages_used} ta loyiha bosqichi")
        if tasks_used:
            parts.append(f"{tasks_used} ta vazifa")
        return jsonify({
            'error': f"Bu guruh {' va '.join(parts)}ga biriktirilgan — "
                     f"avval ularga boshqa ijrochi tanlang"
        }), 400

    log_audit('delete', 'team', team.id, entity_label=team.name)
    db.session.delete(team)
    db.session.commit()
    return jsonify({'message': "Guruh o'chirildi"})
