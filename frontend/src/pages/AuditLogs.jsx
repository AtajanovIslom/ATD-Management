import { useEffect, useState, useCallback } from 'react'
import api from '../api/axios'
import { useI18n } from '../i18n'

// Amal turlarining rangi va belgisi — matni `audit.action.*` kalitlaridan olinadi
const ACTION_STYLES = {
  create: { color: '#10b981', icon: '➕' },
  update: { color: '#3b82f6', icon: '✏️' },
  delete: { color: '#ef4444', icon: '🗑️' },
  assign: { color: '#8b5cf6', icon: '📌' },
  approve: { color: '#10b981', icon: '✔️' },
  return: { color: '#f59e0b', icon: '↩' },
  reject: { color: '#ef4444', icon: '❌' },
  set_role: { color: '#8b5cf6', icon: '🔑' },
  login: { color: '#64748b', icon: '🔓' },
  submit_review: { color: '#3b82f6', icon: '📤' },
}

// Obyekt turlarining belgisi — matni `audit.entity.*` kalitlaridan olinadi
const ENTITY_ICONS = {
  user: '👤',
  department: '🏢',
  division: '📁',
  team: '👥',
  project: '🚀',
  project_stage: '📦',
  task: '📝',
  work_log: '📓',
  reminder: '🗓️',
  service_department: '🧩',
  service_type: '🧩',
  interactive_request: '📥',
  role: '🔑',
}

export default function AuditLogs() {
  const { t, formatDateTime } = useI18n()
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

  // Kod uchun tarjima topilmasa kodning o'zi ko'rsatiladi
  const actionText = (code) => {
    const key = `audit.action.${code}`
    return t(key) === key ? code : t(key)
  }
  const entityText = (code) => {
    const key = `audit.entity.${code}`
    const label = t(key) === key ? code : t(key)
    const icon = ENTITY_ICONS[code]
    return icon ? `${icon} ${label}` : label
  }
  const fmt = (iso) => formatDateTime(iso, {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  }) || '—'

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>📋 {t('audit.title')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
            {t('audit.subtitle')}
          </p>
        </div>
        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
          {t('audit.totalRecords', { n: total })}
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
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('audit.search')}</label>
            <input className="form-input" placeholder={t('audit.search.placeholder')}
              value={filters.q}
              onChange={e => changeFilter('q', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('audit.entityType')}</label>
            <select className="form-input" value={filters.entity_type}
              onChange={e => changeFilter('entity_type', e.target.value)}>
              <option value="">{t('btn.all')}</option>
              {facets.entity_types.map(et => (
                <option key={et} value={et}>{entityText(et)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('audit.action')}</label>
            <select className="form-input" value={filters.action}
              onChange={e => changeFilter('action', e.target.value)}>
              <option value="">{t('btn.all')}</option>
              {facets.actions.map(a => (
                <option key={a} value={a}>{actionText(a)}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('reports.dateFrom')}</label>
            <input type="datetime-local" className="form-input"
              value={filters.from}
              onChange={e => changeFilter('from', e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('reports.dateTo')}</label>
            <input type="datetime-local" className="form-input"
              value={filters.to}
              onChange={e => changeFilter('to', e.target.value)} />
          </div>
          <button className="btn btn-outline btn-sm" onClick={clearFilters}
            style={{ height: 38 }}>
            {t('btn.reset')}
          </button>
        </div>
      </div>

      {/* Jadval */}
      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            {t('state.loading')}
          </div>
        ) : items.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
            {t('audit.noRecords')}
          </div>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th style={{ width: 140 }}>{t('audit.th.time')}</th>
                  <th>{t('audit.th.who')}</th>
                  <th style={{ width: 140 }}>{t('audit.action')}</th>
                  <th style={{ width: 160 }}>{t('audit.entityType')}</th>
                  <th>{t('audit.th.entity')}</th>
                  <th>{t('field.comment')}</th>
                  <th style={{ width: 100 }}>IP</th>
                </tr>
              </thead>
              <tbody>
                {items.map(it => {
                  const a = ACTION_STYLES[it.action] || { color: 'var(--text-muted)', icon: '•' }
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
                          {a.icon} {actionText(it.action)}
                        </span>
                      </td>
                      <td style={{ fontSize: 12 }}>{entityText(it.entity_type)}</td>
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
            ← {t('audit.prev')}
          </button>
          <span style={{ padding: '6px 12px', fontSize: 13, color: 'var(--text-muted)' }}>
            {currentPage} / {totalPages}
          </span>
          <button className="btn btn-outline btn-sm"
            disabled={offset + limit >= total}
            onClick={() => setOffset(offset + limit)}>
            {t('audit.next')} →
          </button>
        </div>
      )}
    </div>
  )
}

