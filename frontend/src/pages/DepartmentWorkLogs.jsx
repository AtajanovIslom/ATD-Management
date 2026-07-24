import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios'

/**
 * Boshqarma rahbari uchun: o'z boshqarmasi xodimlarining kunlik hisobotlari.
 *  - Sana oralig'i + xodim bo'yicha filtr
 *  - Word (.docx) yuklab olish
 */
const today = () => new Date().toISOString().slice(0, 10)

export default function DepartmentWorkLogs() {
  const [logs, setLogs] = useState([])
  const [loading, setLoading] = useState(true)
  const [range, setRange] = useState({ from: '', to: '' })
  const [userFilter, setUserFilter] = useState('')

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (range.from) params.set('from', range.from)
      if (range.to) params.set('to', range.to)
      if (userFilter) params.set('user_id', userFilter)
      const res = await api.get('/work-logs/department?' + params.toString())
      setLogs(res.data)
    } finally {
      setLoading(false)
    }
  }, [range, userFilter])

  useEffect(() => { load() }, [load])

  // Filtr uchun xodimlar ro'yxati (kelgan hisobotlardan)
  const employees = useMemo(() => {
    const map = new Map()
    for (const w of logs) {
      if (w.user_id && !map.has(w.user_id)) map.set(w.user_id, w.user_name)
    }
    return [...map.entries()].map(([id, name]) => ({ id, name }))
  }, [logs])

  const downloadWord = () => {
    const params = new URLSearchParams()
    if (range.from) params.set('from', range.from)
    if (range.to) params.set('to', range.to)
    if (userFilter) params.set('user_id', userFilter)
    const token = localStorage.getItem('token')
    fetch(`${api.defaults.baseURL}/work-logs/department/export?` + params.toString(), {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(r => r.blob())
      .then(blob => {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `boshqarma_hisobot_${today()}.docx`
        a.click()
        URL.revokeObjectURL(url)
      })
      .catch(() => alert('Yuklab olishda xatolik'))
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>👥 Xodimlar kunlik hisobotlari</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Boshqarmangiz xodimlari bajargan ishlar
          </p>
        </div>
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
        <div>
          <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>Xodim</label>
          <select className="form-input" value={userFilter} onChange={e => setUserFilter(e.target.value)}>
            <option value="">— Barchasi —</option>
            {employees.map(e => (
              <option key={e.id} value={e.id}>{e.name}</option>
            ))}
          </select>
        </div>
        {(range.from || range.to || userFilter) && (
          <button className="btn btn-outline btn-sm" onClick={() => { setRange({ from: '', to: '' }); setUserFilter('') }}>Tozalash</button>
        )}
        <button className="btn btn-outline" style={{ marginLeft: 'auto' }} onClick={downloadWord}>
          📄 Word yuklab olish
        </button>
      </div>

      {loading ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Yuklanmoqda...</div>
      ) : logs.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          Hisobot topilmadi.
        </div>
      ) : (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 110 }}>Sana</th>
                  <th style={{ width: 180 }}>Xodim</th>
                  <th style={{ width: 180 }}>Loyiha / Vazifa</th>
                  <th>Bajarilgan ish</th>
                </tr>
              </thead>
              <tbody>
                {logs.map(w => (
                  <tr key={w.id}>
                    <td style={{ fontSize: 12 }}>{formatDate(w.work_date)}</td>
                    <td style={{ fontSize: 12 }}>
                      <strong>{w.user_name}</strong>
                      {w.user_position && <div style={{ color: 'var(--text-muted)', fontSize: 11 }}>{w.user_position}</div>}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {w.ref_label && w.ref_label !== '—' ? (
                        <span>{w.project_name ? '🚀 ' : '📝 '}{w.project_name || w.task_name}</span>
                      ) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                    </td>
                    <td style={{ fontSize: 13, whiteSpace: 'pre-wrap' }}>{w.content}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}


function formatDate(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
}
