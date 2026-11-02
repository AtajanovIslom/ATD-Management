"""
Telegram bot: akkauntni ulash va bot orqali ishlash.

Profil sahifasi uchun (JWT bilan):
  GET    /api/telegram/status   — bot sozlanganmi, xodim ulanganmi
  POST   /api/telegram/link     — bir martalik ulash havolasi (t.me/<bot>?start=<kod>)
  DELETE /api/telegram/link     — uzish
  POST   /api/telegram/test     — sinov xabari

Telegram uchun (maxfiy sarlavha bilan):
  POST   /api/telegram/webhook  — botga kelgan xabar va tugma bosishlari
  (polling rejimida xuddi shu handle_update() app/telegram_poller.py'dan)

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
    MailAccount, MailMessage, Task, TaskReport, TelegramChatState, TelegramLink,
    TelegramLinkCode, User, utc_naive_now,
)
from app.services import telegram as tg
from app.utils import is_any_admin, log_audit

telegram_bp = Blueprint('telegram', __name__)

CODE_TTL = timedelta(minutes=15)
LIST_LIMIT = 10


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
                    tg.card('🔌 Akkaunt uzildi', None,
                            ['Bildirishnomalar endi bu chatga kelmaydi.'],
                            footer="Qayta ulash: saytda Profil → Telegram'ga ulash"),
                    markup={'remove_keyboard': True})
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
                tg.card('✅ Sinov xabari', None, ['Bildirishnomalar shu chatga keladi.']))
    except tg.TelegramError as e:
        return jsonify({'error': e.description}), 502
    return jsonify({'message': 'Yuborildi'})


# =========================================================================
# WEBHOOK VA UMUMIY ISHLOVCHI
# =========================================================================

@telegram_bp.route('/webhook', methods=['POST'])
def webhook():
    cfg = current_app.config
    if not tg.enabled(cfg):
        return jsonify({}), 404
    if request.headers.get('X-Telegram-Bot-Api-Secret-Token') != tg.webhook_secret(cfg):
        return jsonify({}), 403
    # Telegram 200 olmasa xabarni qayta-qayta yuboradi — xato log'ga
    handle_update(request.get_json(silent=True) or {})
    return jsonify({})


def handle_update(update):
    """Bitta Telegram update'ini qayta ishlaydi (webhook va poller uchun umumiy).
    App kontekstida chaqiriladi; xato yutib yuboriladi va log'ga yoziladi."""
    try:
        if 'callback_query' in update:
            _on_callback(update['callback_query'])
        elif 'message' in update:
            _on_message(update['message'])
    except Exception as e:
        db.session.rollback()
        print(f'[telegram] update xatosi: {type(e).__name__}: {e}')


def _linked_user(chat_id):
    link = TelegramLink.query.filter_by(chat_id=chat_id, is_active=True).first()
    if link is None or link.user is None or not link.user.is_active:
        return None
    return link.user


def _reply(chat_id, text, keyboard=None, force_reply=False, markup=None, reply_to=None):
    try:
        return tg.send(current_app.config, chat_id, text, keyboard, reply_to=reply_to,
                       force_reply=force_reply, markup=markup)
    except tg.TelegramError as e:
        print(f'[telegram] chat={chat_id}: {e.description}')


def _not_linked(chat_id):
    _reply(chat_id,
           tg.card('👋 Assalomu alaykum!', None, [
               "Bu chat hali hech qaysi akkauntga ulanmagan.",
               '',
               "1️⃣ Saytda <b>Profil</b> sahifasini oching",
               "2️⃣ <b>📲 Telegram'ga ulash</b> tugmasini bosing",
               "3️⃣ Ochilgan botda <b>Start</b> ni bosing",
           ]),
           [[{'text': '🌐 Profilni ochish', 'url': tg.site_url(current_app.config, '/profile')}]])


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
    # Pastdagi menyu tugmasi bosilsa — mos buyruq
    text = tg.BUTTON_COMMANDS.get(text, text)
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
        return _reply(chat_id, '✖️ Bekor qilindi.', markup=tg.main_keyboard(is_any_admin(user.role)))
    if cmd == '/stop':
        TelegramLink.query.filter_by(chat_id=chat_id).delete()
        _clear_state(chat_id)
        db.session.commit()
        return _reply(chat_id, tg.card('🔌 Akkaunt uzildi', None,
                                       ['Qayta ulash uchun saytdagi profilingizga kiring.']),
                      markup={'remove_keyboard': True})
    if cmd == '/vazifalar':
        return _list_my_tasks(chat_id, user)
    if cmd == '/tekshiruv':
        return _list_review(chat_id, user)
    if cmd == '/pochta':
        return _mail_status(chat_id, user)
    if cmd in ('/yordam', '/help'):
        return _help(chat_id, user)

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
        return _reply(chat_id, tg.card('⌛ Havola eskirgan', None, [
            "Bu havola ishlatilgan yoki muddati o'tgan.",
            "Saytdagi Profil sahifasidan yangisini oling."]))
    user = User.query.get(row.user_id)
    if user is None or not user.is_active:
        return _reply(chat_id, 'Akkaunt faol emas.')

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
    _reply(chat_id, tg.card('✅ Akkaunt ulandi', user.full_name, [
        f'💼 {tg.esc(user.position)}' if user.position else None,
        "Endi bildirishnomalar shu yerga keladi."]),
        markup=tg.main_keyboard(is_any_admin(user.role)))
    _help(chat_id, user)


