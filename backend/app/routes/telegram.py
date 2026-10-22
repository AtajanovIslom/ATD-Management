"""
Telegram bot: akkauntni ulash va bot orqali ishlash.

Profil sahifasi uchun (JWT bilan):
  GET    /api/telegram/status   — bot sozlanganmi, xodim ulanganmi
  POST   /api/telegram/link     — bir martalik ulash havolasi (t.me/<bot>?start=<kod>)
  DELETE /api/telegram/link     — uzish
  POST   /api/telegram/test     — sinov xabari

Telegram uchun (maxfiy sarlavha bilan):
  POST   /api/telegram/webhook  — botga kelgan xabar va tugma bosishlari

Botdagi amallar saytdagi ruxsat qoidalarining aynan o'zi bilan bajariladi
(routes/tasks.py: _Actor, _can_approve, apply_status_change) — bot orqali
ham rahbar faqat o'z ko'lamidagi ishni tasdiqlaydi.
"""
import secrets
from datetime import timedelta

from flask import Blueprint, current_app, jsonify, request
from flask_jwt_extended import get_jwt_identity, jwt_required

from app import db
from app.models import (
    Task, TelegramChatState, TelegramLink, TelegramLinkCode, User, utc_naive_now,
)
from app.services import telegram as tg
from app.utils import is_any_admin, log_audit

telegram_bp = Blueprint('telegram', __name__)

CODE_TTL = timedelta(minutes=15)

STATUS_UZ = {
    'active': 'Faol', 'in_progress': 'Jarayonda', 'review': 'Tekshiruvda',
    'returned': 'Qaytarilgan', 'completed': 'Tasdiqlangan', 'cancelled': 'Bekor qilingan',
}


# =========================================================================
# PROFIL SAHIFASI
# =========================================================================

def _my_link(user_id):
    return TelegramLink.query.filter_by(user_id=user_id).first()


@telegram_bp.route('/status', methods=['GET'])
@jwt_required()
def get_status():
    cfg = current_app.config
    tg.ensure_setup(current_app._get_current_object())
    link = _my_link(int(get_jwt_identity()))
    return jsonify({
        **tg.status(cfg),
        'linked': bool(link and link.is_active),
        'link': link.to_dict() if link else None,
    })


@telegram_bp.route('/link', methods=['POST'])
@jwt_required()
def create_link():
    cfg = current_app.config
    if not tg.enabled(cfg):
        return jsonify({'error': "Telegram bot hali sozlanmagan — administratorga murojaat qiling"}), 503
    tg.ensure_setup(current_app._get_current_object())
    username = tg.bot_username(cfg)
    if not username:
        return jsonify({'error': "Server Telegram'ga ulana olmadi. Keyinroq urinib ko'ring"}), 503

    user_id = int(get_jwt_identity())
    # Eski ishlatilmagan kodlar bekor — har safar faqat oxirgi havola ishlaydi
    TelegramLinkCode.query.filter_by(user_id=user_id, used_at=None).delete()
    code = secrets.token_urlsafe(18)
    expires = utc_naive_now() + CODE_TTL
    db.session.add(TelegramLinkCode(code=code, user_id=user_id, expires_at=expires))
    db.session.commit()
    return jsonify({
        'url': f'https://t.me/{username}?start={code}',
        'bot_username': username,
        'expires_at': expires.isoformat() + 'Z',
    })


@telegram_bp.route('/link', methods=['DELETE'])
@jwt_required()
def delete_link():
    link = _my_link(int(get_jwt_identity()))
    if link:
        chat_id = link.chat_id
        db.session.delete(link)
        log_audit('delete', 'telegram_link', link.user_id, entity_label='Telegram uzildi')
        db.session.commit()
        try:
            tg.send(current_app.config, chat_id,
                    "🔌 Akkauntingiz botdan uzildi. Bildirishnomalar endi bu yerga kelmaydi.")
        except tg.TelegramError:
            pass
    return jsonify({'message': 'Uzildi'})


