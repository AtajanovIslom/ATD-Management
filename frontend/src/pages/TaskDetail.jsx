import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { statusLabel } from '../i18n/labels'
import { statusClass } from '../components/ProjectCard'
import api from '../api/axios'

const downloadFile = async (url, originalName, errorText) => {
  try {
    const res = await api.get(url, { responseType: 'blob' })
    const blobUrl = window.URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = originalName
    a.click()
    window.URL.revokeObjectURL(blobUrl)
  } catch (err) {
    alert(errorText)
  }
}

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user, isDeptAdmin, isAdmin: isDeptOrHigher } = useAuth()
  const { t, formatDate: fmtDate } = useI18n()
  // isAdmin = barcha rahbarlar (bo'lim rahbari, boshqarma rahbari, superadmin)
  const isAdmin = isDeptAdmin
  // Boshqarma rahbari va yuqori (bo'lim rahbari kirmaydi) — tugallanган vazifani
  // qayta yuklash huquqi shu darajaga ega
  const canReturnCompleted = isDeptOrHigher  // useAuth'dagi isAdmin: admin+superadmin

  const [task, setTask] = useState(null)
  const [reports, setReports] = useState([])
  const [reportText, setReportText] = useState('')
  const [reportFiles, setReportFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [assignModal, setAssignModal] = useState(false)
  const [workers, setWorkers] = useState([])
  const [selectedWorkers, setSelectedWorkers] = useState([])
  const [reassignBusy, setReassignBusy] = useState(false)
  const [editModal, setEditModal] = useState(false)
  const [editName, setEditName] = useState('')
  const [editDesc, setEditDesc] = useState('')
  const [editBusy, setEditBusy] = useState(false)

  useEffect(() => { loadData() }, [id])

  const loadData = async () => {
    try {
      const [taskRes, reportsRes] = await Promise.all([
        api.get(`/tasks/${id}`),
        api.get(`/tasks/${id}/reports`),
      ])
      setTask(taskRes.data)
      setReports(reportsRes.data)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const formatDate = (iso) => fmtDate(iso, {
    year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  }) || '—'

  const formatShortDate = (iso) =>
    fmtDate(iso, { year: 'numeric', month: '2-digit', day: '2-digit' }) || '—'

  const statusText = (s) => statusLabel(t, s)

  const download = (f) => downloadFile(f.download_url, f.original_name, t('task.file.downloadFailed'))

  const handleStatusChange = async (newStatus, extra = {}) => {
    try {
      const res = await api.put(`/tasks/${id}`, { status: newStatus, ...extra })
      setTask(res.data)
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  /** Vazifani bekor qilish — sabab so'raladi, vazifa "Bekor qilingan" oynasiga o'tadi */
  const handleCancelTask = () => {
    const reason = window.prompt(t('task.cancel.reasonPrompt'), '')
    if (reason === null) return
    handleStatusChange('cancelled', { cancel_reason: reason })
  }

  const handleDelete = async () => {
    if (!window.confirm(t('task.delete.confirm'))) return
    try {
      await api.delete(`/tasks/${id}`)
      navigate('/')
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  const openAssign = async () => {
    setSelectedWorkers([])
    setAssignModal(true)
    try {
      const res = await api.get('/tasks/assignable-workers')
      setWorkers(res.data)
    } catch {
      setWorkers([])
    }
  }

  const toggleWorker = (uid) => {
    setSelectedWorkers(prev => prev.includes(uid)
      ? prev.filter(x => x !== uid)
      : [...prev, uid])
  }

  const openEdit = () => {
    setEditName(task?.name || '')
    setEditDesc(task?.description || '')
    setEditModal(true)
  }

  const handleEditSave = async () => {
    if (!editName.trim()) return
    setEditBusy(true)
    try {
      const res = await api.put(`/tasks/${id}`, {
        name: editName.trim(),
        description: editDesc.trim(),
      })
      setTask(res.data)
      setEditModal(false)
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    } finally {
      setEditBusy(false)
    }
  }

  const handleReassign = async () => {
    if (selectedWorkers.length === 0) return
    setReassignBusy(true)
    try {
      const res = await api.post(`/tasks/${id}/reassign`, { user_ids: selectedWorkers })
      setTask(res.data)
      setAssignModal(false)
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    } finally {
      setReassignBusy(false)
    }
  }

  const handleReport = async () => {
    if (!reportText.trim()) return
    try {
      const formData = new FormData()
      formData.append('content', reportText.trim())
      reportFiles.forEach(f => formData.append('files', f))

      await api.post(`/tasks/${id}/reports`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setReportText('')
      setReportFiles([])
      const [reportsRes, taskRes] = await Promise.all([
        api.get(`/tasks/${id}/reports`),
        api.get(`/tasks/${id}`),
      ])
      setReports(reportsRes.data)
      setTask(taskRes.data)
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  // Ijrochi bo'lgan har kim (rahbarlar ham) hisobot topshira oladi —
  // ijrochi ekanligi rol emas, biriktirish bilan aniqlanadi.
  const canUserReport = (() => {
    if (!task) return false
    if (task.status === 'completed' || task.status === 'cancelled') return false
    if (task.assignee_id === user.id) return true
    if (task.assignees?.some(a => a.id === user.id)) return true
    if (!task.assignee_id && !task.assignees?.length && task.team_members?.some(m => m.id === user.id)) return true
    return false
  })()

  if (loading) return <div className="empty-state"><p>{t('state.loading')}</p></div>
  if (!task) return <div className="empty-state"><p>{t('task.notFound')}</p></div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{task.name}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('task.number', { id: task.id })}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {/* Xodimga yuklash — rahbarlarga. Yakunlangan va tekshiruvdagi vazifani
              yuklab bo'lmaydi (backend ham buni qaytaradi) */}
          {isAdmin && task.status !== 'completed' && task.status !== 'review' && (
            <button className="btn btn-primary btn-sm" onClick={openAssign}>
              👤 {t('task.assignToWorker')}
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-outline btn-sm" onClick={openEdit}>
              ✏️ {t('btn.edit')}
            </button>
          )}
          {isAdmin && (
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>{t('btn.delete')}</button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>← {t('btn.back')}</button>
        </div>
      </div>

      {editModal && (
        <div className="modal-overlay" onClick={() => setEditModal(false)}>
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 12 }}>✏️ {t('task.edit.title')}</h2>
            <div className="form-group">
              <label>{t('task.field.name')}</label>
              <input className="form-input" value={editName}
                onChange={e => setEditName(e.target.value)} autoFocus />
            </div>
            <div className="form-group">
              <label>{t('task.edit.description')}</label>
              <textarea className="form-input" rows={4} value={editDesc}
                onChange={e => setEditDesc(e.target.value)}
                placeholder={t('task.edit.description.placeholder')} />
            </div>
            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setEditModal(false)}>{t('btn.cancel')}</button>
              <button className="btn btn-primary" onClick={handleEditSave}
                disabled={!editName.trim() || editBusy}>
                {editBusy ? t('btn.saving') : t('btn.save')}
              </button>
            </div>
          </div>
        </div>
      )}

      {assignModal && (
        <div className="modal-overlay" onClick={() => setAssignModal(false)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 4 }}>👤 {t('task.assignModal.title')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              {t('task.assignModal.current')}<strong>{task.assignee_name || task.assignee_names?.join(', ') || task.team_name || '—'}</strong>
            </p>

            <div className="form-group">
              <label>{t('task.assignModal.newAssignees')}</label>
              {workers.length === 0 ? (
                <div style={{ fontSize: 12, color: 'var(--text-muted)', padding: 10 }}>
                  {t('task.assignModal.noWorkers')}
                </div>
              ) : (
                <div style={{
                  display: 'flex', flexDirection: 'column', gap: 4,
                  maxHeight: 260, overflowY: 'auto',
                  border: '1px solid var(--border)', borderRadius: 8, padding: 8,
                }}>
                  {workers.map(w => (
                    <label key={w.id} style={{
                      display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                      cursor: 'pointer', padding: '5px 8px', borderRadius: 6,
                      background: selectedWorkers.includes(w.id) ? 'var(--bg-input)' : 'transparent',
                    }}>
                      <input type="checkbox" checked={selectedWorkers.includes(w.id)}
                        onChange={() => toggleWorker(w.id)} />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {w.full_name} {w.position ? `(${w.position})` : ''} {
                          w.id === user.id ? `— ${t('task.assignModal.you')}`
                            : w.role === 'department_admin' ? `— ${t('task.assignModal.deptHead')}` : ''
                        }
                      </span>
                    </label>
                  ))}
                </div>
              )}
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
                {t('task.assignModal.selected', { n: selectedWorkers.length })}
              </div>
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setAssignModal(false)}>{t('btn.cancel')}</button>
              <button className="btn btn-primary" onClick={handleReassign}
                disabled={selectedWorkers.length === 0 || reassignBusy}>
                {reassignBusy ? t('task.assignModal.submitting') : t('task.assignModal.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span className={`badge ${statusClass(task.status)}`} style={{ fontSize: 13, padding: '4px 12px' }}>
              {statusText(task.status)}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {isAdmin && task.status === 'review' && (
                <>
                  <button className="btn btn-success btn-sm" onClick={() => handleStatusChange('completed')}>
                    ✓ {t('task.accept')}
                  </button>
                  <button className="btn btn-warning btn-sm" onClick={() => handleStatusChange('returned')}>
                    ↩ {t('task.returnBack')}
                  </button>
                </>
              )}
              {/* Boshqarma rahbari va yuqori — tugallangan vazifani qayta yuklashi mumkin
                  (ishda kamchilik topilsa). Bo'lim rahbari bunga huquqi yo'q. */}
              {canReturnCompleted && task.status === 'completed' && (
                <button className="btn btn-warning btn-sm"
                  onClick={() => {
                    if (window.confirm(t('task.returnCompleted.confirm'))) {
                      handleStatusChange('returned')
                    }
                  }}>
                  ↩ {t('task.returnCompleted')}
                </button>
              )}
              {/* Bekor qilish — rahbarga. Tugallangan vazifa bekor qilinmaydi. */}
              {isAdmin && task.status !== 'completed' && task.status !== 'cancelled' && (
                <button className="btn btn-danger btn-sm" onClick={handleCancelTask}>
                  🚫 {t('task.cancelTask')}
                </button>
              )}
              {/* Bekor qilinganini qayta ishga qaytarish */}
              {isAdmin && task.status === 'cancelled' && (
                <button className="btn btn-outline btn-sm" onClick={() => handleStatusChange('active')}>
                  ▶ {t('task.reopen')}
                </button>
              )}
            </div>
          </div>

          {task.description && (
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
              {task.description}
            </p>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {task.team_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 100 }}>{t('task.label.team')}</span>
                <span className="team-chip">{task.team_name}</span>
              </div>
            )}
            {task.assignee_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 100 }}>{t('task.label.responsible')}</span>
                <span className="member-mini-chip member-assignee">{task.assignee_name}</span>
              </div>
            )}
            {task.assignees?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 100, paddingTop: 4 }}>{t('task.label.assignees')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {task.assignees.map(a => (
                    <span key={a.id} className="member-mini-chip member-assignee">{a.full_name}</span>
                  ))}
                </div>
              </div>
            )}
            {task.team_members?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 100, paddingTop: 4 }}>{t('task.label.members')}</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {task.team_members.map(m => (
                    <span key={m.id} className={`member-mini-chip ${task.assignee_id === m.id ? 'member-assignee' : ''}`}>
                      {m.full_name}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-white)' }}>{t('task.info.title')}</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('task.info.started')}</span>
              <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{formatShortDate(task.start_date || task.created_at)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('task.info.deadline')}</span>
              <strong style={{ fontSize: 13, color: task.is_overdue ? 'var(--danger)' : 'var(--text-primary)' }}>
                {formatShortDate(task.deadline)}
                {task.is_overdue && ' ⚠️'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('field.status')}</span>
              <span className={`badge ${statusClass(task.status)}`}>{statusText(task.status)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>{t('task.info.reports')}</span>
              <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{reports.length}</strong>
            </div>
          </div>
        </div>
      </div>

      {task.attachments?.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 12 }}>
            📎 {t('task.attachments', { n: task.attachments.length })}
          </h3>
          <div className="report-files">
            {task.attachments.map(f => (
              <button key={f.id} className="report-file-chip"
                onClick={() => download(f)}>
                📎 {f.original_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {task.status === 'returned' && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          ↩ {t('task.returnedNotice')}
        </div>
      )}

      {task.status === 'cancelled' && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          🚫 {t('task.cancelledNotice')}
          {task.cancel_reason && <> — {task.cancel_reason}</>}
        </div>
      )}

      {/* Write report */}
      {canUserReport && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 4 }}>{t('task.report.title')}</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            {t('task.report.hint')}
          </p>
          <div className="form-group">
            <textarea className="form-input" value={reportText}
              onChange={e => setReportText(e.target.value)}
              placeholder={t('task.report.placeholder')}
              rows={3} />
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
              📎 {t('task.report.attachFile')}
            </label>
            <input type="file" multiple className="form-input" style={{ fontSize: 12, padding: 6 }}
              onChange={e => setReportFiles(Array.from(e.target.files))} />
            {reportFiles.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 4 }}>
                {reportFiles.map((f, i) => (
                  <span key={i} style={{ fontSize: 10, background: 'var(--bg-input)', padding: '2px 8px', borderRadius: 4, color: 'var(--text-secondary)' }}>
                    📄 {f.name}
                  </span>
                ))}
              </div>
            )}
          </div>
          <button className="btn btn-primary" onClick={handleReport} disabled={!reportText.trim()}>
            {t('task.report.submit')}
          </button>
        </div>
      )}

      {!canUserReport && !isAdmin && (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 20 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            {t('task.report.noRight')}
          </p>
        </div>
      )}

      {/* Reports history */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 12 }}>{t('task.report.history', { n: reports.length })}</h3>
        {reports.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>{t('task.report.empty')}</p>
        ) : (
          <div className="reports-list">
            {reports.map(r => (
              <div key={r.id} className="report-item">
                <div className="report-header">
                  <div>
                    <strong>{r.user_name}</strong>
                    {r.user_position && <span className="report-position">{r.user_position}</span>}
                  </div>
                  <div className="report-meta">
                    <span>{formatDate(r.created_at)}</span>
                  </div>
                </div>
                <div className="report-content">{r.content}</div>
                {r.files?.length > 0 && (
                  <div className="report-files">
                    {r.files.map(f => (
                      <button key={f.id} className="report-file-chip"
                        onClick={() => download(f)}>
                        📎 {f.original_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
