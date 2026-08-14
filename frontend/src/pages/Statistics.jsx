import { useState, useEffect } from 'react'
import api from '../api/axios'
import { useI18n } from '../i18n'
import { statusLabel } from '../i18n/labels'

export default function Statistics() {
  const { t, formatDate: fmtDate } = useI18n()
  const [data, setData] = useState(null)
  const [taskData, setTaskData] = useState(null)
  const [empData, setEmpData] = useState([])
  const [selectedEmp, setSelectedEmp] = useState('')
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      api.get('/projects/full-stats'),
      api.get('/tasks/full-stats'),
      api.get('/stats/employees'),
    ]).then(([projRes, taskRes, empRes]) => {
      setData(projRes.data)
      setTaskData(taskRes.data)
      setEmpData(empRes.data)
    }).catch(console.error).finally(() => setLoading(false))
  }, [])

  const formatDate = (iso) =>
    fmtDate(iso, { day: '2-digit', month: '2-digit', year: 'numeric' }) || '—'

  // Loyiha, vazifa va bosqichlar bir xil status kodlaridan foydalanadi
  const statusText = (s) => statusLabel(t, s)

  const taskStatusClass = (s) => {
    if (s === 'active' || s === 'in_progress') return 'badge-active'
    if (s === 'review') return 'badge-review'
    if (s === 'completed') return 'badge-completed'
    return 'badge-on_hold'
  }

  if (loading) return <div className="empty-state"><p>{t('state.loading')}</p></div>
  if (!data) return <div className="empty-state"><p>{t('state.empty')}</p></div>

  const emp = empData.find(e => String(e.user_id) === String(selectedEmp))

  return (
    <div>
      <div className="page-header">
        <h1>{t('stats.kpiTitle')}</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, color: 'var(--text-white)' }}>{t('stats.filterByEmployee')}</h2>
          <select className="form-input" style={{ maxWidth: 320 }} value={selectedEmp}
            onChange={e => setSelectedEmp(e.target.value)}>
            <option value="">{t('stats.allEmployees')}</option>
            {empData.map(e => (
              <option key={e.user_id} value={e.user_id}>{e.full_name} — {e.department}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedEmp && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>{t('stats.allKpiTitle')}</h2>
          {empData.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>{t('stats.noEmployees')}</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('stats.th.employee')}</th>
                    <th>{t('stats.th.unit')}</th>
                    <th>{t('stats.th.totalWork')}</th>
                    <th>{t('stats.th.completed')}</th>
                    <th>{t('stats.th.onTime')}</th>
                    <th>{t('stats.th.late')}</th>
                    <th>{t('stats.th.inProgress')}</th>
                    <th>{t('stats.th.reports')}</th>
                    <th>{t('stats.th.efficiency')}</th>
                  </tr>
                </thead>
                <tbody>
                  {[...empData].sort((a, b) => b.kpi - a.kpi).map((e, i) => (
                    <tr key={e.user_id} style={{ cursor: 'pointer' }} onClick={() => setSelectedEmp(String(e.user_id))}>
                      <td>{i + 1}</td>
                      <td><strong>{e.full_name}</strong></td>
                      <td>{e.department}</td>
                      <td>{e.total_items}</td>
                      <td style={{ color: 'var(--success)' }}>{e.completed}</td>
                      <td style={{ color: 'var(--accent)' }}>{e.on_time}</td>
                      <td style={{ color: e.late > 0 ? '#ef4444' : 'var(--text-muted)' }}>{e.late}</td>
                      <td style={{ color: 'var(--primary)' }}>{e.in_progress}</td>
                      <td>{e.reports}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="progress-bar" style={{ width: 60, height: 6, borderRadius: 3 }}>
                            <div className="progress-fill" style={{ width: `${e.kpi}%`, borderRadius: 3,
                              background: e.kpi >= 80 ? 'var(--success)' : e.kpi >= 50 ? 'var(--warning)' : '#ef4444' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700,
                            color: e.kpi >= 80 ? 'var(--success)' : e.kpi >= 50 ? 'var(--warning)' : '#ef4444' }}>
                            {e.kpi}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {emp && (
        <div style={{ marginBottom: 16 }}>
          <div className="stats-grid" style={{ marginBottom: 16 }}>
            <div className="stat-card stat-primary">
              <div className="stat-value">{emp.total_items}</div>
              <div className="stat-label">{t('stats.totalWorkDetail', { tasks: emp.task_count, stages: emp.stage_count })}</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-value">{emp.completed}</div>
              <div className="stat-label">{t('stats.th.completed')}</div>
            </div>
            <div className="stat-card stat-warning">
              <div className="stat-value">{emp.late}</div>
              <div className="stat-label">{t('stats.th.late')}</div>
            </div>
            <div className="stat-card stat-info">
              <div className="stat-value">{emp.kpi}%</div>
              <div className="stat-label">{t('stats.th.efficiency')}</div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>
              {t('stats.empWorkItems', { name: emp.full_name, n: emp.work_items.length })}
            </h2>
            {emp.work_items.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>{t('stats.noWorkAssigned')}</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('stats.th.type')}</th>
                      <th>{t('field.name')}</th>
                      <th>{t('stats.th.project')}</th>
                      <th>{t('field.status')}</th>
                      <th>{t('field.deadline')}</th>
                      <th>{t('stats.th.completedDate')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emp.work_items.map((w, i) => (
                      <tr key={`${w.type}-${w.id}`}>
                        <td>{i + 1}</td>
                        <td><span className="team-chip" style={{ fontSize: 10 }}>{w.type_label}</span></td>
                        <td><strong>{w.name}</strong></td>
                        <td>{w.parent || '—'}</td>
                        <td><span className={`badge ${taskStatusClass(w.status)}`}>{statusText(w.status)}</span></td>
                        <td style={{ color: w.is_overdue ? '#ef4444' : 'inherit' }}>
                          {formatDate(w.deadline)}{w.is_overdue && ' ⚠️'}
                        </td>
                        <td>{formatDate(w.completed_at)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      <div className="page-header">
        <h1>{t('stats.projectsTitle')}</h1>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card stat-primary">
          <div className="stat-value">{data.total_projects}</div>
          <div className="stat-label">{t('dash.stat.totalProjects')}</div>
        </div>
        <div className="stat-card stat-warning">
          <div className="stat-value">{data.active_projects}</div>
          <div className="stat-label">{t('dash.stat.active')}</div>
        </div>
        <div className="stat-card stat-success">
          <div className="stat-value">{data.completed_projects}</div>
          <div className="stat-label">{t('dash.stat.completed')}</div>
        </div>
        <div className="stat-card stat-info">
          <div className="stat-value">{data.team_performance?.length || 0}</div>
          <div className="stat-label">{t('stats.stat.teams')}</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>{t('stats.teamPerformance')}</h2>
        {data.team_performance?.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>{t('stats.noData')}</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>{t('stats.th.teamName')}</th>
                  <th>{t('stats.th.members')}</th>
                  <th>{t('stats.th.totalStages')}</th>
                  <th>{t('stats.th.completed')}</th>
                  <th>{t('stats.th.onTime')}</th>
                  <th>{t('stats.th.late')}</th>
                  <th>{t('stats.th.inProgress')}</th>
                  <th>{t('stats.th.avgDays')}</th>
                  <th>{t('stats.th.efficiency')}</th>
                </tr>
              </thead>
              <tbody>
                {data.team_performance.map((tp, i) => {
                  const pct = tp.total_stages > 0 ? Math.round(tp.completed / tp.total_stages * 100) : 0
                  const onTimePct = tp.completed > 0 ? Math.round(tp.on_time / tp.completed * 100) : 0
                  return (
                    <tr key={tp.team_id}>
                      <td>{i + 1}</td>
                      <td><strong>{tp.team_name}</strong></td>
                      <td>{tp.member_count}</td>
                      <td>{tp.total_stages}</td>
                      <td style={{ color: 'var(--success)' }}>{tp.completed}</td>
                      <td style={{ color: 'var(--accent)' }}>{tp.on_time}</td>
                      <td style={{ color: tp.late > 0 ? '#ef4444' : 'var(--text-muted)' }}>{tp.late}</td>
                      <td style={{ color: 'var(--primary)' }}>{tp.in_progress}</td>
                      <td>{t('stats.days', { n: tp.avg_completion_days })}</td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <div className="progress-bar" style={{ width: 60, height: 6, borderRadius: 3 }}>
                            <div className="progress-fill" style={{ width: `${pct}%`, borderRadius: 3,
                              background: onTimePct >= 80 ? 'var(--success)' : onTimePct >= 50 ? 'var(--warning)' : '#ef4444' }} />
                          </div>
                          <span style={{ fontSize: 12, fontWeight: 700,
                            color: onTimePct >= 80 ? 'var(--success)' : onTimePct >= 50 ? 'var(--warning)' : '#ef4444' }}>
                            {pct}%
                          </span>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>{t('stats.projectStatuses')}</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>{t('stats.th.projectName')}</th>
                <th>{t('field.status')}</th>
                <th>{t('stats.th.started')}</th>
                <th>{t('field.deadline')}</th>
                <th>{t('stats.th.stages')}</th>
                <th>{t('stats.th.progress')}</th>
                <th>{t('stats.stat.teams')}</th>
                <th>{t('stats.th.reports')}</th>
              </tr>
            </thead>
            <tbody>
              {data.projects?.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td><strong>{p.name}</strong></td>
                  <td>
                    <span className={`badge badge-${p.status === 'active' ? 'active' : p.status === 'completed' ? 'completed' : 'on_hold'}`}>
                      {statusText(p.status)}
                    </span>
                  </td>
                  <td>{formatDate(p.start_date)}</td>
                  <td>{formatDate(p.deadline)}</td>
                  <td>{p.completed_stages}/{p.stage_count}</td>
                  <td>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <div className="progress-bar" style={{ width: 50, height: 6, borderRadius: 3 }}>
                        <div className="progress-fill" style={{ width: `${p.progress}%`, borderRadius: 3 }} />
                      </div>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{p.progress}%</span>
                    </div>
                  </td>
                  <td>
                    <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                      {p.teams?.map(team => (
                        <span key={team.id} className="team-chip" style={{ fontSize: 10 }}>{team.name}</span>
                      ))}
                    </div>
                  </td>
                  <td>{p.total_reports}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {taskData && (
        <>
          <div className="page-header" style={{ marginTop: 28 }}>
            <h1>{t('stats.tasksTitle')}</h1>
          </div>

          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card stat-primary">
              <div className="stat-value">{taskData.total}</div>
              <div className="stat-label">{t('stats.stat.totalTasks')}</div>
            </div>
            <div className="stat-card stat-warning">
              <div className="stat-value">{taskData.review}</div>
              <div className="stat-label">{t('stats.stat.review')}</div>
            </div>
            <div className="stat-card stat-info">
              <div className="stat-value">{taskData.returned}</div>
              <div className="stat-label">{t('stats.stat.returned')}</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-value">{taskData.completed}</div>
              <div className="stat-label">{t('dash.stat.completed')}</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>{t('stats.executorPerformance')}</h2>
            {taskData.performance?.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>{t('stats.noData')}</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('stats.th.executor')}</th>
                      <th>{t('stats.th.total')}</th>
                      <th>{t('stats.th.completed')}</th>
                      <th>{t('stats.th.onTime')}</th>
                      <th>{t('stats.th.late')}</th>
                      <th>{t('stats.th.inProgress')}</th>
                      <th>{t('stats.th.efficiency')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskData.performance.map((p, i) => {
                      const pct = p.total > 0 ? Math.round(p.completed / p.total * 100) : 0
                      const onTimePct = p.completed > 0 ? Math.round(p.on_time / p.completed * 100) : 0
                      return (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td><strong>{p.name}</strong>{p.is_team && <span className="team-chip" style={{ marginLeft: 6, fontSize: 10 }}>{t('stats.teamChip')}</span>}</td>
                          <td>{p.total}</td>
                          <td style={{ color: 'var(--success)' }}>{p.completed}</td>
                          <td style={{ color: 'var(--accent)' }}>{p.on_time}</td>
                          <td style={{ color: p.late > 0 ? '#ef4444' : 'var(--text-muted)' }}>{p.late}</td>
                          <td style={{ color: 'var(--primary)' }}>{p.in_work}</td>
                          <td>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                              <div className="progress-bar" style={{ width: 60, height: 6, borderRadius: 3 }}>
                                <div className="progress-fill" style={{ width: `${pct}%`, borderRadius: 3,
                                  background: onTimePct >= 80 ? 'var(--success)' : onTimePct >= 50 ? 'var(--warning)' : '#ef4444' }} />
                              </div>
                              <span style={{ fontSize: 12, fontWeight: 700,
                                color: onTimePct >= 80 ? 'var(--success)' : onTimePct >= 50 ? 'var(--warning)' : '#ef4444' }}>
                                {pct}%
                              </span>
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>{t('stats.taskStatuses')}</h2>
            {taskData.tasks?.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>{t('stats.noTasksYet')}</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t('stats.th.taskName')}</th>
                      <th>{t('field.status')}</th>
                      <th>{t('stats.th.executor')}</th>
                      <th>{t('stats.th.started')}</th>
                      <th>{t('field.deadline')}</th>
                      <th>{t('stats.th.reports')}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskData.tasks.map((t, i) => (
                      <tr key={t.id}>
                        <td>{i + 1}</td>
                        <td><strong>{t.name}</strong></td>
                        <td><span className={`badge ${taskStatusClass(t.status)}`}>{statusText(t.status)}</span></td>
                        <td>{t.assignee_name || t.team_name || '—'}</td>
                        <td>{formatDate(t.start_date)}</td>
                        <td style={{ color: t.is_overdue ? '#ef4444' : 'inherit' }}>
                          {formatDate(t.deadline)}{t.is_overdue && ' ⚠️'}
                        </td>
                        <td>{t.report_count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  )
}
