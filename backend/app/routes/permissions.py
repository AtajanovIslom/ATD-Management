from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from app import db
from app.models import User, Division, RolePage
from app.utils import (
    get_scope, is_superadmin, can_manage_roles, can_manage_page_access, log_audit,
    PAGES, PAGE_KEYS, LOCKED_ROLES, SERVICE_PROVIDER_PAGES,
    DEFAULT_ROLE_PAGES, role_page_matrix, allowed_pages,
)

permissions_bp = Blueprint('permissions', __name__)

VALID_ROLES = ('superadmin', 'director', 'deputy_director', 'admin',
               'department_admin', 'user', 'agent')

ROLE_LABELS = {
    'superadmin': 'Bosh Administrator',
    'director': 'Direksiya Direktori',
    'deputy_director': "Direktor O'rinbosari",
    'admin': "Boshqarma Rahbari",
    'department_admin': "Bo'lim Rahbari",
    'user': 'Xodim',
    'agent': 'Interaktiv xizmat agenti',
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


# =========================================================================
# ROL ↔ SAHIFA MATRITSASI
# =========================================================================

@permissions_bp.route('/my-pages', methods=['GET'])
@jwt_required()
def my_pages():
    """Joriy foydalanuvchi ko'ra oladigan sahifalar — frontend nav/route uchun.

    Har ochilishda so'raladi, shuning uchun Bosh Administrator matritsani
    o'zgartirsa xodim qayta login qilmasdan (sahifa yangilanishida) ko'radi.
    """
    role, _, _ = get_scope(get_jwt())
    user = User.query.get(int(get_jwt_identity()))
    div = user.division if user else None
    is_provider = bool(div.is_service_provider) if div else False

    pages = allowed_pages(role, is_provider)
    return jsonify({'role': role, 'pages': pages, 'home': _home_path(pages)})


def _home_path(pages):
    """Rolning bosh sahifasi — PAGES tartibidagi birinchi ruxsat etilgani"""
    for p in PAGES:
        if p['key'] in pages:
            return p['path']
    return '/'


@permissions_bp.route('/page-access', methods=['GET'])
@jwt_required()
def get_page_access():
    """To'liq matritsa — faqat Bosh Administrator uchun"""
    role, _, _ = get_scope(get_jwt())
    if not can_manage_page_access(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    matrix = role_page_matrix()
    return jsonify({
        'roles': [
            {
                'value': r,
                'label': ROLE_LABELS.get(r, r),
                'locked': r in LOCKED_ROLES,
                'user_count': User.query.filter_by(role=r, is_active=True).count(),
            }
            for r in VALID_ROLES
        ],
        'pages': PAGES,
        'matrix': matrix,
        'defaults': DEFAULT_ROLE_PAGES,
        'service_provider_pages': list(SERVICE_PROVIDER_PAGES),
    })


@permissions_bp.route('/page-access', methods=['PUT'])
@jwt_required()
def set_page_access():
    """Matritsani saqlash. Body: {"matrix": {"agent": ["interactive_requests"], ...}}

    Faqat kelgan rollar yangilanadi — qolganlari tegilmaydi.
    """
    role, _, _ = get_scope(get_jwt())
    if not can_manage_page_access(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    data = request.get_json() or {}
    matrix = data.get('matrix')
    if not isinstance(matrix, dict) or not matrix:
        return jsonify({'error': 'matrix majburiy'}), 400

    changed = []
    for target_role, page_list in matrix.items():
        if target_role not in VALID_ROLES:
            return jsonify({'error': f"Noma'lum rol: {target_role}"}), 400
        if target_role in LOCKED_ROLES:
            # Bosh Administrator o'zini qulflab qo'ymasligi uchun — jim o'tkazamiz
            continue
        if not isinstance(page_list, list):
            return jsonify({'error': f"{target_role} uchun ro'yxat kutilgan"}), 400

        wanted = {p for p in page_list if p in PAGE_KEYS}
        unknown = set(page_list) - wanted
        if unknown:
            return jsonify({'error': f"Noma'lum sahifa: {', '.join(sorted(unknown))}"}), 400

        existing = {rp.page: rp for rp in RolePage.query.filter_by(role=target_role).all()}
        for page in PAGE_KEYS:
            allow = page in wanted
            row = existing.get(page)
            if row is None:
                db.session.add(RolePage(role=target_role, page=page, allowed=allow))
            elif bool(row.allowed) != allow:
                row.allowed = allow
        changed.append(f"{target_role}=[{','.join(sorted(wanted))}]")

    if changed:
        log_audit('update', 'role_pages', entity_label='Rol ↔ sahifa matritsasi',
                  details='; '.join(changed))
    db.session.commit()

    return jsonify({'message': 'Saqlandi', 'matrix': role_page_matrix()})


@permissions_bp.route('/page-access/reset', methods=['POST'])
@jwt_required()
def reset_page_access():
    """Matritsani standart (kodda yozilgan) holatga qaytarish.

    Body: {"role": "agent"} — faqat bitta rol, yoki bo'sh bo'lsa hammasi.
    """
    role, _, _ = get_scope(get_jwt())
    if not can_manage_page_access(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    data = request.get_json() or {}
    target = data.get('role')

    q = RolePage.query
    if target:
        if target not in VALID_ROLES:
            return jsonify({'error': f"Noma'lum rol: {target}"}), 400
        q = q.filter_by(role=target)

    q.delete(synchronize_session=False)
    log_audit('reset', 'role_pages',
              entity_label=target or 'barcha rollar',
              details='standart qiymatlarga qaytarildi')
    db.session.commit()

    return jsonify({'message': 'Standart holatga qaytarildi', 'matrix': role_page_matrix()})


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
