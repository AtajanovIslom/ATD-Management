import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function CreateProject() {
  const navigate = useNavigate()
  const [teams, setTeams] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({
    name: '', description: '', start_date: '', deadline: '',
    stages: [{ name: '', deadline: '', assign_type: 'team', team_id: '', assignee_id: '', assignee_ids: [] }],
  })
  const [files, setFiles] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    Promise.all([
      api.get('/teams'),
      api.get('/users'),
    ]).then(([teamsRes, usersRes]) => {
      setTeams(teamsRes.data)
      setUsers(usersRes.data.filter(u => u.role === 'user' && u.is_active))
    }).catch(console.error)
  }, [])

  const addStage = () => setForm({
    ...form,
    stages: [...form.stages, { name: '', deadline: '', assign_type: 'team', team_id: '', assignee_id: '' }],
  })

  const removeStage = (idx) => {
    if (form.stages.length <= 1) return
    setForm({ ...form, stages: form.stages.filter((_, i) => i !== idx) })
  }

  const updateStage = (idx, field, val) => {
    const s = [...form.stages]
    s[idx] = { ...s[idx], [field]: val }
    if (field === 'team_id') {
      s[idx].assignee_id = ''
    }
    if (field === 'assign_type') {
      s[idx].team_id = ''
      s[idx].assignee_id = ''
      s[idx].assignee_ids = []
    }
    setForm({ ...form, stages: s })
  }

  const toggleStageAssignee = (idx, uid) => {
    const s = [...form.stages]
    const cur = s[idx].assignee_ids || []
    s[idx] = { ...s[idx], assignee_ids: cur.includes(uid) ? cur.filter(x => x !== uid) : [...cur, uid] }
    setForm({ ...form, stages: s })
  }

  const toggleStageAll = (idx) => {
    const s = [...form.stages]
    const allIds = users.map(u => u.id)
    s[idx] = { ...s[idx], assignee_ids: (s[idx].assignee_ids?.length === allIds.length) ? [] : allIds }
    setForm({ ...form, stages: s })
  }

  const getTeamMembers = (teamId) => {
    if (!teamId) return []
    const team = teams.find(t => t.id === parseInt(teamId))
    return team?.members || []
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    const validStages = form.stages.filter(s => s.name.trim())
    if (!validStages.length) {
      setError('Kamida bitta bosqich kiritilishi shart')
      return
    }

    setLoading(true)
    try {
      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('description', form.description)
      if (form.start_date) fd.append('start_date', new Date(form.start_date + 'T00:00:00').toISOString())
      if (form.deadline) fd.append('deadline', new Date(form.deadline + 'T23:59:59').toISOString())
      fd.append('stages', JSON.stringify(validStages.map(s => ({
        name: s.name,
        deadline: s.deadline ? new Date(s.deadline + 'T23:59:59').toISOString() : null,
        team_id: s.assign_type === 'team' && s.team_id ? parseInt(s.team_id) : null,
        assignee_id: s.assign_type === 'team' && s.team_id && s.assignee_id ? parseInt(s.assignee_id) : null,
        assignee_ids: s.assign_type === 'individual' ? s.assignee_ids : [],
      }))))
      if (files) {
        for (const f of files) fd.append('files', f)
      }

      const res = await api.post('/projects', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      navigate(`/projects/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div>
      <div className="page-header">
        <h1>Yangi loyiha yaratish</h1>
      </div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Loyiha nomi *</label>
            <input className="form-input" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Loyiha nomini kiriting" required />
          </div>

          <div className="form-group">
            <label>Loyiha tavsifi</label>
            <textarea className="form-input" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Loyiha haqida batafsil yozing..." rows={3} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            <div className="form-group">
              <label>Boshlash sanasi</label>
              <input type="date" className="form-input" value={form.start_date}
                onChange={e => setForm({ ...form, start_date: e.target.value })} />
            </div>
            <div className="form-group">
              <label>Topshirish muddati</label>
              <input type="date" className="form-input" value={form.deadline}
                onChange={e => setForm({ ...form, deadline: e.target.value })} />
            </div>
          </div>

          <div className="form-group">
            <label>Bosqichlar *</label>
            <div className="stages-editor">
              {form.stages.map((stage, idx) => {
                const members = getTeamMembers(stage.team_id)
                return (
                  <div key={idx} className="stage-edit-block">
                    <div className="stage-edit-header">
                      <span className="stage-number">{idx + 1}</span>
                      <span style={{ fontSize: 13, color: 'var(--text-secondary)' }}>{idx + 1}-bosqich</span>
                      {form.stages.length > 1 && (
                        <button type="button" className="btn btn-danger btn-sm" onClick={() => removeStage(idx)}
                          style={{ marginLeft: 'auto' }}>✕</button>
                      )}
                    </div>
                    <div className="stage-edit-fields">
                      <input className="form-input" value={stage.name}
                        onChange={e => updateStage(idx, 'name', e.target.value)}
                        placeholder="Bosqich nomi" />
                      <div className="stage-edit-row">
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                            Tugatish muddati
                          </label>
                          <input type="date" className="form-input" value={stage.deadline}
                            onChange={e => updateStage(idx, 'deadline', e.target.value)} />
                        </div>
                        <div style={{ flex: 1 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                            Bajaruvchi turi
                          </label>
                          <div style={{ display: 'flex', gap: 12, alignItems: 'center', height: 38 }}>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                              <input type="radio" name={`assign_type_${idx}`} value="team"
                                checked={stage.assign_type === 'team'}
                                onChange={() => updateStage(idx, 'assign_type', 'team')} />
                              Guruh
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                              <input type="radio" name={`assign_type_${idx}`} value="individual"
                                checked={stage.assign_type === 'individual'}
                                onChange={() => updateStage(idx, 'assign_type', 'individual')} />
                              Individual ishchi
                            </label>
                          </div>
                        </div>
                      </div>

                      {stage.assign_type === 'team' && (
                        <div style={{ marginTop: 8 }}>
                          <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                            Bajaruvchi guruh
                          </label>
                          <select className="form-input" value={stage.team_id}
                            onChange={e => updateStage(idx, 'team_id', e.target.value)}>
                            <option value="">Guruhni tanlang...</option>
                            {teams.map(t => (
                              <option key={t.id} value={t.id}>{t.name} ({t.members?.length || 0})</option>
                            ))}
                          </select>
                          {stage.team_id && members.length > 0 && (
                            <div style={{ marginTop: 8 }}>
                              <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                                Hisobot topshiruvchi (mas'ul shaxs)
                              </label>
                              <select className="form-input" value={stage.assignee_id}
                                onChange={e => updateStage(idx, 'assignee_id', e.target.value)}>
                                <option value="">Hammasi hisobot topshiradi</option>
                                {members.map(m => (
                                  <option key={m.id} value={m.id}>{m.full_name} {m.position ? `(${m.position})` : ''}</option>
                                ))}
                              </select>
                              <div className="stage-team-members">
                                {members.map(m => (
                                  <span key={m.id} className={`member-mini-chip ${stage.assignee_id && parseInt(stage.assignee_id) === m.id ? 'member-assignee' : ''}`}>
                                    {m.full_name}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {stage.assign_type === 'individual' && (
                        <div style={{ marginTop: 8 }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                            <label style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                              Individual ishchilar (tanlangan: {stage.assignee_ids?.length || 0})
                            </label>
                            <button type="button" className="btn btn-outline btn-sm" onClick={() => toggleStageAll(idx)}>
                              {stage.assignee_ids?.length === users.length && users.length > 0 ? 'Bekor qilish' : 'Barchasini tanlash'}
                            </button>
                          </div>
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 200, overflowY: 'auto',
                            border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                            {users.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ishchilar topilmadi</span>}
                            {users.map(u => (
                              <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                                cursor: 'pointer', padding: '5px 8px', borderRadius: 6,
                                background: stage.assignee_ids?.includes(u.id) ? 'var(--bg-input)' : 'transparent' }}>
                                <input type="checkbox" checked={stage.assignee_ids?.includes(u.id) || false}
                                  onChange={() => toggleStageAssignee(idx, u.id)} />
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
              <button type="button" className="btn btn-outline" onClick={addStage}
                style={{ width: '100%', marginTop: 4 }}>
                + Bosqich qo'shish
              </button>
            </div>
          </div>

          <div className="form-group">
            <label>Fayl biriktirish (ixtiyoriy)</label>
            <input type="file" className="form-input" multiple onChange={e => setFiles(e.target.files)} />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Yaratilmoqda...' : 'Loyihani yaratish'}
          </button>
        </form>
      </div>
    </div>
  )
}
