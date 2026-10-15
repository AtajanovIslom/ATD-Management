/**
 * Sana/vaqt yordamchilari.
 *
 * Backend vaqtni UTC'da saqlaydi va ko'pincha mintaqa belgisisiz yuboradi
 * ("2026-10-19T19:00:00"). Brauzer bunday satrni MAHALLIY vaqt deb o'qiydi —
 * natijada hamma joyda vaqt 5 soat orqada, boshlanish sanasi esa bir kun
 * oldin ko'rinardi (20.10 00:00 → "19.10"). Shu yerda u UTC deb o'qiladi.
 */

// Vaqt qismi bor, lekin "Z" yoki "+05:00" kabi mintaqa yo'q
const NAIVE_DATETIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/

export function parseServerDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const s = String(value)
  const d = new Date(NAIVE_DATETIME.test(s) ? s + 'Z' : s)
  return Number.isNaN(d.getTime()) ? null : d
}

const pad = (n) => String(n).padStart(2, '0')

/** Date → mahalliy "YYYY-MM-DD" (<input type="date"> uchun). */
export function localDateString(d = new Date()) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
}

/**
 * Server vaqti → <input type="date"> qiymati (mahalliy kun).
 * Ilgari `iso.split('T')[0]` ishlatilardi — u UTC kunni olardi va har
 * saqlashda sana bir kun orqaga surilib borardi.
 */
export function toDateInput(value) {
  if (!value) return ''
  const s = String(value)
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
  const d = parseServerDate(s)
  return d ? localDateString(d) : ''
}

/** Bugungi mahalliy sana ("YYYY-MM-DD"). `toISOString()` UTC kunini berardi. */
export const todayLocal = () => localDateString(new Date())
