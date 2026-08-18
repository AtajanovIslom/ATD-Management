from flask import Blueprint, request, jsonify, current_app
from flask_jwt_extended import (
    create_access_token, create_refresh_token, jwt_required, get_jwt_identity,
)
from werkzeug.security import check_password_hash, generate_password_hash
from app import db
from app.models import User
from app.utils import validate_password, log_audit

auth_bp = Blueprint('auth', __name__)


def _make_tokens(user):
    """Access + refresh token juftligi.

    Web faqat `token`dan foydalanadi (ortiqcha maydonlarni e'tiborsiz qoldiradi),
    mobil ilova esa `refresh_token`ni xavfsiz xotirada saqlab, access token
    muddati tugashiga yaqin /api/auth/refresh orqali sessiyani uzaytiradi.

    `expires_in` — access token necha sekunddan keyin o'lishi. Mobil ilova
    JWT'ni dekodlab o'tirmasligi uchun tayyor holda beriladi.
    """
    identity = str(user.id)
    return {
        'token': create_access_token(
            identity=identity,
            additional_claims={
                'role': user.role,
                'full_name': user.full_name,
                'department_id': user.department_id,
                'division_id': user.division_id,
                'permissions': user.effective_permissions(),
            }
        ),
        'refresh_token': create_refresh_token(identity=identity),
        'expires_in': int(
            current_app.config['JWT_ACCESS_TOKEN_EXPIRES'].total_seconds()
        ),
    }


@auth_bp.route('/signup', methods=['POST'])
def signup():
    data = request.get_json()
    full_name = data.get('full_name', '').strip()
    department = data.get('department', '').strip()
    position = data.get('position', '').strip()
    tab_number = data.get('tab_number', '').strip()
    login = data.get('login', '').strip()
    password = data.get('password', '')

    # Boshqarma/bo'linma registratsiyada so'ralmaydi — adminlar keyin biriktiradi
    if not all([full_name, tab_number, login]):
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

    return jsonify({**_make_tokens(user), 'user': user.to_dict()}), 201


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

    return jsonify({**_make_tokens(user), 'user': user.to_dict()})


@auth_bp.route('/refresh', methods=['POST'])
@jwt_required(refresh=True)
def refresh():
    """Sessiyani uzaytirish — faqat refresh token bilan chaqiriladi.

    Authorization: Bearer <refresh_token>

    Har chaqiruvda YANGI refresh token qaytariladi (rotatsiya), ya'ni 15 kunlik
    muddat shu paytdan boshlab qayta sanaladi. Mobil ilova buni har ochilganda
    chaqirishi kerak — aks holda 12 soat ichida qayta kirgan xodimning muddati
    surilmay qoladi.

    Rol/bo'lim claim'lari va `user` obyekti bazadan qayta o'qiladi, shuning
    uchun admin xodimni bloklagan yoki rolini o'zgartirgan bo'lsa, o'zgarish
    keyingi refresh'da kuchga kiradi.
    """
    try:
        user_id = int(get_jwt_identity())
    except (TypeError, ValueError):
        return jsonify({'error': 'Token yaroqsiz'}), 401

    user = User.query.filter_by(id=user_id, is_active=True).first()
    if not user:
        return jsonify({'error': 'Foydalanuvchi topilmadi yoki faol emas'}), 401

    return jsonify({**_make_tokens(user), 'user': user.to_dict()})


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

    return jsonify({**_make_tokens(user), 'user': user.to_dict()})
