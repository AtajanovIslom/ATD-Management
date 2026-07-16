# Interaktiv Xizmatlar — API Hujjatlari (AA loyiha / HISOBOT backend)

Bu hujjat HISOBOT backendida qurilgan **interaktiv xizmatlar** tizimining barcha API
endpointlarini tavsiflaydi. Tizim ikkita mustaqil moduldan iborat:

1. **Interaktiv arizalar** (`InteractiveRequest`) — bo'lim/xizmat turi asosidagi arizalar oqimi (masalan: "Создание учётных записей", IT bo'limi arizalari).
2. **Texnik xizmat so'rovlari** (`ServiceRequest`) — bo'lim (Division) darajasida, tashqi API-kalit orqali autentifikatsiya qilinadigan so'rovlar (masalan: kombinat miqyosidagi texnik xizmat).

Ikkalasi ham boshqa loyihada (masalan Laravel backend + uning frontend/mobili) qayta ishlatilishi mumkin — quyida qaysi qatlamdan qaysi turdagi so'rov yuborish kerakligi ko'rsatilgan.

Base URL: `http://<server>:5000/api`

---

## 1-modul: Interaktiv arizalar (`InteractiveRequest`)

### 1.1. Status oqimi

```
new  →  in_progress  →  pending_review  →  completed
            ↑                  │
            └──── (return) ────┘

Istalgan bosqichda → rejected (rahbar rad etadi)
```

| Status | Ma'no | Kim o'zgartiradi |
|---|---|---|
| `new` | Yangi (arizachi yubordi) | — |
| `in_progress` | Ishlash jarayonida | Rahbar biriktiradi |
| `pending_review` | Tasdiqlash kutilmoqda | Xodim "bajarildi" deydi |
| `completed` | Yakunlandi | Rahbar tasdiqlaydi |
| `rejected` | Rad etildi | Rahbar |

### 1.2. PUBLIC endpointlar (mobil ilova / tashqi frontend uchun — **auth talab qilmaydi**)

Prefix: `/api/public/interactive`

Bu qism sizning holatingizga eng mos keladi — **AA'dan boshqa loyihaga API berish uchun aynan shu ochiq (public) endpointlardan foydalaning**, ichki JWT endpointlaridan emas.

#### `GET /api/public/interactive/employee/<tabel_num>`
ISUP tizimidan tabel raqami bo'yicha xodim ma'lumotini oladi.

Javob (200):
```json
{ "full_name": "Ismoilov Anvar", "position": "Muhandis", "division": "IT bo'limi" }
```
Xodim topilmasa: `404 { "error": "Xodim topilmadi" }`

#### `GET /api/public/interactive/departments`
Barcha xizmat bo'limlari (kategoriyalar) ro'yxati.

Javob:
```json
[
  { "id": 4, "name": "Создание учётных записей", "multi_type": true },
  { "id": 2, "name": "Tarmoq xizmatlari", "multi_type": false }
]
```
`multi_type: true` — shu bo'lim uchun bir nechta xizmat turini birga tanlash mumkin.

#### `GET /api/public/interactive/departments/<dept_id>/types`
Bo'limga tegishli xizmat turlari.

Javob:
```json
[ { "id": 11, "name": "Yangi hisob yaratish" }, { "id": 12, "name": "Parolni tiklash" } ]
```

#### `POST /api/public/interactive/submit`
Yangi ariza yuborish (mobil ilovadan asosiy oqim).

So'rov body:
```json
{
  "phone_num": "+998901234567",
  "tabel_num": "12345",
  "department_id": 4,
  "type_ids": [11, 12],
  "comment": "Izoh (ixtiyoriy)"
}
```
Eslatma: `type_ids` massiv. Eski moslik uchun `type_id` yoki `service_type` (bitta qiymat) ham qabul qilinadi. Bir nechta turni faqat `multi_type: true` bo'lgan bo'limlarda tanlash mumkin — aks holda `400` xato qaytadi.

Majburiy maydonlar: `phone_num`, `tabel_num`, `department_id`, kamida bitta `type_id`.

Javob (201) — `full_name`/`position`/`division` ISUP'dan avtomatik to'ldiriladi:
```json
{
  "tracking_id": "aB3dEfGhI9x",
  "phone_num": "+998901234567",
  "tabel_num": "12345",
  "full_name": "Ismoilov Anvar",
  "position": "Muhandis",
  "division": "IT bo'limi",
  "department_name": "Создание учётных записей",
  "types": [{ "id": 11, "name": "Yangi hisob yaratish" }],
  "comment": "",
  "source": "public",
  "status": "new",
  "status_label": "Yangi",
  "assignee_name": null,
  "reviewer_name": null,
  "result_note": "",
  "reject_reason": "",
  "return_count": 0,
  "created_at": "2026-07-07T10:00:00+00:00",
  "completed_at": null,
  "history": [ { "status": "new", "status_label": "Yangi", "actor_name": null, "note": "Ariza qabul qilindi: Yangi hisob yaratish", "created_at": "..." } ]
}
```

