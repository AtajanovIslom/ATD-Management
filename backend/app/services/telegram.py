"""Telegram bot — transport, xabar dizayni va bildirishnomalarni yetkazish.

Tashkilotda bitta umumiy bot (token .env'dagi TELEGRAM_BOT_TOKEN). Xodim
profil sahifasidan bir martalik havola orqali botga ulanadi (TelegramLink),
shundan so'ng tizimdagi bildirishnomalar (notify) botga ham yuboriladi.

Xabarlarni qabul qilish ikki rejimda (TELEGRAM_MODE):
  polling (standart) — `telegram` konteyneridagi app/telegram_poller.py
      Telegram'dan getUpdates bilan o'zi so'raydi. Faqat chiquvchi ulanish
      kerak: domen internetdan boshqa serverga qaraganda ham ishlaydi.
  webhook — Telegram PUBLIC_BASE_URL/api/telegram/webhook ga o'zi yuboradi.
Ikkalasi ham bir xil ishlovchi (routes/telegram.handle_update) orqali.
HTTP so'rovlar standart urllib bilan — qo'shimcha kutubxona yo'q.
"""
import hashlib
import html
import json
import re
import threading
import uuid
from datetime import timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_URL = 'https://api.telegram.org/bot{token}/{method}'
TIMEOUT = 10
MAX_TEXT = 4000           # Telegram chegarasi 4096
REPORT_PREVIEW = 900      # Xabardagi hisobot matni
MAX_DOCUMENT = 45 * 1024 * 1024   # bot API 50 MB, zaxira bilan
LINE = '━━━━━━━━━━━━━━━'

# Bot buyruqlari (Telegram menyusida ko'rinadi)
COMMANDS = {
    'uz': [
        ('vazifalar', '📋 Faol vazifalarim'),
        ('tekshiruv', '📥 Tasdiqlashni kutayotgan ishlar'),
        ('pochta', '📧 Korporativ pochta holati'),
        ('yordam', '❓ Bot imkoniyatlari'),
        ('bekor', '✖️ Joriy amalni bekor qilish'),
    ],
    'ru': [
        ('vazifalar', '📋 Мои активные задачи'),
        ('tekshiruv', '📥 Работы на проверке'),
        ('pochta', '📧 Корпоративная почта'),
        ('yordam', '❓ Возможности бота'),
        ('bekor', '✖️ Отменить действие'),
    ],
}
DESCRIPTION = (
    "ATD Management — ish boshqaruv tizimining rasmiy boti.\n\n"
    "• Yangi vazifalar va ularning holati\n"
    "• Xodim hisobotlarini shu yerda qabul qilish yoki qaytarish\n"
    "• Korporativ pochtaga kelgan yangi xatlar\n\n"
    "Ulash: saytda Profil → \"Telegram'ga ulash\"."
)
SHORT_DESCRIPTION = "ATD Management: vazifalar, hisobotlar va korporativ pochta bildirishnomalari"

# Pastdagi doimiy tugmalar — matni bosilganda buyruq sifatida qabul qilinadi
BTN_TASKS = '📋 Vazifalarim'
BTN_REVIEW = '📥 Tekshiruv'
BTN_MAIL = '📧 Pochta'
BTN_HELP = '❓ Yordam'
BUTTON_COMMANDS = {BTN_TASKS: '/vazifalar', BTN_REVIEW: '/tekshiruv',
                   BTN_MAIL: '/pochta', BTN_HELP: '/yordam'}

STATUS_UZ = {
    'active': '🟡 Faol', 'in_progress': '🔵 Jarayonda', 'review': '🟠 Tekshiruvda',
    'returned': '🔴 Qaytarilgan', 'completed': '🟢 Tasdiqlangan', 'cancelled': '⚫ Bekor qilingan',
    'pending': '⚪ Kutilmoqda',
}

# Hodisa → kartochka sarlavhasi
EVENT_HEADERS = {
    'task_assigned': '🆕 Yangi vazifa',
    'task_review': '📥 Tekshiruvga tushdi',
    'task_completed': '✅ Vazifa tasdiqlandi',
    'task_returned': '↩️ Vazifa qaytarildi',
    'task_cancelled': '🚫 Vazifa bekor qilindi',
    'stage_assigned': '🚀 Yangi loyiha bosqichi',
    'stage_review': '📥 Bosqich tekshiruvga tushdi',
    'stage_completed': '✅ Bosqich tasdiqlandi',
}

