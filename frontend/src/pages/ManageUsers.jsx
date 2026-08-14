import { useState, useEffect } from 'react'
import api from '../api/axios'
import { useI18n } from '../i18n'
import { roleLabel } from '../i18n/labels'

// Rol yonidagi belgilar — matni `role.*` kalitlaridan olinadi
const ROLE_ICONS = {
  superadmin: '👑 ',
  director: '🎖️ ',
  deputy_director: '🥈 ',
}

const TOP_ROLES = ['superadmin', 'director', 'deputy_director']

export default function ManageUsers() {
  const { t } = useI18n()
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
      if (form.password.length < 4) return setError(t('users.err.passwordShort'))
      if (form.password.includes(' ')) return setError(t('users.err.passwordSpace'))
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
      setError(err.response?.data?.error || t('state.error'))
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
      alert(t('vac.err.pickDates'))
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
      alert(err.response?.data?.error || t('state.error'))
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
      if (!window.confirm(t('vac.remove.confirm', { name: user.full_name }))) return
      await api.delete(`/vacations/${v.id}`)
      loadAll()
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  const handleDelete = async (user) => {
    if (!window.confirm(t('users.delete.confirm', { name: user.full_name }))) return
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
    const deptName = u.department_name || u.department || t('users.unassignedDept')
    if (!grouped[deptName]) grouped[deptName] = { rahbar: [], divs: {} }
    if (u.role === 'admin') {
      grouped[deptName].rahbar.push(u)
    } else {
      const divName = u.division_name || t('users.unassignedDiv')
      if (!grouped[deptName].divs[divName]) grouped[deptName].divs[divName] = []
      grouped[deptName].divs[divName].push(u)
    }
  })

  const toggleCollapse = (key) => setCollapsed(prev => ({ ...prev, [key]: !prev[key] }))

  const tableProps = { t, showPasswords, copiedId, togglePassword, copyLink, openEdit, handleDelete, openVacation, removeVacation }

  return (
    <div>
      <div className="page-header">
        <h1>{t('users.title')}</h1>
        <button className="btn btn-primary" onClick={openAdd}>{t('users.add')}</button>
      </div>

      {topLeadership.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid #f59e0b' }}>
          <h2 style={{ fontSize: 15, margin: '0 0 12px 0' }}>
            ⭐ {t('users.topLeadership', { n: topLeadership.length })}
          </h2>
          <div className="table-wrap">
            <UserTable users={topLeadership} {...tableProps} />
          </div>
        </div>
      )}

      {topLeadership.length === 0 && Object.keys(grouped).length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          {t('users.notFound')}
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
                  {t('users.peopleCount', { n: deptCount })}
                </span>
              </h2>
            </div>

            {deptOpen && rahbar.length > 0 && (
              <div style={{ marginBottom: 12 }}>
                <div style={{ padding: '6px 0', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
                  👤 {t('users.deptHead')}
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
            <h2 style={{ marginBottom: 4 }}>🏖 {t('vac.give')}</h2>
            <p style={{ fontSize: 13, color: 'var(--text-muted)', marginBottom: 16 }}>
              {t('vac.employee')}<strong style={{ color: 'var(--text)' }}>{vacDialog.user.full_name}</strong>
            </p>

            <div className="form-group">
              <label>{t('vac.type')}</label>
              <select className="form-input" value={vacForm.type}
                onChange={e => setVacForm({ ...vacForm, type: e.target.value })}>
                <option value="annual">{t('vac.type.annual')}</option>
                <option value="unpaid">{t('vac.type.unpaid')}</option>
                <option value="sick">{t('vac.type.sick')}</option>
                <option value="otgul">{t('vac.type.otgul')}</option>
              </select>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div className="form-group">
                <label>{t('vac.from')}</label>
                <input type="date" className="form-input" value={vacForm.from_date}
                  onChange={e => setVacForm({ ...vacForm, from_date: e.target.value })} />
              </div>
              <div className="form-group">
                <label>{t('vac.to')}</label>
                <input type="date" className="form-input" value={vacForm.to_date}
                  onChange={e => setVacForm({ ...vacForm, to_date: e.target.value })} />
              </div>
            </div>

            <div className="form-group">
              <label>{t('vac.note')}</label>
              <textarea className="form-input" rows={2} value={vacForm.note}
                onChange={e => setVacForm({ ...vacForm, note: e.target.value })}
                placeholder={t('vac.note.placeholder')} />
            </div>

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setVacDialog(null)}>{t('btn.cancel')}</button>
              <button className="btn btn-primary" onClick={submitVacation} disabled={vacBusy}>
                {vacBusy ? t('btn.saving') : t('vac.submit')}
              </button>
            </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className="modal-overlay" onClick={() => setShowModal(false)}>
          <div className="modal" onClick={e => e.stopPropagation()}>
            <h2>{editUser ? t('users.modal.edit') : t('users.modal.add')}</h2>
            {error && <div className="alert alert-error">{error}</div>}
            <form onSubmit={handleSave}>
              <div className="form-group">
                <label>{t('users.field.fullName')}</label>
                <input className="form-input" value={form.full_name}
                  onChange={e => setForm({ ...form, full_name: e.target.value })} required />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>{t('users.field.department')}</label>
                  <select className="form-input" value={form.department_id}
                    onChange={e => setForm({ ...form, department_id: e.target.value, division_id: '' })}>
                    <option value="">{t('users.select')}</option>
                    {departments.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('users.field.division')}</label>
                  <select className="form-input" value={form.division_id}
                    onChange={e => setForm({ ...form, division_id: e.target.value })}
                    disabled={!form.department_id}>
                    <option value="">{t('users.select')}</option>
                    {filteredDivs.map(d => (<option key={d.id} value={d.id}>{d.name}</option>))}
                  </select>
                </div>
              </div>
              <div className="form-group">
                <label>{t('users.field.position')}</label>
                <input className="form-input" value={form.position}
                  onChange={e => setForm({ ...form, position: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>{t('users.field.tabNumber')}</label>
                  <input className="form-input" value={form.tab_number}
                    onChange={e => setForm({ ...form, tab_number: e.target.value })} required />
                </div>
                <div className="form-group">
                  <label>{t('users.field.phone')}</label>
                  <input className="form-input" value={form.phone}
                    onChange={e => setForm({ ...form, phone: e.target.value })} />
                </div>
              </div>
              <div className="form-group">
                <label>{t('users.field.email')}</label>
                <input className="form-input" type="email" value={form.email}
                  onChange={e => setForm({ ...form, email: e.target.value })} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div className="form-group">
                  <label>{t('users.field.login')}</label>
                  <input className="form-input" value={form.login}
                    onChange={e => setForm({ ...form, login: e.target.value })} />
                </div>
                <div className="form-group">
                  <label>{editUser ? t('users.field.newPassword') : t('users.field.password')}</label>
                  <input className="form-input" type="text" value={form.password}
                    onChange={e => setForm({ ...form, password: e.target.value })}
                    placeholder={editUser ? t('users.field.password.keep') : t('users.field.password.hint')} />
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

function UserTable({ t, users, showPasswords, copiedId, togglePassword, copyLink, openEdit, handleDelete, openVacation, removeVacation }) {
  const { formatDate } = useI18n()
  const vacColor = (type) => (
    type === 'annual' ? '#3b82f6'   // ko'k
    : type === 'sick' ? '#ef4444'   // qizil
    : type === 'otgul' ? '#10b981'  // yashil
    : '#f59e0b'                     // BS — sariq
  )
  const vacShort = (type) => t(`vac.short.${type}`)
  const fmt = (iso) => formatDate(iso, { day: '2-digit', month: '2-digit' })
  return (
    <table>
      <thead>
        <tr>
          <th>{t('users.th.fullName')}</th>
          <th>{t('users.th.role')}</th>
          <th>{t('users.th.position')}</th>
          <th>{t('users.th.tab')}</th>
          <th>{t('users.th.login')}</th>
          <th>{t('users.th.password')}</th>
          <th>{t('field.actions')}</th>
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
                {(ROLE_ICONS[u.role] || '') + roleLabel(t, u.role)}
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
                      {showPasswords[u.id] ? t('users.hidePassword') : t('users.showPassword')}
                    </button>
                  </span>
                </td>
              </>
            ) : (
              <td colSpan={2}>
                <span className="badge" style={{ marginRight: 6 }}>{t('users.notRegistered')}</span>
                <button className="btn btn-outline btn-sm" style={{ padding: '2px 6px', fontSize: 11 }}
                  onClick={() => copyLink(u)}>
                  {copiedId === u.id ? t('users.copied') : t('users.copyLink')}
                </button>
              </td>
            )}
            <td style={{ whiteSpace: 'nowrap' }}>
              {u.active_vacation ? (
                <button className="btn btn-outline btn-sm" onClick={() => removeVacation(u)}
                  title={t('vac.cancelTitle')} style={{ marginRight: 4, color: '#f59e0b' }}>
                  🏖 {t('vac.cancel')}
                </button>
              ) : (
                <button className="btn btn-outline btn-sm" onClick={() => openVacation(u)}
                  title={t('vac.give')} style={{ marginRight: 4 }}>
                  🏖 {t('vac.short')}
                </button>
              )}
              <button className="btn btn-outline btn-sm" onClick={() => openEdit(u)} style={{ marginRight: 4 }}>
                {t('btn.edit')}
              </button>
              <button className="btn btn-danger btn-sm" onClick={() => handleDelete(u)}>
                {t('btn.delete')}
              </button>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