def _help(chat_id, user):
    leader = is_any_admin(user.role)
    rows = [
        "🆕 Yangi, qaytarilgan va tasdiqlangan vazifalar haqida xabar",
        "📧 Korporativ pochtaga kelgan yangi xatlar (Profilda ulansa)",
    ]
    if leader:
        rows.insert(1, "📥 Xodim hisobotini shu yerda <b>✅ qabul</b> qilish yoki <b>↩️ qaytarish</b>")
    rows += [
        '',
        f'<b>{tg.BTN_TASKS}</b> — faol vazifalaringiz',
    ]
    if leader:
        rows.append(f'<b>{tg.BTN_REVIEW}</b> — tasdiqlashni kutayotgan ishlar')
    rows += [f'<b>{tg.BTN_MAIL}</b> — pochta holati', '/bekor · /stop']
    _reply(chat_id, tg.card('🤖 ATD Management boti', None, rows),
           markup=tg.main_keyboard(leader))


def _task_button(t):
    label = f'{"⚠️ " if t.is_overdue else ""}{tg.clip(t.name, 40)}'
    return [{'text': label, 'callback_data': f'tv:{t.id}'}]


def _list_my_tasks(chat_id, user):
    from app.routes.tasks import _Actor, _is_assignee, _scoped_query
    actor = _Actor(user)
    tasks = _scoped_query(actor).filter(Task.status.in_(Task.ACTIVE_STATUSES)).all()
    mine = [t for t in tasks if _is_assignee(t, actor)]
    if not mine:
        return _reply(chat_id, tg.card('📋 Vazifalarim', None, ["✨ Hozircha faol vazifangiz yo'q."]))
    mine.sort(key=lambda t: (t.deadline is None, t.deadline or t.created_at))
    rows = []
    for t in mine[:LIST_LIMIT]:
        line = f'{tg.STATUS_UZ.get(t.status, t.status).split()[0]} <b>{tg.esc(tg.clip(t.name, 60))}</b>'
        if t.deadline:
            line += f'\n      ⏰ {tg.local_dt(t.deadline)}' + (' ⚠️ kechikdi' if t.is_overdue else '')
        rows.append(line)
    footer = 'Batafsil ko\'rish uchun vazifani tanlang'
    if len(mine) > LIST_LIMIT:
        footer = f'Yana {len(mine) - LIST_LIMIT} ta — saytda. ' + footer
    _reply(chat_id, tg.card(f'📋 Faol vazifalarim · {len(mine)}', None, rows, footer=footer),
           [_task_button(t) for t in mine[:LIST_LIMIT]])


def _list_review(chat_id, user):
    from app.routes.tasks import _Actor, _can_approve, _scoped_query
    actor = _Actor(user)
    if not actor.is_leader:
        return _reply(chat_id, "Bu bo'lim rahbarlar uchun.")
    tasks = [t for t in _scoped_query(actor).filter(Task.status == 'review')
             .order_by(Task.created_at).all() if _can_approve(t, actor)]
    if not tasks:
        return _reply(chat_id, tg.card('📥 Tekshiruv', None, ["✨ Tasdiqlashni kutayotgan ish yo'q."]))
    _reply(chat_id, tg.card(f'📥 Tasdiqlashni kutayotgan ishlar · {len(tasks)}', None,
                            ['Har biri alohida xabarda — tugmalar bilan.'],
                            footer='Oxirgi 10 tasi' if len(tasks) > LIST_LIMIT else None))
    for t in tasks[-LIST_LIMIT:]:
        report = TaskReport.query.filter_by(task_id=t.id).order_by(TaskReport.created_at.desc()).first()
        _reply(chat_id, tg.task_review_text(t, report), tg.task_review_buttons(current_app.config, t.id))


def _mail_status(chat_id, user):
    acc = MailAccount.query.filter_by(user_id=user.id).first()
    profile = [[{'text': '🌐 Profilni ochish', 'url': tg.site_url(current_app.config, '/profile')}]]
    if acc is None:
        return _reply(chat_id, tg.card('📧 Korporativ pochta', None, [
            'Pochta hali ulanmagan.',
            "Saytda <b>Profil → Korporativ pochta</b> bo'limida manzil va parolingizni kiriting —",
            "shundan keyin yangi xatlar shu yerga keladi."]), profile)
    rows = [f'✉️ {tg.esc(acc.email)}',
            '🟢 Kuzatilmoqda' if acc.is_active else '🔴 To\'xtatilgan']
    if acc.last_checked_at:
        rows.append(f'🔄 Oxirgi tekshiruv: {tg.local_dt(acc.last_checked_at)}')
    if acc.last_error:
        rows.append(f'⚠️ {tg.esc(acc.last_error)}')
    buttons = [[{'text': '🌐 Pochtani ochish', 'url': current_app.config['MAIL_WEB_URL']}]]
    if acc.is_active:
        buttons.insert(0, [{'text': "📬 O'qilmaganlarni yuborish", 'callback_data': 'mu:0'}])
    _reply(chat_id, tg.card('📧 Korporativ pochta', None, rows), buttons + profile)


