from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from app import db
from app.models import User, Division
from app.utils import get_scope, is_superadmin, can_manage_roles, log_audit

permissions_bp = Blueprint('permissions', __name__)

VALID_ROLES = ('superadmin', 'director', 'deputy_director', 'admin', 'department_admin', 'user')

ROLE_LABELS = {
    'superadmin': 'Bosh Administrator',
    'director': 'Direksiya Direktori',
    'deputy_director': "Direktor O'rinbosari",
    'admin': "Boshqarma Rahbari",
    'department_admin': "Bo'lim Rahbari",
    'user': 'Xodim',
}


@permissions_bp.route('/users', methods=['GET'])
@jwt_required()
def list_users():
    role, _, _ = get_scope(get_jwt())
    if not can_manage_roles(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    users = User.query.filter_by(is_active=True).order_by(User.full_name).all()
    return jsonify([_user_dict(u) for u in users])


@permissions_bp.route('/roles', methods=['GET'])
@jwt_required()
def get_roles():
    return jsonify([{'value': k, 'label': v} for k, v in ROLE_LABELS.items()])


@permissions_bp.route('/set-role', methods=['POST'])
@jwt_required()
def set_role():
    role, _, _ = get_scope(get_jwt())
    if not can_manage_roles(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    data = request.get_json()
    user_id = data.get('user_id')
    new_role = data.get('role', 'user')
    dept_id = data.get('department_id') or None
    div_id = data.get('division_id') or None

    if new_role not in VALID_ROLES:
        return jsonify({'error': "Noto'g'ri rol"}), 400

    user = User.query.get_or_404(user_id)

    if user.role == 'superadmin':
        return jsonify({'error': "Bosh admin rolini o'zgartirib bo'lmaydi"}), 400

    user.role = new_role

    if new_role == 'admin':
        user.department_id = dept_id
        user.division_id = None
    elif new_role == 'department_admin':
        user.division_id = div_id
        if div_id:
            div = Division.query.get(div_id)
            user.department_id = div.department_id if div else None
        else:
            user.department_id = dept_id
    else:
        # user: assign home division/dept
        user.division_id = div_id
        if div_id:
            div = Division.query.get(div_id)
            user.department_id = div.department_id if div else dept_id
        else:
            user.department_id = dept_id

    log_audit('set_role', 'user', user.id, entity_label=user.full_name,
              details=f"role={new_role}, dept_id={user.department_id}, div_id={user.division_id}")
    db.session.commit()
    return jsonify({'message': "Rol o'zgartirildi", 'user': _user_dict(user)})


@permissions_bp.route('/user/<int:user_id>', methods=['GET'])
@jwt_required()
def get_user_role(user_id):
    role, _, _ = get_scope(get_jwt())
    if not can_manage_roles(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    user = User.query.get_or_404(user_id)
    return jsonify(_user_dict(user))


def _user_dict(u):
    dept = u.managed_department
    div = u.division
    return {
        'id': u.id,
        'full_name': u.full_name,
        'position': u.position or '',
        'department': u.department or '',
        'role': u.role,
        'role_label': ROLE_LABELS.get(u.role, u.role),
        'department_id': u.department_id,
        'department_name': dept.name if dept else None,
        'division_id': u.division_id,
        'division_name': div.name if div else None,
        'is_active': u.is_active,
    }
