"""
Interaktiv xizmatlar — bo'limlar (kategoriyalar) va ular ichidagi xizmat turlari.

Endpoint'lar:
  GET    /api/interactive/departments                — barcha bo'limlar (+type_count)
  POST   /api/interactive/departments                — yangi bo'lim
  PUT    /api/interactive/departments/<id>           — nomni o'zgartirish
  DELETE /api/interactive/departments/<id>           — o'chirish (turlari ham cascade)

  GET    /api/interactive/departments/<id>/types     — bo'limning turlari
  POST   /api/interactive/departments/<id>/types     — yangi tur
  PUT    /api/interactive/types/<id>                 — nomni o'zgartirish
  DELETE /api/interactive/types/<id>                 — o'chirish

Ruxsat: superadmin, director, deputy_director, admin (Boshqarma rahbari)
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt
from sqlalchemy import func
from app import db
from app.models import ServiceDepartment, ServiceType
from app.utils import is_admin_or_above, log_audit

interactive_bp = Blueprint('interactive_services', __name__)


def _require_admin():
    role = get_jwt().get('role', '')
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    return None


# =========================================================================
# BO'LIMLAR (kategoriyalar)
# =========================================================================

@interactive_bp.route('/departments', methods=['GET'])
@jwt_required()
def list_departments():
    err = _require_admin()
    if err:
        return err

    # Bitta SQL — bo'limlar va ularning tur soni birgalikda (N+1 yo'q)
    rows = (
        db.session.query(
            ServiceDepartment,
            func.count(ServiceType.id).label('type_count'),
        )
        .outerjoin(ServiceType, ServiceType.department_id == ServiceDepartment.id)
        .group_by(ServiceDepartment.id)
        .order_by(ServiceDepartment.id)
        .all()
    )
    return jsonify([d.to_dict(type_count=cnt) for d, cnt in rows])


@interactive_bp.route('/departments', methods=['POST'])
@jwt_required()
def create_department():
    err = _require_admin()
    if err:
        return err

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Nom kiritilishi shart'}), 400

    dept = ServiceDepartment(name=name)
    db.session.add(dept)
    db.session.flush()
    log_audit('create', 'service_department', dept.id, entity_label=dept.name)
    db.session.commit()
    return jsonify(dept.to_dict(type_count=0)), 201


@interactive_bp.route('/departments/<int:dept_id>', methods=['PUT'])
@jwt_required()
def update_department(dept_id):
    err = _require_admin()
    if err:
        return err

    dept = ServiceDepartment.query.get_or_404(dept_id)
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Nom kiritilishi shart'}), 400

    dept.name = name
    log_audit('update', 'service_department', dept.id, entity_label=dept.name)
    db.session.commit()
    return jsonify(dept.to_dict())


@interactive_bp.route('/departments/<int:dept_id>', methods=['DELETE'])
@jwt_required()
def delete_department(dept_id):
    err = _require_admin()
    if err:
        return err

    dept = ServiceDepartment.query.get_or_404(dept_id)
    log_audit('delete', 'service_department', dept.id, entity_label=dept.name)
    db.session.delete(dept)  # cascade — turlar ham o'chadi
    db.session.commit()
    return jsonify({'message': "Bo'lim o'chirildi"})


# =========================================================================
# XIZMAT TURLARI
# =========================================================================

@interactive_bp.route('/departments/<int:dept_id>/types', methods=['GET'])
@jwt_required()
def list_types(dept_id):
    err = _require_admin()
    if err:
        return err

    # Bo'lim mavjudligini tekshirmasdan to'g'ridan-to'g'ri turlarni qaytaramiz
    # (kerak bo'lsa 404 qaytarish uchun query.get_or_404 qo'llash mumkin)
    types = (
        ServiceType.query
        .filter_by(department_id=dept_id)
        .order_by(ServiceType.id)
        .all()
    )
    return jsonify([t.to_dict() for t in types])


@interactive_bp.route('/departments/<int:dept_id>/types', methods=['POST'])
@jwt_required()
def create_type(dept_id):
    err = _require_admin()
    if err:
        return err

    # Bo'lim mavjud emasligini bir marta tekshiramiz
    if not db.session.query(ServiceDepartment.id).filter_by(id=dept_id).first():
        return jsonify({'error': "Bo'lim topilmadi"}), 404

    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Nom kiritilishi shart'}), 400

    t = ServiceType(department_id=dept_id, name=name)
    db.session.add(t)
    db.session.flush()
    log_audit('create', 'service_type', t.id, entity_label=t.name,
              details=f"department_id={dept_id}")
    db.session.commit()
    return jsonify(t.to_dict()), 201


@interactive_bp.route('/types/<int:type_id>', methods=['PUT'])
@jwt_required()
def update_type(type_id):
    err = _require_admin()
    if err:
        return err

    t = ServiceType.query.get_or_404(type_id)
    data = request.get_json() or {}
    name = (data.get('name') or '').strip()
    if not name:
        return jsonify({'error': 'Nom kiritilishi shart'}), 400

    t.name = name
    log_audit('update', 'service_type', t.id, entity_label=t.name)
    db.session.commit()
    return jsonify(t.to_dict())


@interactive_bp.route('/types/<int:type_id>', methods=['DELETE'])
@jwt_required()
def delete_type(type_id):
    err = _require_admin()
    if err:
        return err

    t = ServiceType.query.get_or_404(type_id)
    log_audit('delete', 'service_type', t.id, entity_label=t.name)
    db.session.delete(t)
    db.session.commit()
    return jsonify({'message': "Xizmat turi o'chirildi"})
