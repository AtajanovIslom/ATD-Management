import os
from datetime import timedelta

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def _flag(name, default='1'):
    return os.getenv(name, default).strip().lower() not in ('0', 'false', 'no', '')


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        'postgresql://postgres:1111@localhost:5432/hisobot'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'hisobot-secret-key-2024')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)
    # Mobil ilova uchun "sirpanuvchi sessiya": access token 12 soatda o'ladi,
    # lekin ilova POST /api/auth/refresh orqali uni tiklaydi. Har refresh'da
    # yangi refresh token beriladi (rotatsiya) — shuning uchun xodim 15 kun
    # ichida bir marta kirsa ham muddat o'sha paytdan qayta sanaladi.
    # 15 kun umuman kirmasa — refresh token o'ladi va login sahifasi chiqadi.
    JWT_REFRESH_TOKEN_EXPIRES = timedelta(days=15)

    # --- Firebase Cloud Messaging (mobil ilova bildirishnomalari) ---
    # Credential ikki usulda beriladi (birinchi topilgani ishlatiladi):
    #   FIREBASE_CREDENTIALS_JSON — service account JSON matni (Docker/CI uchun)
    #   FIREBASE_CREDENTIALS_PATH — JSON fayl yo'li (lokal ish uchun)
    # Ikkalasi ham bo'lmasa push jim o'chadi, tizim normal ishlashda davom etadi.
    FIREBASE_CREDENTIALS_JSON = os.getenv('FIREBASE_CREDENTIALS_JSON', '')
    FIREBASE_CREDENTIALS_PATH = os.getenv(
        'FIREBASE_CREDENTIALS_PATH',
        os.path.join(BASE_DIR, 'secrets', 'firebase-service-account.json'),
    )

    PUSH_ENABLED = _flag('PUSH_ENABLED')
    # False bo'lsa push so'rov ichida sinxron yuboriladi (debug/test uchun).
    PUSH_ASYNC = _flag('PUSH_ASYNC')

    # Android notification channel — Flutter tomonda ham shu ID bilan
    # yaratilishi shart, aks holda Android 8+ da tovush/banner ko'rinmaydi.
    FCM_ANDROID_CHANNEL_ID = os.getenv('FCM_ANDROID_CHANNEL_ID', 'atd_high_importance')
