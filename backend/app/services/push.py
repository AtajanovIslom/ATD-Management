"""FCM transport qatlami — token'larga xabar yuborish.

Bu modul bazani bilmaydi va biznes-mantiqqa aralashmaydi: unga token ro'yxati
va matn beriladi, u natijani qaytaradi. Yaroqsiz token'lar ro'yxati alohida
qaytariladi — chaqiruvchi ularni bazadan o'chiradi (`notifications.py`).
"""
from dataclasses import dataclass, field

from app.services import firebase

# FCM bitta multicast so'rovda 500 tagacha token qabul qiladi
MAX_TOKENS_PER_REQUEST = 500

# Bildirishnoma matnining FCM'dagi amaliy chegarasi (uzuni telefonda kesiladi)
MAX_BODY_LEN = 400


@dataclass
class PushResult:
    success: int = 0
    failure: int = 0
    invalid_tokens: list = field(default_factory=list)
    skipped: bool = False   # Firebase sozlanmagani uchun umuman yuborilmadi

    def __add__(self, other):
        return PushResult(
            success=self.success + other.success,
            failure=self.failure + other.failure,
            invalid_tokens=self.invalid_tokens + other.invalid_tokens,
            skipped=self.skipped and other.skipped,
        )


def _stringify(data):
    """FCM data payload'da barcha qiymatlar string bo'lishi shart."""
    out = {}
    for key, value in (data or {}).items():
        if value is None:
            continue
        out[str(key)] = value if isinstance(value, str) else str(value)
    return out


def _is_dead_token(exc):
    """Xatolik token butunlay yaroqsiz ekanini bildiradimi?

    Vaqtinchalik xatoliklarda (UNAVAILABLE, INTERNAL) token o'chirilmaydi —
    aks holda serverning bir daqiqalik nosozligi tufayli xodim qurilmasini
    yo'qotib qo'yardik.
    """
    from firebase_admin import exceptions as fb_exceptions
    from firebase_admin import messaging

    return isinstance(exc, (
        messaging.UnregisteredError,        # ilova o'chirilgan / token eskirgan
        messaging.SenderIdMismatchError,    # token boshqa Firebase loyihasidan
        fb_exceptions.InvalidArgumentError,  # buzuq token
    ))


def _build_message(tokens, title, body, data, channel_id):
    from firebase_admin import messaging

    return messaging.MulticastMessage(
        tokens=tokens,
        notification=messaging.Notification(title=title, body=body),
        data=data,
        android=messaging.AndroidConfig(
            priority='high',
            notification=messaging.AndroidNotification(
                channel_id=channel_id,
                # Eski Flutter setup'lari xabar bosilganini shu action orqali tutadi
                click_action='FLUTTER_NOTIFICATION_CLICK',
            ),
        ),
        apns=messaging.APNSConfig(
            payload=messaging.APNSPayload(
                aps=messaging.Aps(sound='default', content_available=True),
            ),
        ),
    )


def send_to_tokens(tokens, *, title, body, data=None, config=None):
    """Berilgan token'larga bitta xabarni yuboradi.

    Args:
        tokens: FCM registratsiya token'lari ro'yxati
        title:  bildirishnoma sarlavhasi
        body:   bildirishnoma matni
        data:   ilovaga uzatiladigan qo'shimcha maydonlar (string'ga o'giriladi)

    Returns:
        PushResult
    """
    tokens = [t for t in dict.fromkeys(tokens or []) if t]
    if not tokens:
        return PushResult()

    if config is None:
        from flask import current_app
        config = current_app.config

    if not config.get('PUSH_ENABLED', True):
        return PushResult(skipped=True)

    app = firebase.get_app(config)
    if app is None:
        return PushResult(skipped=True)

    from firebase_admin import messaging

    payload = _stringify(data)
    channel_id = config.get('FCM_ANDROID_CHANNEL_ID', 'atd_high_importance')
    body = (body or '')[:MAX_BODY_LEN]

    result = PushResult()
    for start in range(0, len(tokens), MAX_TOKENS_PER_REQUEST):
        chunk = tokens[start:start + MAX_TOKENS_PER_REQUEST]
        message = _build_message(chunk, title, body, payload, channel_id)
        try:
            response = messaging.send_each_for_multicast(message, app=app)
        except Exception as e:
            # Tarmoq/kvota xatosi — bu partiya yetib bormadi, token'lar aybdor emas
            print(f'[push] Yuborishda xatolik: {type(e).__name__}: {e}')
            result.failure += len(chunk)
            continue

        result.success += response.success_count
        result.failure += response.failure_count
        for token, resp in zip(chunk, response.responses):
            if resp.success or resp.exception is None:
                continue
            if _is_dead_token(resp.exception):
                result.invalid_tokens.append(token)
            else:
                print(f'[push] Yetkazilmadi ({token[-8:]}): {resp.exception}')

    return result