# Har bir worker jarayonida bir marta sozlanadi
_state = {'setup_started': False, 'username': None, 'last_error': '', 'webhook_ok': False}
_lock = threading.Lock()


class TelegramError(Exception):
    def __init__(self, description, code=None):
        super().__init__(description)
        self.description = description
        self.code = code


# =========================================================================
# SOZLAMA VA TRANSPORT
# =========================================================================

def token(config):
    return (config.get('TELEGRAM_BOT_TOKEN') or '').strip()


def enabled(config):
    return bool(token(config))


def mode(config):
    return 'webhook' if config.get('TELEGRAM_MODE') == 'webhook' else 'polling'


def webhook_secret(config):
    """Telegram webhook so'roviga qo'shadigan maxfiy sarlavha qiymati."""
    explicit = (config.get('TELEGRAM_WEBHOOK_SECRET') or '').strip()
    if explicit:
        return explicit
    return hashlib.sha256(('atd-webhook:' + token(config)).encode()).hexdigest()[:48]


def _call(config, method, body, content_type, timeout):
    tk = token(config)
    if not tk:
        raise TelegramError('Bot tokeni sozlanmagan')
    req = Request(API_URL.format(token=tk, method=method), data=body,
                  headers={'Content-Type': content_type})
    try:
        with urlopen(req, timeout=timeout) as resp:
            data = json.loads(resp.read().decode('utf-8'))
    except HTTPError as e:
        try:
            data = json.loads(e.read().decode('utf-8'))
        except Exception:
            raise TelegramError(f'HTTP {e.code}', e.code)
    except (URLError, TimeoutError, OSError) as e:
        raise TelegramError(f"Telegram serveriga ulanib bo'lmadi: {e}")
    if not data.get('ok'):
        raise TelegramError(data.get('description') or 'Telegram xatosi', data.get('error_code'))
    return data.get('result')


def api(config, method, payload=None, timeout=TIMEOUT):
    """Bot API chaqiruvi. Natija (`result`) qaytadi yoki TelegramError."""
    return _call(config, method, json.dumps(payload or {}).encode('utf-8'),
                 'application/json', timeout)


def bot_username(config):
    """@username (getMe) — bir marta so'raladi va eslab qolinadi."""
    if _state['username']:
        return _state['username']
    try:
        me = api(config, 'getMe', timeout=5)
        _state['username'] = me.get('username')
    except TelegramError as e:
        _state['last_error'] = e.description
    return _state['username']


def status(config):
    return {
        'enabled': enabled(config),
        'mode': mode(config),
        'bot_username': bot_username(config) if enabled(config) else None,
        'webhook_ok': _state['webhook_ok'],
        'error': _state['last_error'] or None,
    }


def configure_bot(config):
    """Buyruqlar menyusi (uz/ru) va bot tavsifi — polling ham, webhook ham."""
    for lang, cmds in COMMANDS.items():
        payload = {'commands': [{'command': c, 'description': d} for c, d in cmds]}
        if lang != 'uz':
            payload['language_code'] = lang
        api(config, 'setMyCommands', payload)
    try:
        api(config, 'setMyDescription', {'description': DESCRIPTION})
        api(config, 'setMyShortDescription', {'short_description': SHORT_DESCRIPTION})
    except TelegramError:
        pass  # tavsif ixtiyoriy — xato asosiy ishni to'xtatmasin


def ensure_setup(app):
    """Webhook rejimida webhook va menyuni o'rnatadi — har jarayonda bir
    marta, fon oqimida. Polling rejimida buni poller qiladi."""
    if not enabled(app.config) or mode(app.config) != 'webhook':
        return
    with _lock:
        if _state['setup_started']:
            return
        _state['setup_started'] = True
    threading.Thread(target=_setup, args=(app,), daemon=True, name='tg-setup').start()


