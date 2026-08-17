import { useNavigate } from 'react-router-dom'
import { useI18n } from '../i18n'
import { statusLabel } from '../i18n/labels'

/** Holat kodiga mos badge klassi (loyiha va vazifa uchun umumiy) */
export function statusClass(status) {
  if (status === 'active' || status === 'in_progress') return 'badge-active'
  if (status === 'review') return 'badge-review'
  if (status === 'completed') return 'badge-completed'
  if (status === 'cancelled') return 'badge-cancelled'
  if (status === 'inactive' || status === 'on_hold') return 'badge-inactive'
  return 'badge-on_hold'
}

/**
 * Loyiha kartochkasi — boshqaruv panelida va "Loyihalar" sahifasida bir xil
 * ko'rinishda ishlatiladi.
 */
export default function ProjectCard({ project: p, index = 0 }) {
  const navigate = useNavigate()
  const { t, formatDate } = useI18n()
  const fmt = (iso) => formatDate(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }) || '—'

  return (
    <div className="project-card" onClick={() => navigate(`/projects/${p.id}`)}>
      <div className="project-card-header">
        <span className="project-number">#{index + 1}</span>
        <span className={`badge ${statusClass(p.status)}`}>{statusLabel(t, p.status)}</span>
      </div>
      <h3 className="project-card-title">{p.name}</h3>
      <div className="project-card-meta">
        {p.status === 'completed' && p.completed_at
          ? <span>{t('projects.finishedAt')}: {fmt(p.completed_at)}</span>
          : <span>{t('dash.deadlineLabel')}: {fmt(p.deadline)}</span>}
      </div>
      <div className="progress-bar-wrap">
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${p.progress}%` }} />
        </div>
        <span className="progress-text">{p.progress}%</span>
      </div>
      <div className="project-card-info">
        <span>📦 {t('dash.stageCount', { n: p.stage_count })}</span>
        {p.current_stage_name && p.status !== 'completed' && <span>📍 {p.current_stage_name}</span>}
        {p.department_name && <span>🏢 {p.department_name}</span>}
      </div>
      {p.can_finish && p.status === 'active' && (
        <div style={{ fontSize: 11, color: 'var(--success)', marginTop: 4, fontWeight: 600 }}>
          ✅ {t('projects.readyToFinish')}
        </div>
      )}
      <div className="project-card-teams">
        {p.teams?.map(team => (
          <span key={team.id} className="team-chip">{team.name} ({team.member_count})</span>
        ))}
      </div>
    </div>
  )
}
