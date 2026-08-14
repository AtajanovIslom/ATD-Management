import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { statusLabel } from '../i18n/labels'
import api from '../api/axios'

export default function UserDashboard() {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
  const { t, formatDate } = useI18n()
  const navigate = useNavigate()

  useEffect(() => {
    Promise.all([
      api.get('/projects'),
      api.get('/tasks'),
    ]).then(([projRes, taskRes]) => {
      setProjects(projRes.data)
      setTasks(taskRes.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const fmt = (iso) => formatDate(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }) || '—'

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
        <h1>{t('dash.myProjects')}</h1>
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          {t('dash.total', { n: projects.length })}
        </span>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <div className="empty-state"><p>{t('dash.noProjectsForYou')}</p></div>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p, i) => (
            <div key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="project-card-header">
                <span className="project-number">#{i + 1}</span>
                <span className={`badge ${statusClass(p.status)}`}>{statusLabel(t, p.status)}</span>
              </div>
              <h3 className="project-card-title">{p.name}</h3>
              <div className="project-card-meta">
                {p.start_date && <span>{t('dash.startLabel')}: {fmt(p.start_date)}</span>}
                <span>{t('dash.deadlineLabel')}: {fmt(p.deadline)}</span>
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
      {/* Tasks section */}
      <div style={{ marginTop: 24 }}>
        <div className="page-header">
          <h1>{t('dash.myTasks')}</h1>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {t('dash.total', { n: tasks.length })}
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="card">
            <div className="empty-state"><p>{t('dash.noTasksForYou')}</p></div>
          </div>
        ) : (
          <div className="project-grid">
            {tasks.map((task, i) => (
              <div key={task.id} className="project-card" onClick={() => navigate(`/tasks/${task.id}`)}>
                <div className="project-card-header">
                  <span className="project-number">#{i + 1}</span>
                  <span className={`badge ${statusClass(task.status)}`}>{statusLabel(t, task.status)}</span>
                </div>
                <h3 className="project-card-title">{task.name}</h3>
                <div className="project-card-meta">
                  {task.start_date && <span>{t('dash.startLabel')}: {fmt(task.start_date)}</span>}
                  <span>{t('dash.deadlineLabel')}: {fmt(task.deadline)}</span>
                </div>
                <div className="project-card-info">
                  {task.team_name && <span>👥 {task.team_name}</span>}
                  {task.assignee_name && <span>👤 {task.assignee_name}</span>}
                  {task.assignee_names?.length > 0 && <span>👤 {task.assignee_names.join(', ')}</span>}
                  <span>📋 {t('dash.reportCount', { n: task.report_count })}</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
