import secrets
from datetime import date as _date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from werkzeug.security import generate_password_hash
from app import db
from app.models import User, Division, Vacation
from app.utils import (
    validate_password, get_scope, is_admin_or_above, is_dept_admin_or_above,
    is_any_admin, log_audit, ROLES, scope_user_ids, can_manage_user,
)

users_bp = Blueprint('users', __name__)


def _actor():
    """(role, dept_id, div_id, user_id, scope) — joriy rahbar haqida."""
    role, dept_id, div_id = get_scope(get_jwt())
    me = int(get_jwt_identity())
    return role, dept_id, div_id, me, scope_user_ids(role, dept_id, div_id, me)


def _scoped_query(scope):
    q = User.query.filter_by(is_active=True)
    if scope is not None:
        if not scope:
            return q.filter(db.false())
        q = q.filter(User.id.in_(scope))
    return q


def _serialize(user, role, me, scope):
    """Parol va ro'yxatdan o'tish havolasi faqat shu xodimni boshqara
    oladigan rahbarga ko'rinadi (o'zidan past darajadagi, o'z ko'lamidagi)."""
    return user.to_dict(with_secrets=can_manage_user(role, me, scope, user))


@users_bp.route('', methods=['GET'])
@jwt_required()
def get_users():
    role, _dept_id, _div_id, me, scope = _actor()
    if not is_dept_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    users = _scoped_query(scope).order_by(User.full_name).all()
    return jsonify([_serialize(u, role, me, scope) for u in users])


