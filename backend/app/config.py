import os
from datetime import timedelta


class Config:
    SQLALCHEMY_DATABASE_URI = os.getenv(
        'DATABASE_URL',
        'postgresql://postgres:1111@localhost:5432/hisobot'
    )
    SQLALCHEMY_TRACK_MODIFICATIONS = False
    JWT_SECRET_KEY = os.getenv('JWT_SECRET_KEY', 'hisobot-secret-key-2024')
    JWT_ACCESS_TOKEN_EXPIRES = timedelta(hours=12)