#### `GET /api/public/interactive/status/<tracking_id>`
Ariza holatini `tracking_id` orqali kuzatish (ariza yuborilganda qaytgan `tracking_id`).

Javob — yuqoridagi kabi (`to_public(with_history=True)`), yoki `404 { "error": "Ariza topilmadi" }`.

#### `GET /api/public/interactive/history/<tabel_num>`
Bitta xodimning barcha arizalari tarixi (eng yangisi birinchi).

Javob:
```json
{
  "tabel_num": "12345",
  "total": 3,
  "items": [ { "...to_public bilan bir xil..." } ]
}
```

### 1.3. ICHKI endpointlar (JWT talab qiladi — HISOBOT tizimidagi admin/xodim uchun)

Prefix: `/api/interactive-requests` — Header: `Authorization: Bearer <JWT>`

Bular boshqa loyihaga to'g'ridan-to'g'ri berilmaydi (chunki HISOBOT'ning o'z JWT/rol tizimiga bog'liq). Faqat AA loyihasining o'z admin panelida ishlatiladi. Ro'yxat uchun keltirilmoqda — agar boshqa loyihada admin panel qurmoqchi bo'lsangiz shulardan foydalanasiz (lekin bu holda foydalanuvchi HISOBOT hisobiga ega bo'lishi kerak).

| Method | Path | Vazifa | Ruxsat |
|---|---|---|---|
| GET | `/api/interactive-requests` | Ro'yxat (filter: `status`, `department_id`, `assigned_to`, `tabel_num`) | admin — hammasi; xodim — faqat o'ziga biriktirilgan |
| GET | `/api/interactive-requests/<id>` | Bitta ariza + tarix | JWT |
| POST | `/api/interactive-requests/walkin` | Xodim qo'lda ariza kiritadi (og'zaki kelgan) | JWT |
| POST | `/api/interactive-requests/<id>/assign` | Xodimga biriktirish (`{"user_id": 5}`) | admin+ |
| POST | `/api/interactive-requests/<id>/submit-review` | Xodim "bajarildi" (`{"result_note": "..."}`) | biriktirilgan xodim yoki admin+ |
| POST | `/api/interactive-requests/<id>/approve` | Rahbar tasdiqlaydi (→ completed) | admin+ |
| POST | `/api/interactive-requests/<id>/return` | Rahbar qaytaradi (`{"return_reason": "..."}`) | admin+ |
| POST | `/api/interactive-requests/<id>/reject` | Rad etish (`{"reject_reason": "..."}`) | admin+ |
| GET | `/api/interactive-requests/stats/summary` | Status bo'yicha statistika | JWT |

### 1.4. Bo'lim/tur boshqaruvi (admin panel uchun, JWT)

Prefix: `/api/interactive` — faqat `superadmin/director/deputy_director/admin` (`is_admin_or_above`)

| Method | Path | Vazifa |
|---|---|---|
| GET | `/api/interactive/departments` | Bo'limlar ro'yxati (+ `type_count`) |
| POST | `/api/interactive/departments` | Yangi bo'lim (`{"name": "..."}`) |
| PUT | `/api/interactive/departments/<id>` | Nomini o'zgartirish |
| DELETE | `/api/interactive/departments/<id>` | O'chirish (turlari ham o'chadi) |
| GET | `/api/interactive/departments/<id>/types` | Bo'lim turlari |
| POST | `/api/interactive/departments/<id>/types` | Yangi tur (`{"name": "..."}`) |
| PUT | `/api/interactive/types/<id>` | Nomini o'zgartirish |
| DELETE | `/api/interactive/types/<id>` | O'chirish |

---

## 2-modul: Texnik xizmat so'rovlari (`ServiceRequest`)

Bu modul **bo'lim (Division) darajasida**, har bir bo'lim o'ziga xos **API kalit** orqali tashqi tizimlar (masalan boshqa loyihaning mobil ilovasi) bilan ishlashi uchun mo'ljallangan — **aynan sizning holatingiz uchun eng mos qism shu**.

### 2.1. Tashqi PUBLIC API (API-kalit orqali) — Laravel backend shu yerdan foydalanadi

Prefix: `/api/public` — Auth: header `X-API-Key: <bo'lim kaliti>` (yoki `?api_key=` query param)

Kalitni qanday olish: Superadmin `/api/service-requests/divisions/<div_id>/service-config` orqali bo'limni "servis provayder" qilib belgilaydi — shunda kalit avtomatik generatsiya bo'ladi (`secrets.token_urlsafe(32)`).

#### `POST /api/public/requests`
Yangi zayavka yuborish.

