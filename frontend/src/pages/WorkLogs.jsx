import { useCallback, useEffect, useState } from 'react'
import api from '../api/axios'

/**
 * Xodimning kunlik ish hisoboti sahifasi.
 *  - Bajarilgan ishni yozadi, qaysi loyiha yoki vazifaga tegishli ekanini tanlaydi
 *  - Sana bo'yicha saqlanadi, tahrirlash/o'chirish mumkin
 *  - Sana oralig'i bo'yicha filtr + Word (.docx) yuklab olish
 */
const today = () => new Date().toISOString().slice(0, 10)

export default function WorkLogs() {
  const [logs, setLogs] = useState([])
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState({ from: '', to: '' })
  const [dialog, setDialog] = useState(null) // { mode, item? }

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
  }, [])

  const onSave = async ({ id, work_date, content, ref }) => {
    const payload = {
      work_date, content,
      project_id: ref.type === 'project' ? ref.id : null,
      task_id: ref.type === 'task' ? ref.id : null,
    }
    if (id) await api.put(`/work-logs/${id}`, payload)
    else await api.post('/work-logs', payload)
    await load()
    setDialog(null)
  }

  const onDelete = async (item) => {
    if (!window.confirm("Ushbu hisobotni o'chirmoqchimisiz?")) return
    await api.delete(`/work-logs/${item.id}`)
    await load()
  }

  const downloadWord = () => {
    const params = new URLSearchParams()
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)
    const token = localStorage.getItem('token')
    // send_file yuklab olish uchun fetch + blob (Authorization header kerak)
    fetch(`${api.defaults.baseURL}/work-logs/export?` + params.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `hisobot_${today()}.docx`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => alert('Yuklab olishda xatolik'))
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

      {/* Filtr + eksport */}
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
        <button className="btn btn-outline" style={{ marginLeft: 'auto' }} onClick={downloadWord}>
          📄 Word yuklab olish
        </button>
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
                      {w.project_name ? '🚀' : '📝'} {w.project_name || w.task_name}
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

      {dialog && (
        <WorkLogDialog
          dialog={dialog}
          projects={projects}
          tasks={tasks}
          onClose={() => setDialog(null)}
          onSave={onSave}
        />
      )}
    </div>
  )
}


function WorkLogDialog({ dialog, projects, tasks, onClose, onSave }) {
  const initial = dialog.mode === 'edit' ? dialog.item : null
  const [workDate, setWorkDate] = useState(initial?.work_date || today())
  const [content, setContent] = useState(initial?.content || '')
  const [refType, setRefType] = useState(
    initial?.project_id ? 'project' : initial?.task_id ? 'task' : 'project'
  )
  const [refId, setRefId] = useState(
    initial?.project_id ? String(initial.project_id) : initial?.task_id ? String(initial.task_id) : ''
  )
  const [busy, setBusy] = useState(false)

  const canSave = content.trim().length > 0 && !!workDate

  const submit = async (e) => {
    e?.preventDefault()
    if (!canSave || busy) return
    setBusy(true)
    try {
      await onSave({
        id: initial?.id,
        work_date: workDate,
        content: content.trim(),
        ref: { type: refType, id: refId ? parseInt(refId) : null },
      })
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  const options = refType === 'project' ? projects : tasks

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <h2>{initial ? '✏️ Hisobotni tahrirlash' : '📓 Yangi kunlik hisobot'}</h2>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>Sana *</label>
            <input type="date" className="form-input" value={workDate}
              onChange={e => setWorkDate(e.target.value)} required />
          </div>

          <div className="form-group">
            <label>Bajarilgan ish *</label>
            <textarea className="form-input" rows={4} value={content}
              onChange={e => setContent(e.target.value)}
              placeholder="Bugun nima qildingiz..." autoFocus />
          </div>

          <div className="form-group">
            <label>Qaysi ishga tegishli</label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 8 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="reftype" checked={refType === 'project'}
                  onChange={() => { setRefType('project'); setRefId('') }} />
                🚀 Loyiha
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, cursor: 'pointer' }}>
                <input type="radio" name="reftype" checked={refType === 'task'}
                  onChange={() => { setRefType('task'); setRefId('') }} />
                📝 Vazifa
              </label>
            </div>
            <select className="form-input" value={refId} onChange={e => setRefId(e.target.value)}>
              <option value="">— Tanlang (ixtiyoriy) —</option>
              {options.map(o => (
                <option key={o.id} value={o.id}>{o.name}</option>
              ))}
            </select>
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
