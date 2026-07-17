"""
Eslatmalar — foydalanuvchining shaxsiy kalendar eslatmalari.

Har bir foydalanuvchi faqat o'ziga tegishli eslatmalarni ko'radi va boshqaradi.
"""
import os
import uuid
from datetime import datetime, timezone, date as _date
from flask import Blueprint, request, jsonify, send_from_directory, current_app
from flask_jwt_extended import jwt_required, get_jwt_identity
from werkzeug.utils import secure_filename
from app import db
from app.models import Reminder, ReminderAttachment, utc_naive_now
from app.utils import log_audit

reminders_bp = Blueprint('reminders', __name__)

UPLOAD_DIR = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), 'uploads', 'reminders')


def _ensure_upload_dir():
    os.makedirs(UPLOAD_DIR, exist_ok=True)


def _parse_date(s):
    if not s:
        return None
    try:
        return _date.fromisoformat(s[:10])
    except (ValueError, TypeError):
        return None


# -1 = "Oxirgi haftadan boshlab har kuni" (Reminder.LAST_WEEK_MODE)
ALLOWED_INTERVALS = {-1, 0, 60, 120, 360, 720, 1440, 10080, 43200}


def _parse_interval(v):
    """Ogohlantirish oralig'ini (daqiqa) tekshirib qaytaradi. Noto'g'ri bo'lsa None."""
    if v is None or v == '':
        return None
    try:
        iv = int(v)
    except (ValueError, TypeError):
        return None
    return iv if iv in ALLOWED_INTERVALS else None


def _save_file(f):
    _ensure_upload_dir()
    ext = os.path.splitext(secure_filename(f.filename))[1]
    unique_name = f"{uuid.uuid4().hex}{ext}"
    path = os.path.join(UPLOAD_DIR, unique_name)
    f.save(path)
    size = os.path.getsize(path)
    return unique_name, f.filename, size


@reminders_bp.route('', methods=['GET'])
@jwt_required()
def list_mine():
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

    if request.content_type and 'multipart/form-data' in request.content_type:
        rd = _parse_date(request.form.get('remind_date'))
        message = (request.form.get('message') or '').strip()
        raw_interval = request.form.get('notify_interval')
    else:
        data = request.get_json() or {}
        rd = _parse_date(data.get('remind_date'))
        message = (data.get('message') or '').strip()
        raw_interval = data.get('notify_interval')

    if not rd:
        return jsonify({'error': "Sana noto'g'ri (YYYY-MM-DD)"}), 400
    if not message:
        return jsonify({'error': "Xabar kiritilishi shart"}), 400

    interval = _parse_interval(raw_interval)
    if raw_interval not in (None, '') and interval is None:
        return jsonify({'error': "Ogohlantirish oralig'i noto'g'ri"}), 400

    r = Reminder(user_id=user_id, remind_date=rd, message=message,
                 notify_interval=interval if interval is not None else 1440)
    db.session.add(r)
    db.session.flush()

    uploaded_files = request.files.getlist('files')
    for f in uploaded_files:
        if f and f.filename:
            unique_name, orig_name, size = _save_file(f)
            att = ReminderAttachment(
                reminder_id=r.id, filename=unique_name,
                original_name=orig_name, file_size=size,
            )
            db.session.add(att)

    log_audit('create', 'reminder', r.id, entity_label=message[:60])
    db.session.commit()
    return jsonify(r.to_dict()), 201


