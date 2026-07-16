from flask import Blueprint, request, jsonify
from flask_jwt_extended import create_access_token
from werkzeug.security import check_password_hash, generate_password_hash
from app import db
from app.models import User
from app.utils import validate_password, log_audit

auth_bp = Blueprint('auth', __name__)


def _make_token(user):
    return create_access_token(
        identity=str(user.id),
        additional_claims={
            'role': user.role,
            'full_name': user.full_name,
            'department_id': user.department_id,
            'division_id': user.division_id,
        }
    )


@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    full_name = data.get('full_name', '').strip()
    department = data.get('department', '').strip()
    position = data.get('position', '').strip()
    tab_number = data.get('tab_number', '').strip()
    login = data.get('login', '').strip()
    password = data.get('password', '')

    if not all([full_name, department, tab_number, login]):
        return jsonify({'error': 'Barcha majburiy maydonlar to\'ldirilishi shart'}), 400

    if ' ' in login:
        return jsonify({'error': 'Loginda probel bo\'lmasligi kerak'}), 400

    password_error = validate_password(password)
    if password_error:
        return jsonify({'error': password_error}), 400

    if User.query.filter_by(login=login).first():
        return jsonify({'error': 'Bu login allaqachon mavjud'}), 400
    if User.query.filter_by(tab_number=tab_number).first():
        return jsonify({'error': 'Bu tabel raqam allaqachon mavjud'}), 400

    user = User(
        full_name=full_name,
        department=department,
        position=position,
        tab_number=tab_number,
        login=login,
        password_hash=generate_password_hash(password),
        plain_password=password,
        role='user',
    )
    db.session.add(user)
    db.session.commit()

    return jsonify({'token': _make_token(user), 'user': user.to_dict()}), 201


@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    login = data.get('login', '').strip()
    password = data.get('password', '')

    if not login or not password:
        return jsonify({'error': 'Login va parol kiritilishi shart'}), 400

    user = User.query.filter_by(login=login, is_active=True).first()
    if not user or not check_password_hash(user.password_hash, password):
        return jsonify({'error': 'Login yoki parol noto\'g\'ri'}), 401

    # Login audit — user_id/user_name'ni qo'lda kiritamiz (JWT hali yo'q)
    from app import db as _db
    from app.models import AuditLog
    from flask import request as _req
    _db.session.add(AuditLog(
        user_id=user.id, user_name=user.full_name, user_role=user.role,
        action='login', entity_type='user', entity_id=user.id,
        entity_label=user.full_name,
        ip_address=(_req.headers.get('X-Forwarded-For', _req.remote_addr) or '')[:50],
    ))
    _db.session.commit()

    return jsonify({'token': _make_token(user), 'user': user.to_dict()})


@auth_bp.route('/register/<token>', methods=['GET'])
def get_registration(token):
    user = User.query.filter_by(registration_token=token).first()
    if not user:
        return jsonify({'error': 'Havola yaroqsiz yoki muddati o\'tgan'}), 404

    return jsonify({
        'full_name': user.full_name,
        'department': user.department,
        'position': user.position or '',
    })


@auth_bp.route('/register/<token>', methods=['POST'])
def complete_registration(token):
    user = User.query.filter_by(registration_token=token).first()
    if not user:
        return jsonify({'error': 'Havola yaroqsiz yoki muddati o\'tgan'}), 404

    data = request.get_json()
    login = data.get('login', '').strip()
    password = data.get('password', '')

    if not login or ' ' in login:
        return jsonify({'error': 'Login kiritilishi va probelsiz bo\'lishi shart'}), 400

    password_error = validate_password(password)
    if password_error:
        return jsonify({'error': password_error}), 400

    if User.query.filter(User.login == login, User.id != user.id).first():
        return jsonify({'error': 'Bu login allaqachon mavjud'}), 400

    user.login = login
    user.password_hash = generate_password_hash(password)
    user.plain_password = password
    user.registration_token = None
    db.session.commit()

    return jsonify({'token': _make_token(user), 'user': user.to_dict()})
