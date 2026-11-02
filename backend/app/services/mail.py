"""Korporativ pochta (IMAP, mail.uzbeksteel.uz) — yangi xatlarni Telegram'ga.

Ishlash tartibi:
  1. Xodim Profil sahifasida pochta manzili va parolini kiritadi. Server
     IMAP'ga bir marta kirib tekshiradi, parolni shifrlab saqlaydi va
     "shu paytgacha kelgan xatlar" chegarasini (UID) eslab qoladi — eski
     xatlar botga yog'ilib ketmaydi.
  2. `telegram` konteyneridagi kuzatuvchi (start_watcher) har
     MAIL_CHECK_INTERVAL soniyada har bir ulangan qutini tekshiradi.
  3. Yangi xat → botga kartochka: kimdan, mavzu, matnning boshi (300 belgi)
     va "📖 Barchasini o'qish" tugmasi; ilova fayllar hujjat bo'lib keladi.

Xatlar o'qilgan deb belgilanmaydi (BODY.PEEK). Parol noto'g'ri bo'lib qolsa
kuzatish to'xtatiladi va xodimga bir marta xabar beriladi — qayta-qayta
noto'g'ri urinish pochta akkauntini bloklab qo'ymasin.
"""
import base64
import email
import hashlib
import imaplib
import re
import socket
import ssl
import threading
import time
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timedelta, timezone
from email import policy
from email.utils import getaddresses, parsedate_to_datetime
from html.parser import HTMLParser

from app.services import telegram as tg

PREVIEW = 300               # kartochkadagi matn boshi
MAX_PER_CYCLE = 10          # bir tekshiruvda bitta qutidan ko'pi bilan
MAX_UNSEEN = 20             # o'qilmaganlardan eng so'nggi shunchasi yuboriladi
MAX_ATTACHMENTS = 10        # bitta xatdan yuboriladigan fayllar
MAX_BODY_STORE = 100_000    # bazada saqlanadigan matn (belgi)
CHUNK = 3500                # "Barchasini o'qish" — bitta xabardagi matn
IMAP_TIMEOUT = 20
KEEP_DAYS = 30


class MailAuthError(Exception):
    """Login yoki parol noto'g'ri."""


class MailConnectError(Exception):
    """Pochta serveriga ulanib bo'lmadi."""


# =========================================================================
# PAROLNI SHIFRLASH
# =========================================================================

def _fernet(config):
    from cryptography.fernet import Fernet
    material = config.get('MAIL_ENCRYPTION_KEY') or config.get('JWT_SECRET_KEY') or ''
    key = base64.urlsafe_b64encode(hashlib.sha256(('atd-mail:' + material).encode()).digest())
    return Fernet(key)


def encrypt(config, password):
    return _fernet(config).encrypt(password.encode('utf-8')).decode('ascii')


def decrypt(config, token):
    return _fernet(config).decrypt(token.encode('ascii')).decode('utf-8')


# =========================================================================
# IMAP
# =========================================================================

def connect(config, address, password):
    try:
        conn = imaplib.IMAP4_SSL(config['MAIL_IMAP_HOST'], config['MAIL_IMAP_PORT'],
                                 ssl_context=ssl.create_default_context(), timeout=IMAP_TIMEOUT)
    except (OSError, socket.timeout, imaplib.IMAP4.error) as e:
        raise MailConnectError(f"Pochta serveriga ulanib bo'lmadi: {e}")
    try:
        conn.login(address, password)
    except imaplib.IMAP4.error:
        try:
            conn.logout()
        except Exception:
            pass
        raise MailAuthError("Pochta manzili yoki parol noto'g'ri")
    return conn


def _logout(conn):
    try:
        conn.logout()
    except Exception:
        pass


def inbox_state(conn):
    """(UIDVALIDITY, UIDNEXT) — INBOX holati."""
    typ, data = conn.status('INBOX', '(UIDVALIDITY UIDNEXT)')
    if typ != 'OK':
        raise MailConnectError('INBOX holatini olib bo\'lmadi')
    text = data[0].decode() if isinstance(data[0], bytes) else str(data[0])
    validity = int(re.search(r'UIDVALIDITY (\d+)', text).group(1))
    uidnext = int(re.search(r'UIDNEXT (\d+)', text).group(1))
    return validity, uidnext


def verify_and_baseline(config, address, password):
    """Profil sahifasidan ulashda: loginni tekshiradi va hozirgi chegara."""
    conn = connect(config, address, password)
    try:
        return inbox_state(conn)
    finally:
        _logout(conn)


