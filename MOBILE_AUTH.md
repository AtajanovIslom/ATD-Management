# Mobil sessiya — 15 kunlik sirpanuvchi login

**Talab:** xodim 15 kun ilovaga umuman kirmasa → login sahifasi. 15 kun ichida
kirsa → muddat o'sha paytdan yana 15 kunga suriladi.

Backend tayyor. Flutter tomonda qilinadigan ish — quyida.

---

## 1. API shartnomasi

| Token | Muddati | Qayerda |
|---|---|---|
| `token` (access) | 12 soat | Har bir API so'rovi header'ida |
| `refresh_token` | 15 kun | **Faqat** `POST /api/auth/refresh` da |

`POST /api/auth/login` (va `signup`, `register/<token>`) javobi:

```json
{
  "token": "eyJ...",
  "refresh_token": "eyJ...",
  "expires_in": 43200,
  "user": { "id": 12, "full_name": "...", "role": "user" }
}
```

`POST /api/auth/refresh` — **YANGI endpoint**:

```
Authorization: Bearer <REFRESH_TOKEN>     <-- access token EMAS
body kerak emas
```

Javob **login bilan aynan bir xil shakl** (yangi `refresh_token` ham beriladi —
uning 15 kunlik muddati shu paytdan qayta sanaladi).

| Kod | Ma'nosi | Ilova |
|---|---|---|
| 200 | Sessiya uzaytirildi | Yangi tokenlarni saqlash |
| 401 | 15 kun o'tgan yoki xodim bloklangan | Tokenlarni o'chirib → login |
| 422 | Noto'g'ri token turi yuborilgan | Kod xatosi — refresh token yuborilyaptimi? |

---

## 2. Mantiq (juda sodda)

Access token 12 soat yashaydi. Demak ilovadan foydalanish uchun har 12 soatda
kamida bir marta `/refresh` **majburan** chaqiriladi. Har refresh 15 kunni
qayta sanaydi.

**Natijada oyna o'z-o'zidan suriladi** — hech qanday taymer, hisob-kitob yoki
"muddatni yangilash" sahifasi kerak emas.

Yagona qoida:

> So'rov yuborishdan oldin access token muddati tugagan (yoki tugashiga
> 1 daqiqa qolgan) bo'lsa — avval `/refresh`.

Sahifadan sahifaga o'tishda, tugma bosishda alohida hech narsa qilinmaydi.

---

## 3. Kod

### 3.1. Paketlar

```yaml
dependencies:
  dio: ^5.4.0
  flutter_secure_storage: ^9.2.2
```

### 3.2. Token saqlash

`expires_in` kelgani uchun JWT dekodlash kerak emas — tugash vaqtini o'zimiz
hisoblab yozamiz.

```dart
class AuthStorage {
  static const _s = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );

  Future<String?> get accessToken => _s.read(key: 'access_token');
  Future<String?> get refreshToken => _s.read(key: 'refresh_token');

  /// login va refresh javoblari bir xil shaklda — bitta metod yetadi
  Future<void> saveSession(Map<String, dynamic> b) async {
    final expiresAt = DateTime.now()
        .add(Duration(seconds: (b['expires_in'] as int?) ?? 43200));
    await _s.write(key: 'access_token', value: b['token']);
    await _s.write(key: 'refresh_token', value: b['refresh_token']);
    await _s.write(key: 'access_expires_at', value: expiresAt.toIso8601String());
    if (b['user'] != null) {
      await _s.write(key: 'user_json', value: jsonEncode(b['user']));
    }
  }

  /// Muddati tugagan yoki 1 daqiqadan kam qolgan bo'lsa true
  Future<bool> accessExpiresSoon() async {
    final raw = await _s.read(key: 'access_expires_at');
    if (raw == null) return true;
    final exp = DateTime.tryParse(raw);
    if (exp == null) return true;
    return DateTime.now().isAfter(exp.subtract(const Duration(minutes: 1)));
  }

  Future<void> clear() => _s.deleteAll();
}
```

### 3.3. Dio interceptor

Uchta nozik joy:

1. **`QueuedInterceptorsWrapper`** (oddiy `InterceptorsWrapper` emas) — ilova
   ochilganda bir vaqtda ketgan 5-6 so'rov bitta refresh'ni kutadi, aks holda
   hammasi birdan refresh chaqirib tokenlar bir-birini yeb qo'yadi.
2. **Refresh alohida `Dio` bilan** — aks holda interceptor o'zini o'zi chaqirib
   cheksiz halqaga tushadi.
3. **422 ni ham 401 kabi** hisoblang — imzo mos kelmasa Flask 422 qaytaradi.

