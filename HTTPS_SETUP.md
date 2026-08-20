# HTTPS sozlash — atd.uzbeksteel.uz

Loyiha `172.16.22.107` serverida Docker'da ishlaydi. Bu hujjat uni HTTPS'ga
o'tkazish va internetga ochish tartibini tavsiflaydi.

Sertifikat: Sectigo wildcard `*.uzbeksteel.uz` (SAN: `*.uzbeksteel.uz`,
`uzbeksteel.uz`), amal muddati **2027-03-15** gacha. Shu bitta sertifikat
`markaz.uzbeksteel.uz` uchun ham, `atd.uzbeksteel.uz` uchun ham yaraydi.

---

## Sertifikatlar qayerda saqlanadi

**Maxfiy kalit hech qachon git'ga tushmaydi.** Repo public bo'lmasa ham —
git tarixidan biror narsani o'chirish deyarli imkonsiz, va sertifikat
markazlari (shu jumladan Sectigo) repo'ga tushgan kalitni "buzilgan" deb
hisoblab bekor qilishi mumkin.

Buning o'rniga ikkala fayl ham **GitHub Actions Secrets** da saqlanadi va
deploy paytida serverda `certs/` papkasiga yoziladi. Natija siz xohlaganidek:
serverga qo'lda fayl tashish shart emas, hammasi avtomatik.

| Secret nomi | Nima |
|---|---|
| `TLS_FULLCHAIN` | Sertifikat + Sectigo oraliq zanjiri (ochiq ma'lumot) |
| `TLS_PRIVATE_KEY` | Maxfiy kalit |

---

## 1-qadam. Tarmoq administratoriga so'rov

| Nima | Qiymat |
|---|---|
| DNS `A` yozuvi | `atd.uzbeksteel.uz` → tashkilotning tashqi (public) IP manzili |
| NAT / port-forward | tashqi **TCP 443** → `172.16.22.107:443` |
| NAT (ixtiyoriy) | tashqi **TCP 80** → `172.16.22.107:80` — faqat HTTP→HTTPS yo'naltirish uchun |

DNS `markaz.uzbeksteel.uz` bilan bir xil usulda qilinadi. Tashqi 80-portni
ochish shart emas; ochilmasa foydalanuvchilar manzilni `https://` bilan
yozishi kerak bo'ladi.

---

## 2-qadam. GitHub'da secret'larni qo'shish

Repo sahifasida: **Settings → Secrets and variables → Actions → New repository secret**

**`TLS_FULLCHAIN`** — `E:\DOCs\cert\fullchain.crt` faylining butun mazmuni.
Ichida **3 ta** `BEGIN CERTIFICATE` bloki bo'lishi kerak:

```
*.uzbeksteel.uz                                  (sizning sertifikatingiz)
Sectigo Public Server Authentication CA DV R36   (oraliq)
Sectigo Public Server Authentication Root R46    (USERTrust bilan cross-sign)
```

**`TLS_PRIVATE_KEY`** — `E:\DOCs\cert\STAR_uzbeksteel_uz.key` faylining butun
mazmuni, `-----BEGIN PRIVATE KEY-----` dan `-----END PRIVATE KEY-----` gacha.

Fayl mazmunini nusxalash uchun:

```bash
type E:\DOCs\cert\fullchain.crt | clip
```

---

## 3-qadam. `.env` ni yangilash (serverda)

```bash
cd ~/HISOBOT
grep -q '^HTTPS_PORT=' .env || echo 'HTTPS_PORT=443' >> .env
```

---

## 4-qadam. Push

`main` ga push qilinganda self-hosted runner o'zi:

1. kodni yangilaydi;
2. secret'lardan `certs/fullchain.crt` va `certs/privkey.key` ni yozadi
   (avval sertifikat muddati va kalitning sertifikatga mosligini tekshiradi);
3. konteynerlarni qayta quradi;
4. HTTP va HTTPS ikkalasini tekshiradi.

Har bir bosqichda himoya bor: agar secret yaroqsiz bo'lsa yoki sertifikat
topilmasa, deploy **konteynerlarga tegmasdan** to'xtaydi — ya'ni hozir
ishlab turgan sayt o'chib qolmaydi.

Secret'lar qo'yilmagan bo'lsa ham deploy ishlaydi — u holda serverdagi
mavjud `certs/` papkasi ishlatiladi (qo'lda joylash varianti).

---

## 5-qadam. Tekshirish

Serverda:

```bash
curl -sk -o /dev/null -w '%{http_code}\n' https://localhost/
docker compose ps
```

Tashqaridan (DNS va NAT tayyor bo'lgach):

```bash
curl -I https://atd.uzbeksteel.uz
openssl s_client -connect atd.uzbeksteel.uz:443 -servername atd.uzbeksteel.uz < /dev/null | head -20
```

Zanjir to'g'ri yig'ilganini tekshirish uchun: https://www.ssllabs.com/ssltest/

---

## Ichki tarmoq

`http://172.16.22.107/` manzili **HTTP'da ishlashda davom etadi** — sertifikat
IP manzilni qamramagani uchun IP orqali kirganda redirect qilinmaydi.
Ichki foydalanuvchilar ishi buzilmaydi.

---

## Mobil ilova

`MOBILE_AUTH.md` dagi `_base` qiymati:

```dart
static const _base = 'https://atd.uzbeksteel.uz/api';
```

`fullchain.crt` da USERTrust bilan cross-sign qilingan zanjir borligi uchun
eski Android qurilmalarida ham sertifikat qabul qilinadi.

---

## Sertifikat muddati tugaganda (2027-03-15 gacha)

Sectigo'dan yangi `.crt` va `.ca-bundle` olingach:

```bash
cat yangi.crt yangi.ca-bundle > fullchain.crt
openssl verify -untrusted fullchain.crt yangi.crt      # "OK" chiqishi kerak
```

Keyin GitHub'da `TLS_FULLCHAIN` (va kalit o'zgargan bo'lsa `TLS_PRIVATE_KEY`)
secret'ini yangilang va **Actions → Deploy → Run workflow** ni bosing.

`nginx.conf` dagi HSTS hozir `max-age=86400` (1 kun). Hammasi bir necha hafta
barqaror ishlagach uni `31536000` (1 yil) ga oshirish mumkin — lekin shundan
keyin sertifikatni muddatida yangilash qat'iy majburiy bo'ladi, aks holda
foydalanuvchilar saytga umuman kira olmaydi.

---

## Zanjir qanday yig'ilgan

Sectigo bergan `.crt` faylda faqat leaf sertifikat bor edi. To'liq zanjir
sertifikatning o'zidagi AIA manzillaridan yig'ildi:

```
*.uzbeksteel.uz
  └─ Sectigo Public Server Authentication CA DV R36
       └─ Sectigo Public Server Authentication Root R46
            └─ USERTrust RSA Certification Authority   (ildiz, ishonch do'konida)
```

`Root R46` 2021-yilda chiqqan va eski qurilmalarning ishonch do'konida
bo'lmasligi mumkin, shuning uchun uning USERTrust bilan cross-sign qilingan
varianti qo'shilgan — shu tufayli eski Android telefonlarda ham ishlaydi.
