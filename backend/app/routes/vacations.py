"""
Xodim tatillari (Vacation) — rahbar hodimga tatil beradi.

Turlari:
  annual — Yillik tatil (otpuska)
  unpaid — Haq to'lanmaydigan (BS)
  sick   — Kasallik (balnishniy)

Ruxsat:
  - Berish (POST): superadmin/direksiya (barcha xodimlar),
                   admin (o'z boshqarmasi), department_admin (o'z bo'limi)
  - Xodim o'ziga o'zi bermaydi.
  - Ko'rish (GET): rahbar shu bilan bir doirada; xodim faqat o'zining.
  - O'chirish (DELETE): rahbar shu bilan bir doirada.
"""
from datetime import date as _date, datetime
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import Vacation, User
from app.utils import get_scope, is_any_admin, is_admin_or_above, log_audit

vacations_bp = Blueprint('vacations', __name__)

ALLOWED_TYPES = {'annual', 'unpaid', 'sick'}


def _parse_date(s):
    if not s:
        return None
    try:
        return _date.fromisoformat(s[:10])
    except (ValueError, TypeError):
        return None


def _can_manage_user(actor_id, actor_role, actor_dept, actor_div, target_user):
    """Rahbar ushbu xodimga tatil bera oladimi?"""
    if not target_user or not target_user.is_active:
        return False
    if target_user.id == actor_id:
        return False  # o'ziga o'zi bermaydi
    if actor_role in ('superadmin', 'director', 'deputy_director'):
        return True
    if actor_role == 'admin' and actor_dept and target_user.department_id == actor_dept:
        return True
    if actor_role == 'department_admin' and actor_div and target_user.division_id == actor_div:
        return True
    return False


@vacations_bp.route('', methods=['GET'])
@jwt_required()
def list_vacations():
    """Ro'yxat. Rahbar — scope'idagi; oddiy xodim — faqat o'zining."""
    actor_id = int(get_jwt_identity())
    role, dept_id, div_id = get_scope(get_jwt())

    q = Vacation.query
    if not is_any_admin(role):
        q = q.filter_by(user_id=actor_id)
    elif role == 'admin' and dept_id:
        user_ids = {u.id for u in User.query.filter_by(department_id=dept_id).all()}
        q = q.filter(Vacation.user_id.in_(user_ids)) if user_ids else q.filter(db.false())
    elif role == 'department_admin' and div_id:
        user_ids = {u.id for u in User.query.filter_by(division_id=div_id).all()}
        q = q.filter(Vacation.user_id.in_(user_ids)) if user_ids else q.filter(db.false())

    # Ixtiyoriy filtrlar
    uid = request.args.get('user_id', type=int)
    if uid:
        q = q.filter(Vacation.user_id == uid)
    active_only = request.args.get('active') == '1'
    if active_only:
        today = _date.today()
        q = q.filter(Vacation.from_date <= today, Vacation.to_date >= today)

    items = q.order_by(Vacation.from_date.desc()).all()
    return jsonify([v.to_dict() for v in items])


@vacations_bp.route('', methods=['POST'])
@jwt_required()
def create_vacation():
    actor_id = int(get_jwt_identity())
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    data = request.get_json() or {}
    target_id = data.get('user_id')
    v_type = (data.get('type') or '').strip()
    d_from = _parse_date(data.get('from_date'))
    d_to = _parse_date(data.get('to_date'))
    note = (data.get('note') or '').strip()

    if not target_id:
        return jsonify({'error': 'Xodim tanlanishi shart'}), 400
    if v_type not in ALLOWED_TYPES:
        return jsonify({'error': "Tatil turi noto'g'ri"}), 400
    if not d_from or not d_to:
        return jsonify({'error': "Sanalar noto'g'ri"}), 400
    if d_from > d_to:
        return jsonify({'error': "Boshlash sanasi tugash sanasidan keyin bo'la olmaydi"}), 400

    target = User.query.get(int(target_id))
    if not _can_manage_user(actor_id, role, dept_id, div_id, target):
        return jsonify({'error': "Bu xodimga tatil berish huquqingiz yo'q"}), 403

    v = Vacation(
        user_id=target.id,
        type=v_type,
        from_date=d_from,
        to_date=d_to,
        note=note,
        granted_by=actor_id,
    )
    db.session.add(v)
    db.session.flush()
    log_audit('create', 'vacation', v.id,
              entity_label=f"{target.full_name} — {Vacation.TYPE_LABELS.get(v_type, v_type)}",
              details=f"{d_from} — {d_to}")
    db.session.commit()
    return jsonify(v.to_dict()), 201


@vacations_bp.route('/<int:vac_id>', methods=['DELETE'])
@jwt_required()
def delete_vacation(vac_id):
    actor_id = int(get_jwt_identity())
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    v = Vacation.query.get_or_404(vac_id)
    if not _can_manage_user(actor_id, role, dept_id, div_id, v.user):
        return jsonify({'error': "Sizda o'chirish huquqi yo'q"}), 403

    log_audit('delete', 'vacation', v.id,
              entity_label=f"{v.user.full_name if v.user else '?'} — {Vacation.TYPE_LABELS.get(v.type, v.type)}")
    db.session.delete(v)
    db.session.commit()
    return jsonify({'message': "O'chirildi"})
