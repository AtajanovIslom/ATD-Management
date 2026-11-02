"""Telegram poller — botga kelgan xabarlarni getUpdates bilan qabul qiladi.

Alohida `telegram` konteynerida YAGONA nusxada ishlaydi:

    python -m app.telegram_poller

Nega webhook emas: atd.uzbeksteel.uz internetdagi DNS'da boshqa serverga
qaraydi, shuning uchun Telegram saytga yetib kela olmaydi. Polling'da esa
server o'zi Telegram'ga murojaat qiladi — faqat chiquvchi ulanish kerak.

Xabar ishlovchisi webhook bilan umumiy (routes/telegram.handle_update),
shuning uchun botdagi barcha ruxsat qoidalari sayt bilan bir xil.
"""
import time

from app import create_app, db
from app.services import telegram as tg

# Telegram javobni shuncha soniya ushlab turadi. 50 s da tashkilot tarmog'i
# uzoq ochiq turgan ulanishni uzib yuborardi (read timed out / reset) —
# qisqaroq so'rovlar firewall/proksi orqali barqaror o'tadi.
LONG_POLL = 25
ALLOWED = ['message', 'callback_query']


def _prepare(cfg):
    """Webhook'ni o'chiradi (aks holda getUpdates 409 qaytaradi) va
    buyruqlar menyusini o'rnatadi."""
    tg.api(cfg, 'deleteWebhook', {'drop_pending_updates': False})
    tg.api(cfg, 'setMyCommands', {
        'commands': [{'command': c, 'description': d} for c, d in tg.COMMANDS],
    })
    username = tg.bot_username(cfg)
    print(f'[telegram] polling boshlandi (@{username})')


def main():
    # Migratsiyani backend bajaradi — bu jarayon faqat bazaga ulanadi
    app = create_app(init_db=False)
    cfg = app.config
    if not tg.enabled(cfg) or tg.mode(cfg) != 'polling':
        print('[telegram] poller o\'chiq (token yo\'q yoki TELEGRAM_MODE=webhook)')
        # Konteyner qayta-qayta ishga tushib turmasligi uchun shunchaki kutadi
        while True:
            time.sleep(3600)

    from app.routes.telegram import handle_update

    offset = None
    backoff = 5
    prepared = False
    while True:
        try:
            if not prepared:
                _prepare(cfg)
                prepared = True
            payload = {'timeout': LONG_POLL, 'allowed_updates': ALLOWED}
            if offset is not None:
                payload['offset'] = offset
            updates = tg.api(cfg, 'getUpdates', payload, timeout=LONG_POLL + 10)
            backoff = 5
        except tg.TelegramError as e:
            print(f'[telegram] getUpdates xatosi: {e.description}')
            if e.code == 409:
                prepared = False  # kimdir webhook o'rnatgan — qayta o'chiramiz
            time.sleep(backoff)
            backoff = min(backoff * 2, 60)
            continue

        for update in updates or []:
            offset = update['update_id'] + 1
            with app.app_context():
                try:
                    handle_update(update)
                finally:
                    db.session.remove()


if __name__ == '__main__':
    main()
