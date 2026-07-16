import { useState, useEffect } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function ManageDepartments() {
  const { can, isSuperAdmin } = useAuth()
  const [departments, setDepartments] = useState([])
  const [expanded, setExpanded] = useState({})
  const [loading, setLoading] = useState(true)

  // Modal holatlari
  const [deptModal, setDeptModal] = useState(false)
  const [editDept, setEditDept] = useState(null)
  const [deptForm, setDeptForm] = useState({ name: '', description: '' })

  const [divModal, setDivModal] = useState(false)
  const [editDiv, setEditDiv] = useState(null)
  const [divForm, setDivForm] = useState({ name: '', description: '', department_id: '' })

  const [membersModal, setMembersModal] = useState(null) // division obj
  const [allUsers, setAllUsers] = useState([])
  const [selectedUsers, setSelectedUsers] = useState([])

  const [serviceModal, setServiceModal] = useState(null)  // division obj

  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    try {
      const res = await api.get('/departments')
      setDepartments(res.data)
    } catch {
      setError("Ma'lumotlarni yuklashda xatolik")
    } finally {
      setLoading(false)
    }
  }

  const toggleExpand = (id) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }))

  // --- Boshqarma ---
  const openAddDept = () => {
    setEditDept(null)
    setDeptForm({ name: '', description: '' })
    setError('')
    setDeptModal(true)
  }

  const openEditDept = (dept) => {
    setEditDept(dept)
    setDeptForm({ name: dept.name, description: dept.description || '' })
    setError('')
    setDeptModal(true)
  }

  const saveDept = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editDept) {
        await api.put(`/departments/${editDept.id}`, deptForm)
      } else {
        await api.post('/departments', deptForm)
      }
      setDeptModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const deleteDept = async (dept) => {
    if (!window.confirm(`"${dept.name}" boshqarmasini o'chirmoqchimisiz? Barcha bo'limlar ham o'chiriladi!`)) return
    try {
      await api.delete(`/departments/${dept.id}`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  // --- Bo'lim ---
  const openAddDiv = (deptId) => {
    setEditDiv(null)
    setDivForm({ name: '', description: '', department_id: deptId })
    setError('')
    setDivModal(true)
  }

  const openEditDiv = (div) => {
    setEditDiv(div)
    setDivForm({ name: div.name, description: div.description || '', department_id: div.department_id })
    setError('')
    setDivModal(true)
  }

  const saveDiv = async (e) => {
    e.preventDefault()
    setError('')
    setSaving(true)
    try {
      if (editDiv) {
        await api.put(`/divisions/${editDiv.id}`, divForm)
      } else {
        await api.post('/divisions', divForm)
      }
      setDivModal(false)
      load()
    } catch (err) {
      setError(err.response?.data?.error || 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const deleteDiv = async (div) => {
    if (!window.confirm(`"${div.name}" bo'limini o'chirmoqchimisiz?`)) return
    try {
      await api.delete(`/divisions/${div.id}`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  // --- Xodimlar ---
  const openMembers = async (div) => {
    setMembersModal(div)
    setSelectedUsers(div.members.map(m => m.id))
    try {
      const res = await api.get('/users/workers')
      setAllUsers(res.data)
    } catch {
      setAllUsers([])
    }
  }

  const toggleUser = (uid) => {
    setSelectedUsers(prev =>
      prev.includes(uid) ? prev.filter(id => id !== uid) : [...prev, uid]
    )
  }

  const saveMembers = async () => {
    setSaving(true)
    try {
      // Yangi qo'shilganlarni add qilamiz
      const toAdd = selectedUsers.filter(uid => !membersModal.members.find(m => m.id === uid))
      const toRemove = membersModal.members.filter(m => !selectedUsers.includes(m.id)).map(m => m.id)

      if (toAdd.length > 0) {
        await api.post(`/divisions/${membersModal.id}/members`, { user_ids: toAdd })
      }
      for (const uid of toRemove) {
        await api.delete(`/divisions/${membersModal.id}/members/${uid}`)
      }
      setMembersModal(null)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    } finally {
      setSaving(false)
    }
  }

  // --- Servis provayder ---
  const openServiceConfig = (div) => {
    setServiceModal(div)
  }

  const toggleServiceProvider = async (enable) => {
    if (!serviceModal) return
    try {
      const res = await api.post(`/service-requests/divisions/${serviceModal.id}/service-config`, {
        is_service_provider: enable,
      })
      setServiceModal(res.data)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  const rotateApiKey = async () => {
    if (!serviceModal) return
    if (!window.confirm('API kalitni yangilash mobil ilova sozlamalarini yangilashni talab qiladi. Davom etamizmi?')) return
    try {
      const res = await api.post(`/service-requests/divisions/${serviceModal.id}/rotate-key`)
      setServiceModal(prev => ({ ...prev, service_api_key: res.data.service_api_key }))
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  if (loading) return <div className="loading">Yuklanmoqda...</div>

  return (
    <div>
      <div className="page-header">
        <h1>Boshqarmalar va Bo'limlar</h1>
        {can('dept.create') && (
          <button className="btn btn-primary" onClick={openAddDept}>+ Boshqarma qo'shish</button>
        )}
      </div>

      {departments.length === 0 ? (
        <div className="card" style={{ textAlign: 'center', color: 'var(--text-muted)', padding: 40 }}>
          Hali boshqarma qo'shilmagan
        </div>
      ) : (
        departments.map(dept => (
          <div key={dept.id} className="card" style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1, cursor: 'pointer' }}
                onClick={() => toggleExpand(dept.id)}>
                <span style={{ fontSize: 18, transition: 'transform 0.2s', transform: expanded[dept.id] ? 'rotate(90deg)' : 'none' }}>▶</span>
                <div>
                  <strong style={{ fontSize: 16 }}>{dept.name}</strong>
                  {dept.description && <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>{dept.description}</div>}
                </div>
                <span className="badge" style={{ marginLeft: 8 }}>{dept.division_count} bo'lim</span>
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                {can('div.create') && (
                  <button className="btn btn-outline btn-sm" onClick={() => openAddDiv(dept.id)}>+ Bo'lim</button>
                )}
                {can('dept.edit') && (
                  <button className="btn btn-outline btn-sm" onClick={() => openEditDept(dept)}>Tahrirlash</button>
                )}
                {can('dept.delete') && (
                  <button className="btn btn-danger btn-sm" onClick={() => deleteDept(dept)}>O'chirish</button>
                )}
              </div>
            </div>

            {expanded[dept.id] && (
              <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
                {dept.divisions.length === 0 ? (
                  <p style={{ color: 'var(--text-muted)', fontSize: 13, margin: 0 }}>Hali bo'lim qo'shilmagan</p>
                ) : (
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {dept.divisions.map(div => (
                      <div key={div.id} style={{
                        background: 'var(--bg-card-inner, rgba(255,255,255,0.04))',
                        border: '1px solid var(--border)',
                        borderRadius: 8,
                        padding: '10px 14px',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: 10
                      }}>
                        <div style={{ flex: 1 }}>
                          <strong>{div.name}</strong>
                          {div.is_service_provider && (
                            <span style={{
                              marginLeft: 8, fontSize: 11, padding: '2px 8px',
                              borderRadius: 4, background: 'rgba(16, 185, 129, 0.15)',
                              color: '#10b981', fontWeight: 600,
                            }}>
                              🛠️ Texnik xizmat bo'limi
                            </span>
                          )}
                          {div.description && (
                            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 8 }}>{div.description}</span>
                          )}
                          <div style={{ marginTop: 4 }}>
                            {div.members.slice(0, 5).map(m => (
                              <span key={m.id} className="badge" style={{ marginRight: 4, fontSize: 11 }}>{m.full_name}</span>
                            ))}
                            {div.members.length > 5 && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>+{div.members.length - 5} ta</span>
                            )}
                            {div.members.length === 0 && (
                              <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>Xodim yo'q</span>
                            )}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          {isSuperAdmin && (
                            <button
                              className={`btn btn-sm ${div.is_service_provider ? 'btn-primary' : 'btn-outline'}`}
                              onClick={() => openServiceConfig(div)}
                              title="Texnik xizmat bo'limi sifatida sozlash"
                            >
                              🛠️ Servis
                            </button>
                          )}
                          {can('div.members') && (
                            <button className="btn btn-outline btn-sm" onClick={() => openMembers(div)}>
                              👥 Xodimlar ({div.member_count})
                            </button>
                          )}
                          {can('div.edit') && (
                            <button className="btn btn-outline btn-sm" onClick={() => openEditDiv(div)}>Tahrirlash</button>
                          )}
                          {can('div.delete') && (
                            <button className="btn btn-danger btn-sm" onClick={() => deleteDiv(div)}>O'chirish</button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        ))
      )}

      {/* Boshqarma modal */}
      {deptModal && (
        <div className="modal-overlay" onClick={() => setDeptModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editDept ? 'Boshqarmani tahrirlash' : "Yangi boshqarma qo'shish"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={saveDept}>
              <div className="form-group">
                <label>Boshqarma nomi *</label>
                <input className="form-input" value={deptForm.name}
                  onChange={e => setDeptForm({ ...deptForm, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Tavsif</label>
                <textarea className="form-input" rows={2} value={deptForm.description}
                  onChange={e => setDeptForm({ ...deptForm, description: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setDeptModal(false)}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Bo'lim modal */}
      {divModal && (
        <div className="modal-overlay" onClick={() => setDivModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editDiv ? "Bo'limni tahrirlash" : "Yangi bo'lim qo'shish"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={saveDiv}>
              <div className="form-group">
                <label>Boshqarma *</label>
                <select className="form-input" value={divForm.department_id}
                  onChange={e => setDivForm({ ...divForm, department_id: e.target.value })} required>
                  <option value="">— Tanlang —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Bo'lim nomi *</label>
                <input className="form-input" value={divForm.name}
                  onChange={e => setDivForm({ ...divForm, name: e.target.value })} required />
              </div>
              <div className="form-group">
                <label>Tavsif</label>
                <textarea className="form-input" rows={2} value={divForm.description}
                  onChange={e => setDivForm({ ...divForm, description: e.target.value })} />
              </div>
              <div className="modal-actions">
                <button type="button" className="btn btn-outline" onClick={() => setDivModal(false)}>Bekor qilish</button>
                <button type="submit" className="btn btn-primary" disabled={saving}>
                  {saving ? 'Saqlanmoqda...' : 'Saqlash'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Xodimlar modal */}
      {membersModal && (
        <div className="modal-overlay" onClick={() => setMembersModal(null)}>
          <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
            <h2>"{membersModal.name}" bo'limi xodimlari</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 12 }}>
              Xodimlarni belgilash/olib tashlash orqali bo'limga qo'shing yoki chiqaring
            </p>
            <div style={{ maxHeight: 340, overflowY: 'auto', border: '1px solid var(--border)', borderRadius: 6 }}>
              {allUsers.length === 0 ? (
                <p style={{ padding: 16, color: 'var(--text-muted)', margin: 0 }}>Xodimlar topilmadi</p>
              ) : (
                allUsers.map(u => (
                  <label key={u.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                    cursor: 'pointer', borderBottom: '1px solid var(--border)',
                    background: selectedUsers.includes(u.id) ? 'var(--accent-soft, rgba(99,102,241,0.08))' : 'transparent'
                  }}>
                    <input type="checkbox" checked={selectedUsers.includes(u.id)}
                      onChange={() => toggleUser(u.id)} />
                    <div>
                      <div style={{ fontWeight: 500 }}>{u.full_name}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{u.position || u.department}</div>
                    </div>
                  </label>
                ))
              )}
            </div>
            <div className="modal-actions" style={{ marginTop: 16 }}>
              <button className="btn btn-outline" onClick={() => setMembersModal(null)}>Bekor qilish</button>
              <button className="btn btn-primary" onClick={saveMembers} disabled={saving}>
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Servis provayder modal */}
      {serviceModal && (
        <div className="modal-overlay" onClick={() => setServiceModal(null)}>
          <div className="modal" style={{ maxWidth: 600 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 4 }}>
              🛠️ Texnik xizmat bo'limi
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              "{serviceModal.name}" bo'limini kombinat miqyosida keluvchi zayavkalar bilan ishlash uchun sozlash
            </p>

            <div style={{
              padding: 14, borderRadius: 8,
              background: serviceModal.is_service_provider
                ? 'rgba(16, 185, 129, 0.08)'
                : 'var(--bg-input, rgba(255,255,255,0.03))',
              border: `1px solid ${serviceModal.is_service_provider ? '#10b981' : 'var(--border)'}`,
              marginBottom: 16,
            }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div>
                  <div style={{ fontWeight: 600, marginBottom: 4 }}>
                    {serviceModal.is_service_provider
                      ? "✅ Bo'lim faol — zayavkalarni qabul qilmoqda"
                      : "⚪ Bo'lim faol emas"}
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Faollashtirilganda bu bo'lim xodimlari "So'rovlar" sahifasini ko'radi
                  </div>
                </div>
                <button
                  className={`btn ${serviceModal.is_service_provider ? 'btn-outline' : 'btn-primary'}`}
                  onClick={() => toggleServiceProvider(!serviceModal.is_service_provider)}
                >
                  {serviceModal.is_service_provider ? "O'chirish" : "Yoqish"}
                </button>
              </div>
            </div>

            {serviceModal.is_service_provider && serviceModal.service_api_key && (
              <>
                <div style={{ marginBottom: 8, fontWeight: 600, fontSize: 13 }}>
                  🔑 API kalit (mobil ilova uchun)
                </div>
                <div style={{
                  padding: 12, borderRadius: 6, border: '1px solid var(--border)',
                  background: 'var(--bg-input, rgba(255,255,255,0.03))',
                  fontFamily: 'monospace', fontSize: 12, wordBreak: 'break-all',
                  marginBottom: 8,
                }}>
                  {serviceModal.service_api_key}
                </div>
                <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                  <button className="btn btn-outline btn-sm" onClick={() => {
                    navigator.clipboard.writeText(serviceModal.service_api_key)
                    alert("API kalit nusxalandi")
                  }}>
                    📋 Nusxalash
                  </button>
                  <button className="btn btn-outline btn-sm" onClick={rotateApiKey}>
                    🔄 Yangilash
                  </button>
                </div>

                <details style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 8 }}>
                  <summary style={{ cursor: 'pointer', fontWeight: 600 }}>📖 API foydalanish yo'riqnomasi</summary>
                  <div style={{ marginTop: 8, lineHeight: 1.7 }}>
                    <div><strong>Barcha so'rovlarga qo'shing:</strong> Header <code>X-API-Key: {'{yuqoridagi kalit}'}</code></div>
                    <br/>
                    <div><strong>1) Yangi zayavka yuborish:</strong></div>
                    <pre style={{
                      background: 'var(--bg)', padding: 8, borderRadius: 4,
                      fontSize: 11, overflow: 'auto', margin: '4px 0',
                    }}>{`POST /api/public/requests
{
  "external_id": "APP-12345",
  "submitter_name": "Ism Familiya",
  "submitter_phone": "+998...",
  "submitter_address": "Manzil",
  "title": "Muammo qisqacha",
  "description": "Batafsil",
  "category": "internet",
  "priority": "normal"
}`}</pre>
                    <div><strong>2) Zayavka holatini so'rash:</strong></div>
                    <pre style={{
                      background: 'var(--bg)', padding: 8, borderRadius: 4,
                      fontSize: 11, overflow: 'auto', margin: '4px 0',
                    }}>{`GET /api/public/requests/APP-12345/status

Javob:
{
  "external_id": "APP-12345",
  "status": "in_progress",
  "status_label": "Jarayonda",
  "assignee_name": "...",
  "created_at": "...",
  "updated_at": "..."
}`}</pre>
                    <div><strong>Holatlar:</strong> new, accepted, in_progress, completed, rejected</div>
                  </div>
                </details>
              </>
            )}

            <div className="modal-actions">
              <button className="btn btn-primary" onClick={() => setServiceModal(null)}>Yopish</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
