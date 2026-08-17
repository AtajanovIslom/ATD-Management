import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { statusLabel } from '../i18n/labels'
import ProjectCard, { statusClass } from '../components/ProjectCard'
import TaskCard from '../components/TaskCard'

// Boshqaruv panelida faqat eng yangi faol ishlar ko'rsatiladi —
// to'liq ro'yxatlar "Loyihalar" va "Vazifalar" sahifalarida
const PREVIEW_COUNT = 6

/**
 * Boshqaruv paneli.
 *
 * Faqat yangi (faol) loyihalar va faol vazifalar chiqadi — ikkalasi alohida
 * bo'limda, aralashmagan holda. Tugallangan, bekor qilingan va nofaol ishlar
 * o'z sahifalaridagi alohida oynalarda turadi.
 */
export default function AdminDashboard() {
  const { isDeptAdmin, isAdmin } = useAuth()
  const { t, formatDate: fmtDate } = useI18n()
  const [projectCounts, setProjectCounts] = useState(null)
  const [taskCounts, setTaskCounts] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [byDeptGroups, setByDeptGroups] = useState([])
  const [expandedDept, setExpandedDept] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const [pCounts, tCounts, projRes, tasksRes] = await Promise.all([
        api.get('/projects/counts'),
        api.get('/tasks/counts'),
        api.get(`/projects/browse?status=active&per_page=${PREVIEW_COUNT}`),
        api.get(`/tasks/browse?status=active&per_page=${PREVIEW_COUNT}`),
      ])
      setProjectCounts(pCounts.data)
      setTaskCounts(tCounts.data)
      setProjects(projRes.data.projects || [])
      setTasks(tasksRes.data.tasks || [])
      // Boshqarmalar kesimida vazifalar (faqat boshqarma rahbari va yuqori)
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

  const handleDeleteTask = async (e, task) => {
    e.stopPropagation()  // kartochka klik'ini to'sish
    if (!window.confirm(t('dash.deleteTask.confirm', { name: task.name }))) return
    try {
      await api.delete(`/tasks/${task.id}`)
    } catch (err) {
      // 404 — vazifani boshqa rahbar allaqachon o'chirgan. Ro'yxatni
      // moslashtiramiz, chunki foydalanuvchi ko'zlagan natija baribir shu.
      if (err.response?.status !== 404) {
        alert(err.response?.data?.error || t('state.error'))
        return
      }
    }
    loadData()
  }

  if (loading) return <div className="empty-state"><p>{t('state.loading')}</p></div>

  // Boshqa boshqarmalarda ham faqat ishdagi vazifalar ko'rsatiladi
  const activeStatuses = ['active', 'in_progress', 'review', 'returned']
  const otherDepts = byDeptGroups
    .filter(g => !g.is_own)
    .map(g => ({ ...g, tasks: g.tasks.filter(x => activeStatuses.includes(x.status)) }))
    .filter(g => g.tasks.length > 0)

  return (
    <div>
      <div className="page-header">
        <h1>{t('dash.title')}</h1>
      </div>

      {projectCounts && (
        <div className="stats-grid">
          <div className="stat-card stat-primary">
            <div className="stat-value">{projectCounts.total}</div>
            <div className="stat-label">{t('dash.stat.totalProjects')}</div>
          </div>
          <div className="stat-card stat-warning">
            <div className="stat-value">{projectCounts.active}</div>
            <div className="stat-label">{t('dash.stat.active')}</div>
          </div>
          <div className="stat-card stat-success">
            <div className="stat-value">{projectCounts.completed}</div>
            <div className="stat-label">{t('dash.stat.completed')}</div>
          </div>
          <div className="stat-card stat-info">
            <div className="stat-value">{projectCounts.cancelled}</div>
            <div className="stat-label">{t('status.cancelled')}</div>
          </div>
          <div className="stat-card stat-info">
            <div className="stat-value">{projectCounts.inactive}</div>
            <div className="stat-label">{t('status.inactive')}</div>
          </div>
        </div>
      )}

      {/* ── Faol loyihalar ── */}
      <div className="card">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>🚀 {t('dash.activeProjects')}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('dash.total', { n: projectCounts?.active ?? 0 })}
          </span>
          <Link to="/projects" className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }}>
            {t('dash.seeAll')} →
          </Link>
        </div>

        {projects.length === 0 ? (
          <div className="empty-state"><p>{t('dash.noActiveProjects')}</p></div>
        ) : (
          <div className="project-grid">
            {projects.map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}
          </div>
        )}
      </div>

      {/* ── Faol vazifalar (loyihalar bilan aralashmaydi) ── */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>📝 {t('dash.activeTasks')}</h2>
          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('dash.total', { n: taskCounts?.active ?? 0 })}
          </span>
          {taskCounts && (
            <div style={{ display: 'flex', gap: 10, fontSize: 12, flexWrap: 'wrap' }}>
              {taskCounts.review > 0 && (
                <span style={{ color: 'var(--warning)' }}>{t('dash.count.review')}: <strong>{taskCounts.review}</strong></span>
              )}
              {taskCounts.returned > 0 && (
                <span style={{ color: 'var(--text-muted)' }}>{t('dash.count.returned')}: <strong>{taskCounts.returned}</strong></span>
              )}
              {taskCounts.overdue > 0 && (
                <span style={{ color: '#ef4444' }}>{t('dash.count.overdue')}: <strong>{taskCounts.overdue}</strong></span>
              )}
            </div>
          )}
          <Link to="/tasks" className="btn btn-outline btn-sm" style={{ marginLeft: 'auto' }}>
            {t('dash.seeAll')} →
          </Link>
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state"><p>{t('dash.noActiveTasks')}</p></div>
        ) : (
          <div className="project-grid">
            {tasks.map((task, i) => (
              <TaskCard key={task.id} task={task} index={i}
                onDelete={isDeptAdmin ? handleDeleteTask : undefined} />
            ))}
          </div>
        )}
      </div>

      {/* Boshqarmalar kesimida faol vazifalar (faqat ko'rish uchun) */}
      {otherDepts.length > 0 && (
        <div className="card" style={{ marginTop: 16 }}>
          <div style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 16, marginBottom: 4 }}>{t('dash.otherDepartments')}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {t('dash.otherDepartments.hint')}
            </p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {otherDepts.map(g => {
              const open = expandedDept[g.department_id]
              return (
                <div key={g.department_id} style={{ border: '1px solid var(--border)', borderRadius: 8 }}>
                  <button type="button"
                    onClick={() => setExpandedDept({ ...expandedDept, [g.department_id]: !open })}
                    style={{
                      width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      background: 'transparent', border: 'none', padding: '10px 12px',
                      cursor: 'pointer', color: 'var(--text-primary)', fontSize: 14, fontWeight: 600,
                    }}>
                    <span>🏢 {g.department_name}</span>
                    <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('dash.groupCount', { n: g.tasks.length })} {open ? '▲' : '▼'}
                    </span>
                  </button>
                  {open && (
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
                                  {statusLabel(t, task.status)}
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
