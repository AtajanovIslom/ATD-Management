import { useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Ochiq, autentifikatsiyasiz sahifa — Google Play / App Store review va
 * foydalanuvchilar uchun. Ilovaning umumiy i18n lug'atidan mustaqil: bu
 * yerdagi matn qonuniy hujjat bo'lgani uchun tarjima kalitlari orqali
 * bo'lak-bo'lak boshqarilishi xato ehtimolini oshiradi — shuning uchun UZ/EN
 * matnlar shu faylda to'liq saqlanadi.
 */

const CONTENT = {
  uz: {
    label: "O'zbekcha",
    title: 'Maxfiylik siyosati',
    updated: 'Oxirgi yangilanish: 2026-yil 24-avgust',
    intro: [
      '"ATD Boshqaruv" (ATD Management) — "Uzbeksteel" korxonasining ATD ' +
        "direksiyasi ichki xodimlari uchun mo'ljallangan korporativ vazifa, " +
        "loyiha va hisobot boshqaruv tizimi. Ilova ommaviy foydalanuvchilar " +
        "uchun emas — undan faqat korxona tomonidan ro'yxatga olingan " +
        "xodimlar, o'zlariga berilgan hisob (login) orqali foydalanadi.",
      'Ushbu sahifada ilova (veb va mobil versiyalar) qanday ma\'lumot ' +
        'to\'plashi, undan qanday foydalanilishi va qanday himoyalanishi ' +
        'tushuntiriladi.',
    ],
    sections: [
      {
        h: "1. Qanday ma'lumotlar to'planadi",
        p: [
          "Hisob va xodim ma'lumotlari: to'liq ism, lavozim, boshqarma/bo'lim, " +
            "tabel raqami, login, telefon va elektron pochta (agar kiritilgan " +
            "bo'lsa). Bu ma'lumotlarni administrator kiritadi yoki xodim " +
            "ro'yxatdan o'tish havolasi orqali o'zi to'ldiradi.",
          "Ish faoliyati ma'lumotlari: loyihalar, vazifalar, ish jurnali " +
            "yozuvlari, interaktiv xizmat arizalari va ularga biriktirilgan " +
            "fayllar (rasm, hujjat va h.k.).",
          "Bildirishnoma uchun texnik ma'lumot: mobil ilova o'rnatilgan " +
            "qurilmaning push-bildirishnoma tokeni (Firebase Cloud Messaging " +
            'orqali vazifa/ariza haqida xabar yuborish uchun).',
          "Xavfsizlik jurnali: tizimga kirish/chiqish va muhim amallar " +
            "(audit log) — vaqt belgisi bilan birga, ichki xavfsizlik va " +
            'hisobdorlik maqsadida.',
        ],
      },
      {
        h: "2. Ma'lumotlardan qanday foydalaniladi",
        p: [
          "To'plangan ma'lumotlar faqat quyidagi ichki maqsadlarda " +
            'ishlatiladi: xodimlarni autentifikatsiya qilish, vazifa va ' +
            "loyihalarni boshqarish, ish yuklamasi bo'yicha hisobot va " +
            "statistika tuzish, push-bildirishnoma yuborish hamda tizim " +
            "xavfsizligini ta'minlash.",
          "Ma'lumotlar reklama, marketing yoki ilovadan tashqari tahliliy " +
            'maqsadlarda ishlatilmaydi va sotilmaydi.',
        ],
      },
      {
        h: '3. Uchinchi tomonlar bilan bo\'lishish',
        p: [
          "Ma'lumotlar tashqi tomonlarga sotilmaydi va reklama maqsadida " +
            "uzatilmaydi. Yagona tashqi xizmat — Google Firebase Cloud " +
            "Messaging (FCM), mobil bildirishnomalarni yetkazish uchun " +
            "ishlatiladi; unga faqat qurilma tokeni va xabar matni uzatiladi.",
          "Ma'lumotlar qonuniy talab (sud qarori, davlat organi so'rovi) " +
            "asosida taqdim etilishi mumkin.",
        ],
      },
      {
        h: "4. Saqlash muddati va xavfsizlik",
        p: [
          "Ma'lumotlar korxonaning o'z serverida (HTTPS/TLS shifrlash " +
            "orqali), parollar xeshlangan holda saqlanadi. Xodim hisobi " +
            "faol bo'lgan davrda va ichki hisobot/arxiv talablari doirasida " +
            "saqlanadi; hisob o'chirilganda shaxsiy ma'lumotlar administrator " +
            "tomonidan tizimdan o'chiriladi yoki anonimlashtiriladi.",
        ],
      },
      {
        h: '5. Xodimning huquqlari',
        p: [
          "Har bir xodim o'z ma'lumotlarini ko'rish, to'g'irlash yoki " +
            "o'chirishni so'rash huquqiga ega — buning uchun o'z bo'lim/" +
            "boshqarma administratoriga yoki quyidagi kontaktga murojaat " +
            'qilish kifoya.',
        ],
      },
      {
        h: '6. Bolalar maxfiyligi',
        p: [
          "Ilova faqat korxona xodimlari uchun mo'ljallangan va 18 yoshdan " +
            "kichik shaxslardan ataylab ma'lumot to'planmaydi.",
        ],
      },
      {
        h: '7. Aloqa',
        p: [
          "Maxfiylik bo'yicha savollar uchun: ",
        ],
      },
    ],
  },
  en: {
    label: 'English',
    title: 'Privacy Policy',
    updated: 'Last updated: August 24, 2026',
    intro: [
      '"ATD Management" is an internal corporate task, project and ' +
        'reporting management system used by staff of the ATD directorate ' +
        'at "Uzbeksteel". The application is not available to the general ' +
        'public — it is used only by employees registered by the company, ' +
        'through an account (login) issued to them.',
      'This page explains what information the app (web and mobile ' +
        'versions) collects, how it is used, and how it is protected.',
    ],
    sections: [
      {
        h: '1. Information we collect',
        p: [
          'Account and employee data: full name, job title, department/' +
            'division, employee (tab) number, login, phone number and ' +
            'email (if provided). This data is entered by an administrator ' +
            'or by the employee themselves via a registration link.',
          'Work activity data: projects, tasks, work log entries, ' +
            'interactive service requests and files attached to them ' +
            '(images, documents, etc.).',
          'Technical data for notifications: the push-notification token ' +
            'of the device the mobile app is installed on (used via ' +
            'Firebase Cloud Messaging to deliver task/request alerts).',
          'Security logs: sign-in/sign-out events and key actions (audit ' +
            'log), together with timestamps, for internal security and ' +
            'accountability purposes.',
        ],
      },
      {
        h: '2. How we use the information',
        p: [
          'Collected data is used solely for the following internal ' +
            'purposes: authenticating employees, managing tasks and ' +
            'projects, producing workload reports and statistics, sending ' +
            'push notifications, and maintaining system security.',
          'Data is never used for advertising, marketing, or external ' +
            'analytics, and is never sold.',
        ],
      },
      {
        h: '3. Sharing with third parties',
        p: [
          'Data is not sold and is not shared for advertising purposes. ' +
            'The only external service used is Google Firebase Cloud ' +
            'Messaging (FCM), for delivering mobile push notifications; it ' +
            'only receives the device token and the message content.',
          'Data may be disclosed if required by law (court order, request ' +
            'from a government authority).',
        ],
      },
      {
        h: '4. Retention and security',
        p: [
          "Data is stored on the company's own server (protected with " +
            'HTTPS/TLS encryption), with passwords stored hashed. Data is ' +
            "retained while the employee's account is active and as " +
            'required by internal reporting/archival policy; when an ' +
            'account is deactivated, personal data is deleted or ' +
            'anonymized by an administrator.',
        ],
      },
      {
        h: "5. Employee rights",
        p: [
          'Every employee has the right to access, correct, or request ' +
            'deletion of their data — this can be requested from their ' +
            'department/division administrator or via the contact below.',
        ],
      },
      {
        h: "6. Children's privacy",
        p: [
          'The app is intended solely for company employees and does not ' +
            'knowingly collect data from individuals under 18.',
        ],
      },
      {
        h: '7. Contact',
        p: [
          'For privacy-related questions, contact: ',
        ],
      },
    ],
  },
}

const CONTACT_EMAIL = 'sherzodbek4758@gmail.com'

export default function PrivacyPolicy() {
  const [lang, setLang] = useState('uz')
  const c = CONTENT[lang]

  return (
    <div style={{ maxWidth: 760, margin: '0 auto', padding: '32px 20px 64px', lineHeight: 1.6 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <Link to="/login" style={{ textDecoration: 'none', fontWeight: 600 }}>← ATD Management</Link>
        <div style={{ display: 'flex', gap: 8 }}>
          {Object.keys(CONTENT).map((key) => (
            <button
              key={key}
              onClick={() => setLang(key)}
              className="btn"
              style={{
                padding: '4px 10px',
                fontSize: 13,
                fontWeight: lang === key ? 700 : 400,
                opacity: lang === key ? 1 : 0.6,
                border: '1px solid var(--border-color, #ccc)',
                borderRadius: 6,
                background: 'transparent',
                cursor: 'pointer',
              }}
            >
              {CONTENT[key].label}
            </button>
          ))}
        </div>
      </div>

      <h1 style={{ marginBottom: 4 }}>{c.title}</h1>
      <p style={{ opacity: 0.7, marginBottom: 24, fontSize: 14 }}>{c.updated}</p>

      {c.intro.map((p, i) => (
        <p key={i} style={{ marginBottom: 16 }}>{p}</p>
      ))}

      {c.sections.map((s, i) => (
        <section key={i} style={{ marginBottom: 24 }}>
          <h2 style={{ fontSize: 18, marginBottom: 8 }}>{s.h}</h2>
          {s.p.map((p, j) => (
            <p key={j} style={{ marginBottom: 8 }}>
              {p}
              {s.h.startsWith('7') && j === s.p.length - 1 && (
                <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>
              )}
            </p>
          ))}
        </section>
      ))}
    </div>
  )
}
