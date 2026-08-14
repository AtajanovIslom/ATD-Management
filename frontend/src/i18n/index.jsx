/**
 * Ko'p tillilik yadrosi.
 *
 * Matnlar `uz.js` va `ru.js` lug'atlarida yassi kalitlar bilan saqlanadi
 * (`nav.dashboard`, `login.title`, ...). Komponent ichida:
 *
 *     const { t } = useI18n()
 *     <h1>{t('login.title')}</h1>
 *     <p>{t('users.count', { n: 12 })}</p>
 *
 * Tanlangan til localStorage'da turadi — sahifa yangilansa ham saqlanadi.
 * Ruscha tarjima topilmasa o'zbekchasiga qaytadi, u ham bo'lmasa kalitning
 * o'zi ko'rinadi (yo'q tarjima darrov ko'zga tashlansin).
 */
import { createContext, useContext, useState, useEffect, useCallback, useMemo } from 'react'
import uz from './uz'
import ru from './ru'

const DICTS = { uz, ru }
const DEFAULT_LANG = 'uz'
const STORAGE_KEY = 'lang'

// Til tanlash tugmasi shu ro'yxatdan chiziladi
export const LANGUAGES = [
  { code: 'uz', short: 'UZ', label: "O'zbekcha" },
  { code: 'ru', short: 'RU', label: 'Русский' },
]

// Sana formatlash uchun Intl locale kodlari
const LOCALES = { uz: 'uz-UZ', ru: 'ru-RU' }

const I18nContext = createContext(null)

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved && DICTS[saved] ? saved : DEFAULT_LANG
  })

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, lang)
    document.documentElement.setAttribute('lang', lang)
  }, [lang])

  const setLang = useCallback((code) => {
    if (DICTS[code]) setLangState(code)
  }, [])

  /** Kalit bo'yicha matn. `params` — {name} ko'rinishidagi o'rin egalarini almashtiradi. */
  const t = useCallback((key, params) => {
    let str = DICTS[lang][key] ?? DICTS[DEFAULT_LANG][key] ?? key
    if (params) {
      for (const [k, v] of Object.entries(params)) {
        str = str.split(`{${k}}`).join(v ?? '')
      }
    }
    return str
  }, [lang])

  /** Sanani tanlangan til qoidasi bo'yicha formatlaydi. */
  const formatDate = useCallback((iso, opts = { day: '2-digit', month: '2-digit', year: 'numeric' }) => {
    if (!iso) return ''
    const d = iso instanceof Date ? iso : new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleDateString(LOCALES[lang], opts)
  }, [lang])

  /** Sana + vaqt. */
  const formatDateTime = useCallback((iso, opts = {
    day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit',
  }) => {
    if (!iso) return ''
    const d = iso instanceof Date ? iso : new Date(iso)
    if (Number.isNaN(d.getTime())) return ''
    return d.toLocaleString(LOCALES[lang], opts)
  }, [lang])

  const value = useMemo(
    () => ({ lang, setLang, t, formatDate, formatDateTime, locale: LOCALES[lang] }),
    [lang, setLang, t, formatDate, formatDateTime],
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export const useI18n = () => useContext(I18nContext)
