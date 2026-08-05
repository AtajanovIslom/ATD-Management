"""Bildirishnoma yadrosi — bazaga yozish va push'ni yetkazish.

Ishlash tartibi:

    notify(...)  →  Notification yozuvlari db.session'ga qo'shiladi
                 →  push payload'i sessiya "navbati"ga tushadi
    commit()     →  after_commit hodisasi navbatni fon oqimiga uzatadi
                 →  qurilma token'lari o'qiladi va FCM'ga yuboriladi

Push aynan commit'dan keyin yuborilishi muhim: tranzaksiya rollback bo'lsa
xodim "sizga vazifa biriktirildi" degan xabarni olib, ilovada hech narsa
topmasligi kerak emas. Yuborish fon oqimida — FCM sekin javob bersa ham
rahbarning so'rovi kutib qolmaydi.
"""
from concurrent.futures import ThreadPoolExecutor

from sqlalchemy import event as sa_event

from app import db
from app.services import push

# Sessiya `info` lug'atidagi kalitlar (navbat va Flask app obyekti)
_PENDING_KEY = '_atd_pending_push'
_APP_KEY = '_atd_push_app'

# Fon oqimlari — har bir gunicorn worker'da o'ziniki. Ikkita yetarli: FCM
# so'rovi ~100-300 ms, biriktirishlar esa navbat bilan keladi.
_executor = ThreadPoolExecutor(max_workers=2, thread_name_prefix='push')


# =========================================================================
# PUBLIC API
# =========================================================================

def notify(user_ids, *, event, title, body='', entity_type='', entity_id=None,
           data=None, actor=None, exclude_actor=True):
    """Xodim(lar)ga bildirishnoma yaratadi va push navbatiga qo'yadi.

    commit() chaqiruvchi tomonidan bajariladi — bildirishnoma o'zi tegishli
    bo'lgan o'zgarish bilan bitta tranzaksiyada yozilsin.

    Args:
        user_ids:     qabul qiluvchilar (ro'yxat, set yoki bitta id)
        event:        hodisa kodi — ilova shu bo'yicha ekran tanlaydi
        title/body:   bildirishnoma matni
        entity_type:  task | project_stage | interactive_request
        entity_id:    obyekt ID (ilova bosilganda shu sahifani ochadi)
        data:         qo'shimcha maydonlar (deadline, project_id, ...)
        actor:        amalni bajargan User (yoki None — JWT'dan olinadi)
        exclude_actor: True bo'lsa amal egasiga o'ziga xabar yuborilmaydi

    Returns:
        yaratilgan Notification obyektlari ro'yxati
    """
    from app.models import Notification

    actor = actor if actor is not None else _actor_from_jwt()
    actor_id = getattr(actor, 'id', None)
    actor_name = getattr(actor, 'full_name', '') or ''

    recipients = _clean_recipients(user_ids, exclude_id=actor_id if exclude_actor else None)
    if not recipients:
        return []

    payload = dict(data or {})
    payload.setdefault('event', event)
    if entity_type:
        payload.setdefault('entity_type', entity_type)
    if entity_id is not None:
        payload.setdefault('entity_id', entity_id)

    created = []
    for uid in recipients:
        created.append(Notification(
            user_id=uid,
            event=event,
            title=title[:255],
            body=body or '',
            entity_type=entity_type or '',
            entity_id=entity_id,
            data=payload,
            actor_id=actor_id,
            actor_name=actor_name,
        ))
    db.session.add_all(created)
    # ID kerak — ilova xabarni bosganda aynan shu yozuvni "o'qildi" qiladi
    db.session.flush()

    _queue_push([{
        'user_id': n.user_id,
        'title': n.title,
        'body': n.body,
        'data': dict(payload, notification_id=n.id),
    } for n in created])

    return created


def discard(entity_type, entity_ids):
    """Obyekt o'chirilganda unga tegishli bildirishnomalarni ham olib tashlaydi.

    `notifications` jadvalida tashqi kalit yo'q — u bir nechta obyekt turiga
    ishora qiladi (task, project_stage, interactive_request), shuning uchun
    kaskad o'chirish ishlamaydi. Tozalanmasa xodim bildirishnomani bosganda
    "Ma'lumot topilmadi" degan bo'sh sahifaga tushardi.

    commit() chaqiruvchi tomonidan bajariladi — o'chirish bilan bitta
    tranzaksiyada ketsin.
    """
    from app.models import Notification

    if isinstance(entity_ids, int):
        entity_ids = [entity_ids]
    ids = [int(i) for i in entity_ids or [] if i is not None]
    if not ids:
        return 0

    return Notification.query.filter(
        Notification.entity_type == entity_type,
        Notification.entity_id.in_(ids),
    ).delete(synchronize_session=False)


