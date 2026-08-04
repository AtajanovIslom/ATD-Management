# Mobil bildirishnomalar (Firebase Cloud Messaging)

Xodimga vazifa, loyiha bosqichi yoki interaktiv ariza biriktirilganda mobil
ilovaga push bildirishnoma yuboriladi. Har bir xabar bazaga ham yoziladi —
telefon o'chiq bo'lsa yoki push yetib bormasa, ilova ochilganda ro'yxatda
ko'rinadi.

---

## 1. Arxitektura

```
Route (masalan POST /api/tasks)
   │
   └─ events.task_assigned(task)          app/services/events.py
        └─ notifications.notify(...)      app/services/notifications.py
             ├─ Notification yozuvlari → db.session   (commit chaqiruvchida)
             └─ push payload → sessiya navbatiga
                   │
              db.session.commit()
                   │
             after_commit hodisasi
                   └─ fon oqimi → push.send_to_tokens()  app/services/push.py
                                       └─ firebase.get_app()  app/services/firebase.py
```

Muhim jihatlar:

- **Push faqat commit'dan keyin ketadi.** Tranzaksiya rollback bo'lsa navbat
  tozalanadi — xodim "sizga vazifa biriktirildi" xabarini olib, ilovada hech
  narsa topmasligi mumkin emas.
- **Yuborish fon oqimida.** FCM sekin javob bersa ham rahbarning so'rovi
  kutib qolmaydi.
- **Firebase sozlanmagan bo'lsa tizim normal ishlaydi** — bildirishnomalar
  faqat bazaga yoziladi, xatolik chiqmaydi.
- **Yaroqsiz token o'z-o'zidan o'chadi.** FCM `UNREGISTERED` desa (ilova
  o'chirilgan / token eskirgan) token bazadan olib tashlanadi. Vaqtinchalik
  tarmoq xatoliklarida token saqlanadi.

### Fayllar

| Fayl | Vazifasi |
|---|---|
| `app/services/firebase.py` | SDK initsializatsiyasi, credential yuklash |
| `app/services/push.py` | FCM transport — token'larga yuborish, o'liklarini aniqlash |
| `app/services/notifications.py` | Bazaga yozish + commit'ga ulanish + yetkazish |
| `app/services/events.py` | Domen hodisalari: kimga qanday matn ketishi |
| `app/routes/notifications.py` | Mobil ilova uchun REST API |
| `app/models.py` | `DeviceToken`, `Notification` modellari |

---

## 2. O'rnatish

### 2.1 Service account kaliti

Firebase Console → Project settings → Service accounts → *Generate new private key*.
Yuklab olingan faylni quyidagi yo'lga qo'ying:

```
backend/secrets/firebase-service-account.json
```

Bu papka `.gitignore` va `.dockerignore` da — git'ga ham, Docker image ichiga
ham tushmaydi. `docker-compose` uni konteynerga faqat-o'qish rejimida ulaydi.

Muqobil variant (CI/CD uchun) — JSON matnini to'g'ridan-to'g'ri env'ga berish:

```bash
FIREBASE_CREDENTIALS_JSON='{"type":"service_account",...}'
```

### 2.2 Bog'liqlik

```bash
pip install -r backend/requirements.txt
```

### 2.3 Sozlamalar

| O'zgaruvchi | Standart | Izoh |
|---|---|---|
| `FIREBASE_CREDENTIALS_PATH` | `backend/secrets/firebase-service-account.json` | Kalit fayl yo'li |
| `FIREBASE_CREDENTIALS_JSON` | — | Kalit JSON matni (fayldan ustun turadi) |
| `PUSH_ENABLED` | `1` | `0` — push butunlay o'chadi (baza yozuvi qoladi) |
| `PUSH_ASYNC` | `1` | `0` — so'rov ichida sinxron yuboriladi (debug uchun) |
| `FCM_ANDROID_CHANNEL_ID` | `atd_high_importance` | Flutter'dagi channel ID bilan bir xil bo'lishi **shart** |

Server ishga tushganda log'da ko'rinadi:

```
[push] Firebase credential: /app/secrets/firebase-service-account.json
[push] Firebase ulandi: household-80bf6
```

Kalit topilmasa:

```
[push] Firebase credential topilmadi (...) — push yuborilmaydi,
       bildirishnomalar faqat bazaga yoziladi
```

