import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'

/**
 * Xodimning kunlik ish hisoboti sahifasi.
 *
 * Kunlik hisobot mazmuni:
 *   — Bir kun uchun BITTA hisobot yoziladi.
 *   — Hisobot ichida shu kunlik bajarilgan vazifa/loyiha/interaktiv arizalar
 *     tanlanadi va oxirida izoh matni qo'shiladi.
 *   — Bularning barchasi bitta matn ko'rinishida rahbarga yuboriladi.
 *   — Rahbar tomonidan tasdiqlash talab qilinmaydi; hisobotni har doim
 *     tahrirlash mumkin.
 *
 * Bajarilgan vazifa va loyihalar ro'yxati bu sahifada emas, alohida
 * "Vazifalar" va "Loyihalar" bo'limlarida ko'riladi.
 */
const today = () => new Date().toISOString().slice(0, 10)

export default function WorkLogs() {
  const { user, isDeptAdmin } = useAuth()
  const { t, formatDate: fmtDate } = useI18n()
  const canInteractive = isDeptAdmin || user?.division_is_service_provider
  const formatDate = (iso) => fmtDate(iso, { day: '2-digit', month: 'long', year: 'numeric', weekday: 'short' })

  const [logs, setLogs] = useState([])
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [interactiveReqs, setInteractiveReqs] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState({ from: '', to: '' })
  const [dialog, setDialog] = useState(null) // { mode: 'add'|'edit', item? }

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (range.from) params.set('from', range.from)
      if (range.to) params.set('to', range.to)
      const res = await api.get('/work-logs?' + params.toString())
      setLogs(res.data)
    } finally {
      setLoading(false)
    }
  }, [range])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/projects').then(r => setProjects(r.data)).catch(() => {})
    api.get('/tasks').then(r => setTasks(Array.isArray(r.data) ? r.data : [])).catch(() => {})
    if (canInteractive) {
      api.get('/interactive-requests').then(r => setInteractiveReqs(r.data)).catch(() => {})
    }
  }, [canInteractive])

  const onSave = async ({ id, work_date, content }) => {
    if (id) {
      await api.put(`/work-logs/${id}`, { work_date, content })
    } else {
      await api.post('/work-logs', { work_date, content })
    }
    await load()
    setDialog(null)
  }

  const onDelete = async (item) => {
    if (!window.confirm(t('wl.delete.confirm'))) return
    await api.delete(`/work-logs/${item.id}`)
    await load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>📓 {t('wl.title')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {t('wl.subtitle')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setDialog({ mode: 'add' })}>
          {t('wl.add')}
        </button>
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('wl.from')}</label>
          <input type="date" className="form-input" value={range.from}
            onChange={e => setRange({ ...range, from: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{t('wl.to')}</label>
          <input type="date" className="form-input" value={range.to}
            onChange={e => setRange({ ...range, to: e.target.value })} />
        </div>
        {(range.from || range.to) && (
          <button className="btn btn-outline btn-sm" onClick={() => setRange({ from: '', to: '' })}>{t('btn.reset')}</button>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>{t('state.loading')}</div>
      ) : logs.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          {t('wl.empty')}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(w => (
            <div key={w.id} className="card" style={{
              padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start',
            }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  📅 {formatDate(w.work_date)}
                </div>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{w.content}</div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setDialog({ mode: 'edit', item: w })}>✏️</button>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(w)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog && (
        <ReportDialog
          mode={dialog.mode}
          item={dialog.item}
          projects={projects}
          tasks={tasks}
          interactiveReqs={interactiveReqs}
          canInteractive={canInteractive}
          t={t}
          onClose={() => setDialog(null)}
          onSave={onSave}
        />
      )}
    </div>
  )
}


/* ---- Interaktiv ariza uchun ko'rinadigan nom ---- */
function interactiveName(r) {
  const types = (r.types || []).map(x => x.name).join(', ')
  return types || r.tracking_id || `#${r.id}`
}


/* ---- Bitta hisobot dialogi (yaratish va tahrirlash uchun umumiy) ---- */
function ReportDialog({ mode, item, projects, tasks, interactiveReqs, canInteractive, onClose, onSave, t }) {
  const [workDate, setWorkDate] = useState(item?.work_date || today())
  const [note, setNote] = useState(mode === 'edit' ? extractNote(item?.content || '') : '')
  const [pickedTasks, setPickedTasks] = useState([])
  const [pickedProjects, setPickedProjects] = useState([])
  const [pickedInteractive, setPickedInteractive] = useState([])
  const [busy, setBusy] = useState(false)

  // Faqat aktual/faol variantlarni ko'rsatamiz (tahrirda barchasi ko'rinadi)
  const taskOptions = useMemo(() => tasks, [tasks])
  const projectOptions = useMemo(() => projects, [projects])
  const interactiveOptions = useMemo(() => interactiveReqs, [interactiveReqs])

  const toggle = (setter, list, id) => {
    setter(list.includes(id) ? list.filter(x => x !== id) : [...list, id])
  }

  const canSave = workDate && (note.trim() || pickedTasks.length || pickedProjects.length || pickedInteractive.length)

  const submit = async (e) => {
    e?.preventDefault()
    if (!canSave || busy) return
    setBusy(true)
    try {
      const content = buildContent({
        tasks: taskOptions.filter(x => pickedTasks.includes(x.id)),
        projects: projectOptions.filter(p => pickedProjects.includes(p.id)),
        interactive: interactiveOptions.filter(r => pickedInteractive.includes(r.id)),
        note: note.trim(),
      })
      if (!content.trim()) {
        alert(t('wl.err.empty'))
        setBusy(false)
        return
      }
      await onSave({ id: item?.id, work_date: workDate, content })
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 4 }}>
          {mode === 'edit' ? `✏️ ${t('wl.dialog.edit')}` : `📓 ${t('wl.dialog.add')}`}
        </h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('wl.dialog.hint')}
        </p>

        <form onSubmit={submit}>
          <div className="form-group">
            <label>{t('wl.field.date')}</label>
            <input type="date" className="form-input" style={{ maxWidth: 200 }}
              value={workDate} onChange={e => setWorkDate(e.target.value)} required />
          </div>

          <PickerBlock
            title={t('wl.picker.tasks')}
            emptyText={t('wl.picker.tasks.empty')}
            options={taskOptions}
            picked={pickedTasks}
            onToggle={(id) => toggle(setPickedTasks, pickedTasks, id)}
            renderLabel={task => task.name}
          />

          <PickerBlock
            title={t('wl.picker.projects')}
            emptyText={t('wl.picker.projects.empty')}
            options={projectOptions}
            picked={pickedProjects}
            onToggle={(id) => toggle(setPickedProjects, pickedProjects, id)}
            renderLabel={p => p.name}
          />

          {canInteractive && (
            <PickerBlock
              title={t('wl.picker.interactive')}
              emptyText={t('wl.picker.interactive.empty')}
              options={interactiveOptions}
              picked={pickedInteractive}
              onToggle={(id) => toggle(setPickedInteractive, pickedInteractive, id)}
              renderLabel={r => interactiveName(r)}
            />
          )}

          <div className="form-group">
            <label>{t('wl.field.note')}</label>
            <textarea className="form-input" rows={4} value={note}
              onChange={e => setNote(e.target.value)}
              placeholder={t('wl.field.note.placeholder')} />
          </div>

          {mode === 'edit' && item?.content && (
            <details style={{ marginBottom: 12 }}>
              <summary style={{ fontSize: 11, color: 'var(--text-muted)', cursor: 'pointer' }}>
                {t('wl.currentText')}
              </summary>
              <pre style={{
                fontSize: 12, whiteSpace: 'pre-wrap', wordBreak: 'break-word',
                background: 'var(--bg-input)', padding: 8, borderRadius: 6, marginTop: 6,
              }}>{item.content}</pre>
            </details>
          )}

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>{t('btn.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={!canSave || busy}>
              {busy ? t('btn.saving') : t('btn.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


function PickerBlock({ title, emptyText, options, picked, onToggle, renderLabel }) {
  return (
    <div className="form-group">
      <label>{title}</label>
      {options.length === 0 ? (
        <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 8 }}>{emptyText}</div>
      ) : (
        <div style={{
          display: 'flex', flexDirection: 'column', gap: 4,
          maxHeight: 160, overflowY: 'auto',
          border: '1px solid var(--border)', borderRadius: 8, padding: 6,
        }}>
          {options.map(o => (
            <label key={o.id} style={{
              display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
              cursor: 'pointer', padding: '4px 6px', borderRadius: 4,
              background: picked.includes(o.id) ? 'var(--bg-input)' : 'transparent',
            }}>
              <input type="checkbox" checked={picked.includes(o.id)}
                onChange={() => onToggle(o.id)} />
              <span style={{ color: 'var(--text-secondary)' }}>{renderLabel(o)}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  )
}


/* ---- Tanlangan elementlarni bitta text ga yig'ish ---- */
function buildContent({ tasks, projects, interactive, note }) {
  const parts = []
  if (tasks.length) {
    parts.push('📝 Vazifalar:\n' + tasks.map(x => `  • ${x.name}`).join('\n'))
  }
  if (projects.length) {
    parts.push('🚀 Loyihalar:\n' + projects.map(p => `  • ${p.name}`).join('\n'))
  }
  if (interactive.length) {
    parts.push('🧩 Interaktiv arizalar:\n' + interactive.map(r => `  • ${interactiveName(r)}`).join('\n'))
  }
  if (note) {
    parts.push('💬 Izoh:\n' + note)
  }
  return parts.join('\n\n')
}


/* ---- Tahrirlash uchun eski matndan izoh qismini ajratib olish ---- */
function extractNote(content) {
  const marker = '💬 Izoh:'
  const idx = content.indexOf(marker)
  if (idx === -1) return ''
  return content.slice(idx + marker.length).trim()
}

