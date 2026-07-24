import { useEffect, useState, useCallback } from 'react'
import api from '../api/axios'

const ACTION_LABELS = {
  create: { label: 'Yaratish', color: '#10b981', icon: '➕' },
  update: { label: 'Tahrirlash', color: '#3b82f6', icon: '✏️' },
  delete: { label: "O'chirish", color: '#ef4444', icon: '🗑️' },
  assign: { label: 'Biriktirish', color: '#8b5cf6', icon: '📌' },
  approve: { label: 'Tasdiqlash', color: '#10b981', icon: '✔️' },
  return: { label: 'Qaytarish', color: '#f59e0b', icon: '↩' },
  reject: { label: 'Rad etish', color: '#ef4444', icon: '❌' },
  set_role: { label: 'Rol berish', color: '#8b5cf6', icon: '🔑' },
  login: { label: 'Kirish', color: '#64748b', icon: '🔓' },
  submit_review: { label: 'Bajarildi', color: '#3b82f6', icon: '📤' },
}

const ENTITY_LABELS = {
  user: '👤 Foydalanuvchi',
  department: '🏢 Boshqarma',
  division: '📁 Bo\'lim',
  team: '👥 Guruh',
  project: '🚀 Loyiha',
  project_stage: '📦 Loyiha bosqichi',
  task: '📝 Vazifa',
  work_log: '📓 Kunlik hisobot',
  reminder: '🗓️ Eslatma',
  service_department: '🧩 Xizmat bo\'limi',
  service_type: '🧩 Xizmat turi',
  interactive_request: '📥 Interaktiv ariza',
  role: '🔑 Rol',
}

export default function AuditLogs() {
  const [items, setItems] = useState([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [facets, setFacets] = useState({ entity_types: [], actions: [] })
  const [filters, setFilters] = useState({
    entity_type: '', action: '', q: '', from: '', to: '',
  })
  const [offset, setOffset] = useState(0)
  const limit = 50

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (filters.entity_type) params.set('entity_type', filters.entity_type)
      if (filters.action) params.set('action', filters.action)
      if (filters.q) params.set('q', filters.q)
      if (filters.from) params.set('from', filters.from)
      if (filters.to) params.set('to', filters.to)
      params.set('limit', limit)
      params.set('offset', offset)
      const res = await api.get('/audit-logs?' + params.toString())
      setItems(res.data.items)
      setTotal(res.data.total)
    } finally {
      setLoading(false)
    }
  }, [filters, offset])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    api.get('/audit-logs/facets').then(r => setFacets(r.data)).catch(() => {})
  }, [])

  const changeFilter = (k, v) => {
    setOffset(0)
    setFilters(f => ({ ...f, [k]: v }))
  }

  const clearFilters = () => {
    setOffset(0)
    setFilters({ entity_type: '', action: '', q: '', from: '', to: '' })
  }

  const totalPages = Math.max(1, Math.ceil(total / limit))
  const currentPage = Math.floor(offset / limit) + 1

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>📋 Audit jurnali</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            Loyihada bajarilgan barcha muhim amallar tarixi
          </p>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          Jami: <strong style={{ color: 'var(--text)' }}>{total}</strong> ta yozuv
        </div>
      </div>

      {/* Filterlar */}
      <div className="card" style={{ marginBottom: 12 }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
          gap: 10, alignItems: 'end',
        }}>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Qidiruv</label>
            <input className="form-input" placeholder="ism, obyekt yoki izoh"
              value={filters.q}
              onChange={e => changeFilter('q', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Obyekt turi</label>
            <select className="form-input" value={filters.entity_type}
              onChange={e => changeFilter('entity_type', e.target.value)}>
              <option value="">Barchasi</option>
              {facets.entity_types.map(et => (
                <option key={et} value={et}>{ENTITY_LABELS[et] || et}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Amal</label>
            <select className="form-input" value={filters.action}
              onChange={e => changeFilter('action', e.target.value)}>
              <option value="">Barchasi</option>
              {facets.actions.map(a => (
                <option key={a} value={a}>{ACTION_LABELS[a]?.label || a}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sanadan</label>
            <input type="datetime-local" className="form-input"
              value={filters.from}
              onChange={e => changeFilter('from', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>Sanagacha</label>
            <input type="datetime-local" className="form-input"
              value={filters.to}
              onChange={e => changeFilter('to', e.target.value)} />
          </div>
          <button className="btn btn-outline btn-sm" onClick={clearFilters}
            style={{ height: 38 }}>
            Tozalash
          </button>
        </div>
      </div>

      {/* Jadval */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Yuklanmoqda...
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            Yozuvlar topilmadi
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>Vaqt</th>
                  <th>Kim</th>
                  <th style={{ width: 140 }}>Amal</th>
                  <th style={{ width: 160 }}>Obyekt turi</th>
                  <th>Obyekt</th>
                  <th>Izoh</th>
                  <th style={{ width: 100 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const a = ACTION_LABELS[it.action] || { label: it.action, color: 'var(--text-muted)', icon: '•' }
                  return (
                    <tr key={it.id}>
                      <td style={{ fontSize: 11, whiteSpace: 'nowrap' }}>{fmt(it.created_at)}</td>
                      <td>
                        <div style={{ fontWeight: 500, fontSize: 13 }}>{it.user_name || '—'}</div>
                        {it.user_role && (
                          <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{it.user_role}</div>
                        )}
                      </td>
                      <td>
                        <span style={{
                          fontSize: 11, fontWeight: 600,
                          padding: '2px 8px', borderRadius: 4,
                          background: a.color + '20', color: a.color, whiteSpace: 'nowrap',
                        }}>
                          {a.icon} {a.label}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{ENTITY_LABELS[it.entity_type] || it.entity_type}</td>
                      <td style={{ fontSize: 12 }}>
                        {it.entity_label || (it.entity_id ? `#${it.entity_id}` : '—')}
                      </td>
                      <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>{it.details || '—'}</td>
                      <td style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace' }}>
                        {it.ip_address || '—'}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Paginatsiya */}
      {total > limit && (
        <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
          <button className="btn btn-outline btn-sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - limit))}>
            ← Oldingi
          </button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
            {currentPage} / {totalPages}
          </span>
          <button className="btn btn-outline btn-sm"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}>
            Keyingi →
          </button>
        </div>
      )}
    </div>
  )
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('uz-UZ', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}
