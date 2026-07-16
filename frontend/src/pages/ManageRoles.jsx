import { useState, useEffect } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

const ROLE_LABELS = {
  superadmin: '👑 Bosh Administrator',
  director: '🎖️ Direksiya Direktori',
  deputy_director: "🥈 Direktor O'rinbosari",
  admin: "Boshqarma Rahbari",
  department_admin: "Bo'lim Rahbari",
  user: 'Xodim',
}

const TOP_ROLES = ['superadmin', 'director', 'deputy_director', 'admin']

export default function ManageRoles() {
  const { user: currentUser } = useAuth()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [divisions, setDivisions] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal
  const [modal, setModal] = useState(null) // user obj
  const [newRole, setNewRole] = useState('user')
  const [newDeptId, setNewDeptId] = useState('')
  const [newDivId, setNewDivId] = useState('')
  const [filteredDivs, setFilteredDivs] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [uRes, dRes] = await Promise.all([
        api.get('/permissions/users'),
        api.get('/departments'),
      ])
      setUsers(uRes.data.filter(u => u.id !== currentUser.id))
      setDepartments(dRes.data)
      const allDivs = dRes.data.flatMap(d => d.divisions || [])
      setDivisions(allDivs)
    } catch {
      // ignore
    } finally {
      setLoading(false)
    }
  }

  const openModal = (u) => {
    setModal(u)
    setNewRole(u.role === 'superadmin' ? 'admin' : u.role)
    setNewDeptId(u.department_id || '')
    setNewDivId(u.division_id || '')
    setError('')
    updateFilteredDivs(u.department_id, divisions)
  }

  const updateFilteredDivs = (deptId, divList) => {
    if (!deptId) {
      setFilteredDivs(divList)
    } else {
      setFilteredDivs(divList.filter(d => d.department_id === parseInt(deptId)))
    }
  }

  const handleDeptChange = (deptId) => {
    setNewDeptId(deptId)
    setNewDivId('')
    updateFilteredDivs(deptId ? parseInt(deptId) : null, divisions)
  }

  const handleRoleChange = (role) => {
    setNewRole(role)
    if (role === 'admin') setNewDivId('')
    if (role === 'user' || role === 'director') { setNewDeptId(''); setNewDivId('') }
  }

  const saveRole = async () => {
    if (!modal) return
    setError('')

    if (newRole === 'admin' && !newDeptId) {
      setError("Admin uchun boshqarmani tanlang")
      return
    }
    if (newRole === 'department_admin' && !newDivId) {
      setError("Bo'lim rahbari uchun bo'limni tanlang")
      return
    }

    setSaving(true)
    try {
      await api.post('/permissions/set-role', {
        user_id: modal.id,
        role: newRole,
        department_id: newDeptId ? parseInt(newDeptId) : null,
        division_id: newDivId ? parseInt(newDivId) : null,
      })
      setModal(null)
      await loadAll()
    } catch (err) {
      setError(err.response?.data?.error || 'Xatolik yuz berdi')
    } finally {
      setSaving(false)
    }
  }

  const filtered = users.filter(u =>
    u.full_name.toLowerCase().includes(search.toLowerCase()) ||
    (u.position || '').toLowerCase().includes(search.toLowerCase())
  )

  // Yuqori bo'g'in rahbariyat alohida
  const topLeadership = filtered.filter(u => TOP_ROLES.includes(u.role))
  const rest = filtered.filter(u => !TOP_ROLES.includes(u.role))

  // Qolganlarni Boshqarma → Bo'lim → Xodimlar tarzida guruhlaymiz
  const grouped = {}
  rest.forEach(u => {
    const deptName = u.department_name || 'Belgilanmagan'
    const divName = u.division_name || "Bo'lim belgilanmagan"
    if (!grouped[deptName]) grouped[deptName] = {}
    if (!grouped[deptName][divName]) grouped[deptName][divName] = []
    grouped[deptName][divName].push(u)
  })

  if (loading) return <div className="loading">Yuklanmoqda...</div>

  return (
    <div>
      <div className="page-header">
        <h1>Foydalanuvchi rollari</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          Har bir foydalanuvchiga rol va boshqarma/bo'lim belgilang
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          placeholder="Ism yoki lavozim bo'yicha qidiring..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          style={{ maxWidth: 340 }}
        />
      </div>

      {/* Yuqori bo'g'in rahbariyat */}
      {topLeadership.length > 0 && (
        <div className="card" style={{
          marginBottom: 12,
          borderLeft: '3px solid #f59e0b',
        }}>
          <h2 style={{ fontSize: 15, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
            ⭐ Yuqori bo'g'in rahbariyat
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
              ({topLeadership.length} kishi)
            </span>
          </h2>
          {topLeadership.map(u => (
            <UserCard key={u.id} u={u} onEdit={openModal}
              readonly={u.role === 'superadmin'} />
          ))}
        </div>
      )}

      {topLeadership.length === 0 && Object.keys(grouped).length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
          Foydalanuvchi topilmadi
        </div>
      )}

      {Object.entries(grouped).map(([deptName, divsMap]) => {
        const deptCount = Object.values(divsMap).reduce((s, arr) => s + arr.length, 0)
        return (
          <div key={deptName} className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              🏢 {deptName}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                ({deptCount} kishi)
              </span>
            </h2>
            {Object.entries(divsMap).map(([divName, divUsers]) => (
              <div key={divName} style={{
                marginTop: 8, marginLeft: 16, paddingLeft: 12,
                borderLeft: '2px solid var(--border)',
              }}>
                <div style={{
                  padding: '6px 0', fontSize: 12, fontWeight: 600,
                  color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5,
                }}>
                  📁 {divName} <span style={{ fontWeight: 400 }}>({divUsers.length})</span>
                </div>
                {divUsers.map(u => (
                  <UserCard key={u.id} u={u} onEdit={openModal}
                    readonly={u.role === 'superadmin'} />
                ))}
              </div>
            ))}
          </div>
        )
      })}

      {/* Rol berish modali */}
      {modal && (
        <div className="modal-overlay" onClick={() => setModal(null)}>
          <div className="modal" style={{ maxWidth: 480 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 4 }}>{modal.full_name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              {modal.position || modal.department}
            </p>

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {/* Rol tanlash */}
            <div className="form-group">
              <label>Rol</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                {/* 5 rol variantlari */}
                {[
                  { value: 'director', label: '🎖️ Direksiya Direktori', desc: "To'liq huquqli boshqaruvchi" },
                  { value: 'deputy_director', label: "🥈 Direktor O'rinbosari", desc: "Barchasini ko'radi, rol berolmaydi" },
                  { value: 'admin', label: "Boshqarma Rahbari", desc: "O'z boshqarmasini boshqaradi" },
                  { value: 'department_admin', label: "Bo'lim Rahbari", desc: "O'z bo'limini boshqaradi" },
                  { value: 'user', label: 'Xodim', desc: "Faqat o'z vazifalarini ko'radi" },
                ].map(r => (
                  <label key={r.value} style={{
                    display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                    padding: 12, borderRadius: 8,
                    border: `2px solid ${newRole === r.value ? 'var(--accent, #6366f1)' : 'var(--border)'}`,
                    background: newRole === r.value ? 'var(--accent-soft, rgba(99,102,241,0.08))' : 'transparent',
                    transition: 'all 0.15s',
                  }}>
                    <input type="radio" name="role" value={r.value}
                      checked={newRole === r.value}
                      onChange={() => handleRoleChange(r.value)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div style={{ fontWeight: 600, fontSize: 13 }}>{r.label}</div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>{r.desc}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* Boshqarma tanlash — admin uchun */}
            {(newRole === 'admin' || newRole === 'department_admin') && (
              <div className="form-group">
                <label>Boshqarma</label>
                <select className="form-input" value={newDeptId}
                  onChange={e => handleDeptChange(e.target.value)}>
                  <option value="">— Tanlang —</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Bo'lim tanlash — department_admin uchun */}
            {newRole === 'department_admin' && (
              <div className="form-group">
                <label>Bo'lim</label>
                <select className="form-input" value={newDivId}
                  onChange={e => setNewDivId(e.target.value)}
                  disabled={!newDeptId}>
                  <option value="">— Tanlang —</option>
                  {filteredDivs.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {!newDeptId && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    Avval boshqarmani tanlang
                  </p>
                )}
              </div>
            )}

            {/* User uchun ham bo'lim tanlash (optional) */}
            {newRole === 'user' && (
              <>
                <div className="form-group">
                  <label>Boshqarma (ixtiyoriy)</label>
                  <select className="form-input" value={newDeptId}
                    onChange={e => handleDeptChange(e.target.value)}>
                    <option value="">— Tanlang —</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>Bo'lim (ixtiyoriy)</label>
                  <select className="form-input" value={newDivId}
                    onChange={e => setNewDivId(e.target.value)}
                    disabled={!newDeptId}>
                    <option value="">— Tanlang —</option>
                    {filteredDivs.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setModal(null)}>Bekor qilish</button>
              <button className="btn btn-primary" onClick={saveRole} disabled={saving}>
                {saving ? 'Saqlanmoqda...' : 'Saqlash'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoleGroupHeader({ role, count }) {
  const COLORS = {
    superadmin: '#f59e0b',
    director: '#ef4444',
    admin: '#6366f1',
    department_admin: '#10b981',
    user: '#64748b',
  }
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%',
        background: COLORS[role], flexShrink: 0,
      }} />
      <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
        {ROLE_LABELS[role]}
      </h3>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
        {count} ta
      </span>
    </div>
  )
}

function UserCard({ u, onEdit, readonly }) {
  const roleColor = {
    superadmin: '#f59e0b', director: '#ef4444', deputy_director: '#f97316',
    admin: '#6366f1', department_admin: '#10b981', user: 'var(--text-muted)',
  }[u.role] || 'var(--text-muted)'
  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '8px 10px', borderRadius: 6, marginBottom: 4,
      border: '1px solid var(--border)',
      background: 'var(--bg-input, rgba(255,255,255,0.03))',
    }}>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 500, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
          {u.full_name}
          <span style={{
            fontSize: 10, padding: '1px 6px', borderRadius: 3,
            background: roleColor + '20', color: roleColor, fontWeight: 600,
          }}>
            {ROLE_LABELS[u.role] || u.role}
          </span>
        </div>
        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
          {u.position || '—'}
        </div>
      </div>
      {!readonly && (
        <button
          className="btn btn-outline btn-sm"
          style={{ padding: '3px 10px', fontSize: 11, flexShrink: 0 }}
          onClick={() => onEdit(u)}
        >
          Rol berish
        </button>
      )}
      {readonly && (
        <span style={{ fontSize: 14, flexShrink: 0 }}>{u.role === 'director' ? '🎖️' : '👑'}</span>
      )}
    </div>
  )
}

function Empty() {
  return (
    <p style={{ fontSize: 13, color: 'var(--text-muted)', textAlign: 'center', padding: '12px 0' }}>
      —
    </p>
  )
}