### 2.4 Baza

Yangi jadvallar (`device_tokens`, `notifications`) server birinchi ishga
tushganda `db.create_all()` orqali avtomatik yaratiladi. Qo'lda migratsiya
kerak emas.

---

## 3. API

Barcha endpoint'lar JWT talab qiladi: `Authorization: Bearer <token>`.

### 3.1 Qurilmani ro'yxatdan o'tkazish

```http
POST /api/notifications/devices
{
  "token": "<FCM registration token>",
  "platform": "android",              // android | ios | web
  "device_info": "Samsung A54 / Android 14"
}
```

Javob `201`:

```json
{ "id": 1, "user_id": 5, "platform": "android", "token_tail": "x9Kd2mQp", ... }
```

Ilova **login qilgandan keyin** va **token yangilanganda** (`onTokenRefresh`)
chaqiradi. Takroriy chaqiruv xavfsiz — dublikat yaratilmaydi.

Bir telefonda boshqa xodim login qilsa, token avtomatik yangi egasiga
ko'chadi (eski egasining xabari begona qurilmaga tushmaydi).

### 3.2 Qurilmani o'chirish (logout)

```http
DELETE /api/notifications/devices
{ "token": "<FCM registration token>" }
```

Javob: `{ "deleted": 1 }`

> Logout qilganda **albatta** chaqiring — aks holda xodim tizimdan chiqqach
> ham telefoniga xabar kelaveradi.

### 3.3 Bildirishnomalar ro'yxati

```http
GET /api/notifications?page=1&per_page=20&unread=1
```

```json
{
  "total": 42,
  "page": 1,
  "per_page": 20,
  "pages": 3,
  "unread": 7,
  "notifications": [
    {
      "id": 128,
      "event": "task_assigned",
      "title": "Yangi vazifa biriktirildi",
      "body": "Serverni yangilash · Muddat: 01.09.2026 12:00",
      "entity_type": "task",
      "entity_id": 17,
      "data": { "event": "task_assigned", "entity_type": "task",
                "entity_id": 17, "deadline": "2026-09-01T12:00:00" },
      "actor_id": 2,
      "actor_name": "Atajanov Islom",
      "is_read": false,
      "read_at": null,
      "created_at": "2026-08-04T11:34:27.844852"
    }
  ]
}
```

### 3.4 Qolgan endpoint'lar

| Metod | Yo'l | Vazifasi |
|---|---|---|
| `GET` | `/api/notifications/unread-count` | `{ "unread": 7 }` — badge uchun |
| `POST` | `/api/notifications/<id>/read` | Bittasini o'qildi deb belgilash |
| `POST` | `/api/notifications/read-all` | Hammasini o'qildi deb belgilash |
| `GET` | `/api/notifications/devices` | O'z qurilmalari ro'yxati (diagnostika) |
| `POST` | `/api/notifications/test` | O'z telefoniga sinov push'i |

Sinov javobi integratsiyani tekshirishga qulay:

```json
{ "sent": 1, "failed": 0, "removed_tokens": 0, "firebase_configured": true }
```

---

## 4. Hodisalar

Push `data` payload'idagi `event` maydoni ilovaga qaysi ekranni ochishni
aytadi. `entity_type` + `entity_id` — aynan qaysi obyekt.

### Vazifa

| `event` | Kimga | Qachon |
|---|---|---|
| `task_assigned` | Ijrochi(lar)ga | Vazifa yaratildi yoki qayta yuklandi |
| `task_review` | Vazifani bergan rahbarga | Xodim hisobot topshirdi |
| `task_completed` | Ijrochi(lar)ga | Rahbar tasdiqladi |
| `task_returned` | Ijrochi(lar)ga | Rahbar qaytardi |

`entity_type = "task"`, `entity_id = task.id`

### Loyiha

| `event` | Kimga | Qachon |
|---|---|---|
| `stage_assigned` | Bosqich ijrochilariga | Loyiha yaratildi / bosqich qo'shildi / yangi ijrochi biriktirildi |
| `stage_review` | Loyiha egasiga | Xodim bosqichni tekshiruvga yubordi |
| `stage_completed` | Bosqich ijrochilariga | Rahbar bosqichni tasdiqladi |