def _setup(app):
    cfg = app.config
    try:
        api(cfg, 'setWebhook', {
            'url': cfg['PUBLIC_BASE_URL'] + '/api/telegram/webhook',
            'secret_token': webhook_secret(cfg),
            'allowed_updates': ['message', 'callback_query'],
        })
        configure_bot(cfg)
        _state['webhook_ok'] = True
        _state['last_error'] = ''
        bot_username(cfg)
        print('[telegram] webhook o\'rnatildi')
    except TelegramError as e:
        _state['last_error'] = e.description
        _state['setup_started'] = False
        print(f'[telegram] sozlab bo\'lmadi: {e.description}')


def send(config, chat_id, text, keyboard=None, reply_to=None, force_reply=False, markup=None):
    """Matnli xabar. `keyboard` — inline tugmalar, `markup` — tayyor
    reply_markup (masalan pastdagi doimiy menyu)."""
    payload = {
        'chat_id': chat_id,
        'text': text[:MAX_TEXT],
        'parse_mode': 'HTML',
        'link_preview_options': {'is_disabled': True},
    }
    if markup is not None:
        payload['reply_markup'] = markup
    elif keyboard:
        payload['reply_markup'] = {'inline_keyboard': keyboard}
    elif force_reply:
        payload['reply_markup'] = {'force_reply': True, 'input_field_placeholder': 'Sababini yozing...'}
    if reply_to:
        payload['reply_parameters'] = {'message_id': reply_to, 'allow_sending_without_reply': True}
    return api(config, 'sendMessage', payload)


def edit_text(config, chat_id, message_id, text, keyboard=None):
    payload = {
        'chat_id': chat_id, 'message_id': message_id,
        'text': text[:MAX_TEXT], 'parse_mode': 'HTML',
        'link_preview_options': {'is_disabled': True},
        'reply_markup': {'inline_keyboard': keyboard or []},
    }
    return api(config, 'editMessageText', payload)


def send_document(config, chat_id, filename, content, caption=None, reply_to=None):
    """Faylni hujjat sifatida yuboradi (multipart/form-data, urllib)."""
    boundary = uuid.uuid4().hex
    parts = []

    def field(name, value):
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="{name}"\r\n\r\n'
                     .encode() + str(value).encode('utf-8') + b'\r\n')

    field('chat_id', chat_id)
    if caption:
        field('caption', caption[:1000])
        field('parse_mode', 'HTML')
    if reply_to:
        field('reply_parameters', json.dumps({'message_id': reply_to, 'allow_sending_without_reply': True}))
    safe_name = (filename or 'fayl').replace('"', "'").replace('\r', ' ').replace('\n', ' ')
    parts.append(
        f'--{boundary}\r\nContent-Disposition: form-data; name="document"; filename="{safe_name}"\r\n'
        f'Content-Type: application/octet-stream\r\n\r\n'.encode('utf-8') + content + b'\r\n')
    parts.append(f'--{boundary}--\r\n'.encode())
    return _call(config, 'sendDocument', b''.join(parts),
                 f'multipart/form-data; boundary={boundary}', timeout=120)


# =========================================================================
# DIZAYN YORDAMCHILARI
# =========================================================================

# Foydalanuvchi matnidagi HTML teglari (masalan vazifa nomida
# <font color="#00ff00">…</font>). Bot ularni ko'rsatmaydi — faqat matn.
# Faqat ma'lum teg nomlari: "Ism <ism@pochta.uz>" kabi matn tegilmaydi.
_HTML_TAG = re.compile(
    r'</?(?:font|b|i|u|s|strong|em|span|div|p|br|hr|a|img|small|big|mark|sub|sup|'
    r'h[1-6]|ul|ol|li|table|thead|tbody|tr|td|th|center|script|style)(?:\s[^>]*)?/?>',
    re.IGNORECASE)


def strip_html(s):
    return _HTML_TAG.sub('', s or '')


def esc(s):
    return html.escape(strip_html(s), quote=False)


def clip(s, n):
    s = (s or '').strip()
    return s if len(s) <= n else s[:n].rstrip() + '…'


