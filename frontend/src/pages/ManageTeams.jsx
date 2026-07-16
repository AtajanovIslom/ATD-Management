import { useState, useEffect } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function ManageTeams() {
  const { user, isSuperAdmin } = useAuth()
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
      setError(err.response?.data?.error || 'Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  const handleDelete = async (team) => {
    if (!window.confirm(`"${team.name}" guruhini o'chirmoqchimisiz?`)) return
    try {
      await api.delete(`/teams/${team.id}`)
      loadTeams()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
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
    const dept = w.department_name || w.department || 'Belgilanmagan'
    if (!workersByDept[dept]) workersByDept[dept] = []
    workersByDept[dept].push(w)
  })

  return (
    <div>
      <div className="page-header">
        <h1>Guruhlar boshqaruvi</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Guruh yaratish</button>
      </div>

      {user?.role === 'admin' && (
        <div className="alert" style={{
          background: 'rgba(99,102,241,0.08)', color: 'var(--text)',
          padding: 10, borderRadius: 6, marginBottom: 12, fontSize: 13,
          border: '1px solid var(--border)',
        }}>
          ℹ️ Siz faqat o'z boshqarmangiz xodimlaridan guruh tuza olasiz.
          Barcha tuzilgan guruhlarni ko'rasiz va loyihaga biriktirasiz.
        </div>
      )}

      {teams.length === 0 ? (
        <div className="card">
          <div className="empty-state"><p>Hali guruh yaratilmagan</p></div>
        </div>
      ) : (
        <div className="teams-grid">
          {teams.map(t => {
            const canEdit = canEditTeam(t)
            return (
              <div key={t.id} className="card team-card">
                <div className="team-card-header">
                  <div>
                    <h3 style={{ margin: 0 }}>{t.name}</h3>
                    {t.department_name && (
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                        🏢 {t.department_name}
                      </div>
                    )}
                  </div>
                  {canEdit && (
                    <div style={{ display: 'flex', gap: 4 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => openEdit(t)}>Tahrirlash</button>
                      <button className="btn btn-danger btn-sm" onClick={() => handleDelete(t)}>O'chirish</button>
                    </div>
                  )}
                </div>
                <div className="team-card-members">
                  {t.members.length === 0 ? (
                    <span style={{ color: '#9ca3af', fontSize: 13 }}>A'zolar yo'q</span>
                  ) : (
                    t.members.map(m => (
                      <div key={m.id} className="team-member-row">
                        <strong>{m.full_name}</strong>
                        <span>{m.position || m.department}</span>
                      </div>
                    ))
                  )}
                </div>
                <div className="team-card-footer">
                  {t.members.length} ta a'zo
                  {t.creator_name && (
                    <span style={{ marginLeft: 8, fontSize: 11, color: 'var(--text-muted)' }}>
                      · {t.creator_name}
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
            <h2>{editTeam ? 'Guruhni tahrirlash' : 'Yangi guruh yaratish'}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Guruh nomi *</label>
                <input className="form-input" value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  placeholder="Masalan: Web dasturchilar" required />
              </div>
              <div className="form-group">
                <label>
                  A'zolarni tanlang
                  <span style={{ color: 'var(--accent, #6366f1)', marginLeft: 6, fontWeight: 600 }}>
                    ({form.member_ids.length} ta)
                  </span>
                </label>
                <input className="form-input" placeholder="Qidirish..." value={search}
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
                              {w.position || 'Xodim'}
                              {w.division_name && <> · {w.division_name}</>}
                            </span>
                          </div>
                        </label>
                      ))}
                    </div>
                  ))}
                  {filteredWorkers.length === 0 && (
                    <div style={{ padding: 20, textAlign: 'center', color: 'var(--text-muted)', fontSize: 13 }}>
                      Xodim topilmadi
                    </div>
                  )}
                </div>
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setShowModal(false)}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary" disabled={loading}>
                  {loading ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
