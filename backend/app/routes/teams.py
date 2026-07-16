from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import Team, User
from app.utils import is_any_admin, get_scope, is_superadmin

teams_bp = Blueprint('teams', __name__)


@teams_bp.route('', methods=['GET'])
@jwt_required()
def get_teams():
    """Barcha adminlar barcha guruhlarni ko'ra oladi"""
    teams = Team.query.order_by(Team.name).all()
    return jsonify([t.to_dict() for t in teams])


def _validate_members_scope(role, dept_id, member_ids):
    """Admin roli uchun barcha a'zolar bir boshqarmaga tegishli ekanini tekshirish"""
    if is_superadmin(role):
        return None  # to'liq huquq
    if role == 'admin':
        if not dept_id:
            return "Sizga boshqarma biriktirilmagan"
        users = User.query.filter(User.id.in_(member_ids)).all()
        for u in users:
            if u.department_id != dept_id:
                return f"{u.full_name} sizning boshqarmangizga tegishli emas"
    return None


@teams_bp.route('', methods=['POST'])
@jwt_required()
def create_team():
    role, dept_id, _ = get_scope(get_jwt())
    user_id = int(get_jwt_identity())

    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    data = request.get_json()
    name = data.get('name', '').strip()
    member_ids = data.get('member_ids', [])

    if not name:
        return jsonify({'error': 'Guruh nomi kiritilishi shart'}), 400

    err = _validate_members_scope(role, dept_id, member_ids)
    if err:
        return jsonify({'error': err}), 403

    # Boshqarmani aniqlash
    team_dept_id = None
    if role == 'admin':
        team_dept_id = dept_id
    elif member_ids:
        first_user = User.query.get(member_ids[0])
        if first_user:
            team_dept_id = first_user.department_id

    team = Team(name=name, created_by=user_id, department_id=team_dept_id)
    for uid in member_ids:
        user = User.query.get(uid)
        if user:
            team.members.append(user)

    db.session.add(team)
    db.session.commit()
    return jsonify(team.to_dict()), 201


@teams_bp.route('/<int:team_id>', methods=['PUT'])
@jwt_required()
def update_team(team_id):
    role, dept_id, _ = get_scope(get_jwt())

    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    team = Team.query.get_or_404(team_id)

    # Admin faqat o'z boshqarmasidagi guruhlarni tahrirlaydi
    if role == 'admin' and team.department_id and team.department_id != dept_id:
        return jsonify({'error': "Boshqa boshqarma guruhini tahrirlab bo'lmaydi"}), 403

    data = request.get_json()

    if 'name' in data:
        team.name = data['name'].strip()
    if 'member_ids' in data:
        err = _validate_members_scope(role, dept_id, data['member_ids'])
        if err:
            return jsonify({'error': err}), 403
        team.members = []
        for uid in data['member_ids']:
            user = User.query.get(uid)
            if user:
                team.members.append(user)

    db.session.commit()
    return jsonify(team.to_dict())


@teams_bp.route('/<int:team_id>', methods=['DELETE'])
@jwt_required()
def delete_team(team_id):
    role, dept_id, _ = get_scope(get_jwt())

    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    team = Team.query.get_or_404(team_id)

    if role == 'admin' and team.department_id and team.department_id != dept_id:
        return jsonify({'error': "Boshqa boshqarma guruhini o'chirib bo'lmaydi"}), 403

    db.session.delete(team)
    db.session.commit()
    return jsonify({'message': "Guruh o'chirildi"})
