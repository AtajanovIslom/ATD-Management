import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

/**
 * Xodimning kunlik ish hisoboti sahifasi.
 *  - Bir yoki bir nechta hisobotni jadval ko'rinishida bir martada saqlaydi
 *  - Har birini loyiha, vazifa yoki (huquqi bo'lsa) interaktiv arizaga biriktiradi
 *  - Sana bo'yicha saqlanadi, tahrirlash/o'chirish mumkin, sana oralig'i filtri
 */
const today = () => new Date().toISOString().slice(0, 10)

export default function WorkLogs() {
  const { user, isDeptAdmin } = useAuth()
  const canInteractive = isDeptAdmin || user?.division_is_service_provider

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

  const refPayload = (ref) => ({
    project_id: ref.type === 'project' ? ref.id : null,
    task_id: ref.type === 'task' ? ref.id : null,
    interactive_request_id: ref.type === 'interactive' ? ref.id : null,
  })

  // Bir nechta qatorni bir martada saqlash
  const onSaveBatch = async (rows) => {
    const items = rows
      .filter(r => r.content.trim())
      .map(r => ({ work_date: r.work_date, content: r.content.trim(), ...refPayload(r.ref) }))
    if (items.length === 0) return
    await api.post('/work-logs/batch', { items })
    await load()
    setDialog(null)
  }

  const onSaveSingle = async ({ id, work_date, content, ref }) => {
    await api.put(`/work-logs/${id}`, { work_date, content, ...refPayload(ref) })
    await load()
    setDialog(null)
  }

  const onDelete = async (item) => {
    if (!window.confirm("Ushbu hisobotni o'chirmoqchimisiz?")) return
    await api.delete(`/work-logs/${item.id}`)
    await load()
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>📓 Kunlik hisobotim</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Bajargan ishlaringizni sana bo'yicha yozib boring
          </p>
        </div>
        <button className="btn btn-primary" onClick={() => setDialog({ mode: 'add' })}>
          + Yangi hisobot
        </button>
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 12, display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Dan</label>
          <input type="date" className="form-input" value={range.from}
            onChange={e => setRange({ ...range, from: e.target.value })} />
        </div>
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Gacha</label>
          <input type="date" className="form-input" value={range.to}
            onChange={e => setRange({ ...range, to: e.target.value })} />
        </div>
        {(range.from || range.to) && (
          <button className="btn btn-outline btn-sm" onClick={() => setRange({ from: '', to: '' })}>Tozalash</button>
        )}
      </div>

      {loading ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Yuklanmoqda...</div>
      ) : logs.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Hisobot yo'q. "+ Yangi hisobot" bilan qo'shing.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {logs.map(w => (
            <div key={w.id} className="card" style={{ padding: '12px 14px', display: 'flex', gap: 12, alignItems: 'flex-start' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>{w.content}</div>
                <div style={{ fontSize: 11, marginTop: 6, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                  <span style={{ color: 'var(--text-muted)' }}>📅 {formatDate(w.work_date)}</span>
                  {w.ref_label && w.ref_label !== '—' && (
                    <span style={{ color: 'var(--accent, #6366f1)', fontWeight: 600 }}>
                      {w.project_name ? '🚀 ' : w.task_name ? '📝 ' : '🧩 '}
                      {w.project_name || w.task_name || w.interactive_label}
                    </span>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                <button className="btn btn-outline btn-sm" onClick={() => setDialog({ mode: 'edit', item: w })}>✏️</button>
                <button className="btn btn-danger btn-sm" onClick={() => onDelete(w)}>🗑️</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {dialog?.mode === 'add' && (
        <BatchDialog
          projects={projects} tasks={tasks} interactiveReqs={interactiveReqs} canInteractive={canInteractive}
          onClose={() => setDialog(null)} onSave={onSaveBatch}
        />
      )}
      {dialog?.mode === 'edit' && (
        <EditDialog
          item={dialog.item}
          projects={projects} tasks={tasks} interactiveReqs={interactiveReqs} canInteractive={canInteractive}
          onClose={() => setDialog(null)} onSave={onSaveSingle}
        />
      )}
    </div>
  )
}


/* ---- Interaktiv ariza uchun ko'rinadigan nom ---- */
function interactiveName(r) {
  const types = (r.types || []).map(t => t.name).join(', ')
  return types || r.tracking_id || `#${r.id}`
}

/* ---- Bitta qator uchun ref (loyiha/vazifa/interaktiv) tanlash ---- */
function RefPicker({ sel, setRef, projects, tasks, interactiveReqs, canInteractive, compact }) {
  const options = sel.type === 'project' ? projects
    : sel.type === 'task' ? tasks
    : interactiveReqs
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      <select className="form-input" style={{ maxWidth: compact ? 130 : 160 }}
        value={sel.type} onChange={e => setRef({ type: e.target.value, id: '' })}>
        <option value="project">🚀 Loyiha</option>
        <option value="task">📝 Vazifa</option>
        {canInteractive && <option value="interactive">🧩 Interaktiv</option>}
      </select>
      <select className="form-input" style={{ flex: 1, minWidth: 140 }}
        value={sel.id} onChange={e => setRef({ ...sel, id: e.target.value })}>
        <option value="">— Tanlang (ixtiyoriy) —</option>
        {options.map(o => (
          <option key={o.id} value={o.id}>
            {sel.type === 'interactive' ? interactiveName(o) : o.name}
          </option>
        ))}
      </select>
    </div>
  )
}


/* ---- Ko'p qatorli (jadval) yangi hisobot dialogi ---- */
function BatchDialog({ projects, tasks, interactiveReqs, canInteractive, onClose, onSave }) {
  const emptyRow = () => ({ work_date: today(), content: '', ref: { type: 'project', id: '' } })
  const [rows, setRows] = useState([emptyRow()])
  const [busy, setBusy] = useState(false)

  const updateRow = (i, patch) => setRows(rows.map((r, idx) => idx === i ? { ...r, ...patch } : r))
  const addRow = () => setRows([...rows, emptyRow()])
  const removeRow = (i) => setRows(rows.length > 1 ? rows.filter((_, idx) => idx !== i) : rows)

  const canSave = useMemo(() => rows.some(r => r.content.trim()), [rows])

  const submit = async () => {
    if (!canSave || busy) return
    setBusy(true)
    try { await onSave(rows) }
    catch (err) { alert(err.response?.data?.error || 'Xatolik') }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 760 }} onClick={e => e.stopPropagation()}>
        <h2>📓 Yangi kunlik hisobot</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Bir nechta hisobotni bir martada saqlashingiz mumkin — pastdagi "+ Qator qo'shish" bilan
        </p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: '55vh', overflowY: 'auto' }}>
          {rows.map((r, i) => (
            <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 8, padding: 10 }}>
              <div style={{ display: 'flex', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text-muted)' }}>{i + 1}</span>
                <input type="date" className="form-input" style={{ maxWidth: 160 }}
                  value={r.work_date} onChange={e => updateRow(i, { work_date: e.target.value })} />
                <div style={{ flex: 1 }}>
                  <RefPicker sel={r.ref} setRef={(ref) => updateRow(i, { ref })}
                    projects={projects} tasks={tasks} interactiveReqs={interactiveReqs} canInteractive={canInteractive} compact />
                </div>
                {rows.length > 1 && (
                  <button type="button" className="btn btn-danger btn-sm" onClick={() => removeRow(i)}>✕</button>
                )}
              </div>
              <textarea className="form-input" rows={2} value={r.content}
                onChange={e => updateRow(i, { content: e.target.value })}
                placeholder="Bajarilgan ish..." />
            </div>
          ))}
        </div>

        <button type="button" className="btn btn-outline btn-sm" onClick={addRow} style={{ marginTop: 8 }}>
          + Qator qo'shish
        </button>

        <div className="modal-actions" style={{ marginTop: 14 }}>
          <button type="button" className="btn btn-outline" onClick={onClose}>Bekor</button>
          <button type="button" className="btn btn-primary" disabled={!canSave || busy} onClick={submit}>
            {busy ? 'Saqlanmoqda...' : 'Barchasini saqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* ---- Bitta hisobotni tahrirlash dialogi ---- */
function EditDialog({ item, projects, tasks, interactiveReqs, canInteractive, onClose, onSave }) {
  const [workDate, setWorkDate] = useState(item.work_date || today())
  const [content, setContent] = useState(item.content || '')
  const [ref, setRef] = useState(
    item.project_id ? { type: 'project', id: String(item.project_id) }
      : item.task_id ? { type: 'task', id: String(item.task_id) }
      : item.interactive_request_id ? { type: 'interactive', id: String(item.interactive_request_id) }
      : { type: 'project', id: '' }
  )
  const [busy, setBusy] = useState(false)
  const canSave = content.trim().length > 0 && !!workDate

  const submit = async (e) => {
    e?.preventDefault()
    if (!canSave || busy) return
    setBusy(true)
    try {
      await onSave({
        id: item.id, work_date: workDate, content: content.trim(),
        ref: { type: ref.type, id: ref.id ? parseInt(ref.id) : null },
      })
    } catch (err) { alert(err.response?.data?.error || 'Xatolik') }
    finally { setBusy(false) }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <h2>✏️ Hisobotni tahrirlash</h2>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Sana *</label>
            <input type="date" className="form-input" value={workDate}
              onChange={e => setWorkDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>Bajarilgan ish *</label>
            <textarea className="form-input" rows={4} value={content}
              onChange={e => setContent(e.target.value)} autoFocus />
          </div>
          <div className="form-group">
            <label>Qaysi ishga tegishli</label>
            <RefPicker sel={ref} setRef={setRef}
              projects={projects} tasks={tasks} interactiveReqs={interactiveReqs} canInteractive={canInteractive} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Bekor</button>
            <button type="submit" className="btn btn-primary" disabled={!canSave || busy}>
              {busy ? 'Saqlanmoqda...' : 'Saqlash'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric', weekday: 'short' })
}
