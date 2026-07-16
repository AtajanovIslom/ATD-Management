import secrets
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt, get_jwt_identity
from werkzeug.security import generate_password_hash
from app import db
from app.models import User
from app.utils import validate_password, get_scope, is_admin_or_above, is_dept_admin_or_above, dept_user_ids, div_user_ids, log_audit

users_bp = Blueprint('users', __name__)


@users_bp.route('', methods=['GET'])
@jwt_required()
def get_users():
    role, dept_id, div_id = get_scope(get_jwt())

    if not is_dept_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    q = User.query.filter_by(is_active=True)

    if role == 'superadmin':
        pass  # barchasi
    elif role == 'admin':
        if dept_id:
            q = q.filter_by(department_id=dept_id)
    elif role == 'department_admin':
        if div_id:
            q = q.filter_by(division_id=div_id)

    users = q.order_by(User.full_name).all()
    return jsonify([u.to_dict() for u in users])


@users_bp.route('/workers', methods=['GET'])
@jwt_required()
def get_workers():
    role, dept_id, div_id = get_scope(get_jwt())
    q = User.query.filter(User.role.in_(['user', 'department_admin']), User.is_active == True)
    if role == 'admin' and dept_id:
        q = q.filter_by(department_id=dept_id)
    elif role == 'department_admin' and div_id:
        q = q.filter_by(division_id=div_id)
    workers = q.order_by(User.full_name).all()
    return jsonify([w.to_dict() for w in workers])


@users_bp.route('', methods=['POST'])
@jwt_required()
def create_user():
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    data = request.get_json()
    full_name = data.get('full_name', '').strip()
    department = data.get('department', '').strip()
    position = data.get('position', '').strip()
    tab_number = data.get('tab_number', '').strip()
    login = data.get('login', '').strip()
    password = data.get('password', '')
    new_role = data.get('role', 'user')
    email = data.get('email', '').strip()
    phone = data.get('phone', '').strip()
    new_division_id = data.get('division_id') or None
    new_department_id = data.get('department_id') or None

    # Non-superadmin can only create users in their own scope
    if role == 'admin':
        new_department_id = dept_id
        if new_role not in ('user', 'department_admin'):
            new_role = 'user'
    elif role == 'department_admin':
        new_division_id = div_id
        new_role = 'user'

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
    return jsonify(user.to_dict()), 201


@users_bp.route('/<int:user_id>', methods=['PUT'])
@jwt_required()
def update_user(user_id):
    role, dept_id, div_id = get_scope(get_jwt())
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    user = User.query.get_or_404(user_id)

    # Check scope: admin can only edit users in their department
    if role == 'admin' and dept_id and user.department_id != dept_id:
        return jsonify({'error': "Ruxsat yo'q"}), 403

    data = request.get_json()

    if 'full_name' in data:
        user.full_name = data['full_name'].strip()
    if 'department' in data:
        user.department = data['department'].strip()
    if 'position' in data:
        user.position = data['position'].strip()
    if 'email' in data:
        user.email = data['email'].strip() or None
    if 'phone' in data:
        user.phone = data['phone'].strip() or None
    if 'tab_number' in data:
        existing = User.query.filter(User.tab_number == data['tab_number'].strip(), User.id != user_id).first()
        if existing:
            return jsonify({'error': 'Bu tabel raqam allaqachon mavjud'}), 400
        user.tab_number = data['tab_number'].strip()
    if 'login' in data and data['login'].strip():
        existing = User.query.filter(User.login == data['login'].strip(), User.id != user_id).first()
        if existing:
            return jsonify({'error': 'Bu login allaqachon mavjud'}), 400
        user.login = data['login'].strip()
    if 'password' in data and data['password']:
        password_error = validate_password(data['password'])
        if password_error:
            return jsonify({'error': password_error}), 400
        user.password_hash = generate_password_hash(data['password'])
        user.plain_password = data['password']
    if 'division_id' in data:
        user.division_id = data['division_id'] or None
    if 'department_id' in data and role == 'superadmin':
        user.department_id = data['department_id'] or None
    if 'role' in data and role == 'superadmin':
        user.role = data['role']

    log_audit('update', 'user', user.id, entity_label=user.full_name)
    db.session.commit()
    return jsonify(user.to_dict())


@users_bp.route('/<int:user_id>', methods=['DELETE'])
@jwt_required()
def delete_user(user_id):
    role = get_jwt().get('role')
    if not is_admin_or_above(role):
        return jsonify({'error': "Ruxsat yo'q"}), 403

    user = User.query.get_or_404(user_id)
    user.is_active = False
    log_audit('delete', 'user', user.id, entity_label=user.full_name)
    db.session.commit()
    return jsonify({'message': "Foydalanuvchi o'chirildi"})