@reminders_bp.route('/<int:rid>', methods=['PUT'])
@jwt_required()
def update(rid):
    user_id = int(get_jwt_identity())
    r = Reminder.query.filter_by(id=rid, user_id=user_id).first_or_404()

    if request.content_type and 'multipart/form-data' in request.content_type:
        form = request.form
    else:
        form = request.get_json() or {}

    if 'remind_date' in form:
        rd = _parse_date(form['remind_date'])
        if not rd:
            return jsonify({'error': "Sana noto'g'ri"}), 400
        r.remind_date = rd
    if 'message' in form:
        msg = (form['message'] or '').strip()
        if not msg:
            return jsonify({'error': "Xabar bo'sh bo'lishi mumkin emas"}), 400
        r.message = msg
    if 'is_completed' in form:
        val = form['is_completed']
        if isinstance(val, str):
            val = val.lower() in ('true', '1')
        r.is_completed = bool(val)
        r.completed_at = datetime.now(timezone.utc) if r.is_completed else None
    if 'notify_interval' in form:
        interval = _parse_interval(form['notify_interval'])
        if interval is None:
            return jsonify({'error': "Ogohlantirish oralig'i noto'g'ri"}), 400
        # Oraliq o'zgarsa, hisobni noldan boshlaymiz — yangi jadval darhol kuchga kirsin
        if interval != r.notify_interval:
            r.notify_interval = interval
            r.last_notified_at = None

    remove_ids = request.form.getlist('remove_file_ids') if request.content_type and 'multipart' in request.content_type else []
    for fid in remove_ids:
        att = ReminderAttachment.query.filter_by(id=int(fid), reminder_id=r.id).first()
        if att:
            path = os.path.join(UPLOAD_DIR, att.filename)
            if os.path.exists(path):
                os.remove(path)
            db.session.delete(att)

    uploaded_files = request.files.getlist('files')
    for f in uploaded_files:
        if f and f.filename:
            unique_name, orig_name, size = _save_file(f)
            att = ReminderAttachment(
                reminder_id=r.id, filename=unique_name,
                original_name=orig_name, file_size=size,
            )
            db.session.add(att)

    log_audit('update', 'reminder', r.id, entity_label=r.message[:60])
    db.session.commit()
    return jsonify(r.to_dict())


@reminders_bp.route('/<int:rid>/toggle', methods=['POST'])
@jwt_required()
def toggle(rid):
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

    for att in r.files:
        path = os.path.join(UPLOAD_DIR, att.filename)
        if os.path.exists(path):
            os.remove(path)

    log_audit('delete', 'reminder', r.id, entity_label=r.message[:60])
    db.session.delete(r)
    db.session.commit()
    return jsonify({'message': "O'chirildi"})


@reminders_bp.route('/files/<filename>', methods=['GET'])
@jwt_required()
def download_file(filename):
    _ensure_upload_dir()
    return send_from_directory(UPLOAD_DIR, filename, as_attachment=True)


@reminders_bp.route('/upcoming', methods=['GET'])
@jwt_required()
def upcoming():
    """Eslatmalar ro'yxati.

    Query params:
        due_only = '1' — bildirishnoma uchun: har bir eslatmaning o'z ogohlantirish
                   oralig'i (notify_interval) hukmron, kunlik oyna cheklovi yo'q.
                   Aks holda "Har oyda"/"Har haftada" oraliqlari mantiqsiz bo'lardi.
        days     = due_only bo'lmaganda: shu kun ichida muddati keladiganlar (default 5)
    """
    from datetime import timedelta
    user_id = int(get_jwt_identity())
    due_only = request.args.get('due_only') == '1'

    q = Reminder.query.filter(Reminder.user_id == user_id,
                              Reminder.is_completed == False)

    days = request.args.get('days', 5, type=int)
    if not due_only:
        q = q.filter(Reminder.remind_date <= _date.today() + timedelta(days=days))

    items = q.order_by(Reminder.remind_date.asc()).all()

    if due_only:
        now = utc_naive_now()
        items = [r for r in items if r.is_notification_due(now)]

    return jsonify({
        'threshold_days': days,
        'total': len(items),
        'items': [r.to_dict() for r in items],
    })


@reminders_bp.route('/mark-notified', methods=['POST'])
@jwt_required()
def mark_notified():
    """Ogohlantirish ko'rsatilgan eslatmalarni belgilash — keyingi ko'rsatish oraliqdan keyin bo'ladi."""
    user_id = int(get_jwt_identity())
    data = request.get_json() or {}
    ids = data.get('ids') or []
    if not isinstance(ids, list):
        return jsonify({'error': "ids ro'yxat bo'lishi kerak"}), 400

    now = utc_naive_now()
    updated = (Reminder.query
               .filter(Reminder.user_id == user_id, Reminder.id.in_([int(i) for i in ids]))
               .all()) if ids else []
    for r in updated:
        r.last_notified_at = now
    db.session.commit()
    return jsonify({'marked': len(updated)})
