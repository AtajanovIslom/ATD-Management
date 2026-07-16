import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'

export default function CreateTask() {
  const navigate = useNavigate()
  const [teams, setTeams] = useState([])
  const [users, setUsers] = useState([])
  const [form, setForm] = useState({
    name: '', description: '', start_date: '', deadline: '',
    assign_type: 'team', team_id: '', assignee_id: '', assignee_ids: [],
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

  const getTeamMembers = (teamId) => {
    if (!teamId) return []
    const team = teams.find(t => t.id === parseInt(teamId))
    return team?.members || []
  }

  const toggleAssignee = (uid) => {
    setForm(f => ({
      ...f,
      assignee_ids: f.assignee_ids.includes(uid)
        ? f.assignee_ids.filter(x => x !== uid)
        : [...f.assignee_ids, uid],
    }))
  }

  const toggleAll = () => {
    setForm(f => ({
      ...f,
      assignee_ids: f.assignee_ids.length === users.length ? [] : users.map(u => u.id),
    }))
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      const teamId = form.assign_type === 'team' && form.team_id ? parseInt(form.team_id) : null
      const assigneeId = form.assign_type === 'team' && form.team_id && form.assignee_id
        ? parseInt(form.assignee_id) : null
      const assigneeIds = form.assign_type === 'individual' ? form.assignee_ids : []

      if (form.assign_type === 'individual' && assigneeIds.length === 0) {
        setError('Kamida bitta ishchi tanlang')
        setLoading(false)
        return
      }

      const fd = new FormData()
      fd.append('name', form.name)
      fd.append('description', form.description)
      if (form.start_date) fd.append('start_date', new Date(form.start_date + 'T00:00:00').toISOString())
      if (form.deadline) fd.append('deadline', new Date(form.deadline + 'T23:59:59').toISOString())
      if (teamId) fd.append('team_id', teamId)
      if (assigneeId) fd.append('assignee_id', assigneeId)
      fd.append('assignee_ids', JSON.stringify(assigneeIds))
      if (files) {
        for (const f of files) fd.append('files', f)
      }

      const res = await api.post('/tasks', fd, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      navigate(`/tasks/${res.data.id}`)
    } catch (err) {
      setError(err.response?.data?.error || 'Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  const members = getTeamMembers(form.team_id)

  return (
    <div>
      <div className="page-header">
        <h1>Yangi vazifa yaratish</h1>
      </div>

      <div className="card">
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Vazifa nomi *</label>
            <input className="form-input" value={form.name}
              onChange={e => setForm({ ...form, name: e.target.value })}
              placeholder="Vazifa nomini kiriting" required />
          </div>

          <div className="form-group">
            <label>Vazifa tavsifi</label>
            <textarea className="form-input" value={form.description}
              onChange={e => setForm({ ...form, description: e.target.value })}
              placeholder="Vazifa haqida batafsil yozing..." rows={3} />
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
            <label>Bajaruvchini tanlash *</label>
            <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <input type="radio" name="assign_type" value="team"
                  checked={form.assign_type === 'team'}
                  onChange={() => setForm({ ...form, assign_type: 'team', assignee_id: '' })} />
                Guruhga yuklash
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer', color: 'var(--text-secondary)' }}>
                <input type="radio" name="assign_type" value="individual"
                  checked={form.assign_type === 'individual'}
                  onChange={() => setForm({ ...form, assign_type: 'individual', team_id: '', assignee_id: '' })} />
                Individual ishchiga yuklash
              </label>
            </div>

            {form.assign_type === 'team' && (
              <>
                <select className="form-input" value={form.team_id}
                  onChange={e => setForm({ ...form, team_id: e.target.value, assignee_id: '' })}>
                  <option value="">Guruhni tanlang...</option>
                  {teams.map(t => (
                    <option key={t.id} value={t.id}>{t.name} ({t.members?.length || 0})</option>
                  ))}
                </select>
                {form.team_id && members.length > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <label style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4, display: 'block' }}>
                      Mas'ul shaxs (ixtiyoriy)
                    </label>
                    <select className="form-input" value={form.assignee_id}
                      onChange={e => setForm({ ...form, assignee_id: e.target.value })}>
                      <option value="">Hammasi mas'ul</option>
                      {members.map(m => (
                        <option key={m.id} value={m.id}>{m.full_name} {m.position ? `(${m.position})` : ''}</option>
                      ))}
                    </select>
                    <div className="stage-team-members">
                      {members.map(m => (
                        <span key={m.id} className={`member-mini-chip ${form.assignee_id && parseInt(form.assignee_id) === m.id ? 'member-assignee' : ''}`}>
                          {m.full_name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </>
            )}

            {form.assign_type === 'individual' && (
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Tanlangan: {form.assignee_ids.length} / {users.length}
                  </span>
                  <button type="button" className="btn btn-outline btn-sm" onClick={toggleAll}>
                    {form.assignee_ids.length === users.length && users.length > 0 ? 'Bekor qilish' : 'Barchasini tanlash'}
                  </button>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 260, overflowY: 'auto',
                  border: '1px solid var(--border)', borderRadius: 8, padding: 8 }}>
                  {users.length === 0 && <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ishchilar topilmadi</span>}
                  {users.map(u => (
                    <label key={u.id} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13,
                      cursor: 'pointer', padding: '6px 8px', borderRadius: 6,
                      background: form.assignee_ids.includes(u.id) ? 'var(--bg-input)' : 'transparent' }}>
                      <input type="checkbox" checked={form.assignee_ids.includes(u.id)}
                        onChange={() => toggleAssignee(u.id)} />
                      <span style={{ color: 'var(--text-secondary)' }}>
                        {u.full_name} {u.position ? `(${u.position})` : ''} — {u.department}
                      </span>
                    </label>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div className="form-group">
            <label>Fayl biriktirish (ixtiyoriy)</label>
            <input type="file" className="form-input" multiple onChange={e => setFiles(e.target.files)} />
          </div>

          <button type="submit" className="btn btn-primary btn-full" disabled={loading}>
            {loading ? 'Yaratilmoqda...' : 'Vazifani yaratish'}
          </button>
        </form>
      </div>
    </div>
  )
}