`entity_type = "project_stage"`, `entity_id = stage.id`,
qo'shimcha: `project_id`, `project_name`, `stage_name`, `deadline`

### Interaktiv ariza

| `event` | Kimga | Qachon |
|---|---|---|
| `interactive_assigned` | Xodimga | Rahbar arizani biriktirdi |
| `interactive_transferred` | Bo'lim rahbariga | Ariza boshqa bo'limga uzatildi |
| `interactive_review` | Biriktirgan rahbarga | Xodim "bajarildi" dedi |
| `interactive_completed` | Xodimga | Rahbar tasdiqladi |
| `interactive_returned` | Xodimga | Rahbar qaytardi (sabab `body` da) |
| `interactive_rejected` | Xodimga | Rahbar rad etdi (sabab `body` da) |

`entity_type = "interactive_request"`, `entity_id = req.id`,
qo'shimcha: `tracking_id`, `status`

> **Eslatma:** amalni bajargan odamning o'ziga xabar yuborilmaydi. Rahbar
> o'ziga vazifa yuklasa yoki o'z ishini tasdiqlasa telefoni jiringlamaydi.

---

## 5. Flutter tomoni (keyingi bosqich)

Backend tayyor. Mobil ilovada qilinishi kerak bo'lgan ishlar:

1. **`google-services.json`** — Firebase Console'dan Android ilova uchun
   yuklab olib `android/app/` ga qo'yish. iOS uchun `GoogleService-Info.plist`.

2. **Paketlar:** `firebase_core`, `firebase_messaging`,
   `flutter_local_notifications` (ilova ochiq turganda banner ko'rsatish uchun).

3. **Notification channel** — ID backend'dagi `FCM_ANDROID_CHANNEL_ID` bilan
   **bir xil** bo'lishi shart:

   ```dart
   const AndroidNotificationChannel(
     'atd_high_importance',        // FCM_ANDROID_CHANNEL_ID
     'Vazifa bildirishnomalari',
     importance: Importance.high,
   );
   ```

   Channel ID mos kelmasa Android 8+ da xabar ovozsiz va bannersiz keladi.

4. **Token oqimi:**

   ```
   login muvaffaqiyatli
     → FirebaseMessaging.instance.requestPermission()
     → getToken()
     → POST /api/notifications/devices
     → onTokenRefresh.listen(...) → yana POST

   logout
     → DELETE /api/notifications/devices
     → FirebaseMessaging.instance.deleteToken()
   ```

5. **Xabarni ushlash:**
   - `onMessage` — ilova ochiq: `flutter_local_notifications` orqali banner.
   - `onMessageOpenedApp` — xabar bosildi: `data['event']` bo'yicha ekranga o'tish.
   - `getInitialMessage()` — ilova xabardan ochildi.
   - `onBackgroundMessage` — top-level funksiya (`@pragma('vm:entry-point')`).

6. **Bildirishnomalar ekrani** — `GET /api/notifications` ro'yxati,
   `unread-count` badge, bosilganda `POST /<id>/read` va tegishli obyektga o'tish.

---

## 6. Nosozliklarni bartaraf etish

| Alomat | Sabab / yechim |
|---|---|
| `[push] Firebase credential topilmadi` | `backend/secrets/firebase-service-account.json` yo'q yoki volume ulanmagan |
| `firebase_configured: false` (test javobida) | Yuqoridagi bilan bir xil, yoki `PUSH_ENABLED=0` |
| `sent: 0`, `removed_tokens: 1` | Token yaroqsiz — ilova qayta login qilib token yuborsin |
| Baza'da xabar bor, telefonga kelmaydi | Qurilma ro'yxatdan o'tmagan: `GET /api/notifications/devices` ni tekshiring |
| Xabar keladi, lekin ovozsiz | Android channel ID backend sozlamasiga mos emas |
| `SenderIdMismatch` | Ilovadagi `google-services.json` boshqa Firebase loyihasidan |

Sinov ketma-ketligi:

```bash
# 1. Ilovada login qiling, token ro'yxatdan o'tsin
# 2. Qurilma ko'rinayaptimi
curl -H "Authorization: Bearer $TOKEN" http://localhost/api/notifications/devices

# 3. O'zingizga sinov push'i
curl -X POST -H "Authorization: Bearer $TOKEN" http://localhost/api/notifications/test
```