@telegram_bp.route('/test', methods=['POST'])
@jwt_required()
def send_test():
    link = _my_link(int(get_jwt_identity()))
    if not link or not link.is_active:
        return jsonify({'error': 'Telegram ulanmagan'}), 400
    try:
        tg.send(current_app.config, link.chat_id,
                '✅ Sinov xabari. Bildirishnomalar shu chatga keladi.')
    except tg.TelegramError as e:
        return jsonify({'error': e.description}), 502
    return jsonify({'message': 'Yuborildi'})


# =========================================================================
# WEBHOOK
# =========================================================================

@telegram_bp.route('/webhook', methods=['POST'])
def webhook():
    cfg = current_app.config
    if not tg.enabled(cfg):
        return jsonify({}), 404
    if request.headers.get('X-Telegram-Bot-Api-Secret-Token') != tg.webhook_secret(cfg):
        return jsonify({}), 403

    update = request.get_json(silent=True) or {}
    try:
        if 'callback_query' in update:
            _on_callback(update['callback_query'])
        elif 'message' in update:
            _on_message(update['message'])
    except Exception as e:
        # Telegram 200 olmasa xabarni qayta-qayta yuboradi — xato log'ga
        db.session.rollback()
        print(f'[telegram] webhook xatosi: {type(e).__name__}: {e}')
    return jsonify({})


def _linked_user(chat_id):
    link = TelegramLink.query.filter_by(chat_id=chat_id, is_active=True).first()
    if link is None or link.user is None or not link.user.is_active:
        return None
    return link.user


def _reply(chat_id, text, keyboard=None, force_reply=False):
    try:
        tg.send(current_app.config, chat_id, text, keyboard, force_reply=force_reply)
    except tg.TelegramError as e:
        print(f'[telegram] chat={chat_id}: {e.description}')


def _not_linked(chat_id):
    _reply(chat_id,
           "Bu chat hech qaysi akkauntga ulanmagan.\n"
           "Saytda <b>Profil → Telegram</b> bo'limidan \"Telegram'ga ulash\" tugmasini bosing.",
           [[{'text': '🔗 Profilni ochish', 'url': tg.site_url(current_app.config, '/profile')}]])


def _set_state(chat_id, state, data):
    row = TelegramChatState.query.get(chat_id)
    if row is None:
        row = TelegramChatState(chat_id=chat_id)
        db.session.add(row)
    row.state = state
    row.data = data


def _clear_state(chat_id):
    TelegramChatState.query.filter_by(chat_id=chat_id).delete()


def _on_message(msg):
    chat = msg.get('chat') or {}
    if chat.get('type') != 'private':
        return  # guruhlarda ishlamaydi — xabarlar shaxsiy
    chat_id = chat['id']
    text = (msg.get('text') or '').strip()
    cmd = text.split()[0].split('@')[0].lower() if text.startswith('/') else ''

    if cmd == '/start':
        parts = text.split(maxsplit=1)
        return _link_chat(msg, parts[1].strip() if len(parts) > 1 else '')

    user = _linked_user(chat_id)
    if user is None:
        return _not_linked(chat_id)

    if cmd == '/bekor':
        _clear_state(chat_id)
        db.session.commit()
        return _reply(chat_id, 'Bekor qilindi.')
    if cmd == '/stop':
        TelegramLink.query.filter_by(chat_id=chat_id).delete()
        _clear_state(chat_id)
        db.session.commit()
        return _reply(chat_id, "🔌 Akkaunt uzildi. Qayta ulash uchun saytdagi profilingizga kiring.")
    if cmd == '/vazifalar':
        return _list_my_tasks(chat_id, user)
    if cmd == '/tekshiruv':
        return _list_review(chat_id, user)

    state = TelegramChatState.query.get(chat_id)
    if state is not None and state.state == 'return_reason' and text and not cmd:
        return _finish_return(chat_id, user, state, text)

    return _help(chat_id, user)


