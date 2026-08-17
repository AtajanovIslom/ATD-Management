import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { statusLabel } from '../i18n/labels'
import { statusClass } from './ProjectCard'

/**
 * Vazifa kartochkasi — boshqaruv panelida va "Vazifalar" sahifasida bir xil
 * ko'rinishda ishlatiladi. `onDelete` berilsa o'ng yuqorida o'chirish tugmasi.
 */
export default function TaskCard({ task, index = 0, onDelete }) {
  const navigate = useNavigate()
  const { t, formatDate } = useI18n()
  const fmt = (iso) => formatDate(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }) || '—'

  return (
    <div className="project-card" onClick={() => navigate(`/tasks/${task.id}`)}
      style={{ position: 'relative' }}>
      <div className="project-card-header">
        <span className="project-number">#{index + 1}</span>
        <span className={`badge ${statusClass(task.status)}`}>{statusLabel(t, task.status)}</span>
      </div>
      <h3 className="project-card-title">{task.name}</h3>
      <div className="project-card-meta">
        {task.status === 'completed' && task.completed_at
          ? <span>{t('tasks.finishedAt')}: {fmt(task.completed_at)}</span>
          : <span>{t('dash.deadlineLabel')}: {fmt(task.deadline)}</span>}
        {task.is_overdue && <span style={{ color: '#ef4444' }}>⚠️ {t('status.overdue')}</span>}
      </div>
      <div className="project-card-info">
        {task.team_name && <span>👥 {task.team_name}</span>}
        {task.assignee_name && <span>👤 {task.assignee_name}</span>}
        {task.assignee_names?.length > 0 && <span>👤 {task.assignee_names.join(', ')}</span>}
        <span>📋 {t('dash.reportCount', { n: task.report_count })}</span>
      </div>
      {onDelete && (
        <button onClick={(e) => onDelete(e, task)} title={t('dash.deleteTask')}
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
