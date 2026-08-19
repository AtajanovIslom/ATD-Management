import { useState, useEffect } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { statusLabel } from '../i18n/labels'
import { statusClass } from '../components/ProjectCard'
import ProjectsPanel from '../components/ProjectsPanel'
import TasksPanel from '../components/TasksPanel'

/**
 * Boshqaruv paneli.
 *
 * Loyihalar va vazifalar shu yerda, ikkita alohida bo'limda turadi — har
 * biri o'z holat oynalari (Faol / Tugallangan / Bekor qilingan / Nofaol),
 * qidiruvi va sahifalashi bilan. Ilgari bular alohida sahifalarga ajratilgan
 * edi, endi hammasi yana bitta panelda.
 */
export default function AdminDashboard() {
  const { isAdmin } = useAuth()
  const { t, formatDate: fmtDate } = useI18n()
  const [projectCounts, setProjectCounts] = useState(null)
  const [byDeptGroups, setByDeptGroups] = useState([])
  const [expandedDept, setExpandedDept] = useState({})
  const [loading, setLoading] = useState(true)

  useEffect(() => { loadData() }, [])

  const loadData = async () => {
    setLoading(true)
    try {
      const pCounts = await api.get('/projects/counts')
      setProjectCounts(pCounts.data)
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

      <ProjectsPanel />
      <TasksPanel />

      {/* Boshqarmalar kesimida faol vazifalar (faqat ko'rish uchun) */}
      {otherDepts.length > 0 && (
        <div className="card">
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
                  <button type="button" className="panel-group-toggle"
                    onClick={() => setExpandedDept({ ...expandedDept, [g.department_id]: !open })}>
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
