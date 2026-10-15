from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import Division, Department, User, Team
from app.utils import (
    get_scope, is_superadmin, is_any_admin, log_audit,
    scope_user_ids, in_scope, role_rank,
)

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
    data = request.get_json(silent=True) or {}
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
    data = request.get_json(silent=True) or {}
    if 'name' in data:
        div.name = data['name'].strip()
    if 'description' in data:
        div.description = data['description'].strip()
    if 'department_id' in data:
        div.department_id = data['department_id']
    # Interaktiv xizmat ko'rsatuvchi bo'lim belgisi — belgilangan bo'limlar
    # a'zolari interaktiv arizalarga biriktirilishi mumkin bo'ladi
    if 'is_service_provider' in data:
        div.is_service_provider = bool(data['is_service_provider'])
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
    # Bo'limga ishora qiluvchi xodim va guruhlar bo'shatiladi — aks holda
    # tashqi kalit xatosi (500) chiqardi
    User.query.filter_by(division_id=div.id).update({'division_id': None})
    Team.query.filter_by(division_id=div.id).update({'division_id': None})
    db.session.delete(div)
    db.session.commit()
    return jsonify({'message': "Bo'lim o'chirildi"})


def _member_scope_error(div, users):
    """Bo'limga a'zo qo'shish/chiqarish huquqi.

    Ilgari istalgan rahbar istalgan xodimni (Bosh Administratorni ham) o'z
    bo'limiga ko'chira olardi — keyin uni "o'z boshqarmasi xodimi" sifatida
    tahrirlab, parolini almashtirardi. Endi:
      - bo'lim rahbarning ko'lamida bo'lishi shart (boshqarma rahbari — o'z
        boshqarmasi bo'limlari, bo'lim rahbari — faqat o'z bo'limi);
      - xodim rahbardan past darajada bo'lishi va hali hech qayerga
        biriktirilmagan yoki rahbarning o'z ko'lamida bo'lishi shart.
    """
    role, dept_id, my_div_id = get_scope(get_jwt())
    me = int(get_jwt_identity())
    if role == 'admin' and div.department_id != dept_id:
        return "Bu bo'lim sizning boshqarmangizga tegishli emas"
    if role == 'department_admin' and div.id != my_div_id:
        return "Faqat o'z bo'limingiz a'zolarini boshqara olasiz"

    scope = scope_user_ids(role, dept_id, my_div_id, me)
    for u in users:
        unassigned = not u.division_id and not u.department_id
        if role_rank(u.role) >= role_rank(role) and role != 'superadmin':
            return f"{u.full_name} — sizdan yuqori yoki teng lavozimdagi xodim"
        if not unassigned and not in_scope(u.id, scope):
            return f"{u.full_name} boshqa boshqarma/bo'limga tegishli"
    return None


@divisions_bp.route('/<int:div_id>/members', methods=['POST'])
@jwt_required()
def add_member(div_id):
    role, _, _ = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    div = Division.query.get_or_404(div_id)
    data = request.get_json(silent=True) or {}
    try:
        user_ids = [int(x) for x in (data.get('user_ids') or [])]
    except (TypeError, ValueError):
        return jsonify({'error': "user_ids noto'g'ri"}), 400
    users = User.query.filter(User.id.in_(user_ids)).all() if user_ids else []

    err = _member_scope_error(div, users)
    if err:
        return jsonify({'error': err}), 403

    for user in users:
        user.division_id = div_id
        user.department_id = div.department_id
    if users:
        log_audit('update', 'division', div.id, entity_label=div.name,
                  details="a'zo qo'shildi: " + ', '.join(u.full_name for u in users))
    db.session.commit()
    return jsonify(div.to_dict())


@divisions_bp.route('/<int:div_id>/members/<int:user_id>', methods=['DELETE'])
@jwt_required()
def remove_member(div_id, user_id):
    role, _, _ = get_scope(get_jwt())
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403
    div = Division.query.get_or_404(div_id)
    user = User.query.get_or_404(user_id)
    err = _member_scope_error(div, [user])
    if err:
        return jsonify({'error': err}), 403
    if user.division_id == div_id:
        user.division_id = None
        log_audit('update', 'division', div.id, entity_label=div.name,
                  details=f"a'zo chiqarildi: {user.full_name}")
    db.session.commit()
    return jsonify({'message': "Xodim bo'limdan chiqarildi"})
