import { useState, useEffect } from 'react'
import api from '../api/axios'

const ROLE_LABELS = {
  superadmin: '👑 Bosh Admin',
  director: '🎖️ Direktor',
  deputy_director: "🥈 Direktor o'rinbosari",
  admin: "Boshqarma rahbari",
  department_admin: "Bo'lim rahbari",
  user: 'Xodim',
}

const TOP_ROLES = ['superadmin', 'director', 'deputy_director']

export default function ManageUsers() {
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [divisions, setDivisions] = useState([])
  const [showModal, setShowModal] = useState(false)
  const [editUser, setEditUser] = useState(null)
  const [form, setForm] = useState({
    full_name: '', department: '', position: '', tab_number: '',
    login: '', password: '', role: 'user', email: '', phone: '',
    department_id: '', division_id: '',
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [showPasswords, setShowPasswords] = useState({})
  const [copiedId, setCopiedId] = useState(null)
  const [collapsed, setCollapsed] = useState({})
  const [vacDialog, setVacDialog] = useState(null) // { user }
  const [vacForm, setVacForm] = useState({ type: 'annual', from_date: '', to_date: '', note: '' })
  const [vacBusy, setVacBusy] = useState(false)

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    const [uRes, dRes] = await Promise.all([
      api.get('/users'),
      api.get('/departments').catch(() => ({ data: [] })),
    ])
    setUsers(uRes.data)
    setDepartments(dRes.data)
    setDivisions(dRes.data.flatMap(d => (d.divisions || []).map(v => ({ ...v, department_name: d.name }))))
  }

  const openAdd = () => {
    setEditUser(null)
    setForm({
      full_name: '', department: '', position: '', tab_number: '',
      login: '', password: '', role: 'user', email: '', phone: '',
      department_id: '', division_id: '',
    })
    setError('')
    setShowModal(true)
  }

  const openEdit = (user) => {
    setEditUser(user)
    setForm({
      full_name: user.full_name,
      department: user.department || '',
      position: user.position || '',
      tab_number: user.tab_number,
      login: user.login || '',
      password: '',
      role: user.role,
      email: user.email || '',
      phone: user.phone || '',
      department_id: user.department_id || '',
      division_id: user.division_id || '',
    })
    setError('')
    setShowModal(true)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setError('')
    if (form.password) {
      if (form.password.length < 4) return setError('Parol kamida 4 ta belgi')
      if (form.password.includes(' ')) return setError('Parolda probel bo\'lmasin')
    }
    setLoading(true)
    try {
      const data = { ...form }
      if (!data.password) delete data.password
      data.department_id = data.department_id || null
      data.division_id = data.division_id || null
      if (editUser) await api.put(`/users/${editUser.id}`, data)
      else await api.post('/users', data)
      setShowModal(false)
      loadAll()
    } catch (err) {
      setError(err.response?.data?.error || 'Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  const copyLink = (user) => {
    const link = `${window.location.origin}/register/${user.registration_token}`
    navigator.clipboard.writeText(link)
    setCopiedId(user.id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const openVacation = (user) => {
    setVacForm({ type: 'annual', from_date: '', to_date: '', note: '' })
    setVacDialog({ user })
  }

  const submitVacation = async () => {
    if (!vacDialog?.user) return
    if (!vacForm.from_date || !vacForm.to_date) {
      alert("Sana tanlash shart")
      return
    }
    setVacBusy(true)
    try {
      await api.post('/vacations', {
        user_id: vacDialog.user.id,
        type: vacForm.type,
        from_date: vacForm.from_date,
        to_date: vacForm.to_date,
        note: vacForm.note.trim(),
      })
      setVacDialog(null)
      loadAll()
    } catch (err) {
      alert(err.response?.data?.error || "Xatolik")
    } finally {
      setVacBusy(false)
    }
  }

  const removeVacation = async (user) => {
    if (!user.active_vacation) return
    // Ro'yxatdan tatil ID sini olish uchun /vacations chaqiramiz
    try {
      const r = await api.get(`/vacations?user_id=${user.id}&active=1`)
      const v = r.data[0]
      if (!v) return
      if (!window.confirm(`${user.full_name} tatilini bekor qilmoqchimisiz?`)) return
      await api.delete(`/vacations/${v.id}`)
      loadAll()
    } catch (err) {
      alert(err.response?.data?.error || "Xatolik")
    }
  }

  const handleDelete = async (user) => {
    if (!window.confirm(`${user.full_name}ni o'chirmoqchimisiz?`)) return
    await api.delete(`/users/${user.id}`)
    loadAll()
  }

  const togglePassword = (id) => {
    setShowPasswords(prev => ({ ...prev, [id]: !prev[id] }))
  }

  const filteredDivs = form.department_id
    ? divisions.filter(d => d.department_id === parseInt(form.department_id))
    : divisions

  const topLeadership = users.filter(u => TOP_ROLES.includes(u.role))
  const rest = users.filter(u => !TOP_ROLES.includes(u.role))

  // Boshqarma → { rahbar: [admin], divs: {divName: [xodimlar]} }
  const grouped = {}
  rest.forEach(u => {
    const deptName = u.department_name || u.department || 'Belgilanmagan'
    if (!grouped[deptName]) grouped[deptName] = { rahbar: [], divs: {} }
    if (u.role === 'admin') {
      grouped[deptName].rahbar.push(u)
    } else {
      const divName = u.division_name || "Bo'lim belgilanmagan"
      if (!grouped[deptName].divs[divName]) grouped[deptName].divs[divName] = []
      grouped[deptName].divs[divName].push(u)
    }
  })

  const toggleCollapse = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const tableProps = { showPasswords, copiedId, togglePassword, copyLink, openEdit, handleDelete, openVacation, removeVacation }

  return (
    <div>
      <div className="page-header">
        <h1>Xodimlar boshqaruvi</h1>
        <button className="btn btn-primary" onClick={openAdd}>+ Xodim qo'shish</button>
      </div>

      {topLeadership.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid #f59e0b' }}>
          <h2 style={{ fontSize: 15, margin: '0 0 12px 0' }}>
            ⭐ Yuqori bo'g'in rahbariyat ({topLeadership.length})
          </h2>
          <div className="table-wrap">
            <UserTable users={topLeadership} {...tableProps} />
          </div>
        </div>
      )}

      {topLeadership.length === 0 && Object.keys(grouped).length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Xodimlar topilmadi
        </div>
      )}

      {Object.entries(grouped).map(([deptName, deptData]) => {
        const { rahbar, divs } = deptData
        const deptCount = rahbar.length + Object.values(divs).reduce((s, arr) => s + arr.length, 0)
        const deptKey = `d:${deptName}`
        const deptOpen = !collapsed[deptKey]
        return (
          <div key={deptName} className="card" style={{ marginBottom: 12 }}>
            <div onClick={() => toggleCollapse(deptKey)}
              style={{ cursor: 'pointer', padding: '4px 0', marginBottom: deptOpen ? 12 : 0 }}>
              <h2 style={{ fontSize: 15, margin: 0, display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12 }}>{deptOpen ? '▼' : '▶'}</span>
                🏢 {deptName}
                <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                  ({deptCount} kishi)
                </span>
              </h2>
            </div>

            {deptOpen && rahbar.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ padding: '6px 0', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  👤 Boshqarma rahbari
                </div>
                <div className="table-wrap">
                  <UserTable users={rahbar} {...tableProps} />
                </div>
              </div>
            )}

            {deptOpen && Object.entries(divs).map(([divName, divUsers]) => {
              const divKey = `${deptKey}:v:${divName}`
              const divOpen = !collapsed[divKey]
              return (
                <div key={divName} style={{ marginTop: 8, marginLeft: 16, borderLeft: '2px solid var(--border)', paddingLeft: 12 }}>
                  <div onClick={() => toggleCollapse(divKey)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', padding: '6px 0', fontSize: 13, fontWeight: 600, color: 'var(--text-muted)' }}>
                    <span style={{ fontSize: 10 }}>{divOpen ? '▼' : '▶'}</span>
                    📁 {divName}
                    <span style={{ fontSize: 11, fontWeight: 400 }}>({divUsers.length})</span>
                  </div>
                  {divOpen && (
                    <div className="table-wrap" style={{ marginTop: 8 }}>
                      <UserTable users={divUsers} {...tableProps} />
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        )
      })}

      {vacDialog && (
        <div className="modal-overlay" onClick={() => setVacDialog(null)}>
          <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 4 }}>🏖 Tatil berish</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              Xodim: <strong style={{ color: 'var(--text)' }}>{vacDialog.user.full_name}</strong>
            </p>

            <div className="form-group">
              <label>Tatil turi *</label>
              <select className="form-input" value={vacForm.type}
                onChange={e => setVacForm({ ...vacForm, type: e.target.value })}>
                <option value="annual">Yillik tatil (otpuska)</option>
                <option value="unpaid">Haq to'lanmaydigan (BS)</option>
                <option value="sick">Kasallik (balnishniy)</option>
                <option value="otgul">O'tgul (ishlab berilgan vaqt uchun)</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>Boshlash *</label>
                <input type="date" className="form-input" value={vacForm.from_date}
                  onChange={e => setVacForm({ ...vacForm, from_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>Tugash *</label>
                <input type="date" className="form-input" value={vacForm.to_date}
                  onChange={e => setVacForm({ ...vacForm, to_date: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label>Izoh (ixtiyoriy)</label>
              <textarea className="form-input" rows={2} value={vacForm.note}
                onChange={e => setVacForm({ ...vacForm, note: e.target.value })}
                placeholder="Sabab, buyruq raqami va h.k." />
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setVacDialog(null)}>Bekor</button>
              <button className="btn btn-primary" onClick={submitVacation} disabled={vacBusy}>
                {vacBusy ? 'Saqlanmoqda...' : 'Rasmiylashtirish'}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editUser ? 'Foydalanuvchini tahrirlash' : "Yangi xodim qo'shish"}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>Ism sharifi *</label>
                <input className="form-input" value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Boshqarma</label>
                  <select className="form-input" value={form.department_id}
                    onChange={e => setForm({ ...form, department_id: e.target.value, division_id: '' })}>
                    <option value="">— Tanlang —</option>
                    {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Bo'lim</label>
                  <select className="form-input" value={form.division_id}
                    onChange={e => setForm({ ...form, division_id: e.target.value })}
                    disabled={!form.department_id}>
                    <option value="">— Tanlang —</option>
                    {filteredDivs.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>Lavozim</label>
                <input className="form-input" value={form.position}
                  onChange={e => setForm({ ...form, position: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Tabel raqami *</label>
                  <input className="form-input" value={form.tab_number}
                    onChange={e => setForm({ ...form, tab_number: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>Telefon</label>
                  <input className="form-input" value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>Email</label>
                <input className="form-input" type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>Login</label>
                  <input className="form-input" value={form.login}
                    onChange={e => setForm({ ...form, login: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>{editUser ? 'Yangi parol' : 'Parol'}</label>
                  <input className="form-input" type="text" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder={editUser ? "Bo'sh qoldirsangiz saqlanadi" : '4+ belgi, probelsiz'} />
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

function UserTable({ users, showPasswords, copiedId, togglePassword, copyLink, openEdit, handleDelete, openVacation, removeVacation }) {
  const vacColor = (t) => (
    t === 'annual' ? '#3b82f6'   // ko'k
    : t === 'sick' ? '#ef4444'   // qizil
    : t === 'otgul' ? '#10b981'  // yashil
    : '#f59e0b'                  // BS — sariq
  )
  const vacShort = (t) => (
    t === 'annual' ? 'Otpuska' : t === 'sick' ? 'Kasallik' : t === 'otgul' ? "O'tgul" : 'BS'
  )
  const fmt = (iso) => iso ? new Date(iso).toLocaleDateString('uz-UZ', { day: '2-digit', month: '2-digit' }) : ''
  return (
    <table>
      <thead>
        <tr>
          <th>Ism sharifi</th>
          <th>Rol</th>
          <th>Lavozim</th>
          <th>Tabel</th>
          <th>Login</th>
          <th>Parol</th>
          <th>Amallar</th>
        </tr>
      </thead>
      <tbody>
        {users.map(u => (
          <tr key={u.id}>
            <td>
              <strong>{u.full_name}</strong>
              {u.active_vacation && (
                <div style={{
                  marginTop: 2, fontSize: 10, fontWeight: 600, display: 'inline-block',
                  marginLeft: 6, padding: '2px 6px', borderRadius: 4,
                  background: `${vacColor(u.active_vacation.type)}22`,
                  color: vacColor(u.active_vacation.type),
                }} title={u.active_vacation.type_label}>
                  🏖 {vacShort(u.active_vacation.type)} ({fmt(u.active_vacation.from_date)}—{fmt(u.active_vacation.to_date)})
                </div>
              )}
            </td>
            <td>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {ROLE_LABELS[u.role] || u.role}
              </span>
            </td>
            <td>{u.position || '—'}</td>
            <td>{u.tab_number}</td>
            {u.login ? (
              <>
                <td><code>{u.login}</code></td>
                <td>
                  <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                    <code>{showPasswords[u.id] ? (u.plain_password || '***') : '••••••'}</code>
                    <button className="btn btn-outline btn-sm" style={{ padding: '2px 6px', fontSize: 11 }}
                      onClick={() => togglePassword(u.id)}>
                      {showPasswords[u.id] ? 'Yashirish' : "Ko'rish"}
                    </button>
                  </span>
                </td>
              </>
            ) : (
              <td colSpan={2}>
                <span className="badge" style={{ marginRight: 6 }}>Ro'yxatdan o'tmagan</span>
                <button className="btn btn-outline btn-sm" style={{ padding: '2px 6px', fontSize: 11 }}
                  onClick={() => copyLink(u)}>
                  {copiedId === u.id ? 'Nusxalandi!' : 'Havolani nusxalash'}
                </button>
              </td>
            )}
            <td style={{ whiteSpace: 'nowrap' }}>
              {u.active_vacation ? (
                <button className="btn btn-outline btn-sm" onClick={() => removeVacation(u)}
                  title="Tatilni bekor qilish" style={{ marginRight: 4, color: '#f59e0b' }}>
                  🏖 Bekor
                </button>
              ) : (
                <button className="btn btn-outline btn-sm" onClick={() => openVacation(u)}
                  title="Tatil berish" style={{ marginRight: 4 }}>
                  🏖 Tatil
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)} style={{ marginRight: 4 }}>
                Tahrirlash
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>
                O'chirish
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
