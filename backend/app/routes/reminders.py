"""
Eslatmalar — foydalanuvchining shaxsiy kalendar eslatmalari.

Har bir foydalanuvchi faqat o'ziga tegishli eslatmalarni ko'radi va boshqaradi.
"""
from datetime import datetime, timezone, date as _date
from flask import Blueprint, request, jsonify
from flask_jwt_extended import jwt_required, get_jwt_identity
from app import db
from app.models import Reminder
from app.utils import log_audit

reminders_bp = Blueprint('reminders', __name__)


def _parse_date(s):
    if not s:
        return None
    try:
        return _date.fromisoformat(s[:10])
    except (ValueError, TypeError):
        return None


@reminders_bp.route('', methods=['GET'])
@jwt_required()
def list_mine():
    """Barcha eslatmalarim (yaqin muddat birinchi).

    Query params:
        status = 'active' | 'completed' | 'all' (default 'all')
    """
    user_id = int(get_jwt_identity())
    q = Reminder.query.filter_by(user_id=user_id)

    status = request.args.get('status', 'all')
    if status == 'active':
        q = q.filter_by(is_completed=False)
    elif status == 'completed':
        q = q.filter_by(is_completed=True)

    items = q.order_by(Reminder.remind_date.asc(), Reminder.id.asc()).all()
    return jsonify([r.to_dict() for r in items])


@reminders_bp.route('', methods=['POST'])
@jwt_required()
def create():
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}

    rd = _parse_date(data.get('remind_date'))
    message = (data.get('message') or '').strip()

    if not rd:
        return jsonify({'error': "Sana noto'g'ri (YYYY-MM-DD)"}), 400
    if not message:
        return jsonify({'error': "Xabar kiritilishi shart"}), 400

    r = Reminder(user_id=user_id, remind_date=rd, message=message)
    db.session.add(r)
    db.session.flush()
    log_audit('create', 'reminder', r.id, entity_label=message[:60])
    db.session.commit()
    return jsonify(r.to_dict()), 201


@reminders_bp.route('/<int:rid>', methods=['PUT'])
@jwt_required()
def update(rid):
    user_id = int(get_jwt_identity())
    r = Reminder.query.filter_by(id=rid, user_id=user_id).first_or_404()
    data = request.get_json() or {}

    if 'remind_date' in data:
        rd = _parse_date(data['remind_date'])
        if not rd:
            return jsonify({'error': "Sana noto'g'ri"}), 400
        r.remind_date = rd
    if 'message' in data:
        msg = (data['message'] or '').strip()
        if not msg:
            return jsonify({'error': "Xabar bo'sh bo'lishi mumkin emas"}), 400
        r.message = msg
    if 'is_completed' in data:
        r.is_completed = bool(data['is_completed'])
        r.completed_at = datetime.now(timezone.utc) if r.is_completed else None

    log_audit('update', 'reminder', r.id, entity_label=r.message[:60])
    db.session.commit()
    return jsonify(r.to_dict())


@reminders_bp.route('/<int:rid>/toggle', methods=['POST'])
@jwt_required()
def toggle(rid):
    """Eslatmani bajarilgan/bajarilmagan sifatida belgilash"""
    user_id = int(get_jwt_identity())
    r = Reminder.query.filter_by(id=rid, user_id=user_id).first_or_404()

    r.is_completed = not r.is_completed
    r.completed_at = datetime.now(timezone.utc) if r.is_completed else None

    log_audit('toggle', 'reminder', r.id, entity_label=r.message[:60],
              details=('completed' if r.is_completed else 'reopened'))
    db.session.commit()
    return jsonify(r.to_dict())


@reminders_bp.route('/<int:rid>', methods=['DELETE'])
@jwt_required()
def delete(rid):
    user_id = int(get_jwt_identity())
    r = Reminder.query.filter_by(id=rid, user_id=user_id).first_or_404()

    log_audit('delete', 'reminder', r.id, entity_label=r.message[:60])
    db.session.delete(r)
    db.session.commit()
    return jsonify({'message': "O'chirildi"})


@reminders_bp.route('/upcoming', methods=['GET'])
@jwt_required()
def upcoming():
    """N kun ichida (default 5) muddat qoladigan yoki muddati o'tgan
       BAJARILMAGAN eslatmalar (login bildirishnomasi uchun)"""
    from datetime import timedelta
    user_id = int(get_jwt_identity())
    days = request.args.get('days', 5, type=int)
    threshold = _date.today() + timedelta(days=days)

    items = (Reminder.query
             .filter(Reminder.user_id == user_id,
                     Reminder.is_completed == False,
                     Reminder.remind_date <= threshold)
             .order_by(Reminder.remind_date.asc())
             .all())
    return jsonify({
        'threshold_days': days,
        'total': len(items),
        'items': [r.to_dict() for r in items],
    })