```dart
class ApiClient {
  ApiClient(this._storage, this._onSessionExpired) {
    dio = Dio(BaseOptions(baseUrl: _base));
    _refreshDio = Dio(BaseOptions(baseUrl: _base));   // interceptorsiz

    dio.interceptors.add(QueuedInterceptorsWrapper(
      onRequest: (options, handler) async {
        if (options.extra['skipAuth'] != true) {
          // ★ Butun mantiq shu yerda: muddati tugayotgan bo'lsa oldin yangilaymiz
          if (await _storage.accessExpiresSoon()) {
            await refreshSession();
          }
          final t = await _storage.accessToken;
          if (t != null) options.headers['Authorization'] = 'Bearer $t';
        }
        handler.next(options);
      },

      // Zaxira yo'l: telefon soati noto'g'ri bo'lsa yoki token serverda
      // kutilmaganda bekor bo'lsa
      onError: (e, handler) async {
        final code = e.response?.statusCode;
        final isAuth = code == 401 || code == 422;
        if (!isAuth ||
            e.requestOptions.extra['retried'] == true ||
            e.requestOptions.path.contains('/auth/')) {
          return handler.next(e);
        }

        if (!await refreshSession()) {
          await _storage.clear();
          _onSessionExpired();                 // -> login ekrani
          return handler.next(e);
        }

        final req = e.requestOptions;
        req.extra['retried'] = true;
        req.headers['Authorization'] = 'Bearer ${await _storage.accessToken}';
        try {
          return handler.resolve(await dio.fetch(req));
        } catch (err) {
          return handler.next(err as DioException);
        }
      },
    ));
  }

  static const _base = 'https://SERVER/api';
  late final Dio dio;
  late final Dio _refreshDio;
  final AuthStorage _storage;
  final void Function() _onSessionExpired;

  /// true = uzaytirildi, false = qayta login kerak
  Future<bool> refreshSession() async {
    final rt = await _storage.refreshToken;
    if (rt == null) return false;
    try {
      final res = await _refreshDio.post('/auth/refresh',
          options: Options(headers: {'Authorization': 'Bearer $rt'}));
      await _storage.saveSession(Map<String, dynamic>.from(res.data));
      return true;
    } on DioException catch (e) {
      final code = e.response?.statusCode;
      if (code == 401 || code == 422) return false;   // muddat tugagan/bloklangan
      rethrow;                                        // tarmoq xatosi — logout QILMAYMIZ
    }
  }
}
```

> **Muhim:** tarmoq uzilgani uchun refresh yiqilsa foydalanuvchini chiqarib
> yubormang. Faqat server **401/422** qaytarganda login sahifasiga o'ting.
> Aks holda internetsiz joyda ilova ochgan xodim sessiyasidan ayriladi.

### 3.4. Ilova ochilganda (splash)

```dart
Future<bool> bootstrap() async {
  final rt = await storage.refreshToken;
  if (rt == null) return false;                  // hech qachon kirmagan / logout

  if (await storage.accessExpiresSoon()) {
    if (!await api.refreshSession()) {
      await storage.clear();
      return false;                              // 15 kun o'tgan yoki bloklangan
    }
  }
  await registerFcmToken();                      // POST /api/notifications/devices
  return true;                                   // to'g'ridan-to'g'ri asosiy panelga
}
```

`false` → login ekrani, `true` → asosiy panel. Splash'da ko'pi bilan bitta
so'rov kutiladi (~200 ms).

### 3.5. Login

```dart
final res = await api.dio.post('/auth/login',
    data: {'login': login, 'password': password},
    options: Options(extra: {'skipAuth': true}));
await storage.saveSession(Map<String, dynamic>.from(res.data));
await registerFcmToken();
```

### 3.6. Logout

```dart
Future<void> logout() async {
  final fcm = await FirebaseMessaging.instance.getToken();
  if (fcm != null) {
    try {
      await api.dio.delete('/notifications/devices', data: {'token': fcm});
    } catch (_) {}                    // chiqish baribir davom etsin
  }
  await storage.clear();
  goToLogin();
}
```

FCM tokenni o'chirish shart — aks holda chiqib ketgan xodimning telefoniga
push kelaveradi.

---

## 4. Tekshirish ro'yxati

- [ ] Login → panel. Ilovani yopib qayta oching → login so'ralmasin
- [ ] Telefon sanasini 5 kun oldinga suring → login so'ralmasin
- [ ] Sanani 20 kun oldinga suring → **login sahifasi chiqsin**
- [ ] Aviarejimda oching → login sahifasiga **tushib ketmasin** (tarmoq xatosi chiqsin)
- [ ] Bir vaqtda bir nechta ekran ochilganda → **bitta** refresh so'rovi ketsin
- [ ] Admin xodimni bloklasin (`is_active=false`) → keyingi refreshda login sahifasi
- [ ] Logout → FCM token o'chsin, qayta ochilganda login so'ralsin

---

## 5. Bilib qo'yish kerak

**Bir martalik qayta login.** Deploy'dan keyin hozirgi foydalanuvchilarda
refresh token yo'q — bir marta qayta kirishlari kerak.

**Serverdagi `JWT_SECRET_KEY` o'zgarmasin.** U almashsa barcha tokenlar bir
zumda kuchini yo'qotadi va hamma qayta login qilishga majbur bo'ladi.

**Yo'qolgan telefonni o'chirish hozircha yo'q.** Refresh token bazada
saqlanmaydi, shuning uchun uni masofadan bekor qilib bo'lmaydi — telefon
yo'qolsa o'sha token 15 kun amal qiladi. Kerak bo'lsa backendga `sessions`
jadvali qo'shiladi (`last_seen_at`, `revoked`); **mobil tomonda hech narsa
o'zgarmaydi**, API shartnomasi bir xil qoladi.

**Web ilovaga ta'siri yo'q.** Web faqat 12 soatlik access tokendan foydalanadi
va javobdagi qo'shimcha maydonlarni e'tiborsiz qoldiradi.
