import { LANGUAGES, useI18n } from '../i18n'

/**
 * UZ / RU almashtirgichi.
 *
 * `variant="compact"` — sidebar footer uchun (tema tugmasi bilan yonma-yon),
 * `variant="plain"` — Login/SignUp sahifalarining tepasi uchun.
 */
export default function LanguageSwitcher({ variant = 'compact' }) {
  const { lang, setLang } = useI18n()

  return (
    <div className={`lang-switcher lang-switcher-${variant}`} role="group" aria-label="Til / Язык">
      {LANGUAGES.map(l => (
        <button
          key={l.code}
          type="button"
          className={`lang-btn${lang === l.code ? ' active' : ''}`}
          onClick={() => setLang(l.code)}
          title={l.label}
          aria-pressed={lang === l.code}
        >
          {l.short}
        </button>
      ))}
    </div>
  )
}