So'rov body:
```json
{
  "external_id": "uzsteel-00123",
  "submitter_name": "Aliyev Vali",
  "submitter_phone": "+998901112233",
  "submitter_email": "vali@example.com",
  "submitter_address": "Toshkent, ...",
  "category": "internet",
  "title": "Internet ishlamayapti",
  "description": "Batafsil tavsif",
  "priority": "normal"
}
```
- `external_id` — ixtiyoriy; bermasangiz server avtomatik generatsiya qiladi va javobda qaytaradi. Bu ID orqali keyinchalik holatni so'raysiz — **shuning uchun Laravel tomonda uni saqlab qo'ying**.
- Majburiy: `submitter_name`, `title`.
- `priority`: `low | normal | high | urgent`.
- Bir xil `external_id` bilan ikkinchi marta yuborilsa `400` xato.

Javob (201):
```json
{
  "external_id": "uzsteel-00123",
  "status": "new",
  "status_label": "Yangi (qabul qilinmagan)",
  "assignee_name": null,
  "accepted_at": null,
  "started_at": null,
  "completed_at": null,
  "result_note": "",
  "reject_reason": "",
  "created_at": "2026-07-07T10:00:00+00:00",
  "updated_at": "2026-07-07T10:00:00+00:00"
}
```

#### `GET /api/public/requests/<external_id>/status`
Qisqa holat (`to_public_status()` — yuqoridagi javob shakli bilan bir xil).

#### `GET /api/public/requests/<external_id>`
Xuddi shu narsa (batafsil variant, hozircha status bilan bir xil maydonlar qaytaradi).

Ikkalasida ham kalit noto'g'ri bo'lsa: `401 { "error": "API kalit noto'g'ri yoki bo'lim faol emas" }`
Zayavka topilmasa: `404 { "error": "Zayavka topilmadi" }`

### 2.2. Status qiymatlari

| Status | Ma'no |
|---|---|
| `new` | Yangi (qabul qilinmagan) |
| `accepted` | Qabul qilingan |
| `in_progress` | Jarayonda |
| `completed` | Ijobiy bajarilgan |
| `rejected` | Rad etilgan |

### 2.3. Ichki JWT endpointlar (HISOBOT xodimlari ishlatadi — boshqa loyihaga tegishli emas)

Prefix: `/api/service-requests`

| Method | Path | Vazifa |
|---|---|---|
| GET | `/api/service-requests` | Ro'yxat (filter: `status`, `only_mine=1`) — scope: rolga qarab bo'lim(lar) |
| GET | `/api/service-requests/<id>` | Bitta so'rov |
| POST | `/api/service-requests/<id>/accept` | Xodim qabul qiladi |
| POST | `/api/service-requests/<id>/start` | Ishni boshlaydi |
| POST | `/api/service-requests/<id>/complete` | Yakunlaydi (`{"result_note": "..."}`) |
| POST | `/api/service-requests/<id>/reject` | Rad etadi (`{"reject_reason": "..."}`) |
| POST | `/api/service-requests/<id>/reassign` | Admin boshqa xodimga o'tkazadi (`{"user_id": 5}`) |
| GET | `/api/service-requests/stats/summary` | Statistika |
| POST | `/api/service-requests/divisions/<id>/service-config` | Bo'limni servis-provayder qilish/o'chirish (superadmin) |
| POST | `/api/service-requests/divisions/<id>/rotate-key` | API kalitni yangilash (superadmin) |
| GET | `/api/service-requests/service-divisions` | Servis-provayder bo'limlar ro'yxati (superadmin) |

---

## 3. Boshqa loyihaga integratsiya bo'yicha tavsiya

Sizning diagrammangizdagi arxitektura (AA API → Laravel backend → o'z frontend/mobili) uchun **aniq qaysi endpointlardan foydalanish**:

| Ehtiyoj | Foydalaniladigan endpoint | Auth |
|---|---|---|
| Bo'lim/tur ro'yxatini ko'rsatish (ariza formasi uchun) | `GET /api/public/interactive/departments`, `.../types` | Yo'q |
| Ariza yuborish | `POST /api/public/interactive/submit` | Yo'q |
| Ariza holatini kuzatish | `GET /api/public/interactive/status/<tracking_id>` | Yo'q |
| Texnik xizmat zayavkasi yuborish | `POST /api/public/requests` | `X-API-Key` (Laravel `.env`da saqlansin) |
| Texnik xizmat holatini so'rash | `GET /api/public/requests/<external_id>` | `X-API-Key` |

**Muhim**: `X-API-Key` talab qiladigan endpointlarni Laravel backend ichida chaqiring (masalan Guzzle/HTTP client orqali), hech qachon frontend JS yoki mobil ilova kodiga API kalitni yozmang. `interactive/*` public endpointlar kalitsiz ishlagani uchun ularni to'g'ridan-to'g'ri frontenddan ham chaqirsa bo'ladi, lekin baribir Laravel orqali o'tkazish tavsiya etiladi — bu holda AA manzili (`host:port`) o'zgarsa faqat Laravel konfiguratsiyasini yangilaysiz, mobil ilova/frontendni qayta relizga chiqarish shart bo'lmaydi.
