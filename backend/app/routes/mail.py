"""
Korporativ pochtani ulash (Profil sahifasi).

  GET    /api/mail/status   — ulanganmi, oxirgi tekshiruv, xato
  POST   /api/mail/connect  — {email, password}: IMAP'ga kirib tekshiradi va saqlaydi
  DELETE /api/mail/connect  — uzish (parol o'chiriladi)

Yangi xatlarni tekshirish va Telegram'ga yuborish — services/mail.py
(`telegram` konteynerida).
"""
from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import MailAccount, TelegramLink, User
from app.services import mail as mail_svc
from app.utils import log_audit

mail_bp = Blueprint('mail', __name__)


def _status(user_id):
    acc = MailAccount.query.filter_by(user_id=user_id).first()
    link = TelegramLink.query.filter_by(user_id=user_id, is_active=True).first()
    return {
        'connected': acc is not None,
        'account': acc.to_dict() if acc else None,
        'telegram_linked': link is not None,
        'web_url': current_app.config['MAIL_WEB_URL'],
        'check_interval': current_app.config['MAIL_CHECK_INTERVAL'],
    }


@mail_bp.route('/status', methods=['GET'])
@jwt_required()
def get_status():
    user_id = int(get_jwt_identity())
    data = _status(user_id)
    if not data['connected']:
        # Taklif: xodim profilidagi e-mail yoki login@uzbeksteel.uz
        user = User.query.get(user_id)
        data['suggested_email'] = (user.email or '') if user else ''
    return jsonify(data)


@mail_bp.route('/connect', methods=['POST'])
@jwt_required()
def connect():
    user_id = int(get_jwt_identity())
    data = request.get_json(silent=True) or {}
    address = (data.get('email') or '').strip()
    password = data.get('password') or ''
    if '@' not in address or not password:
        return jsonify({'error': 'Pochta manzili va parolni kiriting'}), 400

    cfg = current_app.config
    try:
        validity, uidnext = mail_svc.verify_and_baseline(cfg, address, password)
    except mail_svc.MailAuthError as e:
        return jsonify({'error': str(e)}), 400
    except mail_svc.MailConnectError as e:
        return jsonify({'error': str(e)}), 502

    acc = MailAccount.query.filter_by(user_id=user_id).first()
    if acc is None:
        acc = MailAccount(user_id=user_id)
        db.session.add(acc)
    acc.email = address
    acc.password_enc = mail_svc.encrypt(cfg, password)
    acc.is_active = True
    # Shu paytgacha kelgan xatlar botga yuborilmaydi — faqat bundan keyingilari
    acc.uidvalidity, acc.last_uid = validity, uidnext - 1
    acc.last_error = ''
    log_audit('create', 'mail_account', user_id, entity_label='Korporativ pochta ulandi',
              details=address)
    db.session.commit()
    return jsonify(_status(user_id))


@mail_bp.route('/connect', methods=['DELETE'])
@jwt_required()
def disconnect():
    user_id = int(get_jwt_identity())
    acc = MailAccount.query.filter_by(user_id=user_id).first()
    if acc:
        db.session.delete(acc)
        log_audit('delete', 'mail_account', user_id, entity_label='Korporativ pochta uzildi')
        db.session.commit()
    return jsonify(_status(user_id))