def _link_chat(msg, code):
    chat_id = msg['chat']['id']
    if not code:
        user = _linked_user(chat_id)
        if user:
            return _help(chat_id, user)
        return _not_linked(chat_id)

    row = TelegramLinkCode.query.filter_by(code=code, used_at=None).first()
    if row is None or row.expires_at < utc_naive_now():
        return _reply(chat_id, "⌛ Havola eskirgan yoki ishlatilgan. Saytdagi profilingizdan yangisini oling.")
    user = User.query.get(row.user_id)
    if user is None or not user.is_active:
        return _reply(chat_id, "Akkaunt faol emas.")

    sender = msg.get('from') or {}
    # Bitta chat — bitta akkaunt va aksincha
    TelegramLink.query.filter(db.or_(TelegramLink.chat_id == chat_id,
                                     TelegramLink.user_id == user.id)).delete()
    db.session.add(TelegramLink(
        user_id=user.id, chat_id=chat_id,
        username=(sender.get('username') or '')[:255],
        first_name=(sender.get('first_name') or '')[:255],
    ))
    row.used_at = utc_naive_now()
    log_audit('create', 'telegram_link', user.id, entity_label='Telegram ulandi',
              details=f"@{sender.get('username') or '-'}", actor=user)
    db.session.commit()
    _reply(chat_id, f"✅ <b>{tg.esc(user.full_name)}</b>, akkauntingiz ulandi!")
    _help(chat_id, user)


def _help(chat_id, user):
    lines = [
        '🤖 <b>ATD Management boti</b>',
        '',
        "Sizga biriktirilgan yangi vazifalar, qaytarilgan va tasdiqlangan ishlar shu yerga keladi.",
        '',
        '/vazifalar — faol vazifalaringiz',
    ]
    if is_any_admin(user.role):
        lines.insert(3, "Xodimlaringiz ish topshirganda hisobot ham keladi — uni shu yerning o'zida "
                        "<b>✅ Qabul qilish</b> yoki <b>↩ Qaytarish</b> mumkin.")
        lines.append('/tekshiruv — tasdiqlashni kutayotgan ishlar')
    lines += ['/bekor — joriy amalni bekor qilish', '/stop — botni akkauntdan uzish']
    _reply(chat_id, '\n'.join(lines),
           [[{'text': '🌐 Saytni ochish', 'url': tg.site_url(current_app.config, '/')}]])


def _task_line(i, t):
    url = tg.site_url(current_app.config, f'/tasks/{t.id}')
    line = f'{i}. <a href="{url}">{tg.esc(t.name)}</a> — {STATUS_UZ.get(t.status, t.status)}'
    if t.deadline:
        line += f' · ⏰ {tg.local_dt(t.deadline)}'
        if t.is_overdue:
            line += ' ⚠️'
    return line


def _list_my_tasks(chat_id, user):
    from app.routes.tasks import _Actor, _is_assignee, _scoped_query
    actor = _Actor(user)
    tasks = _scoped_query(actor).filter(Task.status.in_(Task.ACTIVE_STATUSES)).all()
    mine = [t for t in tasks if _is_assignee(t, actor)]
    if not mine:
        return _reply(chat_id, "✨ Faol vazifangiz yo'q.")
    mine.sort(key=lambda t: (t.deadline is None, t.deadline or t.created_at))
    lines = [f'📋 <b>Faol vazifalaringiz ({len(mine)})</b>', '']
    lines += [_task_line(i, t) for i, t in enumerate(mine[:25], 1)]
    if len(mine) > 25:
        lines.append(f'… va yana {len(mine) - 25} ta (saytda)')
    _reply(chat_id, '\n'.join(lines))


def _list_review(chat_id, user):
    from app.routes.tasks import _Actor, _can_approve, _scoped_query
    from app.models import TaskReport
    actor = _Actor(user)
    if not actor.is_leader:
        return _reply(chat_id, "Bu buyruq rahbarlar uchun.")
    tasks = [t for t in _scoped_query(actor).filter(Task.status == 'review')
             .order_by(Task.created_at).all() if _can_approve(t, actor)]
    if not tasks:
        return _reply(chat_id, "✨ Tasdiqlashni kutayotgan ish yo'q.")
    _reply(chat_id, f'📥 <b>Tasdiqlashni kutayotgan ishlar: {len(tasks)}</b>'
                    + ('\nOxirgi 10 tasi quyida.' if len(tasks) > 10 else ''))
    for t in tasks[-10:]:
        report = TaskReport.query.filter_by(task_id=t.id).order_by(TaskReport.created_at.desc()).first()
        _reply(chat_id, tg.task_review_text(t, report), tg.task_review_buttons(current_app.config, t.id))


