import { useRef } from 'react'
import { useI18n } from '../i18n'

/**
 * Bir nechta fayl biriktirish maydoni.
 *
 * Oddiy `<input type="file" multiple>` har tanlovda o'zining `files`
 * ro'yxatini butunlay almashtiradi: foydalanuvchi ikkinchi marta
 * "biriktirish" ni bosib yangi fayl tanlasa, avval tanlanganlari yo'qolardi.
 * Shuning uchun tanlangan fayllar shu komponentda to'planadi, input esa
 * har safar bo'shatiladi — natijada yangi fayllar eskilarining ustiga
 * qo'shiladi va har birini alohida olib tashlash mumkin.
 */
export default function FilePicker({ files = [], onChange, accept, inputStyle, className = 'form-input' }) {
  const { t } = useI18n()
  const inputRef = useRef(null)

  // Bir xil fayl ikki marta qo'shilib qolmasin
  const keyOf = f => `${f.name}|${f.size}|${f.lastModified}`

  const add = (e) => {
    const picked = Array.from(e.target.files || [])
    if (picked.length) {
      const seen = new Set(files.map(keyOf))
      onChange([...files, ...picked.filter(f => !seen.has(keyOf(f)))])
    }
    // Bo'shatmasak, xuddi shu faylni qayta tanlaganda `change` hodisasi
    // umuman ishlamaydi (qiymat o'zgarmagan hisoblanadi)
    e.target.value = ''
  }

  const remove = (idx) => onChange(files.filter((_, i) => i !== idx))

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={accept}
        className={className}
        style={inputStyle}
        onChange={add}
      />

      {files.length > 0 && (
        <>
          <div className="file-chips">
            {files.map((f, i) => (
              <span key={`${keyOf(f)}-${i}`} className="file-chip">
                📄 {f.name}
                <span className="file-chip__size">({formatFileSize(f.size)})</span>
                <button type="button" className="file-chip__remove"
                  onClick={() => remove(i)} title={t('file.remove')}
                  aria-label={t('file.remove')}>×</button>
              </span>
            ))}
          </div>
          <div className="file-picker__foot">
            <span>{t('file.selected', { n: files.length })} · {t('file.appendHint')}</span>
            <button type="button" className="file-picker__clear" onClick={() => onChange([])}>
              {t('file.clearAll')}
            </button>
          </div>
        </>
      )}
    </div>
  )
}

export function formatFileSize(bytes) {
  if (!bytes && bytes !== 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
