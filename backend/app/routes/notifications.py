"""Bildirishnomalar API — mobil ilova uchun.

Qurilma:
    POST   /api/notifications/devices        FCM token'ni ro'yxatdan o'tkazish
    DELETE /api/notifications/devices        token'ni o'chirish (logout paytida)

Bildirishnomalar:
    GET    /api/notifications                ro'yxat (paginatsiya, filtr)
    GET    /api/notifications/unread-count   o'qilmaganlar soni (badge uchun)
    POST   /api/notifications/<id>/read      bittasini o'qildi deb belgilash
    POST   /api/notifications/read-all       hammasini o'qildi deb belgilash
    POST   /api/notifications/test           o'z qurilmangizga sinov xabari
"""
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity

from app import db
from app.models import DeviceToken, Notification, utc_naive_now
from app.services import notifications as notification_service

notifications_bp = Blueprint('notifications', __name__)

DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 100


# =========================================================================
# QURILMA TOKENLARI
# =========================================================================

@notifications_bp.route('/devices', methods=['POST'])
@jwt_required()
def register_device():
    """FCM token'ni joriy foydalanuvchiga bog'laydi.

    Ilova har ishga tushganda va token yangilanganda (onTokenRefresh) chaqiradi —
    shuning uchun takroriy chaqiruv xavfsiz: mavjud token yangilanadi, dublikat
    yaratilmaydi.
    """
    user_id = int(get_jwt_identity())
    # silent=True — body yuborilmasa Flask 415 qaytarmasin (masalan bo'sh /test)
    data = request.get_json(silent=True) or {}

    token = (data.get('token') or '').strip()
    if not token:
        return jsonify({'error': 'token majburiy'}), 400

    platform = (data.get('platform') or 'android').strip().lower()
    if platform not in DeviceToken.PLATFORMS:
        platform = 'android'

    device = DeviceToken.query.filter_by(token=token).first()
    if device:
        # Bir telefonda boshqa xodim login qilgan bo'lishi mumkin — token
        # yangi egasiga ko'chadi, aks holda xabar noto'g'ri odamga borardi.
        device.user_id = user_id
        device.platform = platform
        device.device_info = (data.get('device_info') or device.device_info or '')[:255]
        device.is_active = True
        device.last_used_at = utc_naive_now()
    else:
        device = DeviceToken(
            user_id=user_id,
            token=token,
            platform=platform,
            device_info=(data.get('device_info') or '')[:255],
        )
        db.session.add(device)

    db.session.commit()
    return jsonify(device.to_dict()), 201


@notifications_bp.route('/devices', methods=['DELETE'])
@jwt_required()
def unregister_device():
    """Logout'da chaqiriladi — qurilmaga endi xabar yuborilmaydi."""
    user_id = int(get_jwt_identity())
    # silent=True — body yuborilmasa Flask 415 qaytarmasin (masalan bo'sh /test)
    data = request.get_json(silent=True) or {}
    token = (data.get('token') or '').strip()
    if not token:
        return jsonify({'error': 'token majburiy'}), 400

    deleted = DeviceToken.query.filter_by(token=token, user_id=user_id).delete()
    db.session.commit()
    return jsonify({'deleted': deleted})


@notifications_bp.route('/devices', methods=['GET'])
@jwt_required()
def list_devices():
    """Foydalanuvchining ro'yxatdan o'tgan qurilmalari (diagnostika uchun)."""
    user_id = int(get_jwt_identity())
    devices = DeviceToken.query.filter_by(user_id=user_id)\
        .order_by(DeviceToken.last_used_at.desc()).all()
    return jsonify([d.to_dict() for d in devices])


# =========================================================================
# BILDIRISHNOMALAR
# =========================================================================

@notifications_bp.route('', methods=['GET'])
@jwt_required()
def list_notifications():
    """Query params: unread=1 (faqat o'qilmagan), page, per_page"""
    user_id = int(get_jwt_identity())

    q = Notification.query.filter_by(user_id=user_id)
    if (request.args.get('unread') or '').strip() in ('1', 'true'):
        q = q.filter_by(is_read=False)

    try:
        page = max(1, int(request.args.get('page', 1)))
        per_page = min(MAX_PER_PAGE, max(1, int(request.args.get('per_page', DEFAULT_PER_PAGE))))
    except ValueError:
        page, per_page = 1, DEFAULT_PER_PAGE

    total = q.count()
    items = q.order_by(Notification.created_at.desc(), Notification.id.desc())\
        .offset((page - 1) * per_page).limit(per_page).all()

    return jsonify({
        'total': total,
        'page': page,
        'per_page': per_page,
        'pages': (total + per_page - 1) // per_page or 1,
        'unread': Notification.query.filter_by(user_id=user_id, is_read=False).count(),
        'notifications': [n.to_dict() for n in items],
    })


@notifications_bp.route('/unread-count', methods=['GET'])
@jwt_required()
def unread_count():
    user_id = int(get_jwt_identity())
    count = Notification.query.filter_by(user_id=user_id, is_read=False).count()
    return jsonify({'unread': count})


@notifications_bp.route('/<int:notification_id>/read', methods=['POST'])
@jwt_required()
def mark_read(notification_id):
    user_id = int(get_jwt_identity())
    n = Notification.query.filter_by(id=notification_id, user_id=user_id).first()
    if not n:
        return jsonify({'error': 'Bildirishnoma topilmadi'}), 404

    if not n.is_read:
        n.is_read = True
        n.read_at = utc_naive_now()
        db.session.commit()
    return jsonify(n.to_dict())


@notifications_bp.route('/read-all', methods=['POST'])
@jwt_required()
def mark_all_read():
    user_id = int(get_jwt_identity())
    updated = Notification.query.filter_by(user_id=user_id, is_read=False).update(
        {'is_read': True, 'read_at': utc_naive_now()}, synchronize_session=False)
    db.session.commit()
    return jsonify({'updated': updated})


@notifications_bp.route('/test', methods=['POST'])
@jwt_required()
def send_test():
    """O'z qurilmangizga sinov push'i — integratsiyani tekshirish uchun."""
    user_id = int(get_jwt_identity())
    # silent=True — body yuborilmasa Flask 415 qaytarmasin (masalan bo'sh /test)
    data = request.get_json(silent=True) or {}

    result = notification_service.send_now(
        user_id,
        title=(data.get('title') or 'Sinov bildirishnomasi'),
        body=(data.get('body') or 'ATD Management — push ishlayapti'),
        data={'event': 'test'},
    )
    return jsonify({
        'sent': result.success,
        'failed': result.failure,
        'removed_tokens': len(result.invalid_tokens),
        'firebase_configured': not result.skipped,
    })
