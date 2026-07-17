import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios'

/**
 * Eslatmalar sahifasi:
 *   - Chap: kalendar (oy ko'rinishida, muddati o'tayotgan kunlarda rangli nuqta)
 *   - O'ng: barcha eslatmalar ro'yxati
 *   - Kunga bosilganda dialog ochiladi
 */

const UZ_MONTHS = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun',
                   'Iyul', 'Avgust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr']
const UZ_WEEK = ['Du', 'Se', 'Cho', 'Pa', 'Ju', 'Sha', 'Ya']  // Mon-Sun

// Ogohlantirish takrorlanish oraliqlari (daqiqada) — backend'dagi ALLOWED_INTERVALS bilan mos.
// -1 = maxsus rejim: muddatga 7 kun qolganda kunlik ogohlantirish (Reminder.LAST_WEEK_MODE)
const NOTIFY_INTERVALS = [
  { value: 0, label: 'Takrorlanmasin (faqat bir marta)' },
  { value: -1, label: 'Oxirgi haftadan boshlab har kuni' },
  { value: 60, label: 'Har soatda' },
  { value: 120, label: 'Har 2 soatda' },
  { value: 360, label: 'Har 6 soatda' },
  { value: 720, label: 'Har 12 soatda' },
  { value: 1440, label: 'Har kuni' },
  { value: 10080, label: 'Har haftada' },
  { value: 43200, label: 'Har oyda' },
]

// Lokal timezone bo'yicha YYYY-MM-DD (UTC ga o'girmasdan — kun surilib ketmasin)
const isoDate = (d) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}


export default function Reminders() {
  const [items, setItems] = useState([])
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('all')  // all | active | completed
  const [dialog, setDialog] = useState(null)   // { mode:'add'|'edit', date, item? }

  const [today] = useState(() => { const d = new Date(); d.setHours(0,0,0,0); return d })
  const [monthStart, setMonthStart] = useState(() => {
    const d = new Date(); d.setDate(1); d.setHours(0,0,0,0); return d
  })

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get('/reminders?status=' + filter)
      setItems(res.data)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  // Kalendar bosilganda: agar shu kunga eslatma yo'q bo'lsa yangi yaratamiz; bor bo'lsa ochamiz
  const openForDate = (dateStr) => {
    const existing = items.filter(r => r.remind_date === dateStr && !r.is_completed)
    if (existing.length > 0) {
      // Birinchi mavjudini tahrirlash uchun ochamiz
      setDialog({ mode: 'edit', item: existing[0] })
    } else {
      setDialog({ mode: 'add', date: dateStr })
    }
  }

  const openAddToday = () => setDialog({ mode: 'add', date: isoDate(today) })

  const openEdit = (item) => setDialog({ mode: 'edit', item })

  const closeDialog = () => setDialog(null)

  const onSave = async ({ date, message, id, notifyInterval, newFiles, removeFileIds }) => {
    const fd = new FormData()
    fd.append('remind_date', date)
    fd.append('message', message)
    fd.append('notify_interval', String(notifyInterval))
    if (newFiles) {
      for (const f of newFiles) fd.append('files', f)
    }
    if (removeFileIds) {
      for (const fid of removeFileIds) fd.append('remove_file_ids', fid)
    }
    if (id) {
      await api.put(`/reminders/${id}`, fd)
    } else {
      await api.post('/reminders', fd)
    }
    await load()
    closeDialog()
  }

  const onToggle = async (item) => {
    await api.post(`/reminders/${item.id}/toggle`)
    await load()
  }

  const onDelete = async (item) => {
    if (!window.confirm("Ushbu eslatmani o'chirmoqchimisiz?")) return
    await api.delete(`/reminders/${item.id}`)
    await load()
  }

  const remindersByDate = useMemo(() => {
    const map = new Map()
    for (const r of items) {
      const arr = map.get(r.remind_date) || []
      arr.push(r)
      map.set(r.remind_date, arr)
    }
    return map
  }, [items])

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>🗓️ Eslatmalarim</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Kalendar bo'yicha muhim ishlarni belgilash
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddToday}>
          + Yangi eslatma
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(320px, 420px) 1fr', gap: 12 }}>
        {/* CHAP: kalendar */}
        <div>
          <Calendar
            monthStart={monthStart}
            setMonthStart={setMonthStart}
            today={today}
            remindersByDate={remindersByDate}
            onDayClick={openForDate}
          />
          <Legend />
        </div>

        {/* O'NG: ro'yxat */}
        <div>
          <div className="card" style={{ padding: 8, marginBottom: 10, display: 'flex', gap: 6, flexWrap: 'wrap' }}>
            <FilterBtn active={filter === 'all'} onClick={() => setFilter('all')}>Barchasi</FilterBtn>
            <FilterBtn active={filter === 'active'} onClick={() => setFilter('active')}>Faol</FilterBtn>
            <FilterBtn active={filter === 'completed'} onClick={() => setFilter('completed')}>Bajarilgan</FilterBtn>
            <span style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--text-muted)', alignSelf: 'center' }}>
              {items.length} ta
            </span>
          </div>

          {loading ? (
            <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
              Yuklanmoqda...
            </div>
          ) : items.length === 0 ? (
            <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
              Eslatmalar yo'q. Kalendarda kunni bosib qo'shing.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {items.map(item => (
                <ReminderItem key={item.id} item={item}
                  onEdit={openEdit} onToggle={onToggle} onDelete={onDelete} />
              ))}
            </div>
          )}
        </div>
      </div>

      {dialog && (
        <ReminderDialog
          dialog={dialog}
          onClose={closeDialog}
          onSave={onSave}
          onDelete={dialog.mode === 'edit' ? () => onDelete(dialog.item) : null}
        />
      )}
    </div>
  )
}