def quote(text, expandable=False):
    """Iqtibos bloki. `expandable` — uzun matn yig'ilgan holda ko'rinadi,
    bosilsa ochiladi (Telegram'ning o'z imkoniyati)."""
    tag = 'blockquote expandable' if expandable else 'blockquote'
    return f'<{tag}>{esc(text)}</blockquote>'


def card(header, title=None, rows=(), body=None, expandable=False, footer=None):
    """Bir xil uslubdagi kartochka:

        🆕 Yangi vazifa
        ━━━━━━━━━━━━━━━
        📝 Vazifa nomi
        ⏰ Muddat: ...
        ┃ matn (iqtibos)
        ...izoh
    """
    lines = [f'<b>{header}</b>', LINE]
    if title:
        lines.append(f'<b>{esc(title)}</b>')
    for row in rows:
        if row is not None:   # '' — ataylab bo'sh qator (ajratgich)
            lines.append(row)
    if body:
        lines.append(quote(body, expandable=expandable or len(body) > 300))
    if footer:
        lines.append(f'<i>{footer}</i>')
    return '\n'.join(lines)


def local_dt(dt):
    if not dt:
        return ''
    if dt.tzinfo is None:
        dt = dt.replace(tzinfo=timezone.utc)
    return dt.astimezone().strftime('%d.%m.%Y %H:%M')


def site_url(config, path):
    return config['PUBLIC_BASE_URL'] + path


def entity_path(entity_type, entity_id, data):
    if entity_type == 'task' and entity_id:
        return f'/tasks/{entity_id}'
    if entity_type == 'project_stage':
        pid = (data or {}).get('project_id')
        return f'/projects/{pid}' if pid else '/'
    if entity_type == 'interactive_request':
        return '/interactive-requests'
    return '/'


def main_keyboard(is_leader):
    """Pastdagi doimiy menyu — buyruq yozish shart emas."""
    rows = [[{'text': BTN_TASKS}]]
    if is_leader:
        rows[0].append({'text': BTN_REVIEW})
    rows.append([{'text': BTN_MAIL}, {'text': BTN_HELP}])
    return {'keyboard': rows, 'resize_keyboard': True, 'is_persistent': True,
            'input_field_placeholder': 'Menyudan tanlang...'}


def task_rows(task):
    rows = [f'📊 Holat: {STATUS_UZ.get(task.status, task.status)}']
    if task.deadline:
        rows.append(f'⏰ Muddat: {local_dt(task.deadline)}' + (' ⚠️ <b>kechikdi</b>' if task.is_overdue else ''))
    if task.creator:
        rows.append(f'👔 Bergan: {esc(task.creator.full_name)}')
    return rows


def task_review_buttons(config, task_id):
    return [
        [{'text': '✅ Qabul qilish', 'callback_data': f'ta:{task_id}'},
         {'text': '↩️ Qaytarish', 'callback_data': f'tr:{task_id}'}],
        [{'text': '📄 Batafsil', 'callback_data': f'tv:{task_id}'},
         {'text': '🌐 Saytda ochish', 'url': site_url(config, f'/tasks/{task_id}')}],
    ]


def task_buttons(config, task_id):
    return [[{'text': '📄 Batafsil', 'callback_data': f'tv:{task_id}'},
             {'text': '🌐 Saytda ochish', 'url': site_url(config, f'/tasks/{task_id}')}]]


def task_review_text(task, report):
    """Rahbarga: xodim yuborgan ish — vazifa, kim, qachon, hisobot matni."""
    rows = []
    footer = None
    body = None
    if report is not None:
        who = report.user.full_name if report.user else ''
        rows.append(f'👤 Xodim: <b>{esc(who)}</b>')
        rows.append(f'🕒 Topshirdi: {local_dt(report.created_at)}')
        body = clip(report.content, REPORT_PREVIEW)
        if report.files:
            footer = f'📎 {len(report.files)} ta fayl biriktirilgan — saytda'
    if task.deadline:
        rows.append(f'⏰ Muddat: {local_dt(task.deadline)}' + (' ⚠️' if task.is_overdue else ''))
    return card('📥 Tekshiruvga tushdi', f'📝 {task.name}', rows, body=body, footer=footer)