# =========================================================================
# TUGMALAR: QABUL QILISH / QAYTARISH
# =========================================================================

def _answer(cb, text, alert=False):
    try:
        tg.api(current_app.config, 'answerCallbackQuery',
               {'callback_query_id': cb['id'], 'text': text[:190], 'show_alert': alert})
    except tg.TelegramError:
        pass


def _drop_buttons(chat_id, message_id):
    if not message_id:
        return
    try:
        tg.api(current_app.config, 'editMessageReplyMarkup',
               {'chat_id': chat_id, 'message_id': message_id,
                'reply_markup': {'inline_keyboard': []}})
    except tg.TelegramError:
        pass


def _on_callback(cb):
    from app.routes.tasks import _Actor, _can_approve, _can_view, apply_status_change

    message = cb.get('message') or {}
    chat_id = (message.get('chat') or {}).get('id')
    message_id = message.get('message_id')
    user = _linked_user(chat_id) if chat_id else None
    if user is None:
        return _answer(cb, "Akkaunt ulanmagan — saytdagi profilingizdan ulang", alert=True)

    action, _, raw_id = (cb.get('data') or '').partition(':')
    try:
        task_id = int(raw_id)
    except ValueError:
        return _answer(cb, "Noma'lum amal")

    task = Task.query.get(task_id)
    actor = _Actor(user)
    if task is None or not _can_view(task, actor):
        _drop_buttons(chat_id, message_id)
        return _answer(cb, 'Vazifa topilmadi', alert=True)

    if task.status != 'review':
        _drop_buttons(chat_id, message_id)
        return _answer(cb, f"Bu ish allaqachon ko'rib chiqilgan: {STATUS_UZ.get(task.status, task.status)}",
                       alert=True)
    if not _can_approve(task, actor):
        return _answer(cb, "Bu ishni tasdiqlash huquqingiz yo'q", alert=True)

    if action == 'ta':
        err = apply_status_change(task, actor, 'completed', {})
        if err:
            db.session.rollback()
            return _answer(cb, err[0], alert=True)
        db.session.commit()
        _drop_buttons(chat_id, message_id)
        _answer(cb, 'Qabul qilindi')
        return _reply(chat_id, f'✅ <b>Qabul qilindi:</b> {tg.esc(task.name)}')

    if action == 'tr':
        _set_state(chat_id, 'return_reason', {'task_id': task.id, 'message_id': message_id})
        db.session.commit()
        _answer(cb, 'Sababini yozing')
        return _reply(chat_id, f'↩ <b>{tg.esc(task.name)}</b>\nQaytarish sababini yozing '
                               f'(xodimga yuboriladi). Bekor qilish: /bekor', force_reply=True)

    return _answer(cb, "Noma'lum amal")


def _finish_return(chat_id, user, state, reason):
    from app.routes.tasks import _Actor, _can_view, apply_status_change

    data = state.data or {}
    task = Task.query.get(data.get('task_id'))
    _clear_state(chat_id)
    actor = _Actor(user)
    if task is None or not _can_view(task, actor):
        db.session.commit()
        return _reply(chat_id, 'Vazifa topilmadi.')
    err = apply_status_change(task, actor, 'returned', {'return_reason': reason})
    if err:
        db.session.rollback()
        _clear_state(chat_id)
        db.session.commit()
        return _reply(chat_id, f'⚠️ {tg.esc(err[0])}')
    db.session.commit()
    _drop_buttons(chat_id, data.get('message_id'))
    _reply(chat_id, f'↩ <b>Qaytarildi:</b> {tg.esc(task.name)}\nSabab: {tg.esc(reason)}')
