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
    console.error(err)
  }
}

function DonutChart({ percent }) {
  const r = 54
  const circ = 2 * Math.PI * r
  const offset = circ - (percent / 100) * circ
  return (
    <div className="donut-wrap">
      <svg width="140" height="140" viewBox="0 0 140 140" className="donut-svg">
        <circle className="donut-track" cx="70" cy="70" r={r} strokeWidth="10" />
        <circle className="donut-fill" cx="70" cy="70" r={r} strokeWidth="10"
          stroke="url(#donutGrad)" strokeDasharray={circ} strokeDashoffset={offset} />
        <defs>
          <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#3b82f6" />
            <stop offset="100%" stopColor="#06d6a0" />
          </linearGradient>
        </defs>
      </svg>
      <div style={{ position: 'absolute', textAlign: 'center' }}>
        <div style={{ fontSize: 28, fontWeight: 800, color: '#fff' }}>{percent}%</div>
        <div style={{ fontSize: 11, color: '#94a3b8' }}>Bajarilgan</div>
      </div>
    </div>
  )
}

export default function ProjectDetail() {
  const { id } = useParams()
  const { user } = useAuth()
  const navigate = useNavigate()
  const [project, setProject] = useState(null)
  const [reports, setReports] = useState([])
  const [reportText, setReportText] = useState('')
  const [reportStage, setReportStage] = useState('')
  const [reportFiles, setReportFiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [editMode, setEditMode] = useState(false)
  const [editForm, setEditForm] = useState({})
  const [newSubName, setNewSubName] = useState({})
  const [expandedStages, setExpandedStages] = useState({})
  const [editStages, setEditStages] = useState([])
  const [deletedStageIds, setDeletedStageIds] = useState(new Set())
  const [teams, setTeams] = useState([])
  const [users, setUsers] = useState([])

  useEffect(() => { loadProject() }, [id])

  useEffect(() => {
    Promise.all([api.get('/teams'), api.get('/users')]).then(([tr, ur]) => {
      setTeams(tr.data)
      setUsers(ur.data.filter(u => u.role === 'user' && u.is_active))
    }).catch(console.error)
  }, [])

  const loadProject = async () => {
    try {
      const [projRes, repRes] = await Promise.all([
        api.get(`/projects/${id}`),
        api.get(`/projects/${id}/reports`),
      ])
      setProject(projRes.data)
      setReports(repRes.data)
      setEditForm({
        name: projRes.data.name,
        description: projRes.data.description,
        status: projRes.data.status,
      })
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
      hour: '2-digit', minute: '2-digit',
    })
  }

  const formatShortDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit', year: 'numeric' })
  }

  const statusLabel = (s) => {
    if (s === 'active') return 'Faol'
    if (s === 'completed') return 'Tugallangan'
    if (s === 'on_hold') return 'To\'xtatilgan'
    return s
  }

  const handleStageUpdate = async (stageId, status) => {
    try {
      const res = await api.put(`/projects/${id}/stages/${stageId}`, { status })
      setProject(res.data)
    } catch (err) {
      const msg = err.response?.data?.error || 'Xatolik yuz berdi'
      alert(msg)
    }
  }

  const handleReport = async () => {
    if (!reportText.trim()) return
    try {
      const formData = new FormData()
      formData.append('content', reportText.trim())
      if (reportStage) formData.append('stage_id', reportStage)
      reportFiles.forEach(f => formData.append('files', f))

      await api.post(`/projects/${id}/reports`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      })
      setReportText('')
      setReportStage('')
      setReportFiles([])
      const res = await api.get(`/projects/${id}/reports`)
      setReports(res.data)
    } catch (err) {
      const msg = err.response?.data?.error || 'Xatolik yuz berdi'
      alert(msg)
    }
  }

  const toggleStageExpand = (stageId) => {
    setExpandedStages(prev => ({ ...prev, [stageId]: !prev[stageId] }))
  }

  const canManageSubStages = (s) => {
    return isAdmin || s.assignee_id === user.id || s.assignees?.some(a => a.id === user.id) ||
      (!s.assignee_id && !s.assignees?.length && s.team_members?.some(m => m.id === user.id))
  }

  const handleAddSubStage = async (stageId) => {
    const name = (newSubName[stageId] || '').trim()
    if (!name) return
    try {
      const res = await api.post(`/projects/${id}/stages/${stageId}/substages`, { name })
      setProject(res.data)
      setNewSubName(prev => ({ ...prev, [stageId]: '' }))
      setExpandedStages(prev => ({ ...prev, [stageId]: true }))
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  const handleSubStageUpdate = async (stageId, subId, status) => {
    try {
      const res = await api.put(`/projects/${id}/stages/${stageId}/substages/${subId}`, { status })
      setProject(res.data)
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  const handleDeleteSubStage = async (stageId, subId) => {
    if (!window.confirm('Ichki bosqichni o\'chirmoqchimisiz?')) return
    try {
      const res = await api.delete(`/projects/${id}/stages/${stageId}/substages/${subId}`)
      setProject(res.data)
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  const openEditMode = () => {
    setEditStages(project.stages.map(s => ({
      id: s.id,
      name: s.name,
      deadline: s.deadline ? s.deadline.split('T')[0] : '',
      assign_type: s.assignees?.length > 0 ? 'individual' : 'team',
      team_id: s.team_id ? String(s.team_id) : '',
      assignee_id: s.assignee_id ? String(s.assignee_id) : '',
      assignee_ids: s.assignees?.map(a => a.id) || [],
    })))
    setDeletedStageIds(new Set())
    setEditMode(true)
  }

  const handleEditSave = async () => {
    try {
      await api.put(`/projects/${id}`, editForm)

      for (const sid of deletedStageIds) {
        await api.delete(`/projects/${id}/stages/${sid}`)
      }

      for (const s of editStages.filter(s => s.id && !deletedStageIds.has(s.id))) {
        await api.put(`/projects/${id}/stages/${s.id}`, {
          name: s.name,
          deadline: s.deadline ? new Date(s.deadline + 'T23:59:59').toISOString() : null,
          team_id: s.assign_type === 'team' ? (parseInt(s.team_id) || null) : null,
          assignee_id: s.assign_type === 'team' ? (parseInt(s.assignee_id) || null) : null,
          assignee_ids: s.assign_type === 'individual' ? s.assignee_ids : [],
        })
      }

      for (const s of editStages.filter(s => !s.id)) {
        await api.post(`/projects/${id}/stages`, {
          name: s.name,
          deadline: s.deadline ? new Date(s.deadline + 'T23:59:59').toISOString() : null,
          team_id: s.assign_type === 'team' ? (parseInt(s.team_id) || null) : null,
          assignee_id: s.assign_type === 'team' ? (parseInt(s.assignee_id) || null) : null,
          assignee_ids: s.assign_type === 'individual' ? s.assignee_ids : [],
        })
      }

      setEditMode(false)
      setDeletedStageIds(new Set())
      loadProject()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik yuz berdi')
    }
  }

  const updateEditStage = (idx, field, val) => {
    const s = [...editStages]
    s[idx] = { ...s[idx], [field]: val }
    if (field === 'assign_type') { s[idx].team_id = ''; s[idx].assignee_id = ''; s[idx].assignee_ids = [] }
    if (field === 'team_id') s[idx].assignee_id = ''
    setEditStages(s)
  }

  const toggleEditStageAssignee = (idx, uid) => {
    const s = [...editStages]
    const cur = s[idx].assignee_ids || []
    s[idx] = { ...s[idx], assignee_ids: cur.includes(uid) ? cur.filter(x => x !== uid) : [...cur, uid] }
    setEditStages(s)
  }

  const addEditStage = () => {
    setEditStages([...editStages, { id: null, name: '', deadline: '', assign_type: 'team', team_id: '', assignee_id: '', assignee_ids: [] }])
  }

  const removeEditStage = (idx) => {
    const s = editStages[idx]
    if (s.id) {
      setDeletedStageIds(prev => new Set([...prev, s.id]))
    }
    setEditStages(editStages.filter((_, i) => i !== idx))
  }

  const getTeamMembersEdit = (teamId) => {
    if (!teamId) return []
    const team = teams.find(t => t.id === parseInt(teamId))
    return team?.members || []
  }

  const handleDelete = async () => {
    if (!window.confirm('Bu loyihani o\'chirmoqchimisiz?')) return
    try {
      await api.delete(`/projects/${id}`)
      navigate('/')
    } catch (err) {
      console.error(err)
    }
  }

  if (loading) return <div className="empty-state"><p>Yuklanmoqda...</p></div>
  if (!project) return <div className="empty-state"><p>Loyiha topilmadi</p></div>

  const isAdmin = user.role === 'admin'
  const completedStages = project.stages.filter(s => s.status === 'completed').length
  const currentStage = project.stages.find(s => s.status === 'in_progress' || s.status === 'review')
  const currentIdx = currentStage ? project.stages.findIndex(s => s.id === currentStage.id) : -1

  const userStages = project.stages.filter(s =>
    s.assignee_id === user.id || s.assignees?.some(a => a.id === user.id) ||
    (!s.assignee_id && !s.assignees?.length && s.team_members?.some(m => m.id === user.id))
  )
  const canUserReport = !isAdmin && userStages.length > 0

  const canUserSubmitStage = (s) => {
    if (isAdmin) return false
    return s.status === 'in_progress' && (
      s.assignee_id === user.id || s.assignees?.some(a => a.id === user.id) ||
      (!s.assignee_id && !s.assignees?.length && s.team_members?.some(m => m.id === user.id))
    )
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ marginBottom: 4 }}>Loyiha Ish Jarayoni</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
            Loyiha {project.stages.length} ta bosqichga bo'lingan.
            {currentStage && ` Hozirgi bosqich: ${currentIdx + 1}-bosqich`}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          {isAdmin && (
            <>
              <button className="btn btn-outline btn-sm" onClick={() => editMode ? (setEditMode(false), setDeletedStageIds(new Set())) : openEditMode()}>
                {editMode ? 'Bekor qilish' : 'Tahrirlash'}
              </button>
              <button className="btn btn-danger btn-sm" onClick={handleDelete}>O'chirish</button>
            </>
          )}
          <button className="btn btn-outline" onClick={() => navigate('/')}>← Orqaga</button>
        </div>
      </div>

      {editMode && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h2 style={{ fontSize: 16, marginBottom: 12, color: 'var(--text-white)' }}>Loyihani tahrirlash</h2>
          <div className="form-group">
            <label>Nomi</label>
            <input className="form-input" value={editForm.name}
              onChange={e => setEditForm({ ...editForm, name: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Tavsifi</label>
            <textarea className="form-input" value={editForm.description}
              onChange={e => setEditForm({ ...editForm, description: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Holat</label>
            <select className="form-input" value={editForm.status}
              onChange={e => setEditForm({ ...editForm, status: e.target.value })}>
              <option value="active">Faol</option>
              <option value="on_hold">To'xtatilgan</option>
              <option value="completed">Tugallangan</option>
            </select>
          </div>
          <div className="form-group">
            <label>Bosqichlar</label>
            <div className="stages-editor">
              {editStages.map((stage, idx) => {
                const members = getTeamMembersEdit(stage.team_id)
                return (
                  <div key={idx} className="stage-edit-block">
                    <div className="stage-edit-header">
                      <span className="stage-number">{idx + 1}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{idx + 1}-bosqich</span>
                      {editStages.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeEditStage(idx)}
                          style={{ marginLeft: 'auto' }}>✕</button>
                      )}
                    </div>
                    <div className="stage-edit-fields">
                      <input className="form-input" value={stage.name}
                        onChange={e => updateEditStage(idx, 'name', e.target.value)}
                        placeholder="Bosqich nomi" />
                      <div className="stage-edit-row">
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Tugatish muddati</label>
                          <input type="date" className="form-input" value={stage.deadline}
                            onChange={e => updateEditStage(idx, 'deadline', e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Bajaruvchi turi</label>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', height: 38 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                              <input type="radio" name={`edit_assign_${idx}`} value="team"
                                checked={stage.assign_type === 'team'}
                                onChange={() => updateEditStage(idx, 'assign_type', 'team')} />
                              Guruh
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                              <input type="radio" name={`edit_assign_${idx}`} value="individual"
                                checked={stage.assign_type === 'individual'}
                                onChange={() => updateEditStage(idx, 'assign_type', 'individual')} />
                              Individual ishchi
                            </label>
                          </div>
                        </div>
                      </div>

                      {stage.assign_type === 'team' && (
                        <div style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Bajaruvchi guruh</label>
                          <select className="form-input" value={stage.team_id}
                            onChange={e => updateEditStage(idx, 'team_id', e.target.value)}>
                            <option value="">Guruhni tanlang...</option>
                            {teams.map(t => (
                              <option key={t.id} value={t.id}>{t.name} ({t.members?.length || 0})</option>
                            ))}
                          </select>
                          {stage.team_id && members.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>Mas'ul shaxs</label>
                              <select className="form-input" value={stage.assignee_id}
                                onChange={e => updateEditStage(idx, 'assignee_id', e.target.value)}>
                                <option value="">Hammasi hisobot topshiradi</option>
                                {members.map(m => (
                                  <option key={m.id} value={m.id}>{m.full_name} {m.position ? `(${m.position})` : ''}</option>
                                ))}
                              </select>
                            </div>
                          )}
                        </div>
                      )}

                      {stage.assign_type === 'individual' && (
                        <div style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                            Individual ishchilar (tanlangan: {stage.assignee_ids?.length || 0})
                          </label>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 180, overflowY: 'auto',
                            border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                            {users.map(u => (
                              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                                cursor: 'pointer', padding: '4px 8px', borderRadius: 6,
                                background: stage.assignee_ids?.includes(u.id) ? 'var(--bg-input)' : 'transparent' }}>
                                <input type="checkbox" checked={stage.assignee_ids?.includes(u.id) || false}
                                  onChange={() => toggleEditStageAssignee(idx, u.id)} />
                                <span style={{ color: 'var(--text-secondary)' }}>
                                  {u.full_name} {u.position ? `(${u.position})` : ''} — {u.department}
                                </span>
                              </label>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                )
              })}
              <button type="button" className="btn btn-outline" onClick={addEditStage}
                style={{ width: '100%', marginTop: 4 }}>
                + Bosqich qo'shish
              </button>
            </div>
          </div>

          <button className="btn btn-primary" onClick={handleEditSave}>Saqlash</button>
        </div>
      )}

      {/* Pipeline stages */}
      <div className="card" style={{ marginBottom: 16, overflowX: 'auto' }}>
        <div className="stages-pipeline">
          {project.stages.map((stage, idx) => {
            const isCompleted = stage.status === 'completed'
            const isActive = stage.status === 'in_progress'
            const isReview = stage.status === 'review'
            const cls = isCompleted ? 'completed' : (isActive || isReview) ? 'active' : 'pending'

            return (
              <div key={stage.id} className={`pipeline-stage ${cls}`}>
                {idx < project.stages.length - 1 && (
                  <div className={`pipeline-connector pipeline-connector-${
                    isCompleted ? 'completed' : (isActive || isReview) ? 'active' : 'pending'
                  }`} />
                )}
                <div className={`pipeline-node pipeline-node-${isReview ? 'review' : stage.status}`}>
                  {isCompleted ? '✓' : isReview ? '!' : stage.order}
                </div>
                <div className="pipeline-label">{stage.name}</div>
                {stage.team_name && (
                  <div style={{ fontSize: 10, color: 'var(--primary)', marginTop: 2, textAlign: 'center' }}>
                    {stage.team_name}
                  </div>
                )}
                {stage.assignee_name && (
                  <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 1, textAlign: 'center' }}>
                    {stage.assignee_name}
                  </div>
                )}
                {stage.assignees?.length > 0 && (
                  <div style={{ fontSize: 9, color: 'var(--accent)', marginTop: 1, textAlign: 'center' }}>
                    {stage.assignees.map(a => a.full_name).join(', ')}
                  </div>
                )}
                <div className="pipeline-status-icon">
                  {isCompleted ? (stage.is_overdue ? '⚠️' : '✅') : isReview ? '🟡' : isActive ? '🔵' : '⚪'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Current stage detail + Donut */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 320px', gap: 16, marginBottom: 16 }}>
        <div className="card">
          {currentStage ? (
            <>
              <div className="stage-detail-title">
                {currentStage.order}-BOSQICH: {currentStage.name.toUpperCase()}
              </div>
              {project.description && (
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', marginBottom: 16, lineHeight: 1.6 }}>
                  {project.description}
                </p>
              )}
              <h4 style={{ fontSize: 13, color: 'var(--text-white)', marginBottom: 10 }}>Bosqichlar holati</h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {project.stages.map(s => (
                  <div key={s.id} className={`stage-list-item ${s.is_overdue ? 'stage-overdue' : ''}`}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
                      <span>{s.status === 'completed' ? (s.is_overdue ? '⚠️' : '✅') : s.status === 'review' ? '🟡' : s.status === 'in_progress' ? '🔄' : '⚪'}</span>
                      <div style={{ display: 'flex', flexDirection: 'column' }}>
                        <span style={{ fontSize: 13, color: s.status === 'completed' ? (s.is_overdue ? '#f59e0b' : 'var(--success)') : 'var(--text-secondary)' }}>
                          {s.order}. {s.name}
                        </span>
                        <div style={{ display: 'flex', gap: 8, fontSize: 11, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
                          {s.team_name && <span>👥 {s.team_name}</span>}
                          {s.assignee_name && <span>👤 {s.assignee_name}</span>}
                          {s.assignees?.length > 0 && <span>👤 {s.assignees.map(a => a.full_name).join(', ')}</span>}
                          {s.deadline && <span>📅 {formatShortDate(s.deadline)}</span>}
                          {s.is_overdue && <span style={{ color: '#ef4444', fontWeight: 600 }}>Kechikkan!</span>}
                        </div>
                        {s.assignees?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                            {s.assignees.map(a => (
                              <span key={a.id} className="member-mini-chip member-assignee">{a.full_name}</span>
                            ))}
                          </div>
                        )}
                        {s.team_members?.length > 0 && (
                          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginTop: 4 }}>
                            {s.team_members.map(m => (
                              <span key={m.id} className={`member-mini-chip ${s.assignee_id === m.id ? 'member-assignee' : ''}`}>
                                {m.full_name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span className={`badge badge-${s.status === 'completed' ? 'completed' : s.status === 'review' ? 'review' : s.status === 'in_progress' ? 'active' : 'pending'}`}>
                        {s.status === 'completed' ? 'Bajarilgan' : s.status === 'review' ? 'Tekshiruvda' : s.status === 'in_progress' ? 'Jarayonda' : 'Kutilmoqda'}
                      </span>
                      {canUserSubmitStage(s) && (
                        <button className="btn btn-warning btn-sm" onClick={() => handleStageUpdate(s.id, 'review')}>
                          Bajarildi
                        </button>
                      )}
                      {isAdmin && s.status === 'review' && (
                        <button className="btn btn-success btn-sm" onClick={() => handleStageUpdate(s.id, 'completed')}>
                          ✓ Tasdiqlash
                        </button>
                      )}
                      {isAdmin && s.status === 'review' && (
                        <button className="btn btn-outline btn-sm" onClick={() => handleStageUpdate(s.id, 'in_progress')}>
                          ↩ Qaytarish
                        </button>
                      )}
                      {isAdmin && s.status === 'pending' && (
                        <button className="btn btn-outline btn-sm" onClick={() => handleStageUpdate(s.id, 'in_progress')}>
                          ▶
                        </button>
                      )}
                    </div>
                    {/* Sub-stages section */}
                    {(s.sub_stages?.length > 0 || canManageSubStages(s)) && (s.status === 'in_progress' || s.status === 'review' || s.sub_stages?.length > 0) && (
                      <div className="substages-section">
                        <button className="substage-toggle" onClick={() => toggleStageExpand(s.id)}>
                          {expandedStages[s.id] ? '▾' : '▸'} Ichki bosqichlar ({s.sub_stages?.length || 0})
                          {s.sub_stages?.length > 0 && (
                            <span style={{ marginLeft: 6, fontSize: 10, color: 'var(--text-muted)' }}>
                              {s.sub_stages.filter(ss => ss.status === 'completed').length}/{s.sub_stages.length}
                            </span>
                          )}
                        </button>
                        {expandedStages[s.id] && (
                          <div className="substages-grid">
                            {s.sub_stages?.map((ss, ssIdx) => (
                              <div key={ss.id} className={`substage-card substage-card-${ss.status}`}>
                                <div className="substage-card-header">
                                  <span className="substage-order">{ssIdx + 1}</span>
                                  <span className={`badge badge-${ss.status === 'completed' ? 'completed' : ss.status === 'in_progress' ? 'active' : 'pending'}`}
                                    style={{ fontSize: 9, padding: '2px 6px' }}>
                                    {ss.status === 'completed' ? 'Bajarilgan' : ss.status === 'in_progress' ? 'Jarayonda' : 'Kutilmoqda'}
                                  </span>
                                </div>
                                <div className="substage-card-name">{ss.name}</div>
                                {ss.completed_at && (
                                  <div className="substage-card-date">{formatShortDate(ss.completed_at)}</div>
                                )}
                                <div className="substage-card-actions">
                                  {canManageSubStages(s) && ss.status === 'in_progress' && (
                                    <button className="btn btn-success btn-sm" style={{ padding: '3px 10px', fontSize: 10 }}
                                      onClick={() => handleSubStageUpdate(s.id, ss.id, 'completed')}>✓ Tayyor</button>
                                  )}
                                  {canManageSubStages(s) && ss.status === 'pending' && (
                                    <button className="btn btn-outline btn-sm" style={{ padding: '3px 10px', fontSize: 10 }}
                                      onClick={() => handleSubStageUpdate(s.id, ss.id, 'in_progress')}>▶ Boshlash</button>
                                  )}
                                  {canManageSubStages(s) && (
                                    <button className="btn btn-danger btn-sm" style={{ padding: '3px 6px', fontSize: 10 }}
                                      onClick={() => handleDeleteSubStage(s.id, ss.id)}>✕</button>
                                  )}
                                </div>
                              </div>
                            ))}
                            {canManageSubStages(s) && (s.status === 'in_progress' || s.status === 'review') && (
                              <div className="substage-card substage-card-add">
                                <input className="form-input" style={{ fontSize: 12, padding: '6px 10px' }}
                                  placeholder="Ichki bosqich nomi..."
                                  value={newSubName[s.id] || ''}
                                  onChange={e => setNewSubName(prev => ({ ...prev, [s.id]: e.target.value }))}
                                  onKeyDown={e => e.key === 'Enter' && handleAddSubStage(s.id)} />
                                <button className="btn btn-primary btn-sm" style={{ width: '100%', marginTop: 6, fontSize: 11 }}
                                  onClick={() => handleAddSubStage(s.id)}>+ Qo'shish</button>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div style={{ textAlign: 'center', padding: 20, color: 'var(--success)' }}>
              <p style={{ fontSize: 18, fontWeight: 700 }}>Barcha bosqichlar tugallangan!</p>
            </div>
          )}
        </div>

        <div className="card" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 20, position: 'relative' }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-white)', alignSelf: 'flex-start' }}>Joriy bosqich holati</h3>
          <DonutChart percent={project.progress} />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', fontSize: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Boshlangan sana</span>
              <strong style={{ color: 'var(--text-primary)' }}>{formatShortDate(project.start_date || project.created_at)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Topshirish muddati</span>
              <strong style={{ color: 'var(--text-primary)' }}>{formatShortDate(project.deadline)}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Qatnashchilar</span>
              <strong style={{ color: 'var(--text-primary)' }}>{project.total_participants || 0} kishi</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', color: 'var(--text-muted)' }}>
              <span>Holat</span>
              <span className={`badge badge-${project.status === 'active' ? 'active' : project.status === 'completed' ? 'completed' : 'on_hold'}`}>
                {statusLabel(project.status)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div className="summary-bar" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h3 style={{ fontSize: 15, color: 'var(--text-white)' }}>Loyiha umumiy holati</h3>
          <span className="progress-text" style={{ fontSize: 18 }}>{project.progress}%</span>
        </div>
        <div className="summary-progress">
          <div className="progress-bar" style={{ height: 10, borderRadius: 5 }}>
            <div className="progress-fill" style={{ width: `${project.progress}%`, borderRadius: 5 }} />
          </div>
        </div>
        <div className="summary-stats">
          <div className="summary-stat">
            <span className="summary-stat-label">Boshlangan sana</span>
            <span className="summary-stat-value">{formatShortDate(project.start_date || project.created_at)}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Topshirish muddati</span>
            <span className="summary-stat-value">{formatShortDate(project.deadline)}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Jami bosqichlar</span>
            <span className="summary-stat-value">{project.stages.length}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Bajarilgan</span>
            <span className="summary-stat-value">{completedStages}</span>
          </div>
          <div className="summary-stat">
            <span className="summary-stat-label">Qatnashchilar</span>
            <span className="summary-stat-value">{project.total_participants || 0}</span>
          </div>
        </div>
      </div>

      {/* Team Performance Stats */}
      {project.team_stats?.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 12 }}>Guruhlar samaradorligi</h3>
          <div className="team-stats-grid">
            {project.team_stats.map(ts => {
              const pct = ts.total_stages > 0 ? Math.round(ts.completed / ts.total_stages * 100) : 0
              return (
                <div key={ts.team_id} className="team-stat-card">
                  <div className="team-stat-header">
                    <h4>{ts.team_name}</h4>
                    <span className="team-stat-pct">{pct}%</span>
                  </div>
                  <div className="progress-bar" style={{ height: 6, marginBottom: 10, borderRadius: 3 }}>
                    <div className="progress-fill" style={{ width: `${pct}%`, borderRadius: 3 }} />
                  </div>
                  <div className="team-stat-details">
                    <div className="team-stat-item">
                      <span>Jami bosqichlar</span>
                      <strong>{ts.total_stages}</strong>
                    </div>
                    <div className="team-stat-item">
                      <span>Bajarilgan</span>
                      <strong style={{ color: 'var(--success)' }}>{ts.completed}</strong>
                    </div>
                    <div className="team-stat-item">
                      <span>Vaqtida</span>
                      <strong style={{ color: 'var(--accent)' }}>{ts.on_time}</strong>
                    </div>
                    <div className="team-stat-item">
                      <span>Kechikkan</span>
                      <strong style={{ color: ts.late > 0 ? '#ef4444' : 'var(--text-muted)' }}>{ts.late}</strong>
                    </div>
                    <div className="team-stat-item">
                      <span>Jarayonda</span>
                      <strong style={{ color: 'var(--primary)' }}>{ts.in_progress}</strong>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Attachments */}
      {project.attachments?.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 10 }}>Fayllar</h3>
          <div className="task-files">
            {project.attachments.map(f => (
              <button key={f.id} className="file-link" onClick={() => downloadFile(f.download_url, f.original_name)}>
                📎 {f.original_name} <span className="file-size">({(f.file_size / 1024).toFixed(1)} KB)</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Teams */}
      <div className="card" style={{ marginBottom: 16 }}>
        <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 12 }}>Ishtirokchi guruhlar</h3>
        <div className="teams-grid" style={{ gap: 12 }}>
          {project.teams.map(t => (
            <div key={t.id} className="team-mini-card">
              <h4>{t.name}</h4>
              <div className="team-mini-members">
                {t.members.map(m => (
                  <span key={m.id} className="member-chip">
                    {m.full_name} <small>{m.position || ''}</small>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Write report */}
      {canUserReport && (
        <div className="card" style={{ marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, color: 'var(--text-white)', marginBottom: 12 }}>Kunlik hisobot yozish</h3>
          <div className="form-group" style={{ marginBottom: 8 }}>
            <select className="form-input" value={reportStage}
              onChange={e => setReportStage(e.target.value)}>
              <option value="">Bosqichni tanlang</option>
              {userStages.map(s => (
                <option key={s.id} value={s.id}>{s.order}. {s.name}</option>
              ))}
            </select>
          </div>
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
                    {r.stage_name && <span className="report-stage">📍 {r.stage_name}</span>}
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