# =========================================================================
# XATNI O'QISH
# =========================================================================

class _TextFromHtml(HTMLParser):
    BLOCK = {'p', 'div', 'br', 'tr', 'li', 'h1', 'h2', 'h3', 'h4', 'table', 'blockquote'}

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.parts = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in ('script', 'style', 'head'):
            self.skip += 1
        elif tag in self.BLOCK:
            self.parts.append('\n')

    def handle_endtag(self, tag):
        if tag in ('script', 'style', 'head'):
            self.skip = max(0, self.skip - 1)
        elif tag in self.BLOCK:
            self.parts.append('\n')

    def handle_data(self, data):
        if not self.skip:
            self.parts.append(data)


def html_to_text(markup):
    p = _TextFromHtml()
    try:
        p.feed(markup)
    except Exception:
        return re.sub(r'<[^>]+>', ' ', markup)
    return ''.join(p.parts)


def _clean(text):
    text = (text or '').replace('\r\n', '\n').replace('\xa0', ' ')
    text = re.sub(r'[ \t]+\n', '\n', text)
    return re.sub(r'\n{3,}', '\n\n', text).strip()


def _part_text(part):
    try:
        return part.get_content()
    except (LookupError, ValueError, AssertionError):
        payload = part.get_payload(decode=True) or b''
        return payload.decode('utf-8', 'replace')


def parse_message(raw):
    msg = email.message_from_bytes(raw, policy=policy.default)

    senders = getaddresses([str(msg.get('From', ''))])
    if senders and (senders[0][0] or senders[0][1]):
        name, addr = senders[0]
        sender = f'{name} <{addr}>' if name and addr else (name or addr)
    else:
        sender = str(msg.get('From', ''))

    sent_at = None
    try:
        dt = parsedate_to_datetime(str(msg.get('Date')))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        sent_at = dt.astimezone(timezone.utc).replace(tzinfo=None)
    except (TypeError, ValueError, IndexError):
        pass

    body = ''
    part = msg.get_body(preferencelist=('plain', 'html'))
    if part is not None:
        content = _part_text(part)
        body = html_to_text(content) if part.get_content_subtype() == 'html' else content

    attachments = []
    for att in msg.iter_attachments():
        # Imzodagi logotip kabi matn ichiga joylangan rasmlar fayl emas
        if att.get_content_disposition() == 'inline' and att.get_content_maintype() == 'image':
            continue
        data = att.get_payload(decode=True)
        if data is None:
            continue
        attachments.append((att.get_filename() or 'fayl', data))

    return {
        'sender': sender[:500],
        'subject': (str(msg.get('Subject') or '').strip() or '(mavzusiz)')[:1000],
        'sent_at': sent_at,
        'body': _clean(body)[:MAX_BODY_STORE],
        'attachments': attachments,
    }


# =========================================================================
# TELEGRAM KARTOCHKASI
# =========================================================================

def _size(n):
    return f'{n / 1024 / 1024:.1f} MB' if n >= 1024 * 1024 else f'{max(1, n // 1024)} KB'


def card_text(row, full=False, header='📧 Yangi xat'):
    rows = [f'👤 <b>{tg.esc(row.sender)}</b>']
    if row.sent_at:
        rows.append(f'🕒 {tg.local_dt(row.sent_at)}')
    body = row.body or '(matnsiz xat)'
    if not full:
        body = tg.clip(body, PREVIEW)
    files = row.attachments or []
    footer = f'📎 {len(files)} ta ilova: ' + ', '.join(f['name'] for f in files[:5]) if files else None
    if footer and len(files) > 5:
        footer += ' …'
    return tg.card(header, f'✉️ {row.subject}', rows, body=body,
                   expandable=full and len(body) > 600, footer=tg.esc(footer) if footer else None)


def card_buttons(config, row, full=False):
    rows = []
    if not full and len(row.body or '') > PREVIEW:
        rows.append([{'text': "📖 Barchasini o'qish", 'callback_data': f'mf:{row.id}'}])
    rows.append([{'text': '🌐 Pochtada ochish', 'url': config['MAIL_WEB_URL']}])
    return rows


def full_text_chunks(row):
    body = row.body or ''
    return [body[i:i + CHUNK] for i in range(0, len(body), CHUNK)] or ['']


# =========================================================================
# TEKSHIRISH VA YETKAZISH
# =========================================================================

