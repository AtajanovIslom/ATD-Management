import { useState, useEffect } from 'react'
import api from '../api/axios'

export default function Statistics() {
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

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const statusLabel = (s) => {
    if (s === 'active') return 'Faol'
    if (s === 'completed') return 'Tugallangan'
    if (s === 'on_hold') return 'To\'xtatilgan'
    return s
  }

  const taskStatusLabel = (s) => {
    if (s === 'active') return 'Faol'
    if (s === 'in_progress') return 'Jarayonda'
    if (s === 'review') return 'Tekshiruvda'
    if (s === 'returned') return 'Qayta ko\'rib chiqilsin'
    if (s === 'completed') return 'Tugallangan'
    return s
  }

  const taskStatusClass = (s) => {
    if (s === 'active' || s === 'in_progress') return 'badge-active'
    if (s === 'review') return 'badge-review'
    if (s === 'completed') return 'badge-completed'
    return 'badge-on_hold'
  }

  if (loading) return <div className="empty-state"><p>Yuklanmoqda...</p></div>
  if (!data) return <div className="empty-state"><p>Ma'lumot topilmadi</p></div>

  const emp = empData.find(e => String(e.user_id) === String(selectedEmp))
  const workStatusLabel = (s) => {
    if (s === 'pending') return 'Kutilmoqda'
    return taskStatusLabel(s)
  }

  return (
    <div>
      <div className="page-header">
        <h1>Xodimlar KPI</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <h2 style={{ fontSize: 16, color: 'var(--text-white)' }}>Xodim bo'yicha filtr</h2>
          <select className="form-input" style={{ maxWidth: 320 }} value={selectedEmp}
            onChange={e => setSelectedEmp(e.target.value)}>
            <option value="">Barcha xodimlar</option>
            {empData.map(e => (
              <option key={e.user_id} value={e.user_id}>{e.full_name} — {e.department}</option>
            ))}
          </select>
        </div>
      </div>

      {!selectedEmp && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>Barcha xodimlar samaradorligi (KPI)</h2>
          {empData.length === 0 ? (
            <p style={{ color: 'var(--text-muted)' }}>Xodimlar topilmadi</p>
          ) : (
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Xodim</th>
                    <th>Bo'linma</th>
                    <th>Jami ish</th>
                    <th>Bajarilgan</th>
                    <th>Vaqtida</th>
                    <th>Kechikkan</th>
                    <th>Jarayonda</th>
                    <th>Hisobotlar</th>
                    <th>Samaradorlik</th>
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
              <div className="stat-label">Jami ish ({emp.task_count} vazifa, {emp.stage_count} bosqich)</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-value">{emp.completed}</div>
              <div className="stat-label">Bajarilgan</div>
            </div>
            <div className="stat-card stat-warning">
              <div className="stat-value">{emp.late}</div>
              <div className="stat-label">Kechikkan</div>
            </div>
            <div className="stat-card stat-info">
              <div className="stat-value">{emp.kpi}%</div>
              <div className="stat-label">Samaradorlik</div>
            </div>
          </div>

          <div className="card">
            <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>
              {emp.full_name} — bajargan ishlari ({emp.work_items.length})
            </h2>
            {emp.work_items.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Bu xodimga hali ish biriktirilmagan</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Turi</th>
                      <th>Nomi</th>
                      <th>Loyiha</th>
                      <th>Holat</th>
                      <th>Muddat</th>
                      <th>Bajarilgan sana</th>
                    </tr>
                  </thead>
                  <tbody>
                    {emp.work_items.map((w, i) => (
                      <tr key={`${w.type}-${w.id}`}>
                        <td>{i + 1}</td>
                        <td><span className="team-chip" style={{ fontSize: 10 }}>{w.type_label}</span></td>
                        <td><strong>{w.name}</strong></td>
                        <td>{w.parent || '—'}</td>
                        <td><span className={`badge ${taskStatusClass(w.status)}`}>{workStatusLabel(w.status)}</span></td>
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
        <h1>Loyihalar statistikasi</h1>
      </div>

      <div className="stats-grid" style={{ marginBottom: 20 }}>
        <div className="stat-card stat-primary">
          <div className="stat-value">{data.total_projects}</div>
          <div className="stat-label">Jami loyihalar</div>
        </div>
        <div className="stat-card stat-warning">
          <div className="stat-value">{data.active_projects}</div>
          <div className="stat-label">Faol</div>
        </div>
        <div className="stat-card stat-success">
          <div className="stat-value">{data.completed_projects}</div>
          <div className="stat-label">Tugallangan</div>
        </div>
        <div className="stat-card stat-info">
          <div className="stat-value">{data.team_performance?.length || 0}</div>
          <div className="stat-label">Guruhlar</div>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>Guruhlar samaradorligi</h2>
        {data.team_performance?.length === 0 ? (
          <p style={{ color: 'var(--text-muted)' }}>Hali ma'lumot yo'q</p>
        ) : (
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Guruh nomi</th>
                  <th>A'zolar</th>
                  <th>Jami bosqichlar</th>
                  <th>Bajarilgan</th>
                  <th>Vaqtida</th>
                  <th>Kechikkan</th>
                  <th>Jarayonda</th>
                  <th>O'rtacha kun</th>
                  <th>Samaradorlik</th>
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
                      <td>{tp.avg_completion_days} kun</td>
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
        <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>Loyihalar holati</h2>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>#</th>
                <th>Loyiha nomi</th>
                <th>Holat</th>
                <th>Boshlangan</th>
                <th>Muddat</th>
                <th>Bosqichlar</th>
                <th>Bajarilish</th>
                <th>Guruhlar</th>
                <th>Hisobotlar</th>
              </tr>
            </thead>
            <tbody>
              {data.projects?.map((p, i) => (
                <tr key={p.id}>
                  <td>{i + 1}</td>
                  <td><strong>{p.name}</strong></td>
                  <td>
                    <span className={`badge badge-${p.status === 'active' ? 'active' : p.status === 'completed' ? 'completed' : 'on_hold'}`}>
                      {statusLabel(p.status)}
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
                      {p.teams?.map(t => (
                        <span key={t.id} className="team-chip" style={{ fontSize: 10 }}>{t.name}</span>
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
            <h1>Vazifalar statistikasi</h1>
          </div>

          <div className="stats-grid" style={{ marginBottom: 20 }}>
            <div className="stat-card stat-primary">
              <div className="stat-value">{taskData.total}</div>
              <div className="stat-label">Jami vazifalar</div>
            </div>
            <div className="stat-card stat-warning">
              <div className="stat-value">{taskData.review}</div>
              <div className="stat-label">Tekshiruvda</div>
            </div>
            <div className="stat-card stat-info">
              <div className="stat-value">{taskData.returned}</div>
              <div className="stat-label">Qaytarilgan</div>
            </div>
            <div className="stat-card stat-success">
              <div className="stat-value">{taskData.completed}</div>
              <div className="stat-label">Tugallangan</div>
            </div>
          </div>

          <div className="card" style={{ marginBottom: 16 }}>
            <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>Bajaruvchilar samaradorligi</h2>
            {taskData.performance?.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Hali ma'lumot yo'q</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Bajaruvchi</th>
                      <th>Jami</th>
                      <th>Bajarilgan</th>
                      <th>Vaqtida</th>
                      <th>Kechikkan</th>
                      <th>Jarayonda</th>
                      <th>Samaradorlik</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskData.performance.map((p, i) => {
                      const pct = p.total > 0 ? Math.round(p.completed / p.total * 100) : 0
                      const onTimePct = p.completed > 0 ? Math.round(p.on_time / p.completed * 100) : 0
                      return (
                        <tr key={i}>
                          <td>{i + 1}</td>
                          <td><strong>{p.name}</strong>{p.is_team && <span className="team-chip" style={{ marginLeft: 6, fontSize: 10 }}>guruh</span>}</td>
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
            <h2 style={{ fontSize: 16, marginBottom: 16, color: 'var(--text-white)' }}>Vazifalar holati</h2>
            {taskData.tasks?.length === 0 ? (
              <p style={{ color: 'var(--text-muted)' }}>Hali vazifa yo'q</p>
            ) : (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>Vazifa nomi</th>
                      <th>Holat</th>
                      <th>Bajaruvchi</th>
                      <th>Boshlangan</th>
                      <th>Muddat</th>
                      <th>Hisobotlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {taskData.tasks.map((t, i) => (
                      <tr key={t.id}>
                        <td>{i + 1}</td>
                        <td><strong>{t.name}</strong></td>
                        <td><span className={`badge ${taskStatusClass(t.status)}`}>{taskStatusLabel(t.status)}</span></td>
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