/* -------------------------- Kalendar ---------------------------------- */

function Calendar({ monthStart, setMonthStart, today, remindersByDate, onDayClick }) {
  const y = monthStart.getFullYear()
  const m = monthStart.getMonth()

  // Oyning birinchi kunini haftaning kunidan boshlab (Du - Ya) hisoblaymiz
  const firstWeekDay = (monthStart.getDay() + 6) % 7  // 0 = Du
  const daysInMonth = new Date(y, m + 1, 0).getDate()
  const prevMonthDays = new Date(y, m, 0).getDate()

  // 6x7 grid hosil qilamiz (o'tgan/kelasi oy kunlari bilan)
  const cells = []
  for (let i = 0; i < firstWeekDay; i++) {
    cells.push({ date: new Date(y, m - 1, prevMonthDays - firstWeekDay + i + 1), out: true })
  }
  for (let d = 1; d <= daysInMonth; d++) {
    cells.push({ date: new Date(y, m, d), out: false })
  }
  while (cells.length % 7 !== 0 || cells.length < 42) {
    const last = cells[cells.length - 1].date
    cells.push({ date: new Date(last.getFullYear(), last.getMonth(), last.getDate() + 1), out: true })
    if (cells.length >= 42) break
  }

  const changeMonth = (delta) => {
    setMonthStart(new Date(y, m + delta, 1))
  }
  const goToday = () => {
    const t = new Date(); t.setDate(1); t.setHours(0,0,0,0)
    setMonthStart(t)
  }

  return (
    <div className="card" style={{ padding: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
        <button className="btn btn-outline btn-sm" onClick={() => changeMonth(-1)}>‹</button>
        <div style={{ fontSize: 15, fontWeight: 700 }}>
          {UZ_MONTHS[m]} {y}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className="btn btn-outline btn-sm" onClick={goToday}>Bugun</button>
          <button className="btn btn-outline btn-sm" onClick={() => changeMonth(1)}>›</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 3 }}>
        {UZ_WEEK.map((w, i) => (
          <div key={w} style={{
            fontSize: 11, textAlign: 'center', fontWeight: 600,
            color: i >= 5 ? '#ef4444' : 'var(--text-muted)',
            padding: '6px 0',
          }}>{w}</div>
        ))}
        {cells.map((c, i) => {
          const dateStr = isoDate(c.date)
          const isToday = dateStr === isoDate(today)
          const dayReminders = remindersByDate.get(dateStr) || []
          const activeReminders = dayReminders.filter(r => !r.is_completed)
          const isWeekend = i % 7 >= 5

          // Sanaga tegishli eng "tez" muddatga qarab rang
          let dot = null
          if (activeReminders.length > 0) {
            const minDays = Math.min(...activeReminders.map(r => r.days_left))
            dot = colorForDays(minDays)
          }

          return (
            <button key={i}
              onClick={() => !c.out && onDayClick(dateStr)}
              disabled={c.out}
              style={{
                position: 'relative',
                aspectRatio: '1 / 1',
                background: isToday ? 'var(--accent-soft, rgba(99,102,241,0.15))' : 'transparent',
                border: `1px solid ${isToday ? 'var(--accent, #6366f1)' : 'transparent'}`,
                borderRadius: 6,
                cursor: c.out ? 'default' : 'pointer',
                color: c.out ? 'var(--text-muted)' : (isWeekend ? '#ef4444' : 'var(--text)'),
                opacity: c.out ? 0.35 : 1,
                fontSize: 13,
                fontWeight: isToday ? 700 : 400,
                padding: 0,
                transition: 'all 0.15s',
              }}
              onMouseEnter={e => { if (!c.out) e.currentTarget.style.background = 'var(--bg-input, rgba(255,255,255,0.05))' }}
              onMouseLeave={e => {
                e.currentTarget.style.background = isToday ? 'var(--accent-soft, rgba(99,102,241,0.15))' : 'transparent'
              }}
            >
              {c.date.getDate()}
              {dot && (
                <span style={{
                  position: 'absolute', bottom: 3, left: '50%', transform: 'translateX(-50%)',
                  width: 6, height: 6, borderRadius: 3, background: dot,
                  boxShadow: `0 0 4px ${dot}`,
                }} />
              )}
              {activeReminders.length > 1 && (
                <span style={{
                  position: 'absolute', top: 2, right: 3,
                  fontSize: 9, fontWeight: 700, color: dot || 'var(--text-muted)',
                }}>×{activeReminders.length}</span>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}


/* -------------------------- Reminder item ----------------------------- */

function ReminderItem({ item, onEdit, onToggle, onDelete }) {
  const color = item.is_completed ? '#64748b' : colorForDays(item.days_left)
  const daysText = daysText_(item.days_left, item.is_completed)

  return (
    <div className="card" style={{
      padding: '12px 14px',
      display: 'flex',
      alignItems: 'flex-start',
      gap: 12,
      borderLeft: `4px solid ${color}`,
      opacity: item.is_completed ? 0.6 : 1,
      transition: 'all 0.15s',
    }}>
      {/* Checkbox */}
      <button
        onClick={() => onToggle(item)}
        title={item.is_completed ? "Bekor qilish" : "Bajarildi"}
        style={{
          background: item.is_completed ? '#10b981' : 'transparent',
          color: item.is_completed ? '#fff' : color,
          border: `2px solid ${color}`,
          borderRadius: 6,
          width: 22, height: 22, minWidth: 22,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', marginTop: 2,
          fontSize: 12, fontWeight: 700, lineHeight: 1,
        }}
      >
        {item.is_completed && '✓'}
      </button>

      {/* Ma'lumot */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 13, fontWeight: 600, color: 'var(--text)',
          textDecoration: item.is_completed ? 'line-through' : 'none',
          whiteSpace: 'pre-wrap', wordBreak: 'break-word',
        }}>
          {item.message}
        </div>
        <div style={{
          fontSize: 11, marginTop: 4, display: 'flex', gap: 8, flexWrap: 'wrap',
        }}>
          <span style={{ color: 'var(--text-muted)' }}>📅 {formatDate(item.remind_date)}</span>
          <span style={{ color, fontWeight: 600 }}>{daysText}</span>
          {!item.is_completed && item.notify_interval_label && (
            <span style={{ color: 'var(--text-muted)' }}>🔔 {item.notify_interval_label}</span>
          )}
        </div>
        {item.files && item.files.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 6 }}>
            {item.files.map(f => (
              <a key={f.id} href={`${api.defaults.baseURL}${f.download_url}`}
                target="_blank" rel="noopener noreferrer"
                style={{
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                  background: 'var(--bg-input, #f1f5f9)', border: '1px solid var(--border)',
                  borderRadius: 5, padding: '3px 7px', fontSize: 10,
                  color: 'var(--accent, #6366f1)', textDecoration: 'none',
                  cursor: 'pointer',
                }}
                title={`Yuklab olish: ${f.original_name}`}
              >
                📎 {f.original_name}
              </a>
            ))}
          </div>
        )}
      </div>

      {/* Amallar */}
      <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
        <IconBtn title="Tahrirlash" onClick={() => onEdit(item)}>✏️</IconBtn>
        <IconBtn title="O'chirish" tone="danger" onClick={() => onDelete(item)}>🗑️</IconBtn>
      </div>
    </div>
  )
}


/* -------------------------- Dialog ------------------------------------ */

function ReminderDialog({ dialog, onClose, onSave, onDelete }) {
  const initial = dialog.mode === 'edit' ? dialog.item : null
  const [message, setMessage] = useState(initial?.message || '')
  const [date, setDate] = useState(initial?.remind_date || dialog.date)
  const [busy, setBusy] = useState(false)
  const [notifyInterval, setNotifyInterval] = useState(
    initial?.notify_interval !== undefined && initial?.notify_interval !== null
      ? initial.notify_interval
      : 1440
  )
  const [newFiles, setNewFiles] = useState([])
  const [existingFiles, setExistingFiles] = useState(initial?.files || [])
  const [removeFileIds, setRemoveFileIds] = useState([])

  const canSave = message.trim().length > 0 && !!date

  const addFiles = (e) => {
    const selected = Array.from(e.target.files || [])
    setNewFiles(prev => [...prev, ...selected])
    e.target.value = ''
  }

  const removeNewFile = (idx) => {
    setNewFiles(prev => prev.filter((_, i) => i !== idx))
  }

  const removeExisting = (file) => {
    setExistingFiles(prev => prev.filter(f => f.id !== file.id))
    setRemoveFileIds(prev => [...prev, file.id])
  }

  const submit = async (e) => {
    e?.preventDefault()
    if (!canSave || busy) return
    setBusy(true)
    try {
      await onSave({
        date, message: message.trim(), id: initial?.id,
        notifyInterval,
        newFiles: newFiles.length > 0 ? newFiles : null,
        removeFileIds: removeFileIds.length > 0 ? removeFileIds : null,
      })
    } catch (err) {
      const d = err.response?.data
      const msg = d?.error || d?.msg || err.message || 'Noma\'lum xato'
      const status = err.response?.status ? ` (kod: ${err.response.status})` : ' (tarmoq xatosi — token muddati tugagan bo\'lishi mumkin)'
      alert('Xatolik: ' + msg + status)
    } finally {
      setBusy(false)
    }
  }

  const formatSize = (bytes) => {
    if (!bytes) return ''
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1024 / 1024).toFixed(1) + ' MB'
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 500 }} onClick={e => e.stopPropagation()}>
        <h2>{initial ? '✏️ Eslatmani tahrirlash' : '📝 Yangi eslatma'}</h2>

        <form onSubmit={submit}>
          <div className="form-group">
            <label>Sana *</label>
            <input type="date" className="form-input" value={date}
              onChange={e => setDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Xabar *</label>
            <textarea className="form-input" rows={4} value={message}
              onChange={e => setMessage(e.target.value)}
              placeholder="Nima haqida eslatish kerak..."
              autoFocus
              onKeyDown={e => {
                if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) submit(e)
              }}
            />
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              Ctrl+Enter — tez saqlash
            </div>
          </div>

          <div className="form-group">
            <label>🔔 Ogohlantirish takrorlanishi</label>
            <select className="form-input" value={notifyInterval}
              onChange={e => setNotifyInterval(Number(e.target.value))}>
              {NOTIFY_INTERVALS.map(o => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 4 }}>
              Muddat yaqinlashganda shu oraliqda ogohlantirish beriladi
            </div>
          </div>

          <div className="form-group">
            <label>Fayllar biriktirish</label>
            <input type="file" multiple onChange={addFiles}
              style={{ fontSize: 12, color: 'var(--text-muted)' }} />

            {(existingFiles.length > 0 || newFiles.length > 0) && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {existingFiles.map(f => (
                  <span key={f.id} className="report-file-chip" style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--bg-input, #f1f5f9)', border: '1px solid var(--border)',
                    borderRadius: 6, padding: '4px 8px', fontSize: 11,
                  }}>
                    📎 {f.original_name}
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      ({formatSize(f.file_size)})
                    </span>
                    <button type="button" onClick={() => removeExisting(f)} style={{
                      background: 'none', border: 'none', color: '#ef4444',
                      cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1,
                    }}>×</button>
                  </span>
                ))}
                {newFiles.map((f, i) => (
                  <span key={`new-${i}`} style={{
                    display: 'inline-flex', alignItems: 'center', gap: 4,
                    background: 'var(--accent-soft, rgba(99,102,241,0.1))', border: '1px solid var(--accent, #6366f1)',
                    borderRadius: 6, padding: '4px 8px', fontSize: 11,
                  }}>
                    📄 {f.name}
                    <span style={{ color: 'var(--text-muted)', fontSize: 10 }}>
                      ({formatSize(f.size)})
                    </span>
                    <button type="button" onClick={() => removeNewFile(i)} style={{
                      background: 'none', border: 'none', color: '#ef4444',
                      cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1,
                    }}>×</button>
                  </span>
                ))}
              </div>
            )}
          </div>

          <div className="modal-actions" style={{ justifyContent: 'space-between' }}>
            {onDelete ? (
              <button type="button" className="btn btn-danger" onClick={onDelete}>
                O'chirish
              </button>
            ) : <span />}
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn btn-outline" onClick={onClose}>Bekor</button>
              <button type="submit" className="btn btn-primary" disabled={!canSave || busy}>
                {busy ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  )
}