def _chat_for(user_id):
    from app.models import TelegramLink
    link = TelegramLink.query.filter_by(user_id=user_id, is_active=True).first()
    return link.chat_id if link and link.user and link.user.is_active else None


def _deliver(config, acc, parsed, uid, header='📧 Yangi xat'):
    """Xatni bazaga yozadi va (Telegram ulangan bo'lsa) botga yuboradi."""
    from app import db
    from app.models import MailMessage

    row = MailMessage(
        user_id=acc.user_id, uid=uid, sender=parsed['sender'], subject=parsed['subject'],
        sent_at=parsed['sent_at'], body=parsed['body'],
        attachments=[{'name': n, 'size': len(d)} for n, d in parsed['attachments']],
    )
    db.session.add(row)
    db.session.flush()

    chat_id = _chat_for(acc.user_id)
    if chat_id is None:
        return
    sent = tg.send(config, chat_id, card_text(row, header=header), card_buttons(config, row))
    reply_to = (sent or {}).get('message_id')
    for name, data in parsed['attachments'][:MAX_ATTACHMENTS]:
        if len(data) > tg.MAX_DOCUMENT:
            tg.send(config, chat_id, f'📎 <b>{tg.esc(name)}</b> ({_size(len(data))}) — '
                                     f'Telegram uchun juda katta, pochtada oching.', reply_to=reply_to)
            continue
        try:
            tg.send_document(config, chat_id, name, data, reply_to=reply_to)
        except tg.TelegramError as e:
            print(f'[mail] fayl yuborilmadi ({name}): {e.description}')
    if len(parsed['attachments']) > MAX_ATTACHMENTS:
        tg.send(config, chat_id, f'📎 Yana {len(parsed["attachments"]) - MAX_ATTACHMENTS} ta ilova — '
                                 f'pochtada ko\'ring.', reply_to=reply_to)


def _notify_auth_failed(config, acc):
    chat_id = _chat_for(acc.user_id)
    if chat_id is None:
        return
    try:
        tg.send(config, chat_id, tg.card(
            '⚠️ Pochta uzildi', acc.email,
            ["Pochtaga kirib bo'lmadi — parol o'zgargan bo'lishi mumkin."],
            footer="Saytda Profil → Korporativ pochta bo'limida qayta ulang."))
    except tg.TelegramError:
        pass


def _fetch_and_deliver(cfg, conn, acc, uid, header):
    typ, msg_data = conn.uid('fetch', str(uid), '(BODY.PEEK[])')
    raw = next((p[1] for p in msg_data if isinstance(p, tuple)), None)
    if typ == 'OK' and raw:
        try:
            _deliver(cfg, acc, parse_message(raw), uid, header=header)
        except tg.TelegramError as e:
            print(f'[mail] user={acc.user_id}: {e.description}')


def _send_unseen(cfg, conn, acc):
    """Hozircha o'qilmagan xatlar — eng so'nggi MAX_UNSEEN tasi, eskidan
    yangiga (eng yangisi chat oxirida). Xatlar o'qilgan deb belgilanmaydi."""
    from app import db
    conn.select('INBOX', readonly=True)
    typ, data = conn.uid('search', None, 'UNSEEN')
    uids = sorted(int(x) for x in (data[0] or b'').split()) if typ == 'OK' else []
    # Chegaradan keyingilarini oddiy oqim "yangi xat" sifatida yuboradi
    if acc.last_uid is not None:
        uids = [u for u in uids if u <= acc.last_uid]
    acc.send_unseen = False
    db.session.commit()
    chat_id = _chat_for(acc.user_id)
    if not uids or chat_id is None:
        if chat_id is not None:
            tg.send(cfg, chat_id, tg.card('📬 O\'qilmagan xatlar', acc.email,
                                          ["✨ Pochtangizda o'qilmagan xat yo'q."]))
        return
    shown = uids[-MAX_UNSEEN:]
    rows = [f'Pochtangizda <b>{len(uids)}</b> ta o\'qilmagan xat bor.']
    if len(uids) > MAX_UNSEEN:
        rows.append(f'Eng so\'nggi {MAX_UNSEEN} tasi quyida, qolganini pochtada ko\'ring.')
    tg.send(cfg, chat_id, tg.card('📬 O\'qilmagan xatlar', acc.email, rows),
            [[{'text': '🌐 Pochtani ochish', 'url': cfg['MAIL_WEB_URL']}]])
    for uid in shown:
        _fetch_and_deliver(cfg, conn, acc, uid, header='📩 O\'qilmagan xat')
        db.session.commit()


