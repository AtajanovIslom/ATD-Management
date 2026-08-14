import { useState, useEffect } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'

export default function ManageTeams() {
  const { user, isSuperAdmin } = useAuth()
  const { t } = useI18n()
  const [teams, setTeams] = useState([])
  const [workers, setWorkers] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editTeam, setEditTeam] = useState(null)
  const [form, setForm] = useState({ name: '', member_ids: [] })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState('')

  useEffect(() => {
    loadTeams()
    api.get('/users/workers').then(res => setWorkers(res.data)).catch(console.error)
  }, [])

  const loadTeams = async () => {
    const res = await api.get('/teams')
    setTeams(res.data)
  }

  const openAdd = () => {
    setEditTeam(null)
    setForm({ name: '', member_ids: [] })
    setError('')
    setSearch('')
    setShowModal(true)
  }

  const openEdit = (team) => {
    setEditTeam(team)
    setForm({ name: team.name, member_ids: team.members.map(m => m.id) })
    setError('')
    setSearch('')
    setShowModal(true)
  }

  const toggleMember = (id) => {
    setForm(prev => ({
      ...prev,
      member_ids: prev.member_ids.includes(id)
        ? prev.member_ids.filter(m => m !== id)
        : [...prev.member_ids, id],
    }))
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      if (editTeam) {
        await api.put(`/teams/${editTeam.id}`, form)
      } else {
        await api.post('/teams', form)
      }
      setShowModal(false)
      loadTeams()
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (team) => {
    if (!window.confirm(t('teams.delete.confirm', { name: team.name }))) return
    try {
      await api.delete(`/teams/${team.id}`)
      loadTeams()
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  // Foydalanuvchi bu guruhni tahrirlay oladimi?
  const canEditTeam = (team) => {
    if (isSuperAdmin) return true
    if (user?.role === 'admin') {
      return !team.department_id || team.department_id === user.department_id
    }
    return false
  }

  // Modal — a'zolarni boshqarma bo'yicha guruhlash
  const filteredWorkers = workers.filter(w =>
    w.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (w.position || '').toLowerCase().includes(search.toLowerCase())
  )
  const workersByDept = {}
  filteredWorkers.forEach(w => {
    const dept = w.department_name || w.department || t('teams.unassignedDept')
    if (!workersByDept[dept]) workersByDept[dept] = []
    workersByDept[dept].push(w)
  })

  return (
    <div>
      <div className="page-header">
        <h1>{t('teams.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>{t('teams.add')}</button>
      </div>

      {user?.role === 'admin' && (
        <div className="alert" style={{
          background: 'rgba(99,102,241,0.08)', color: 'var(--text)',
          padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13,
          border: '1px solid var(--border)',
        }}>
          ℹ️ {t('teams.adminHint')}
        </div>
      )}

      {teams.length === 0 ? (
        <div className="card">
          <div className="empty-state"><p>{t('teams.empty')}</p></div>
        </div>
      ) : (
        <div className="teams-grid">
          {teams.map(team => {
            const canEdit = canEditTeam(team)
            return (
              <div key={team.id} className="card team-card">
                <div className="team-card-header">
                  <div>
                    <h3 style={{ margin: 0 }}>{team.name}</h3>
                    {team.department_name && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        🏢 {team.department_name}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(team)}>{t('btn.edit')}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(team)}>{t('btn.delete')}</button>
                    </div>
                  )}
                </div>
                <div className="team-card-members">
                  {team.members.length === 0 ? (
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>{t('teams.noMembers')}</span>
                  ) : (
                    team.members.map(m => (
                      <div key={m.id} className="team-member-row">
                        <strong>{m.full_name}</strong>
                        <span>{m.position || m.department}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="team-card-footer">
                  {t('teams.memberCount', { n: team.members.length })}
                  {team.creator_name && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                      · {team.creator_name}
                    </span>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()} style={{ maxWidth: 640 }}>
            <h2>{editTeam ? t('teams.modal.edit') : t('teams.modal.add')}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>{t('teams.field.name')}</label>
                <input className="form-input" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder={t('teams.field.name.placeholder')} required />
              </div>
              <div className="form-group">
                <label>
                  {t('teams.selectMembers')}
                  <span style={{ color: 'var(--accent, #6366f1)', marginLeft: 6, fontWeight: 600 }}>
                    {t('teams.selectedCount', { n: form.member_ids.length })}
                  </span>
                </label>
                <input className="form-input" placeholder={t('teams.search')} value={search}
                  onChange={e => setSearch(e.target.value)} style={{ marginBottom: 8 }} />
                <div className="member-select-list" style={{ maxHeight: 400, overflowY: 'auto' }}>
                  {Object.entries(workersByDept).map(([deptName, deptWorkers]) => (
                    <div key={deptName}>
                      <div style={{
                        padding: '6px 4px', fontSize: 11, fontWeight: 700,
                        color: 'var(--text-muted)', textTransform: 'uppercase',
                        letterSpacing: 0.5, marginTop: 4,
                      }}>
                        🏢 {deptName} ({deptWorkers.length})
                      </div>
                      {deptWorkers.map(w => (
                        <label key={w.id}
                          className={`member-select-item ${form.member_ids.includes(w.id) ? 'selected' : ''}`}>
                          <input type="checkbox" checked={form.member_ids.includes(w.id)}
                            onChange={() => toggleMember(w.id)} />
                          <div>
                            <strong>{w.full_name}</strong>
                            <span>
                              {w.position || t('role.user')}
                              {w.division_name && <> · {w.division_name}</>}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  ))}
                  {filteredWorkers.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      {t('teams.workerNotFound')}
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>{t('btn.cancel')}</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? t('btn.saving') : t('btn.save')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