/* -------------------------- Yordamchi komponentlar --------------------- */

function FilterBtn({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? 'var(--accent, #6366f1)' : 'transparent',
        color: active ? '#fff' : 'var(--text)',
        border: `1px solid ${active ? 'var(--accent, #6366f1)' : 'var(--border)'}`,
        borderRadius: 6, padding: '5px 12px',
        fontSize: 12, fontWeight: 500, cursor: 'pointer',
      }}
    >
      {children}
    </button>
  )
}

function IconBtn({ children, onClick, title, tone }) {
  const color = tone === 'danger' ? '#ef4444' : 'var(--text-muted)'
  return (
    <button onClick={onClick} title={title}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 6, padding: '4px 8px',
        cursor: 'pointer', fontSize: 13, color,
      }}
    >
      {children}
    </button>
  )
}

function Legend() {
  // Gradient yo'nalishi colorForDays bilan mos: chapda muddati o'tgan (qizil),
  // o'ngda uzoq muddat (yashil)
  const stops = [0, 25, 50, 75, 100]
    .map(p => `hsl(${Math.round((p / 100) * 120)}, 85%, 45%)`)
    .join(', ')

  return (
    <div className="card" style={{ marginTop: 10, padding: 10 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
        Rang tavsifi
      </div>

      <div style={{
        height: 8, borderRadius: 4, marginBottom: 6,
        background: `linear-gradient(to right, ${stops})`,
      }} />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 10, color: 'var(--text-muted)' }}>
        <span>Muddat yaqin</span>
        <span>{COLOR_MAX_DAYS}+ kun</span>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginTop: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: 'hsl(0, 85%, 38%)' }} />
          <span>Muddati o‘tgan</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 12 }}>
          <span style={{ width: 12, height: 12, borderRadius: 3, background: '#64748b' }} />
          <span>Bajarilgan</span>
        </div>
      </div>
    </div>
  )
}


/* -------------------------- Utillar ----------------------------------- */

// Muddat yaqinlashgan sari rang yashildan qizilga silliq o'zgaradi.
// HSL rang doirasida hue 120° (yashil) -> 0° (qizil) oralig'ida interpolyatsiya.
const COLOR_MAX_DAYS = 30  // shundan uzoq muddat — to'liq yashil

function colorForDays(days) {
  if (days === null || days === undefined) return '#64748b'
  if (days < 0) return 'hsl(0, 85%, 38%)'  // muddati o'tgan — to'q qizil
  const t = Math.min(days, COLOR_MAX_DAYS) / COLOR_MAX_DAYS  // 0..1
  const hue = t * 120  // 0 = qizil, 120 = yashil
  return `hsl(${Math.round(hue)}, 85%, 45%)`
}

function daysText_(days, completed) {
  if (completed) return '✓ Bajarilgan'
  if (days === null || days === undefined) return ''
  if (days < 0) return `Muddati o‘tgan (${Math.abs(days)} kun)`
  if (days === 0) return 'Bugun!'
  if (days === 1) return 'Ertaga'
  if (days <= 5) return `${days} kun qoldi`
  return `${days} kun qoldi`
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'short' })
}
