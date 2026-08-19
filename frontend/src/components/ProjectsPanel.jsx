import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import { useI18n } from '../i18n'
import ProjectCard from './ProjectCard'
import StatusTabs from './StatusTabs'
import Pagination from './Pagination'

const PER_PAGE = 12

const EMPTY_FILTER = { q: '', from: '', to: '', page: 1 }

/**
 * Boshqaruv panelidagi "Loyihalar" bo'limi.
 *
 * Har bir holat alohida oynada: Faol, Tugallangan, Bekor qilingan, Nofaol.
 * Tugallangan loyihalar bo'yicha "Boshqarmalar kesimida" ko'rinishi yoqilgan
 * bo'ladi — yakunlangan ishlar boshqarmalar bo'yicha saralanib turadi.
 */
export default function ProjectsPanel({ title }) {
  const { t } = useI18n()
  const [tab, setTab] = useState('active')
  const [filter, setFilter] = useState(EMPTY_FILTER)
  // Tugallangan oynasi boshqarmalar kesimida ochiladi
  const [byDept, setByDept] = useState(true)
  const [data, setData] = useState({ total: 0, projects: [], groups: null, pages: 1, page: 1 })
  const [counts, setCounts] = useState({})
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(true)

  const grouped = tab === 'completed' && byDept

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status: tab, per_page: PER_PAGE })
    if (grouped) params.set('group', 'department')
    Object.entries(filter).forEach(([k, v]) => {
      if (v !== '' && v != null) params.set(k, v)
    })
    try {
      const r = await api.get('/projects/browse?' + params.toString())
      setData({ groups: null, projects: [], pages: 1, page: 1, ...r.data })
    } catch {
      setData({ total: 0, projects: [], groups: null, pages: 1, page: 1 })
    } finally {
      setLoading(false)
    }
  }, [tab, grouped, filter])

  useEffect(() => { load() }, [load])

  // Oyna sarlavhalaridagi sonlar — ro'yxat yangilangach qayta o'qiladi
  // (loyiha yakunlansa son darrov o'z oynasiga ko'chsin)
  useEffect(() => {
    api.get('/projects/counts')
      .then(r => setCounts(r.data))
      .catch(() => setCounts({}))
  }, [tab])

  const setF = (patch) => setFilter(prev => ({ ...prev, ...patch, page: patch.page ?? 1 }))

  const changeTab = (value) => {
    setTab(value)
    setFilter(EMPTY_FILTER)
    setExpanded({})
  }

  const tabs = [
    { value: 'active', label: t('status.active'), count: counts.active },
    { value: 'completed', label: t('status.completed'), count: counts.completed },
    { value: 'cancelled', label: t('status.cancelled'), count: counts.cancelled },
    { value: 'inactive', label: t('status.inactive'), count: counts.inactive },
  ]

  const hasFilter = filter.q || filter.from || filter.to

  return (
    <div className="card">
      <div className="panel-head">
        <h2>🚀 {title || t('projects.title')}</h2>
        <span className="panel-head__meta">{t('dash.total', { n: data.total })}</span>
      </div>

      <StatusTabs tabs={tabs} value={tab} onChange={changeTab} />

      <div className="panel-filters">
        <input type="text" className="form-input" placeholder={t('projects.searchPlaceholder')}
          value={filter.q} onChange={e => setF({ q: e.target.value })}
          style={{ maxWidth: 260, padding: '5px 10px', fontSize: 12, flex: '0 1 260px' }} />
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('dash.dateLabel')}</span>
        <input type="date" className="form-input" value={filter.from} title={t('dash.dateFrom')}
          onChange={e => setF({ from: e.target.value })}
          style={{ maxWidth: 140, padding: '4px 8px', fontSize: 12 }} />
        <input type="date" className="form-input" value={filter.to} title={t('dash.dateTo')}
          onChange={e => setF({ to: e.target.value })}
          style={{ maxWidth: 140, padding: '4px 8px', fontSize: 12 }} />

        {tab === 'completed' && (
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, cursor: 'pointer' }}>
            <input type="checkbox" checked={byDept} onChange={e => setByDept(e.target.checked)} />
            {t('dash.group.department')}
          </label>
        )}

        {hasFilter && (
          <button className="btn btn-outline btn-sm" style={{ padding: '3px 10px', fontSize: 11 }}
            onClick={() => setFilter(EMPTY_FILTER)}>{t('btn.reset')}</button>
        )}
      </div>

      {loading ? (
        <div className="empty-state"><p>{t('state.loading')}</p></div>
      ) : data.total === 0 ? (
        <div className="empty-state"><p>{t('projects.emptyTab')}</p></div>
      ) : data.groups ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {data.groups.map(g => {
            const open = expanded[g.key] !== false  // default ochiq
            return (
              <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                <button type="button" className="panel-group-toggle"
                  onClick={() => setExpanded({ ...expanded, [g.key]: !open })}>
                  <span>🏢 {g.label}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    {t('dash.groupCount', { n: g.count })} {open ? '▲' : '▼'}
                  </span>
                </button>
                {open && (
                  <div className="project-grid" style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
                    {g.projects.map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      ) : (
        <>
          <div className="project-grid">
            {data.projects.map((p, i) => (
              <ProjectCard key={p.id} project={p} index={i + (data.page - 1) * PER_PAGE} />
            ))}
          </div>
          <Pagination page={data.page} pages={data.pages}
            onChange={(p) => setFilter(f => ({ ...f, page: p }))} />
        </>
      )}
    </div>
  )
}
