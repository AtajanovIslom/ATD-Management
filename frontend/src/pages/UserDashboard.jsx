import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

export default function UserDashboard() {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const { user } = useAuth()
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

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('uz-UZ', {
      year: 'numeric', month: '2-digit', day: '2-digit',
    })
  }

  const statusLabel = (s) => {
    if (s === 'active') return 'Faol'
    if (s === 'in_progress') return 'Jarayonda'
    if (s === 'review') return 'Tekshiruvda'
    if (s === 'returned') return 'Qayta ko\'rib chiqilsin'
    if (s === 'completed') return 'Tugallangan'
    if (s === 'on_hold') return 'To\'xtatilgan'
    return s
  }

  const statusClass = (s) => {
    if (s === 'active') return 'badge-active'
    if (s === 'in_progress') return 'badge-active'
    if (s === 'review') return 'badge-review'
    if (s === 'returned') return 'badge-on_hold'
    if (s === 'completed') return 'badge-completed'
    return 'badge-on_hold'
  }

  if (loading) return <div className="empty-state"><p>Yuklanmoqda...</p></div>

  return (
    <div>
      <div className="page-header">
        <h1>Mening loyihalarim</h1>
        <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
          Jami: {projects.length}
        </span>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <div className="empty-state"><p>Sizga hali loyiha yuklanmagan</p></div>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p, i) => (
            <div key={p.id} className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
              <div className="project-card-header">
                <span className="project-number">#{i + 1}</span>
                <span className={`badge ${statusClass(p.status)}`}>{statusLabel(p.status)}</span>
              </div>
              <h3 className="project-card-title">{p.name}</h3>
              <div className="project-card-meta">
                {p.start_date && <span>Boshlanish: {formatDate(p.start_date)}</span>}
                <span>Muddat: {formatDate(p.deadline)}</span>
              </div>
              <div className="progress-bar-wrap">
                <div className="progress-bar">
                  <div className="progress-fill" style={{ width: `${p.progress}%` }} />
                </div>
                <span className="progress-text">{p.progress}%</span>
              </div>
              <div className="project-card-info">
                <span>📦 {p.stage_count} bosqich</span>
                {p.current_stage_name && <span>📍 {p.current_stage_name}</span>}
              </div>
              <div className="project-card-teams">
                {p.teams?.map(t => (
                  <span key={t.id} className="team-chip">{t.name} ({t.member_count})</span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Tasks section */}
      <div style={{ marginTop: 24 }}>
        <div className="page-header">
          <h1>Mening vazifalarim</h1>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            Jami: {tasks.length}
          </span>
        </div>

        {tasks.length === 0 ? (
          <div className="card">
            <div className="empty-state"><p>Sizga hali vazifa yuklanmagan</p></div>
          </div>
        ) : (
          <div className="project-grid">
            {tasks.map((t, i) => (
              <div key={t.id} className="project-card" onClick={() => navigate(`/tasks/${t.id}`)}>
                <div className="project-card-header">
                  <span className="project-number">#{i + 1}</span>
                  <span className={`badge ${statusClass(t.status)}`}>{statusLabel(t.status)}</span>
                </div>
                <h3 className="project-card-title">{t.name}</h3>
                <div className="project-card-meta">
                  {t.start_date && <span>Boshlanish: {formatDate(t.start_date)}</span>}
                  <span>Muddat: {formatDate(t.deadline)}</span>
                </div>
                <div className="project-card-info">
                  {t.team_name && <span>👥 {t.team_name}</span>}
                  {t.assignee_name && <span>👤 {t.assignee_name}</span>}
                  {t.assignee_names?.length > 0 && <span>👤 {t.assignee_names.join(', ')}</span>}
                  <span>📋 {t.report_count} hisobot</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
