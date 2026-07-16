import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function AdminDashboard() {
  const [stats, setStats] = useState(null)
  const [taskStats, setTaskStats] = useState(null)
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  useEffect(() => { loadData() }, [])

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
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

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
        <h1>Boshqaruv paneli</h1>
      </div>

      {stats && (
        <div className="stats-grid">
          <div className="stat-card stat-primary">
            <div className="stat-value">{stats.total}</div>
            <div className="stat-label">Jami loyihalar</div>
          </div>
          <div className="stat-card stat-warning">
            <div className="stat-value">{stats.active}</div>
            <div className="stat-label">Faol</div>
          </div>
          <div className="stat-card stat-success">
            <div className="stat-value">{stats.completed}</div>
            <div className="stat-label">Tugallangan</div>
          </div>
          <div className="stat-card stat-info">
            <div className="stat-value">{stats.on_hold}</div>
            <div className="stat-label">To'xtatilgan</div>
          </div>
        </div>
      )}

      <div className="card">
        <h2 style={{ marginBottom: 16, fontSize: 16 }}>Barcha loyihalar</h2>

        {projects.length === 0 ? (
          <div className="empty-state">
            <p>Hali loyiha yaratilmagan</p>
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
      </div>
      {/* Tasks section */}
      <div className="card" style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 16 }}>Barcha vazifalar</h2>
          {taskStats && (
            <div style={{ display: 'flex', gap: 12, fontSize: 12, flexWrap: 'wrap' }}>
              <span style={{ color: 'var(--text-muted)' }}>Jami: <strong>{taskStats.total}</strong></span>
              <span style={{ color: 'var(--warning)' }}>Tekshiruvda: <strong>{taskStats.review}</strong></span>
              <span style={{ color: 'var(--text-muted)' }}>Qaytarilgan: <strong>{taskStats.returned}</strong></span>
              <span style={{ color: 'var(--success)' }}>Tugallangan: <strong>{taskStats.completed}</strong></span>
              {taskStats.overdue > 0 && <span style={{ color: '#ef4444' }}>Kechikkan: <strong>{taskStats.overdue}</strong></span>}
            </div>
          )}
        </div>

        {tasks.length === 0 ? (
          <div className="empty-state">
            <p>Hali vazifa yaratilmagan</p>
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