def check_account(app, account_id):
    """Bitta qutini tekshiradi (o'z app kontekstida, fon oqimida)."""
    from app import db
    from app.models import MailAccount
    cfg = app.config
    with app.app_context():
        acc = MailAccount.query.get(account_id)
        if acc is None or not acc.is_active:
            return
        try:
            password = decrypt(cfg, acc.password_enc)
        except Exception:
            acc.is_active = False
            acc.last_error = "Saqlangan parolni o'qib bo'lmadi — qayta ulang"
            db.session.commit()
            return

        try:
            conn = connect(cfg, acc.email, password)
        except MailAuthError as e:
            acc.is_active = False
            acc.last_error = str(e)
            db.session.commit()
            _notify_auth_failed(cfg, acc)
            return
        except MailConnectError as e:
            acc.last_error = str(e)[:500]
            db.session.commit()
            return

        try:
            validity, uidnext = inbox_state(conn)
            if acc.uidvalidity != validity or acc.last_uid is None:
                # Birinchi tekshiruv yoki quti qayta yaratilgan — eskilarni
                # "yangi xat" qilib yubormaymiz (o'qilmaganlari alohida quyida)
                acc.uidvalidity, acc.last_uid = validity, uidnext - 1
            if acc.send_unseen:
                _send_unseen(cfg, conn, acc)
            if uidnext - 1 > acc.last_uid:
                conn.select('INBOX', readonly=True)
                typ, data = conn.uid('search', None, f'UID {acc.last_uid + 1}:*')
                uids = sorted(int(x) for x in (data[0] or b'').split() if int(x) > acc.last_uid) \
                    if typ == 'OK' else []
                for uid in uids[:MAX_PER_CYCLE]:
                    _fetch_and_deliver(cfg, conn, acc, uid, header='📧 Yangi xat')
                    acc.last_uid = uid
                    db.session.commit()   # yuborilgani qayta yuborilmasin
                rest = len(uids) - MAX_PER_CYCLE
                if rest > 0:
                    acc.last_uid = uids[-1]
                    chat_id = _chat_for(acc.user_id)
                    if chat_id:
                        tg.send(cfg, chat_id, f'📬 Yana <b>{rest}</b> ta yangi xat bor — pochtada ko\'ring.',
                                [[{'text': '🌐 Pochtani ochish', 'url': cfg['MAIL_WEB_URL']}]])
            acc.last_checked_at = datetime.utcnow()
            acc.last_error = ''
            db.session.commit()
        except (imaplib.IMAP4.error, OSError, MailConnectError, tg.TelegramError) as e:
            db.session.rollback()
            acc = MailAccount.query.get(account_id)
            if acc is not None:
                acc.last_error = f'{type(e).__name__}: {e}'[:500]
                db.session.commit()
        finally:
            _logout(conn)
            db.session.remove()


def check_all(app, pool):
    from app.models import MailAccount
    with app.app_context():
        ids = [a.id for a in MailAccount.query.filter_by(is_active=True).all()]
    for f in [pool.submit(check_account, app, i) for i in ids]:
        try:
            f.result(timeout=300)
        except Exception as e:
            print(f'[mail] tekshiruv xatosi: {type(e).__name__}: {e}')


def cleanup(app):
    from app import db
    from app.models import MailMessage
    with app.app_context():
        cutoff = datetime.utcnow() - timedelta(days=KEEP_DAYS)
        MailMessage.query.filter(MailMessage.created_at < cutoff).delete()
        db.session.commit()


def start_watcher(app):
    """`telegram` konteynerida fon oqimi — barcha qutilarni davriy tekshiradi."""
    interval = max(20, int(app.config.get('MAIL_CHECK_INTERVAL') or 60))

    def loop():
        pool = ThreadPoolExecutor(max_workers=4, thread_name_prefix='mail')
        last_cleanup = 0
        print(f'[mail] kuzatuvchi ishga tushdi (har {interval} s)')
        while True:
            started = time.time()
            try:
                check_all(app, pool)
                if started - last_cleanup > 3600:
                    cleanup(app)
                    last_cleanup = started
            except Exception as e:
                print(f'[mail] kutilmagan xato: {type(e).__name__}: {e}')
            time.sleep(max(5, interval - (time.time() - started)))

    t = threading.Thread(target=loop, daemon=True, name='mail-watcher')
    t.start()
    return t
