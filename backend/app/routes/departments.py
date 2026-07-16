from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from app import db
from app.models import Department
from app.utils import get_scope, is_superadmin, is_any_admin, log_audit

departments_bp = Blueprint('departments', __name__)


@departments_bp.route('', methods=['GET'])
@jwt_required()
def get_departments():
    role, _, _ = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    departments = Department.query.order_by(Department.name).all()
    return jsonify([d.to_dict() for d in departments])


@departments_bp.route('', methods=['POST'])
@jwt_required()
def create_department():
    role, _, _ = get_scope(get_jwt())
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    data = request.get_json()
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Boshqarma nomi kiritilishi shart'}), 400
    if Department.query.filter_by(name=name).first():
        return jsonify({'error': 'Bu nomli boshqarma allaqachon mavjud'}), 400
    dept = Department(name=name, description=(data.get('description') or '').strip())
    db.session.add(dept)
    db.session.flush()
    log_audit('create', 'department', dept.id, entity_label=dept.name)
    db.session.commit()
    return jsonify(dept.to_dict()), 201


@departments_bp.route('/<int:dept_id>', methods=['PUT'])
@jwt_required()
def update_department(dept_id):
    role, _, _ = get_scope(get_jwt())
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    dept = Department.query.get_or_404(dept_id)
    data = request.get_json()
    if 'name' in data:
        name = data['name'].strip()
        existing = Department.query.filter(Department.name == name, Department.id != dept_id).first()
        if existing:
            return jsonify({'error': 'Bu nomli boshqarma allaqachon mavjud'}), 400
        dept.name = name
    if 'description' in data:
        dept.description = data['description'].strip()
    log_audit('update', 'department', dept.id, entity_label=dept.name)
    db.session.commit()
    return jsonify(dept.to_dict())


@departments_bp.route('/<int:dept_id>', methods=['DELETE'])
@jwt_required()
def delete_department(dept_id):
    role, _, _ = get_scope(get_jwt())
    if not is_superadmin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    dept = Department.query.get_or_404(dept_id)
    log_audit('delete', 'department', dept.id, entity_label=dept.name)
    db.session.delete(dept)
    db.session.commit()
    return jsonify({'message': "Boshqarma o'chirildi"})
