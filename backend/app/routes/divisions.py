from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from app import db
from app.models import Division, Department, User
from app.utils import get_scope, is_superadmin, is_any_admin, log_audit

divisions_bp = Blueprint('divisions', __name__)


@divisions_bp.route('', methods=['GET'])
@jwt_required()
def get_divisions():
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    dept_filter = request.args.get('department_id', type=int)
    q = Division.query
    if dept_filter:
        q = q.filter_by(department_id=dept_filter)
    elif role == 'admin' and dept_id:
        q = q.filter_by(department_id=dept_id)
    divisions = q.order_by(Division.name).all()
    return jsonify([d.to_dict() for d in divisions])


@divisions_bp.route('', methods=['POST'])
@jwt_required()
def create_division():
    role, _, _ = get_scope(get_jwt())
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    data = request.get_json()
    name = (data.get('name') or '').strip()
    dept_id = data.get('department_id')
    if not name or not dept_id:
        return jsonify({'error': "Bo'lim nomi va boshqarma tanlanishi shart"}), 400
    dept = Department.query.get(dept_id)
    if not dept:
        return jsonify({'error': 'Boshqarma topilmadi'}), 404
    div = Division(
        name=name,
        department_id=dept_id,
        description=(data.get('description') or '').strip()
    )
    db.session.add(div)
    db.session.flush()
    log_audit('create', 'division', div.id, entity_label=div.name)
    db.session.commit()
    return jsonify(div.to_dict()), 201


@divisions_bp.route('/<int:div_id>', methods=['PUT'])
@jwt_required()
def update_division(div_id):
    role, _, _ = get_scope(get_jwt())
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    div = Division.query.get_or_404(div_id)
    data = request.get_json()
    if 'name' in data:
        div.name = data['name'].strip()
    if 'description' in data:
        div.description = data['description'].strip()
    if 'department_id' in data:
        div.department_id = data['department_id']
    log_audit('update', 'division', div.id, entity_label=div.name)
    db.session.commit()
    return jsonify(div.to_dict())


@divisions_bp.route('/<int:div_id>', methods=['DELETE'])
@jwt_required()
def delete_division(div_id):
    role, _, _ = get_scope(get_jwt())
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    div = Division.query.get_or_404(div_id)
    log_audit('delete', 'division', div.id, entity_label=div.name)
    db.session.delete(div)
    db.session.commit()
    return jsonify({'message': "Bo'lim o'chirildi"})


@divisions_bp.route('/<int:div_id>/members', methods=['POST'])
@jwt_required()
def add_member(div_id):
    role, _, _ = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    div = Division.query.get_or_404(div_id)
    data = request.get_json()
    user_ids = data.get('user_ids', [])
    for uid in user_ids:
        user = User.query.get(uid)
        if user:
            user.division_id = div_id
            user.department_id = div.department_id
    db.session.commit()
    return jsonify(div.to_dict())


@divisions_bp.route('/<int:div_id>/members/<int:user_id>', methods=['DELETE'])
@jwt_required()
def remove_member(div_id, user_id):
    role, _, _ = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    user = User.query.get_or_404(user_id)
    if user.division_id == div_id:
        user.division_id = None
    db.session.commit()
    return jsonify({'message': "Xodim bo'limdan chiqarildi"})
