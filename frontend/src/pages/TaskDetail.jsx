import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import api from '../api/axios'

const downloadFile = async (url, originalName) => {
  try {
    const res = await api.get(url, { responseType: 'blob' })
    const blobUrl = window.URL.createObjectURL(res.data)
    const a = document.createElement('a')
    a.href = blobUrl
    a.download = originalName
    a.click()
    window.URL.revokeObjectURL(blobUrl)
  } catch (err) {
    alert('Faylni yuklab bo\'lmadi')
  }
}

export default function TaskDetail() {
  const { id } = useParams()
  const navigate = useNavigate()
  const { user } = useAuth()
  const isAdmin = user.role === 'admin'

  const [task, setTask] = useState(null)
  const [reports, setReports] = useState([])
  const [reportText, setReportText] = useState('')
  const [reportFiles, setReportFiles] = useState([])
  const [loading, setLoading] = useState(true)

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

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('uz-UZ', {
      year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
    })
  }

  const formatShortDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('uz-UZ', { year: 'numeric', month: '2-digit', day: '2-digit' })
  }

  const statusLabel = (s) => {
    if (s === 'active') return 'Faol'
    if (s === 'in_progress') return 'Jarayonda'
    if (s === 'review') return 'Tekshiruvda'
    if (s === 'returned') return 'Qayta ko\'rib chiqilsin'
    if (s === 'completed') return 'Tugallangan'
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

  const handleStatusChange = async (newStatus) => {
    try {
      const res = await api.put(`/tasks/${id}`, { status: newStatus })
      setTask(res.data)
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik yuz berdi')
    }
  }

  const handleDelete = async () => {
    if (!window.confirm('Vazifani o\'chirmoqchimisiz?')) return
    try {
      await api.delete(`/tasks/${id}`)
      navigate('/')
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik yuz berdi')
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
      alert(err.response?.data?.error || 'Xatolik yuz berdi')
    }
  }

  const canUserReport = (() => {
    if (!task) return false
    if (isAdmin) return false
    if (task.status === 'completed') return false
    if (task.assignee_id === user.id) return true
    if (task.assignees?.some(a => a.id === user.id)) return true
    if (!task.assignee_id && !task.assignees?.length && task.team_members?.some(m => m.id === user.id)) return true
    return false
  })()

  if (loading) return <div className="empty-state"><p>Yuklanmoqda...</p></div>
  if (!task) return <div className="empty-state"><p>Vazifa topilmadi</p></div>

  return (
    <div>
      <div className="page-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <h1>{task.name}</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 4 }}>
            Vazifa #{task.id}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <button className="btn btn-danger btn-sm" onClick={handleDelete}>O'chirish</button>
          )}
          <button className="btn btn-outline btn-sm" onClick={() => navigate(-1)}>← Orqaga</button>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>
        <div className="card">
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <span className={`badge ${statusClass(task.status)}`} style={{ fontSize: 13, padding: '4px 12px' }}>
              {statusLabel(task.status)}
            </span>
            <div style={{ display: 'flex', gap: 6 }}>
              {isAdmin && task.status === 'review' && (
                <>
                  <button className="btn btn-success btn-sm" onClick={() => handleStatusChange('completed')}>
                    ✓ Qabul qilish
                  </button>
                  <button className="btn btn-warning btn-sm" onClick={() => handleStatusChange('returned')}>
                    ↩ Qayta yuklash
                  </button>
                </>
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
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 100 }}>Guruh:</span>
                <span className="team-chip">{task.team_name}</span>
              </div>
            )}
            {task.assignee_name && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 100 }}>Mas'ul shaxs:</span>
                <span className="member-mini-chip member-assignee">{task.assignee_name}</span>
              </div>
            )}
            {task.assignees?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 100, paddingTop: 4 }}>Bajaruvchilar:</span>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                  {task.assignees.map(a => (
                    <span key={a.id} className="member-mini-chip member-assignee">{a.full_name}</span>
                  ))}
                </div>
              </div>
            )}
            {task.team_members?.length > 0 && (
              <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)', minWidth: 100, paddingTop: 4 }}>A'zolar:</span>
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
          <h3 style={{ fontSize: 14, color: 'var(--text-white)' }}>Vazifa ma'lumotlari</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Boshlangan sana</span>
              <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{formatShortDate(task.start_date || task.created_at)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Topshirish muddati</span>
              <strong style={{ fontSize: 13, color: task.is_overdue ? 'var(--danger)' : 'var(--text-primary)' }}>
                {formatShortDate(task.deadline)}
                {task.is_overdue && ' ⚠️'}
              </strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Holat</span>
              <span className={`badge ${statusClass(task.status)}`}>{statusLabel(task.status)}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hisobotlar</span>
              <strong style={{ fontSize: 13, color: 'var(--text-primary)' }}>{reports.length}</strong>
            </div>
          </div>
        </div>
      </div>

      {task.attachments?.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 12 }}>
            📎 Biriktirilgan fayllar ({task.attachments.length})
          </h3>
          <div className="report-files">
            {task.attachments.map(f => (
              <button key={f.id} className="report-file-chip"
                onClick={() => downloadFile(f.download_url, f.original_name)}>
                📎 {f.original_name}
              </button>
            ))}
          </div>
        </div>
      )}

      {task.status === 'returned' && (
        <div className="alert alert-error" style={{ marginBottom: 16 }}>
          ↩ Bu vazifa admin tomonidan qayta ko'rib chiqish uchun qaytarildi. Iltimos, tuzatib, yangi hisobot bilan qayta yuboring.
        </div>
      )}

      {/* Write report */}
      {canUserReport && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 4 }}>Hisobot yozish</h3>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>
            Hisobot yuborilgach, vazifa admin tekshiruviga o'tadi.
          </p>
          <div className="form-group">
            <textarea className="form-input" value={reportText}
              onChange={e => setReportText(e.target.value)}
              placeholder="Bugun nima qilindi, qanday natijalar erishildi..."
              rows={3} />
          </div>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
              📎 Fayl biriktirish (ixtiyoriy)
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
            Hisobotni yuborish
          </button>
        </div>
      )}

      {!canUserReport && !isAdmin && (
        <div className="card" style={{ marginBottom: 16, textAlign: 'center', padding: 20 }}>
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>
            Sizda hisobot topshirish huquqi yo'q.
          </p>
        </div>
      )}

      {/* Reports history */}
      <div className="card">
        <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 12 }}>Hisobotlar tarixi ({reports.length})</h3>
        {reports.length === 0 ? (
          <p style={{ color: 'var(--text-muted)', fontSize: 13 }}>Hali hisobot yozilmagan</p>
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
                        onClick={() => downloadFile(f.download_url, f.original_name)}>
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
