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

    # nginx'dagi client_max_body_size bilan bir xil. Chegara oshsa backend
    # tushunarli JSON xato (413) qaytaradi.
    MAX_CONTENT_LENGTH = 50 * 1024 * 1024

    # --- Telegram bot (bildirishnomalar va tezkor amallar) ---
    # BotFather'dan olingan token. Bo'sh bo'lsa Telegram funksiyasi o'chiq —
    # sayt odatdagidek ishlaydi, profil sahifasi "sozlanmagan" deb ko'rsatadi.
    TELEGRAM_BOT_TOKEN = os.getenv('TELEGRAM_BOT_TOKEN', '').strip()
    # Telegram webhook'ni shu manzilga yuboradi (internetdan ochiq bo'lishi shart)
    PUBLIC_BASE_URL = os.getenv('PUBLIC_BASE_URL', 'https://atd.uzbeksteel.uz').rstrip('/')
    # Webhook so'rovi haqiqatan Telegram'dan kelganini tekshirish uchun.
    # Berilmasa tokendan hosil qilinadi.
    TELEGRAM_WEBHOOK_SECRET = os.getenv('TELEGRAM_WEBHOOK_SECRET', '').strip()

    # --- ISUP (kadrlar tizimi) — tabel raqami bo'yicha xodim ma'lumoti ---
    # Login va parol faqat .env'da turadi, git'ga tushmaydi.
    ISUP_EMPLOYEE_URL = os.getenv(
        'ISUP_EMPLOYEE_URL',
        'https://isup.uzbeksteel.uz/isup/hs/employee/getEmployee/{tab}',
    )
    ISUP_USER = os.getenv('ISUP_USER', '')
    ISUP_PASSWORD = os.getenv('ISUP_PASSWORD', '')

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
