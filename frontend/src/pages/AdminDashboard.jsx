import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { statusLabel } from '../i18n/labels'

export default function AdminDashboard() {
  const { isDeptAdmin, isAdmin } = useAuth()
  const { t, formatDate: fmtDate } = useI18n()
  const [stats, setStats] = useState(null)
  const [taskStats, setTaskStats] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [byDeptGroups, setByDeptGroups] = useState([])
  const [expandedDept, setExpandedDept] = useState({})
  const [loading, setLoading] = useState(true)

  // "Barcha vazifalar" bo'limi uchun filter/pagination — default Faol
  const [taskFilter, setTaskFilter] = useState({
    status: 'active', group: 'none', q: '', from: '', to: '', page: 1, per_page: 12,
  })
  const [browseData, setBrowseData] = useState({ total: 0, tasks: [], groups: null, pages: 1, page: 1 })
  const [expandedGroup, setExpandedGroup] = useState({})
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

  // "Barcha vazifalar" ro'yxati. loadData() bunga tegmaydi, shuning uchun
  // ro'yxatni o'zgartiradigan amallar (o'chirish) buni alohida chaqiradi —
  // aks holda o'chirilgan vazifa ekranda qolib ketadi.
  const loadBrowse = async () => {
    const params = new URLSearchParams()
    Object.entries(taskFilter).forEach(([k, v]) => {
      if (v !== '' && v !== null && v !== undefined) params.set(k, v)
    })
    try {
      const r = await api.get('/tasks/browse?' + params.toString())
      setBrowseData(r.data)
    } catch { /* ignore */ }
  }

  // Filter/pagination o'zgarganida browse ni qayta yuklaymiz
  useEffect(() => { loadBrowse() }, [taskFilter])

  const setF = (patch) => setTaskFilter(prev => ({ ...prev, ...patch, page: patch.page ?? 1 }))

  const handleDeleteTask = async (e, task) => {
    e.stopPropagation()  // kartochka klik'ini to'sish
    if (!window.confirm(t('dash.deleteTask.confirm', { name: task.name }))) return
    try {
      await api.delete(`/tasks/${task.id}`)
      loadData()
      loadBrowse()
    } catch (err) {
      // 404 — vazifani boshqa rahbar allaqachon o'chirgan. Ro'yxatni
      // moslashtiramiz, chunki foydalanuvchi ko'zlagan natija baribir shu.
      if (err.response?.status === 404) {
        loadData()
        loadBrowse()
        return
      }
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  const loadData = async () => {
    try {
      const [statsRes, projRes, taskStatsRes, tasksRes] = await Promise.all([
        api.get('/projects/stats'),
        api.get('/projects'),
        api.get('/tasks/stats'),
        api.get('/tasks'),
      ])
      setStats(statsRes.data)
      setProjects(projRes.data)
      setTaskStats(taskStatsRes.data)
      setTasks(tasksRes.data)
      // Boshqarmalar kesimida vazifalar (faqat boshqarma rahbari va yuqori,
      // bo'lim rahbari boshqa boshqarmalarni ko'rmaydi)
      if (isAdmin) {
        api.get('/tasks/by-departments').then(r => setByDeptGroups(r.data)).catch(() => {})
      }
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (iso) =>
    fmtDate(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }) || '—'

  const statusText = (s) => statusLabel(t, s)

  const statusClass = (s) => {
    if (s === 'active') return 'badge-active'
    if (s === 'in_progress') return 'badge-active'
    if (s === 'review') return 'badge-review'
    if (s === 'returned') return 'badge-on_hold'
    if (s === 'completed') return 'badge-completed'
    return 'badge-on_hold'
  }

  if (loading) return <div className="empty-state"><p>{t('state.loading')}</p></div>

  return (
    <div>
      <div className="page-header">
        <h1>{t('dash.title')}</h1>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card stat-primary">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">{t('dash.stat.totalProjects')}</div>
          </div>
          <div className="stat-card stat-warning">
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">{t('dash.stat.active')}</div>
          </div>
          <div className="stat-card stat-success">
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-label">{t('dash.stat.completed')}</div>
          </div>
          <div className="stat-card stat-info">
            <div className="stat-value">{stats.on_hold}</div>
            <div className="stat-label">{t('dash.stat.onHold')}</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 16, fontSize: 16 }}>{t('dash.allProjects')}</h2>

        {projects.length === 0 ? (
          <div className="empty-state">
            <p>{t('dash.noProjects')}</p>
          </div>
        ) : (
          <div className="project-grid">
            {projects.map((p, i) => (
              <div key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
                <div className="project-card-header">
                  <span className="project-number">#{i + 1}</span>
                  <span className={`badge ${statusClass(p.status)}`}>{statusText(p.status)}</span>
                </div>
                <h3 className="project-card-title">{p.name}</h3>
                <div className="project-card-meta">
                  <span>{t('dash.deadlineLabel')}: {formatDate(p.deadline)}</span>
                </div>
                <div className="progress-bar-wrap">
                  <div className="progress-bar">
                    <div className="progress-fill" style={{ width: `${p.progress}%` }} />
                  </div>
                  <span className="progress-text">{p.progress}%</span>
                </div>
                <div className="project-card-info">
                  <span>📦 {t('dash.stageCount', { n: p.stage_count })}</span>
                  {p.current_stage_name && <span>📍 {p.current_stage_name}</span>}
                </div>
                <div className="project-card-teams">
                  {p.teams?.map(team => (
                    <span key={team.id} className="team-chip">{team.name} ({team.member_count})</span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
      {/* Tasks section — filter + guruhlash + paginatsiya */}
      <div className="card" style={{ marginTop: 16 }}>
        {/* Yuqori qator: sarlavha | Faol/Tugallangan tugmalari | search | sonlar */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 12 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>{t('dash.allTasks')}</h2>

          {/* Status tugmalari: Faol / Tugallangan (+ Barchasi kompakt) */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[
              { v: 'active',    label: t('status.active') },
              { v: 'completed', label: t('status.completed') },
              { v: 'all',       label: t('btn.all') },
            ].map(s => (
              <button key={s.v} onClick={() => setF({ status: s.v })}
                style={{
                  padding: '4px 12px', fontSize: 12, borderRadius: 6, cursor: 'pointer',
                  background: taskFilter.status === s.v ? 'var(--accent, #6366f1)' : 'transparent',
                  color: taskFilter.status === s.v ? '#fff' : 'var(--text)',
                  border: `1px solid ${taskFilter.status === s.v ? 'var(--accent, #6366f1)' : 'var(--border)'}`,
                  fontWeight: 500,
                }}>{s.label}</button>
            ))}
          </div>

          {/* Search input */}
          <input type="text" placeholder={t('dash.searchPlaceholder')}
            value={taskFilter.q} onChange={e => setF({ q: e.target.value })}
            className="form-input" style={{ maxWidth: 240, padding: '5px 10px', fontSize: 12, flex: '0 1 240px' }} />

          {/* Sonlar o'ng chekkada */}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 10, fontSize: 12, flexWrap: 'wrap' }}>
            <span style={{ color: 'var(--text-muted)' }}>{t('stats.th.total')}: <strong>{browseData.total}</strong></span>
            {taskStats && (
              <>
                <span style={{ color: 'var(--warning)' }}>{t('dash.count.review')}: <strong>{taskStats.review}</strong></span>
                <span style={{ color: 'var(--text-muted)' }}>{t('dash.count.returned')}: <strong>{taskStats.returned}</strong></span>
                <span style={{ color: 'var(--success)' }}>{t('dash.count.completed')}: <strong>{taskStats.completed}</strong></span>
                {taskStats.overdue > 0 && <span style={{ color: '#ef4444' }}>{t('dash.count.overdue')}: <strong>{taskStats.overdue}</strong></span>}
              </>
            )}
          </div>
        </div>

        {/* Ikkinchi qator: sana oralig'i + guruhlash + tozalash (kompakt) */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{t('dash.dateLabel')}</span>
          <input type="date" value={taskFilter.from} onChange={e => setF({ from: e.target.value })}
            className="form-input" style={{ maxWidth: 140, padding: '4px 8px', fontSize: 12 }} title={t('dash.dateFrom')} />
          <input type="date" value={taskFilter.to} onChange={e => setF({ to: e.target.value })}
            className="form-input" style={{ maxWidth: 140, padding: '4px 8px', fontSize: 12 }} title={t('dash.dateTo')} />
          <select value={taskFilter.group} onChange={e => setF({ group: e.target.value })}
            className="form-input" style={{ maxWidth: 190, padding: '4px 8px', fontSize: 12 }}>
            <option value="none">{t('dash.group.none')}</option>
            <option value="department">{t('dash.group.department')}</option>
            <option value="team">{t('dash.group.team')}</option>
          </select>
          {(taskFilter.q || taskFilter.from || taskFilter.to || taskFilter.status !== 'active' || taskFilter.group !== 'none') && (
            <button className="btn btn-outline btn-sm" style={{ padding: '3px 10px', fontSize: 11 }} onClick={() =>
              setTaskFilter({ status: 'active', group: 'none', q: '', from: '', to: '', page: 1, per_page: 12 })}>
              {t('btn.reset')}
            </button>
          )}
        </div>

        {/* Kontent: guruhlangan yoki paginatsiya bilan */}
        {browseData.total === 0 ? (
          <div className="empty-state"><p>{t('dash.noTasksFound')}</p></div>
        ) : browseData.groups ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {browseData.groups.map(g => {
              const open = expandedGroup[g.key] !== false  // default ochiq
              return (
                <div key={g.key} style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                  <button type="button"
                    onClick={() => setExpandedGroup({ ...expandedGroup, [g.key]: !open })}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'transparent', border: 'none', padding: '10px 12px',
                      cursor: 'pointer', color: 'var(--text)', fontSize: 14, fontWeight: 600,
                    }}>
                    <span>{taskFilter.group === 'team' ? '👥' : '🏢'} {g.label}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('dash.groupCount', { n: g.count })} {open ? '▲' : '▼'}</span>
                  </button>
                  {open && (
                    <div className="project-grid" style={{ padding: 10, borderTop: '1px solid var(--border)' }}>
                      {g.tasks.map((task, i) => (
                        <TaskCard key={task.id} task={task} i={i} navigate={navigate}
                          isDeptAdmin={isDeptAdmin} handleDeleteTask={handleDeleteTask}
                          statusClass={statusClass} statusLabel={statusText} formatDate={formatDate} />
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
              {browseData.tasks.map((task, i) => (
                <TaskCard key={task.id} task={task} i={i + (browseData.page - 1) * browseData.per_page}
                  navigate={navigate} isDeptAdmin={isDeptAdmin} handleDeleteTask={handleDeleteTask}
                  statusClass={statusClass} statusLabel={statusText} formatDate={formatDate} />
              ))}
            </div>
            {browseData.pages > 1 && (
              <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
                <button className="btn btn-outline btn-sm" disabled={browseData.page <= 1}
                  onClick={() => setTaskFilter(f => ({ ...f, page: f.page - 1 }))}>‹</button>
                {Array.from({ length: browseData.pages }, (_, i) => i + 1).map(p => (
                  <button key={p} className="btn btn-outline btn-sm"
                    onClick={() => setTaskFilter(f => ({ ...f, page: p }))}
                    style={{
                      background: browseData.page === p ? 'var(--accent, #6366f1)' : undefined,
                      color: browseData.page === p ? '#fff' : undefined,
                      minWidth: 32,
                    }}>{p}</button>
                ))}
                <button className="btn btn-outline btn-sm" disabled={browseData.page >= browseData.pages}
                  onClick={() => setTaskFilter(f => ({ ...f, page: f.page + 1 }))}>›</button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Boshqarmalar kesimida vazifalar (faqat ko'rish, boshqarma rahbarlariga
          o'z boshqarmasidan tashqari boshqalarni ham ko'rsatadi) */}
      {byDeptGroups.filter(g => !g.is_own).length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>{t('dash.otherDepartments')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('dash.otherDepartments.hint')}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {byDeptGroups.filter(g => !g.is_own).map(g => {
              const open = expandedDept[g.department_id]
              return (
                <div key={g.department_id} style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                  <button type="button"
                    onClick={() => setExpandedDept({ ...expandedDept, [g.department_id]: !open })}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'transparent', border: 'none', padding: '10px 12px',
                      cursor: 'pointer', color: 'var(--text)', fontSize: 14, fontWeight: 600,
                    }}>
                    <span>🏢 {g.department_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('dash.groupCount', { n: g.task_count })} {open ? '▲' : '▼'}
                    </span>
                  </button>
                  {open && (
                    g.tasks.length === 0 ? (
                      <div style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-muted)' }}>
                        {t('dash.noTasks')}
                      </div>
                    ) : (
                      <div className="table-wrap" style={{ borderTop: '1px solid var(--border)' }}>
                        <table>
                          <thead>
                            <tr>
                              <th>{t('field.name')}</th>
                              <th style={{ width: 130 }}>{t('field.status')}</th>
                              <th style={{ width: 180 }}>{t('dash.th.executor')}</th>
                              <th style={{ width: 130 }}>{t('field.deadline')}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {g.tasks.map(task => (
                              <tr key={task.id}>
                                <td style={{ fontSize: 13 }}>{task.name}</td>
                                <td>
                                  <span className={`badge ${statusClass(task.status)}`} style={{ fontSize: 11 }}>
                                    {statusText(task.status)}
                                  </span>
                                </td>
                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  {task.assignee_name || (task.assignee_names?.join(', ')) || task.team_name || '—'}
                                </td>
                                <td style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                                  {formatDate(task.deadline)}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )
                  )}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}


function TaskCard({ task, i, navigate, isDeptAdmin, handleDeleteTask, statusClass, statusLabel, formatDate }) {
  const { t } = useI18n()
  return (
    <div className="project-card" onClick={() => navigate(`/tasks/${task.id}`)}
      style={{ position: 'relative' }}>
      <div className="project-card-header">
        <span className="project-number">#{i + 1}</span>
        <span className={`badge ${statusClass(task.status)}`}>{statusLabel(task.status)}</span>
      </div>
      <h3 className="project-card-title">{task.name}</h3>
      <div className="project-card-meta">
        <span>{t('dash.deadlineLabel')}: {formatDate(task.deadline)}</span>
      </div>
      <div className="project-card-info">
        {task.team_name && <span>👥 {task.team_name}</span>}
        {task.assignee_name && <span>👤 {task.assignee_name}</span>}
        {task.assignee_names?.length > 0 && <span>👤 {task.assignee_names.join(', ')}</span>}
        <span>📋 {t('dash.reportCount', { n: task.report_count })}</span>
      </div>
      {isDeptAdmin && (
        <button onClick={(e) => handleDeleteTask(e, task)} title={t('dash.deleteTask')}
          style={{
            position: 'absolute', top: 8, right: 8,
            background: 'transparent', border: '1px solid var(--border)',
            borderRadius: 6, padding: '2px 8px', fontSize: 13, color: '#ef4444', cursor: 'pointer',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.1)' }}
          onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
        >🗑️</button>
      )}
    </div>
  )
}
