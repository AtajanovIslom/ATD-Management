import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useI18n } from '../i18n'
import api from '../api/axios'
import ProjectCard from '../components/ProjectCard'
import TaskCard from '../components/TaskCard'

// Panelda faqat eng yangi faol ishlar — to'liq ro'yxat alohida sahifalarda
const PREVIEW_COUNT = 6

/**
 * Xodim paneli — faqat faol (ishdagi) loyihalar va vazifalar, alohida
 * bo'limlarda. Tugallangan va bekor qilinganlari "Loyihalar"/"Vazifalar"
 * sahifalaridagi o'z oynalarida turadi.
 */
export default function UserDashboard() {
  const [projects, setProjects] = useState([])
  const [tasks, setTasks] = useState([])
  const [counts, setCounts] = useState({ projects: 0, tasks: 0 })
  const [loading, setLoading] = useState(true)
  const { t } = useI18n()

  useEffect(() => {
    Promise.all([
      api.get(`/projects/browse?status=active&per_page=${PREVIEW_COUNT}`),
      api.get(`/tasks/browse?status=active&per_page=${PREVIEW_COUNT}`),
    ]).then(([projRes, taskRes]) => {
      setProjects(projRes.data.projects || [])
      setTasks(taskRes.data.tasks || [])
      setCounts({ projects: projRes.data.total || 0, tasks: taskRes.data.total || 0 })
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  if (loading) return <div className="empty-state"><p>{t('state.loading')}</p></div>

  return (
    <div>
      <div className="page-header">
        <h1>{t('dash.myProjects')}</h1>
        <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
          <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
            {t('dash.total', { n: counts.projects })}
          </span>
          <Link to="/projects" className="btn btn-outline btn-sm">{t('dash.seeAll')} →</Link>
        </div>
      </div>

      {projects.length === 0 ? (
        <div className="card">
          <div className="empty-state"><p>{t('dash.noProjectsForYou')}</p></div>
        </div>
      ) : (
        <div className="project-grid">
          {projects.map((p, i) => <ProjectCard key={p.id} project={p} index={i} />)}
        </div>
      )}

      {/* Vazifalar — loyihalar bilan aralashmagan alohida bo'lim */}
      <div style={{ marginTop: 24 }}>
        <div className="page-header">
          <h1>{t('dash.myTasks')}</h1>
          <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
            <span style={{ fontSize: 14, color: 'var(--text-muted)' }}>
              {t('dash.total', { n: counts.tasks })}
            </span>
            <Link to="/tasks" className="btn btn-outline btn-sm">{t('dash.seeAll')} →</Link>
          </div>
        </div>

        {tasks.length === 0 ? (
          <div className="card">
            <div className="empty-state"><p>{t('dash.noTasksForYou')}</p></div>
          </div>
        ) : (
          <div className="project-grid">
            {tasks.map((task, i) => <TaskCard key={task.id} task={task} index={i} />)}
          </div>
        )}
      </div>
    </div>
  )
}
