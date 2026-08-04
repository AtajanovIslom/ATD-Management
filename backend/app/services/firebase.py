"""Firebase Admin SDK initsializatsiyasi.

Credential ikki manbadan olinadi (birinchi topilgani ishlatiladi):
    FIREBASE_CREDENTIALS_JSON — service account JSON matni
    FIREBASE_CREDENTIALS_PATH — JSON fayl yo'li

Initsializatsiya "lazy" — birinchi push yuborishda bajariladi. Buning sababi
gunicorn `--preload` bilan ishga tushadi: master process'da yaratilgan HTTP
sessiyalar fork'dan keyin worker'lar orasida bo'lishib ketishi mumkin edi.
Har bir worker o'z SDK nusxasini o'zi ko'taradi.

Credential topilmasa yoki buzuq bo'lsa — istisno tashlanmaydi, shunchaki push
o'chib qoladi va bir marta ogohlantirish log'ga yoziladi. Bildirishnomalar
bazaga baribir yoziladi, ilova ochilganda ko'rinadi.
"""
import json
import os
import threading

_lock = threading.Lock()
_app = None
_unavailable_reason = None   # None emas bo'lsa — qayta urinilmaydi


def _build_credential(config):
    """Config'dan firebase credentials obyektini yasaydi. Topilmasa (None, sabab)."""
    from firebase_admin import credentials

    raw = (config.get('FIREBASE_CREDENTIALS_JSON') or '').strip()
    if raw:
        return credentials.Certificate(json.loads(raw)), None

    path = (config.get('FIREBASE_CREDENTIALS_PATH') or '').strip()
    if not path:
        return None, 'FIREBASE_CREDENTIALS_JSON/PATH ko\'rsatilmagan'
    if not os.path.exists(path):
        return None, f'Service account fayli topilmadi: {path}'
    return credentials.Certificate(path), None


def get_app(config=None):
    """Initsializatsiya qilingan firebase_admin App yoki None."""
    global _app, _unavailable_reason

    if _app is not None:
        return _app
    if _unavailable_reason is not None:
        return None

    if config is None:
        from flask import current_app
        config = current_app.config

    with _lock:
        # Boshqa oqim biz kutib turganda ulgurgan bo'lishi mumkin
        if _app is not None:
            return _app
        if _unavailable_reason is not None:
            return None

        try:
            import firebase_admin
        except ImportError:
            _unavailable_reason = "firebase-admin o'rnatilmagan (pip install firebase-admin)"
            print(f'[push] {_unavailable_reason}')
            return None

        try:
            cred, reason = _build_credential(config)
            if cred is None:
                _unavailable_reason = reason
                print(f'[push] Firebase o\'chirilgan: {reason}')
                return None
            _app = firebase_admin.initialize_app(cred, name='atd-push')
            print(f'[push] Firebase ulandi: {cred.project_id}')
        except ValueError:
            # Shu nom bilan allaqachon initsializatsiya qilingan (masalan reload)
            import firebase_admin
            _app = firebase_admin.get_app('atd-push')
        except Exception as e:
            _unavailable_reason = f'{type(e).__name__}: {e}'
            print(f'[push] Firebase initsializatsiyasi muvaffaqiyatsiz: {_unavailable_reason}')
            return None

    return _app


def is_available(config=None):
    return get_app(config) is not None


def check_config(app):
    """Startup diagnostikasi — credential o'qiladimi, jarayonni to'xtatmaydi."""
    if not app.config.get('PUSH_ENABLED', True):
        print('[push] PUSH_ENABLED=0 — bildirishnomalar o\'chirilgan')
        return False

    raw = (app.config.get('FIREBASE_CREDENTIALS_JSON') or '').strip()
    path = (app.config.get('FIREBASE_CREDENTIALS_PATH') or '').strip()
    if raw:
        print('[push] Firebase credential: FIREBASE_CREDENTIALS_JSON (env)')
        return True
    if path and os.path.exists(path):
        print(f'[push] Firebase credential: {path}')
        return True

    where = path or "yo'l ko'rsatilmagan"
    print(f'[push] Firebase credential topilmadi ({where}) — '
          'push yuborilmaydi, bildirishnomalar faqat bazaga yoziladi')
    return False