def task_detail_text(task, report=None):
    body = clip(task.description, 1500) if task.description else None
    rows = task_rows(task)
    workers = [a.full_name for a in task.assignees] or ([task.assignee.full_name] if task.assignee else [])
    if workers:
        rows.append(f'👥 Ijrochi: {esc(", ".join(workers))}')
    elif task.team:
        rows.append(f'👥 Guruh: {esc(task.team.name)}')
    text = card('📄 Vazifa', f'📝 {task.name}', rows, body=body)
    if report is not None:
        text += '\n\n' + f'<b>🗂 Oxirgi hisobot</b> · {esc(report.user.full_name if report.user else "")}, ' \
                         f'{local_dt(report.created_at)}\n' + quote(clip(report.content, 1200), expandable=True)
    return text


# =========================================================================
# BILDIRISHNOMALARNI YETKAZISH (notifications._deliver_safe'dan, fon oqimida)
# =========================================================================

def _notification_card(cfg, item, link, Task, TaskReport):
    """(matn, tugmalar) — hodisa turiga mos kartochka."""
    data = item.get('data') or {}
    event = data.get('event', '')
    entity_type = data.get('entity_type', '')
    entity_id = data.get('entity_id')
    keyboard = [[{'text': '🌐 Saytda ochish',
                  'url': site_url(cfg, entity_path(entity_type, entity_id, data))}]]

    task = Task.query.get(entity_id) if entity_type == 'task' and entity_id else None
    if task is not None:
        if event == 'task_review':
            report = TaskReport.query.filter_by(task_id=task.id) \
                .order_by(TaskReport.created_at.desc()).first()
            kb = task_review_buttons(cfg, task.id) if can_approve_task(task, link.user) \
                else task_buttons(cfg, task.id)
            return task_review_text(task, report), kb
        rows = task_rows(task)
        if item.get('actor_name') and event != 'task_assigned':
            rows.append(f'👤 {esc(item["actor_name"])}')
        body = None
        if event == 'task_returned' and ' — ' in (item.get('body') or ''):
            body = 'Sabab: ' + item['body'].split(' — ', 1)[1]
        elif event == 'task_cancelled' and task.cancel_reason:
            body = 'Sabab: ' + task.cancel_reason
        elif event == 'task_assigned' and task.description:
            body = clip(task.description, 600)
        header = EVENT_HEADERS.get(event, '🔔 ' + esc(item['title']))
        return card(header, f'📝 {task.name}', rows, body=body), task_buttons(cfg, task.id)

    header = EVENT_HEADERS.get(event) or ('🔔 ' + esc(item['title']))
    rows = [f'👤 {esc(item["actor_name"])}'] if item.get('actor_name') else []
    return card(header, item.get('body') or None, rows), keyboard


def deliver(app, items):
    """Telegram'ga ulangan xodimlarga bildirishnomalarni yuboradi."""
    cfg = app.config
    if not enabled(cfg) or not items:
        return
    from app import db
    from app.models import Task, TaskReport, TelegramLink

    user_ids = {i['user_id'] for i in items}
    links = {l.user_id: l for l in TelegramLink.query.filter(
        TelegramLink.user_id.in_(user_ids), TelegramLink.is_active.is_(True)).all()}
    if not links:
        return

    changed = False
    for item in items:
        link = links.get(item['user_id'])
        if link is None or not (link.user and link.user.is_active):
            continue
        text, keyboard = _notification_card(cfg, item, link, Task, TaskReport)
        try:
            send(cfg, link.chat_id, text, keyboard)
        except TelegramError as e:
            if deactivate_on_error(link, e):
                changed = True
            print(f'[telegram] user={item["user_id"]}: {e.description}')
    if changed:
        db.session.commit()


def deactivate_on_error(link, e):
    """Xodim botni bloklagan yoki chatni o'chirgan — boshqa urinmaymiz."""
    if e.code == 403 or (e.code == 400 and 'chat not found' in (e.description or '').lower()):
        link.is_active = False
        return True
    return False


def can_approve_task(task, user):
    from app.routes.tasks import _Actor, _can_approve
    return task.status == 'review' and _can_approve(task, _Actor(user))
