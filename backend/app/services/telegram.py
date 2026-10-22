"""Telegram bot — transport va bildirishnoma ko'rinishi.

Tashkilotda bitta umumiy bot (token .env'dagi TELEGRAM_BOT_TOKEN). Xodim
profil sahifasidan bir martalik havola orqali botga ulanadi (TelegramLink),
shundan so'ng tizimdagi bildirishnomalar (notify) botga ham yuboriladi.

Bot webhook rejimida ishlaydi: Telegram yangi xabarlarni
PUBLIC_BASE_URL/api/telegram/webhook ga yuboradi (routes/telegram.py).
Alohida jarayon yoki qo'shimcha kutubxona kerak emas — HTTP so'rovlar
standart urllib bilan.

Telegram'ga ulanib bo'lmasa (token yo'q, tarmoq yopiq) — sayt odatdagidek
ishlaydi, xatolar log'ga yoziladi va profil sahifasida ko'rsatiladi.
"""
import hashlib
import html
import json
import threading
from datetime import timezone
from urllib.error import HTTPError, URLError
from urllib.request import Request, urlopen

API_URL = 'https://api.telegram.org/bot{token}/{method}'
TIMEOUT = 10
MAX_TEXT = 3500           # Telegram chegarasi 4096 — teglar uchun zaxira
REPORT_PREVIEW = 1200     # Xabardagi hisobot matni

# Bot buyruqlari (Telegram menyusida ko'rinadi)
COMMANDS = [
    ('vazifalar', 'Mening faol vazifalarim'),
    ('tekshiruv', 'Tasdiqlashni kutayotgan ishlar (rahbar)'),
    ('bekor', 'Joriy amalni bekor qilish'),
    ('yordam', 'Bot imkoniyatlari'),
]

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


def webhook_secret(config):
    """Telegram webhook so'roviga qo'shadigan maxfiy sarlavha qiymati."""
    explicit = (config.get('TELEGRAM_WEBHOOK_SECRET') or '').strip()
    if explicit:
        return explicit
    return hashlib.sha256(('atd-webhook:' + token(config)).encode()).hexdigest()[:48]


def api(config, method, payload=None, timeout=TIMEOUT):
    """Bot API chaqiruvi. Natija (`result`) qaytadi yoki TelegramError."""
    tk = token(config)
    if not tk:
        raise TelegramError('Bot tokeni sozlanmagan')
    body = json.dumps(payload or {}).encode('utf-8')
    req = Request(API_URL.format(token=tk, method=method), data=body,
                  headers={'Content-Type': 'application/json'})
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
        'bot_username': bot_username(config) if enabled(config) else None,
        'webhook_ok': _state['webhook_ok'],
        'error': _state['last_error'] or None,
    }


def ensure_setup(app):
    """Webhook va buyruqlar menyusini o'rnatadi — har jarayonda bir marta,
    fon oqimida (so'rovni kutdirmaydi). setWebhook takror chaqirilsa ham
    zarari yo'q."""
    if not enabled(app.config):
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
        api(cfg, 'setMyCommands', {
            'commands': [{'command': c, 'description': d} for c, d in COMMANDS],
        })
        _state['webhook_ok'] = True
        _state['last_error'] = ''
        bot_username(cfg)
        print('[telegram] webhook o\'rnatildi')
    except TelegramError as e:
        _state['last_error'] = e.description
        # Keyingi so'rovda qayta urinib ko'rsin
        _state['setup_started'] = False
        print(f'[telegram] sozlab bo\'lmadi: {e.description}')


def send(config, chat_id, text, keyboard=None, reply_to=None, force_reply=False):
    payload = {
        'chat_id': chat_id,
        'text': text[:MAX_TEXT],
        'parse_mode': 'HTML',
        'disable_web_page_preview': True,
    }
    if keyboard:
        payload['reply_markup'] = {'inline_keyboard': keyboard}
    elif force_reply:
        payload['reply_markup'] = {'force_reply': True}
    if reply_to:
        payload['reply_parameters'] = {'message_id': reply_to, 'allow_sending_without_reply': True}
    return api(config, 'sendMessage', payload)


# =========================================================================
# MATN YORDAMCHILARI
# =========================================================================

def esc(s):
    return html.escape(s or '', quote=False)


def clip(s, n):
    s = (s or '').strip()
    return s if len(s) <= n else s[:n].rstrip() + '…'


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


def task_review_buttons(config, task_id):
    return [
        [{'text': '✅ Qabul qilish', 'callback_data': f'ta:{task_id}'},
         {'text': '↩ Qaytarish', 'callback_data': f'tr:{task_id}'}],
        [{'text': '🔗 Saytda ochish', 'url': site_url(config, f'/tasks/{task_id}')}],
    ]


def task_review_text(task, report):
    """Rahbarga: xodim yuborgan ish — vazifa nomi, kim, hisobot matni."""
    lines = ['🔔 <b>Vazifa tekshiruvga tushdi</b>', f'📝 <b>{esc(task.name)}</b>']
    if report is not None:
        who = report.user.full_name if report.user else ''
        lines.append(f'👤 {esc(who)} · {local_dt(report.created_at)}')
        lines += ['', '<i>Hisobot:</i>', esc(clip(report.content, REPORT_PREVIEW))]
        if report.files:
            lines.append(f'📎 {len(report.files)} ta fayl (saytda)')
    if task.deadline:
        lines.append(f'⏰ Muddat: {local_dt(task.deadline)}')
    return '\n'.join(lines)


# =========================================================================
# BILDIRISHNOMALARNI YETKAZISH (notifications._deliver_safe'dan, fon oqimida)
# =========================================================================

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
        data = item.get('data') or {}
        event = data.get('event', '')
        entity_type = data.get('entity_type', '')
        entity_id = data.get('entity_id')

        keyboard = [[{'text': '🔗 Saytda ochish',
                      'url': site_url(cfg, entity_path(entity_type, entity_id, data))}]]
        text = f"🔔 <b>{esc(item['title'])}</b>"
        if item.get('body'):
            text += '\n' + esc(item['body'])
        if item.get('actor_name'):
            text += f"\n👤 {esc(item['actor_name'])}"

        if event == 'task_review' and entity_type == 'task' and entity_id:
            task = Task.query.get(entity_id)
            if task is not None:
                report = TaskReport.query.filter_by(task_id=task.id) \
                    .order_by(TaskReport.created_at.desc()).first()
                text = task_review_text(task, report)
                if can_approve_task(task, link.user):
                    keyboard = task_review_buttons(cfg, task.id)

        try:
            send(cfg, link.chat_id, text, keyboard)
        except TelegramError as e:
            # Xodim botni bloklagan yoki chatni o'chirgan — boshqa urinmaymiz
            if e.code == 403 or (e.code == 400 and 'chat not found' in e.description.lower()):
                link.is_active = False
                changed = True
            print(f'[telegram] user={item["user_id"]}: {e.description}')
    if changed:
        db.session.commit()


def can_approve_task(task, user):
    from app.routes.tasks import _Actor, _can_approve
    return task.status == 'review' and _can_approve(task, _Actor(user))
