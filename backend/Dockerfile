FROM python:3.11-slim

WORKDIR /app

# stdout quvurga (pipe) ulanganda Python uni blok-buferlaydi va qisqa
# `print()` chiqishlari (masalan `[push] ...`) log'ga hech qachon tushmaydi.
ENV PYTHONUNBUFFERED=1

# Mahalliy vaqt — "bugun", ta'til tekshiruvi, hisobot davrlari va eksport
# sanalari Toshkent vaqti bo'yicha hisoblansin (bazada vaqt UTC'da qoladi).
ENV TZ=Asia/Tashkent

# fonts-dejavu-core — PDF hisobotlarda kirill va o'zbek harflari uchun shrift
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc libpq-dev tzdata fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

RUN mkdir -p /app/uploads

EXPOSE 5000

CMD ["gunicorn", "-w", "4", "-b", "0.0.0.0:5000", "--timeout", "120", "--preload", "run:app"]