# =========================================================================
# TUGMALAR
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
    message = cb.get('message') or {}
    chat_id = (message.get('chat') or {}).get('id')
    message_id = message.get('message_id')
    user = _linked_user(chat_id) if chat_id else None
    if user is None:
        return _answer(cb, "Akkaunt ulanmagan — saytdagi profilingizdan ulang", alert=True)

    action, _, raw_id = (cb.get('data') or '').partition(':')
    try:
        obj_id = int(raw_id)
    except ValueError:
        return _answer(cb, "Noma'lum amal")

    if action == 'mf':
        return _mail_full(cb, chat_id, message_id, user, obj_id)
    if action == 'mu':
        return _mail_unseen(cb, user)
    if action in ('ta', 'tr', 'tv'):
        return _task_action(cb, chat_id, message_id, user, action, obj_id)
    return _answer(cb, "Noma'lum amal")


def _mail_unseen(cb, user):
    acc = MailAccount.query.filter_by(user_id=user.id, is_active=True).first()
    if acc is None:
        return _answer(cb, "Pochta ulanmagan yoki to'xtatilgan — Profilda ulang", alert=True)
    acc.send_unseen = True
    db.session.commit()
    interval = current_app.config['MAIL_CHECK_INTERVAL']
    _answer(cb, f"📬 {interval} soniya ichida yuboriladi", alert=False)


def _mail_full(cb, chat_id, message_id, user, msg_id):
    from app.services import mail as mail_svc
    row = MailMessage.query.filter_by(id=msg_id, user_id=user.id).first()
    if row is None:
        return _answer(cb, "Xat topilmadi (30 kundan eski xatlar o'chiriladi)", alert=True)
    cfg = current_app.config
    _answer(cb, "To'liq matn")
    full_card = mail_svc.card_text(row, full=True)
    if len(full_card) <= tg.MAX_TEXT:
        try:
            return tg.edit_text(cfg, chat_id, message_id, full_card,
                                mail_svc.card_buttons(cfg, row, full=True))
        except tg.TelegramError:
            pass
    # Uzun xat — bo'laklab, asl kartochkaga javob sifatida
    _drop_buttons(chat_id, message_id)
    chunks = mail_svc.full_text_chunks(row)
    for i, chunk in enumerate(chunks, 1):
        head = f'<b>📖 {tg.esc(tg.clip(row.subject, 80))}</b>' + (f'  ·  {i}/{len(chunks)}' if len(chunks) > 1 else '')
        _reply(chat_id, head + '\n' + tg.quote(chunk), reply_to=message_id)


def _task_action(cb, chat_id, message_id, user, action, task_id):
    from app.routes.tasks import _Actor, _can_approve, _can_view, apply_status_change

    task = Task.query.get(task_id)
    actor = _Actor(user)
    if task is None or not _can_view(task, actor):
        _drop_buttons(chat_id, message_id)
        return _answer(cb, 'Vazifa topilmadi', alert=True)

    if action == 'tv':
        _answer(cb, '')
        report = TaskReport.query.filter_by(task_id=task.id).order_by(TaskReport.created_at.desc()).first()
        from app.routes.tasks import _can_see_all_reports
        if report is not None and report.user_id != user.id and not _can_see_all_reports(task, actor):
            report = None
        kb = tg.task_review_buttons(current_app.config, task.id) \
            if task.status == 'review' and _can_approve(task, actor) else tg.task_buttons(current_app.config, task.id)
        kb = [row for row in kb if not any(b.get('callback_data') == f'tv:{task.id}' for b in row)] or kb
        return _reply(chat_id, tg.task_detail_text(task, report), kb)

    if task.status != 'review':
        _drop_buttons(chat_id, message_id)
        return _answer(cb, f"Bu ish allaqachon ko'rib chiqilgan: {tg.STATUS_UZ.get(task.status, task.status)}",
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
        _answer(cb, '✅ Qabul qilindi')
        return _reply(chat_id, tg.card('✅ Qabul qilindi', f'📝 {task.name}',
                                       [f'🕒 {tg.local_dt(utc_naive_now())}']), reply_to=message_id)

    # tr — qaytarish: sababini so'raymiz
    _set_state(chat_id, 'return_reason', {'task_id': task.id, 'message_id': message_id})
    db.session.commit()
    _answer(cb, 'Sababini yozing')
    return _reply(chat_id, tg.card('↩️ Qaytarish', f'📝 {task.name}', [
        'Qaytarish sababini yozing — u xodimga yuboriladi.'], footer='Bekor qilish: /bekor'),
        force_reply=True, reply_to=message_id)


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
    _reply(chat_id, tg.card('↩️ Qaytarildi', f'📝 {task.name}', [], body=f'Sabab: {reason}'),
           markup=tg.main_keyboard(is_any_admin(user.role)))
