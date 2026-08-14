/**
 * Backend qaytaradigan kodlarni ({status}, {role}, ...) tarjimaga aylantiradi.
 *
 * Lug'atda mos kalit topilmasa kodning o'zi qaytariladi — noma'lum status
 * kelganda ekranda `status.xyz` emas, `xyz` ko'rinsin.
 */

function lookup(t, prefix, code) {
  if (!code) return ''
  const key = `${prefix}.${code}`
  const value = t(key)
  return value === key ? code : value
}

/** Vazifa/loyiha/bosqich statusi: active → Faol / Активна */
export const statusLabel = (t, code) => lookup(t, 'status', code)

/** Foydalanuvchi roli: admin → Boshqarma Rahbari / Руководитель управления */
export const roleLabel = (t, code) => lookup(t, 'role', code)

/** Muhimlik darajasi: high → Yuqori / Высокий */
export const priorityLabel = (t, code) => lookup(t, 'priority', code)