@users_bp.route('/workers', methods=['GET'])
@jwt_required()
def get_workers():
    """Rahbar ko'lamidagi ijrochilar (guruh tuzish, bo'limga a'zo qo'shish).

    Ilgari bu yo'l har kimga ochiq edi va javobda barcha xodimlarning paroli
    bor edi. Endi faqat rahbarlarga, faqat o'z ko'lami va yengil ko'rinishda.
    """
    role, _dept_id, _div_id, _me, scope = _actor()
    if not is_any_admin(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    q = _scoped_query(scope).filter(User.role.in_(['user', 'department_admin']))

    # ?service_provider=1 — faqat interaktiv xizmat ko'rsatuvchi bo'lim a'zolari.
    # Agar hali hech qaysi bo'lim belgilanmagan bo'lsa, cheklamaslik (eski xatti-harakat).
    if request.args.get('service_provider') == '1':
        provider_div_ids = [d.id for d in Division.query.filter_by(is_service_provider=True).all()]
        if provider_div_ids:
            q = q.filter(User.division_id.in_(provider_div_ids))

    # Bugun tatilda bo'lgan xodimlar chiqariladi (vazifa/interaktiv yuklab bo'lmaydi)
    today = _date.today()
    on_vacation = {v.user_id for v in Vacation.query.filter(
        Vacation.from_date <= today, Vacation.to_date >= today
    ).all()}
    if on_vacation:
        q = q.filter(~User.id.in_(on_vacation))

    workers = q.order_by(User.full_name).all()
    return jsonify([w.to_brief() for w in workers])


@users_bp.route('', methods=['POST'])
@jwt_required()
def create_user():
    role, dept_id, div_id, me, scope = _actor()
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    data = request.get_json(silent=True) or {}
    full_name = (data.get('full_name') or '').strip()
    department = (data.get('department') or '').strip()
    position = (data.get('position') or '').strip()
    tab_number = (data.get('tab_number') or '').strip()
    login = (data.get('login') or '').strip()
    password = data.get('password') or ''
    new_role = data.get('role') or 'user'
    email = (data.get('email') or '').strip()
    phone = (data.get('phone') or '').strip()
    new_division_id = data.get('division_id') or None
    new_department_id = data.get('department_id') or None

    if new_role not in ROLES:
        return jsonify({'error': "Noto'g'ri rol"}), 400

    # Boshqarma rahbari faqat o'z boshqarmasiga va faqat o'zidan past rolda
    # xodim qo'sha oladi; bo'lim ham uning boshqarmasidan bo'lishi shart
    if role == 'admin':
        if not dept_id:
            return jsonify({'error': "Sizga boshqarma biriktirilmagan"}), 400
        new_department_id = dept_id
        if new_role not in ('user', 'department_admin'):
            new_role = 'user'
        if new_division_id:
            div = Division.query.get(new_division_id)
            if not div or div.department_id != dept_id:
                return jsonify({'error': "Bo'lim sizning boshqarmangizga tegishli emas"}), 403
    elif role != 'superadmin' and new_role in ('superadmin', 'director'):
        # Direksiya Bosh Administrator yoki direktor yarata olmaydi
        return jsonify({'error': "Bu rolni faqat Bosh Administrator beradi"}), 403

    # Bo'lim tanlangan bo'lsa boshqarma ham o'sha bo'limdan olinadi —
    # aks holda xodim boshqarma rahbarining ro'yxatlaridan tushib qolardi
    if new_division_id and not new_department_id:
        div = Division.query.get(new_division_id)
        new_department_id = div.department_id if div else None

    if not all([full_name, tab_number]):
        return jsonify({'error': 'Ism va tabel raqami kiritilishi shart'}), 400

    if User.query.filter_by(tab_number=tab_number).first():
        return jsonify({'error': 'Bu tabel raqam allaqachon mavjud'}), 400

    if login or password:
        if not login or not password:
            return jsonify({'error': 'Login va parol birgalikda kiritilishi shart'}), 400
        password_error = validate_password(password)
        if password_error:
            return jsonify({'error': password_error}), 400
        if User.query.filter_by(login=login).first():
            return jsonify({'error': 'Bu login allaqachon mavjud'}), 400
        user = User(
            full_name=full_name, department=department, position=position,
            tab_number=tab_number, login=login,
            password_hash=generate_password_hash(password), plain_password=password,
            role=new_role, email=email, phone=phone,
            division_id=new_division_id, department_id=new_department_id,
        )
    else:
        user = User(
            full_name=full_name, department=department, position=position,
            tab_number=tab_number, role=new_role, email=email, phone=phone,
            division_id=new_division_id, department_id=new_department_id,
            registration_token=secrets.token_urlsafe(24),
        )

    db.session.add(user)
    db.session.flush()
    log_audit('create', 'user', user.id, entity_label=user.full_name,
              details=f"role={user.role}, tab={user.tab_number}")
    db.session.commit()
    # Yaratuvchi rahbar ro'yxatdan o'tish havolasini darhol nusxalay olsin
    return jsonify(user.to_dict(with_secrets=True)), 201


@users_bp.route('/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user(user_id):
    role, dept_id, div_id, me, scope = _actor()
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    user = User.query.get_or_404(user_id)

    # Faqat o'z ko'lamidagi va o'zidan past darajadagi xodimni. Ilgari
    # boshqarma rahbari o'z boshqarmasidagi superadmin parolini ham
    # almashtira olardi.
    if not can_manage_user(role, me, scope, user):
        return jsonify({'error': "Bu xodimni tahrirlash huquqingiz yo'q"}), 403

    data = request.get_json(silent=True) or {}

    def text(key):
        return (data.get(key) or '').strip()

    if 'full_name' in data and text('full_name'):
        user.full_name = text('full_name')
    if 'department' in data:
        user.department = text('department')
    if 'position' in data:
        user.position = text('position')
    if 'email' in data:
        user.email = text('email') or None
    if 'phone' in data:
        user.phone = text('phone') or None
    if 'tab_number' in data and text('tab_number'):
        existing = User.query.filter(User.tab_number == text('tab_number'), User.id != user_id).first()
        if existing:
            return jsonify({'error': 'Bu tabel raqam allaqachon mavjud'}), 400
        user.tab_number = text('tab_number')
    if 'login' in data and text('login'):
        existing = User.query.filter(User.login == text('login'), User.id != user_id).first()
        if existing:
            return jsonify({'error': 'Bu login allaqachon mavjud'}), 400
        user.login = text('login')
    if data.get('password'):
        password_error = validate_password(data['password'])
        if password_error:
            return jsonify({'error': password_error}), 400
        user.password_hash = generate_password_hash(data['password'])
        user.plain_password = data['password']
    if 'division_id' in data:
        new_div_id = data['division_id'] or None
        div = Division.query.get(new_div_id) if new_div_id else None
        if new_div_id and not div:
            return jsonify({'error': "Bo'lim topilmadi"}), 404
        # Boshqarma rahbari xodimni boshqa boshqarma bo'limiga o'tkaza olmaydi
        if role == 'admin' and div and div.department_id != dept_id:
            return jsonify({'error': "Bo'lim sizning boshqarmangizga tegishli emas"}), 403
        user.division_id = new_div_id
        # Boshqarma bo'limdan kelib chiqadi (superadmin uni quyida qo'lda
        # o'zgartira oladi) — ustun eskirib qolmasin
        if div:
            user.department_id = div.department_id
    if 'department_id' in data and role == 'superadmin':
        user.department_id = data['department_id'] or None
    if 'role' in data and role == 'superadmin':
        if data['role'] not in ROLES:
            return jsonify({'error': "Noto'g'ri rol"}), 400
        user.role = data['role']

    log_audit('update', 'user', user.id, entity_label=user.full_name)
    db.session.commit()
    return jsonify(_serialize(user, role, me, scope))


@users_bp.route('/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    role, _dept_id, _div_id, me, scope = _actor()
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    user = User.query.get_or_404(user_id)
    if not can_manage_user(role, me, scope, user):
        return jsonify({'error': "Bu xodimni o'chirish huquqingiz yo'q"}), 403

    user.is_active = False
    log_audit('delete', 'user', user.id, entity_label=user.full_name)
    db.session.commit()
    return jsonify({'message': "Foydalanuvchi o'chirildi"})
