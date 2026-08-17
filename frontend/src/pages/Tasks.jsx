import { useState, useEffect, useCallback } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import TaskCard from '../components/TaskCard'
import StatusTabs from '../components/StatusTabs'
import Pagination from '../components/Pagination'

const PER_PAGE = 12

const EMPTY_FILTER = { q: '', from: '', to: '', group: 'none', page: 1 }

/**
 * Vazifalar sahifasi.
 *
 * Har bir holat alohida oynada: Faol (ishdagi barcha vazifalar), Tugallangan,
 * Bekor qilingan. Har oynada 12 tadan sahifalash, boshqarma yoki guruh
 * kesimida saralash mumkin.
 */
export default function Tasks() {
  const { isDeptAdmin } = useAuth()
  const { t } = useI18n()
  const [tab, setTab] = useState('active')
  const [filter, setFilter] = useState(EMPTY_FILTER)
  const [data, setData] = useState({ total: 0, tasks: [], groups: null, pages: 1, page: 1 })
  const [counts, setCounts] = useState({})
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams({ status: tab, per_page: PER_PAGE })
    Object.entries(filter).forEach(([k, v]) => {
      if (v !== '' && v != null) params.set(k, v)
    })
    try {
      const r = await api.get('/tasks/browse?' + params.toString())
      setData({ groups: null, tasks: [], pages: 1, page: 1, ...r.data })
    } catch {
      setData({ total: 0, tasks: [], groups: null, pages: 1, page: 1 })
    } finally {
      setLoading(false)
    }
  }, [tab, filter])

  useEffect(() => { load() }, [load])

  const loadCounts = useCallback(() => {
    api.get('/tasks/counts').then(r => setCounts(r.data)).catch(() => setCounts({}))
  }, [])

  useEffect(() => { loadCounts() }, [loadCounts, tab])

  const setF = (patch) => setFilter(prev => ({ ...prev, ...patch, page: patch.page ?? 1 }))

  const changeTab = (value) => {
    setTab(value)
    setFilter(EMPTY_FILTER)
    setExpanded({})
  }

  const handleDelete = async (e, task) => {
    e.stopPropagation()
    if (!window.confirm(t('dash.deleteTask.confirm', { name: task.name }))) return
    try {
      await api.delete(`/tasks/${task.id}`)
    } catch (err) {
      // 404 — boshqa rahbar allaqachon o'chirgan: ro'yxatni baribir yangilaymiz
      if (err.response?.status !== 404) {
        alert(err.response?.data?.error || t('state.error'))
        return
      }
    }
    load()
    loadCounts()
  }

  const tabs = [
    { value: 'active', label: t('status.active'), count: counts.active },
    { value: 'completed', label: t('status.completed'), count: counts.completed },
    { value: 'cancelled', label: t('status.cancelled'), count: counts.cancelled },
  ]

  const hasFilter = filter.q || filter.from || filter.to || filter.group !== 'none'

  return (
    <div>
      <div className="page-header">
        <h1>{t('tasks.title')}</h1>
        <div style={{ display: 'flex', gap: 10, fontSize: 12, flexWrap: 'wrap' }}>
          <span style={{ color: 'var(--text-muted)' }}>{t('stats.th.total')}: <strong>{data.total}</strong></span>
          {counts.review > 0 && (
            <span style={{ color: 'var(--warning)' }}>{t('dash.count.review')}: <strong>{counts.review}</strong></span>
          )}
          {counts.overdue > 0 && (
            <span style={{ color: '#ef4444' }}>{t('dash.count.overdue')}: <strong>{counts.overdue}</strong></span>
          )}
        </div>
      </div>

      <div className="card">
        <StatusTabs tabs={tabs} value={tab} onChange={changeTab} />

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <input type="text" className="form-input" placeholder={t('dash.searchPlaceholder')}
            value={filter.q} onChange={e => setF({ q: e.target.value })}
            style={{ maxWidth: 260, padding: '5px 10px', fontSize: 12, flex: '0 1 260px' }} />
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('dash.dateLabel')}</span>
          <input type="date" className="form-input" value={filter.from} title={t('dash.dateFrom')}
            onChange={e => setF({ from: e.target.value })}
            style={{ maxWidth: 140, padding: '4px 8px', fontSize: 12 }} />
          <input type="date" className="form-input" value={filter.to} title={t('dash.dateTo')}
            onChange={e => setF({ to: e.target.value })}
            style={{ maxWidth: 140, padding: '4px 8px', fontSize: 12 }} />
          <select className="form-input" value={filter.group}
            onChange={e => setF({ group: e.target.value })}
            style={{ maxWidth: 190, padding: '4px 8px', fontSize: 12 }}>
            <option value="none">{t('dash.group.none')}</option>
            <option value="department">{t('dash.group.department')}</option>
            <option value="team">{t('dash.group.team')}</option>
          </select>
          {hasFilter && (
            <button className="btn btn-outline btn-sm" style={{ padding: '3px 10px', fontSize: 11 }}
              onClick={() => setFilter(EMPTY_FILTER)}>{t('btn.reset')}</button>
          )}
        </div>

        {loading ? (
          <div className="empty-state"><p>{t('state.loading')}</p></div>
        ) : data.total === 0 ? (
          <div className="empty-state"><p>{t('dash.noTasksFound')}</p></div>
        ) : data.groups ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {data.groups.map(g => {
              const open = expanded[g.key] !== false  // default ochiq
              return (
                <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                  <button type="button"
                    onClick={() => setExpanded({ ...expanded, [g.key]: !open })}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'transparent', border: 'none', padding: '10px 12px',
                      cursor: 'pointer', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
                    }}>
                    <span>{filter.group === 'team' ? '👥' : '🏢'} {g.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('dash.groupCount', { n: g.count })} {open ? '▲' : '▼'}
                    </span>
                  </button>
                  {open && (
                    <div className="project-grid" style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
                      {g.tasks.map((task, i) => (
                        <TaskCard key={task.id} task={task} index={i}
                          onDelete={isDeptAdmin ? handleDelete : undefined} />
                      ))}
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        ) : (
          <>
            <div className="project-grid">
              {data.tasks.map((task, i) => (
                <TaskCard key={task.id} task={task} index={i + (data.page - 1) * PER_PAGE}
                  onDelete={isDeptAdmin ? handleDelete : undefined} />
              ))}
            </div>
            <Pagination page={data.page} pages={data.pages}
              onChange={(p) => setFilter(f => ({ ...f, page: p }))} />
          </>
        )}
      </div>
    </div>
  )
}