def send_now(user_ids, *, title, body='', data=None):
    """Bazaga yozmasdan darhol push yuborish (test/diagnostika uchun).

    Returns: PushResult
    """
    from flask import current_app
    from app.models import DeviceToken

    recipients = _clean_recipients(user_ids)
    if not recipients:
        return push.PushResult()

    tokens = [t.token for t in DeviceToken.query.filter(
        DeviceToken.user_id.in_(recipients),
        DeviceToken.is_active.is_(True),
    ).all()]

    result = push.send_to_tokens(tokens, title=title, body=body, data=data,
                                 config=current_app.config)
    if result.invalid_tokens:
        _prune_tokens(result.invalid_tokens)
        db.session.commit()
    return result


# =========================================================================
# INTERNAL
# =========================================================================

def _clean_recipients(user_ids, exclude_id=None):
    """None/dublikat/o'zini o'zi xabardor qilishni tozalaydi, tartibni saqlaydi."""
    if user_ids is None:
        return []
    if isinstance(user_ids, (int, str)):
        user_ids = [user_ids]
    seen = []
    for uid in user_ids:
        if uid is None:
            continue
        uid = int(uid)
        if uid == exclude_id or uid in seen:
            continue
        seen.append(uid)
    return seen


def _actor_from_jwt():
    """Joriy so'rov egasi (bo'lsa) — log_audit bilan bir xil yondashuv."""
    try:
        from flask_jwt_extended import get_jwt_identity, verify_jwt_in_request
        from app.models import User

        verify_jwt_in_request(optional=True)
        uid = get_jwt_identity()
        return User.query.get(int(uid)) if uid else None
    except Exception:
        return None


def _queue_push(items):
    from flask import current_app

    info = db.session.info
    info.setdefault(_PENDING_KEY, []).extend(items)
    info[_APP_KEY] = current_app._get_current_object()


def _prune_tokens(tokens):
    """FCM yaroqsiz deb qaytargan token'larni o'chiradi (commit chaqiruvchida)."""
    from app.models import DeviceToken

    if not tokens:
        return 0
    deleted = DeviceToken.query.filter(DeviceToken.token.in_(tokens)).delete(
        synchronize_session=False)
    if deleted:
        print(f'[push] {deleted} ta eskirgan token o\'chirildi')
    return deleted


def _deliver(app, items):
    """Fon oqimi: token'larni o'qib FCM'ga yuboradi va o'liklarini tozalaydi."""
    with app.app_context():
        from app.models import DeviceToken

        user_ids = {i['user_id'] for i in items}
        tokens_by_user = {}
        for row in DeviceToken.query.filter(
            DeviceToken.user_id.in_(user_ids),
            DeviceToken.is_active.is_(True),
        ).all():
            tokens_by_user.setdefault(row.user_id, []).append(row.token)

        dead = []
        for item in items:
            tokens = tokens_by_user.get(item['user_id'])
            if not tokens:
                continue
            result = push.send_to_tokens(
                tokens,
                title=item['title'],
                body=item['body'],
                data=item['data'],
                config=app.config,
            )
            if result.skipped:
                return  # Firebase sozlanmagan — qolganini urinib o'tirmaymiz
            dead.extend(result.invalid_tokens)

        if dead:
            _prune_tokens(dead)
            db.session.commit()


def _deliver_safe(app, items):
    try:
        _deliver(app, items)
    except Exception as e:
        # Push yetkazilmasligi asosiy amalni buzmasligi kerak
        print(f'[push] Yetkazishda kutilmagan xato: {type(e).__name__}: {e}')


@sa_event.listens_for(db.session,'after_commit')
def _flush_push_queue(session):
    items = session.info.pop(_PENDING_KEY, None)
    app = session.info.pop(_APP_KEY, None)
    if not items or app is None:
        return
    if app.config.get('PUSH_ASYNC', True):
        _executor.submit(_deliver_safe, app, items)
    else:
        _deliver_safe(app, items)


@sa_event.listens_for(db.session,'after_rollback')
def _drop_push_queue(session):
    session.info.pop(_PENDING_KEY, None)
    session.info.pop(_APP_KEY, None)
