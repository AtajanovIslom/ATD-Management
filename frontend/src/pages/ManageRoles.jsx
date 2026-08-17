import { Fragment, useState, useEffect } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { roleLabel } from '../i18n/labels'

// Rol yonidagi belgilar — matni `role.*` kalitlaridan olinadi
const ROLE_ICONS = {
  superadmin: '👑 ',
  director: '🎖️ ',
  deputy_director: '🥈 ',
}

const TOP_ROLES = ['superadmin', 'director', 'deputy_director', 'admin']

// Rol berish oynasida ko'rsatiladigan rollar (superadmin bu yerdan berilmaydi)
const ASSIGNABLE_ROLES = [
  'director', 'deputy_director', 'admin', 'department_admin', 'user', 'agent',
]

// Sahifa kaliti → menyu tarjimasi kaliti. Matritsada menyudagi nom ko'rinsin.
const PAGE_LABEL_KEYS = {
  dashboard: 'nav.dashboard',
  reminders: 'nav.reminders',
  work_logs: 'nav.workLogs',
  department_work_logs: 'nav.departmentWorkLogs',
  statistics: 'nav.statistics',
  create_project: 'nav.createProject',
  create_task: 'nav.createTask',
  teams: 'nav.teams',
  departments: 'nav.departments',
  users: 'nav.users',
  interactive_services: 'nav.interactiveServices',
  interactive_requests: 'nav.interactiveRequests',
  roles: 'nav.roles',
  audit_logs: 'nav.auditLogs',
}

const ROLE_COLORS = {
  superadmin: '#f59e0b', director: '#ef4444', deputy_director: '#f97316',
  admin: '#6366f1', department_admin: '#10b981', user: '#64748b',
  agent: '#0ea5e9',
}

export default function ManageRoles() {
  const { canManagePageAccess } = useAuth()
  const { t } = useI18n()
  // Rol ↔ sahifa matritsasi faqat Bosh Administratorga ko'rinadi
  const [tab, setTab] = useState('users')

  return (
    <div>
      {canManagePageAccess && (
        <div className="card" style={{ marginBottom: 16, display: 'flex', gap: 8, padding: 8 }}>
          <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
            🧑‍💻 {t('roles.tab.users')}
          </TabButton>
          <TabButton active={tab === 'pages'} onClick={() => setTab('pages')}>
            🗂️ {t('roles.tab.pages')}
          </TabButton>
        </div>
      )}

      {tab === 'pages' && canManagePageAccess ? <PageAccessMatrix /> : <UserRoles />}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button
      onClick={onClick}
      className={active ? 'btn btn-primary' : 'btn btn-outline'}
      style={{ flex: 1, fontSize: 13 }}
    >
      {children}
    </button>
  )
}

function UserRoles() {
  const { user: currentUser } = useAuth()
  const { t } = useI18n()
  const [users, setUsers] = useState([])
  const [departments, setDepartments] = useState([])
  const [divisions, setDivisions] = useState([])
  const [permDefs, setPermDefs] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')

  // Modal
  const [modal, setModal] = useState(null) // user obj
  const [newRole, setNewRole] = useState('user')
  const [newDeptId, setNewDeptId] = useState('')
  const [newDivId, setNewDivId] = useState('')
  const [newPerms, setNewPerms] = useState([])
  const [filteredDivs, setFilteredDivs] = useState([])
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { loadAll() }, [])

  const loadAll = async () => {
    setLoading(true)
    try {
      const [uRes, dRes, pRes] = await Promise.all([
        api.get('/permissions/users'),
        api.get('/departments'),
        api.get('/permissions/definitions').catch(() => ({ data: [] })),
      ])
      setUsers(uRes.data.filter(u => u.id !== currentUser.id))
      setDepartments(dRes.data)
      const allDivs = dRes.data.flatMap(d => d.divisions || [])
      setDivisions(allDivs)
      setPermDefs(pRes.data || [])
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
    setNewPerms(u.permissions || [])
    setError('')
    updateFilteredDivs(u.department_id, divisions)
  }

  const togglePerm = (key) => {
    setNewPerms(prev => prev.includes(key) ? prev.filter(p => p !== key) : [...prev, key])
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
    if (role === 'user' || role === 'agent' || role === 'director') {
      setNewDeptId(''); setNewDivId('')
    }
  }

  const saveRole = async () => {
    if (!modal) return
    setError('')

    if (newRole === 'admin' && !newDeptId) {
      setError(t('roles.err.needDept'))
      return
    }
    if (newRole === 'department_admin' && !newDivId) {
      setError(t('roles.err.needDiv'))
      return
    }

    setSaving(true)
    try {
      await api.post('/permissions/set-role', {
        user_id: modal.id,
        role: newRole,
        department_id: newDeptId ? parseInt(newDeptId) : null,
        division_id: newDivId ? parseInt(newDivId) : null,
        permissions: newPerms,
      })
      setModal(null)
      await loadAll()
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
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
    const deptName = u.department_name || t('users.unassignedDept')
    const divName = u.division_name || t('users.unassignedDiv')
    if (!grouped[deptName]) grouped[deptName] = {}
    if (!grouped[deptName][divName]) grouped[deptName][divName] = []
    grouped[deptName][divName].push(u)
  })

  if (loading) return <div className="loading">{t('state.loading')}</div>

  return (
    <div>
      <div className="page-header">
        <h1>{t('roles.title')}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>
          {t('roles.subtitle')}
        </p>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          placeholder={t('roles.search')}
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
            ⭐ {t('roles.topLeadership')}
            <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
              {t('users.peopleCount', { n: topLeadership.length })}
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
          {t('roles.notFound')}
        </div>
      )}

      {Object.entries(grouped).map(([deptName, divsMap]) => {
        const deptCount = Object.values(divsMap).reduce((s, arr) => s + arr.length, 0)
        return (
          <div key={deptName} className="card" style={{ marginBottom: 12 }}>
            <h2 style={{ fontSize: 15, margin: '0 0 12px 0', display: 'flex', alignItems: 'center', gap: 8 }}>
              🏢 {deptName}
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 400 }}>
                {t('users.peopleCount', { n: deptCount })}
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
              <label>{t('roles.field.role')}</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginTop: 8 }}>
                {ASSIGNABLE_ROLES.map(value => ({
                  value,
                  label: (ROLE_ICONS[value] || '') + roleLabel(t, value),
                  desc: t(`roles.desc.${value}`),
                })).map(r => (
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
                <label>{t('users.field.department')}</label>
                <select className="form-input" value={newDeptId}
                  onChange={e => handleDeptChange(e.target.value)}>
                  <option value="">{t('users.select')}</option>
                  {departments.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
              </div>
            )}

            {/* Bo'lim tanlash — department_admin uchun */}
            {newRole === 'department_admin' && (
              <div className="form-group">
                <label>{t('users.field.division')}</label>
                <select className="form-input" value={newDivId}
                  onChange={e => setNewDivId(e.target.value)}
                  disabled={!newDeptId}>
                  <option value="">{t('users.select')}</option>
                  {filteredDivs.map(d => (
                    <option key={d.id} value={d.id}>{d.name}</option>
                  ))}
                </select>
                {!newDeptId && (
                  <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 4 }}>
                    {t('roles.pickDeptFirst')}
                  </p>
                )}
              </div>
            )}

            {/* Xodim va agent uchun ham bo'lim tanlash (ixtiyoriy).
                Agentga interaktiv ariza biriktirilishi uchun uni xizmat
                ko'rsatuvchi bo'limga qo'shib qo'yish kerak. */}
            {(newRole === 'user' || newRole === 'agent') && (
              <>
                <div className="form-group">
                  <label>{t('roles.field.departmentOptional')}</label>
                  <select className="form-input" value={newDeptId}
                    onChange={e => handleDeptChange(e.target.value)}>
                    <option value="">{t('users.select')}</option>
                    {departments.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
                <div className="form-group">
                  <label>{t('roles.field.divisionOptional')}</label>
                  <select className="form-input" value={newDivId}
                    onChange={e => setNewDivId(e.target.value)}
                    disabled={!newDeptId}>
                    <option value="">{t('users.select')}</option>
                    {filteredDivs.map(d => (
                      <option key={d.id} value={d.id}>{d.name}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {/* Qo'shimcha huquqlar — roldan tashqari alohida beriladi
                (masalan "Loyihani tahrirlash": loyihani tahrirlash va yakunlash) */}
            {permDefs.length > 0 && (
              <div className="form-group">
                <label>{t('roles.field.extraPermissions')}</label>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {t('roles.extraPermissions.hint')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {permDefs.map(p => (
                    <label key={p.key} style={{
                      display: 'flex', alignItems: 'flex-start', gap: 8, cursor: 'pointer',
                      padding: 10, borderRadius: 8,
                      border: `2px solid ${newPerms.includes(p.key) ? 'var(--accent, #6366f1)' : 'var(--border)'}`,
                      background: newPerms.includes(p.key) ? 'var(--accent-soft, rgba(99,102,241,0.08))' : 'transparent',
                    }}>
                      <input type="checkbox" checked={newPerms.includes(p.key)}
                        onChange={() => togglePerm(p.key)} style={{ marginTop: 2 }} />
                      <div>
                        <div style={{ fontWeight: 600, fontSize: 13 }}>
                          {t(`perm.${p.key}`) === `perm.${p.key}` ? p.label : t(`perm.${p.key}`)}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                          {t(`perm.${p.key}.desc`) === `perm.${p.key}.desc`
                            ? p.description : t(`perm.${p.key}.desc`)}
                        </div>
                      </div>
                    </label>
                  ))}
                </div>
              </div>
            )}

            <div className="modal-actions">
              <button className="btn btn-outline" onClick={() => setModal(null)}>{t('btn.cancel')}</button>
              <button className="btn btn-primary" onClick={saveRole} disabled={saving}>
                {saving ? t('btn.saving') : t('btn.save')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function RoleGroupHeader({ role, count }) {
  const { t } = useI18n()
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
      <span style={{
        width: 10, height: 10, borderRadius: '50%',
        background: ROLE_COLORS[role], flexShrink: 0,
      }} />
      <h3 style={{ fontSize: 13, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, margin: 0 }}>
        {(ROLE_ICONS[role] || '') + roleLabel(t, role)}
      </h3>
      <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
        {t('roles.count', { n: count })}
      </span>
    </div>
  )
}

function UserCard({ u, onEdit, readonly }) {
  const { t } = useI18n()
  const roleColor = ROLE_COLORS[u.role] || 'var(--text-muted)'
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
            {(ROLE_ICONS[u.role] || '') + roleLabel(t, u.role)}
          </span>
          {/* Roldan tashqari berilgan huquqlar ko'rinib tursin */}
          {(u.permissions || []).map(p => (
            <span key={p} style={{
              fontSize: 10, padding: '1px 6px', borderRadius: 3,
              background: 'rgba(6, 214, 160, 0.15)', color: 'var(--accent)', fontWeight: 600,
            }}>
              {t(`perm.${p}`) === `perm.${p}` ? p : t(`perm.${p}`)}
            </span>
          ))}
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
          {t('roles.assign')}
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


// =========================================================================
// ROL ↔ SAHIFA MATRITSASI — faqat Bosh Administrator uchun
//
// Ilgari qaysi rol qaysi sahifani ko'rishi App.jsx/Navbar.jsx ichida qattiq
// yozilgan edi. Endi bu yerdan boshqariladi; standart qiymatlar avvalgi
// holatning aynan o'zi, shuning uchun tegilmasa hech nima o'zgarmaydi.
// =========================================================================

function PageAccessMatrix() {
  const { t } = useI18n()
  const [data, setData] = useState(null)      // {roles, pages, matrix, defaults, ...}
  const [draft, setDraft] = useState({})      // {role: Set(pageKey)}
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // Rol qatori ochilganda o'sha roldagi xodimlar yuklanadi. Bir roldagi
  // xodimlarga har xil oyna kerak bo'lishi mumkin — har biri alohida sozlanadi.
  const [expanded, setExpanded] = useState(null)          // ochiq rol
  const [usersByRole, setUsersByRole] = useState({})      // {role: [user, ...]}
  const [loadingUsers, setLoadingUsers] = useState(null)  // yuklanayotgan rol
  const [userDraft, setUserDraft] = useState({})          // {userId: Set(pageKey)}

  useEffect(() => { load() }, [])

  const fetchRoleUsers = async (role) => {
    setLoadingUsers(role)
    try {
      const res = await api.get('/permissions/page-access/users', { params: { role } })
      setUsersByRole(prev => ({ ...prev, [role]: res.data }))
      setUserDraft(prev => {
        const next = { ...prev }
        res.data.forEach(u => { next[u.id] = new Set(u.pages) })
        return next
      })
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setLoadingUsers(null)
    }
  }

  const toggleExpand = async (role) => {
    if (expanded === role) { setExpanded(null); return }
    setExpanded(role)
    if (!usersByRole[role]) await fetchRoleUsers(role)
  }

  const toggleUserPage = (userId, pageKey) => {
    setSaved(false)
    setUserDraft(prev => {
      const set = new Set(prev[userId] || [])
      if (set.has(pageKey)) set.delete(pageKey)
      else set.add(pageKey)
      return { ...prev, [userId]: set }
    })
  }

  // Xodimni rol qiymatiga qaytarish — shaxsiy sozlama serverdan o'chiriladi
  const resetUser = async (u) => {
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/permissions/page-access/user/reset', { user_id: u.id })
      applyUserResult(res.data)
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setSaving(false)
    }
  }

  const applyUserResult = (payload) => {
    setUsersByRole(prev => {
      const next = { ...prev }
      Object.keys(next).forEach(role => {
        next[role] = next[role].map(u => u.id === payload.user_id
          ? { ...u, pages: payload.pages, has_override: payload.has_override }
          : u)
      })
      return next
    })
    setUserDraft(prev => ({ ...prev, [payload.user_id]: new Set(payload.pages) }))
  }

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/permissions/page-access')
      setData(res.data)
      setDraft(toDraft(res.data.matrix))
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setLoading(false)
    }
  }

  const toDraft = (matrix) => {
    const d = {}
    Object.entries(matrix || {}).forEach(([role, pages]) => { d[role] = new Set(pages) })
    return d
  }

  const pageLabel = (p) => {
    const key = PAGE_LABEL_KEYS[p.key]
    if (!key) return p.label
    const val = t(key)
    return val === key ? p.label : val
  }

  const toggle = (role, pageKey) => {
    setSaved(false)
    setDraft(prev => {
      const next = { ...prev }
      const set = new Set(next[role] || [])
      if (set.has(pageKey)) set.delete(pageKey)
      else set.add(pageKey)
      next[role] = set
      return next
    })
  }

  const setAll = (role, on) => {
    setSaved(false)
    setDraft(prev => ({
      ...prev,
      [role]: on ? new Set(data.pages.map(p => p.key)) : new Set(),
    }))
  }

  const resetRole = (role) => {
    setSaved(false)
    setDraft(prev => ({ ...prev, [role]: new Set(data.defaults[role] || []) }))
  }

  // Serverdagi holatdan farq qiladigan rollar — faqat shular yuboriladi
  const changedRoles = data ? data.roles
    .filter(r => !r.locked)
    .filter(r => {
      const now = [...(draft[r.value] || [])].sort().join(',')
      const before = [...(data.matrix[r.value] || [])].sort().join(',')
      return now !== before
    })
    .map(r => r.value) : []

  // O'zgargan xodimlar — yuklangan (ochilgan) rollar ichidan
  const changedUsers = Object.values(usersByRole).flat().filter(u => {
    if (u.locked) return false
    const now = [...(userDraft[u.id] || [])].sort().join(',')
    return now !== [...u.pages].sort().join(',')
  })

  const changeCount = changedRoles.length + changedUsers.length

  const save = async () => {
    if (!changeCount) return
    setSaving(true)
    setError('')
    try {
      if (changedRoles.length) {
        const matrix = {}
        changedRoles.forEach(role => { matrix[role] = [...(draft[role] || [])] })
        const res = await api.put('/permissions/page-access', { matrix })
        setData(prev => ({ ...prev, matrix: res.data.matrix }))
        setDraft(toDraft(res.data.matrix))
      }
      for (const u of changedUsers) {
        const res = await api.put('/permissions/page-access/user', {
          user_id: u.id,
          pages: [...(userDraft[u.id] || [])],
        })
        applyUserResult(res.data)
      }
      // Rol qiymati o'zgargan bo'lsa, shaxsiy sozlamasi yo'q xodimlarning
      // amaldagi ruxsati ham o'zgardi — ochiq ro'yxatni qayta o'qiymiz
      if (expanded && changedRoles.includes(expanded)) {
        await fetchRoleUsers(expanded)
      }
      setSaved(true)
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setSaving(false)
    }
  }

  const resetAll = async () => {
    if (!window.confirm(t('pages.resetConfirm'))) return
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/permissions/page-access/reset', {})
      setData(prev => ({ ...prev, matrix: res.data.matrix }))
      setDraft(toDraft(res.data.matrix))
      // Shaxsiy sozlamalar ham o'chdi — ochiq rollar qayta yuklanadi
      const openRoles = Object.keys(usersByRole)
      setUsersByRole({})
      setUserDraft({})
      if (expanded && openRoles.includes(expanded)) {
        const role = expanded
        setExpanded(null)
        await toggleExpand(role)
      }
      setSaved(true)
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setSaving(false)
    }
  }

  if (loading) return <div className="loading">{t('state.loading')}</div>
  if (!data) return <div className="alert alert-error">{error || t('state.error')}</div>

  return (
    <div>
      <div className="page-header">
        <h1>{t('pages.title')}</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 14 }}>{t('pages.subtitle')}</p>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ marginBottom: 12, overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
          <thead>
            <tr>
              <th style={{
                textAlign: 'left', padding: '8px 10px', position: 'sticky', left: 0,
                background: 'var(--bg-card, var(--bg))', borderBottom: '2px solid var(--border)',
                minWidth: 180, zIndex: 1,
              }}>
                {t('pages.col.role')}
              </th>
              {data.pages.map(p => (
                <th key={p.key} style={{
                  padding: '8px 6px', borderBottom: '2px solid var(--border)',
                  fontWeight: 600, fontSize: 11, minWidth: 82, verticalAlign: 'bottom',
                }}>
                  <div style={{ fontSize: 15 }}>{p.icon}</div>
                  <div>{pageLabel(p)}</div>
                  {data.service_provider_pages.includes(p.key) && (
                    <div title={t('pages.serviceNote')} style={{ color: '#0ea5e9', fontSize: 12 }}>ⓘ</div>
                  )}
                </th>
              ))}
              <th style={{ borderBottom: '2px solid var(--border)', minWidth: 110 }} />
            </tr>
          </thead>
          <tbody>
            {data.roles.map(r => {
              const set = draft[r.value] || new Set()
              const isChanged = changedRoles.includes(r.value)
              const isOpen = expanded === r.value
              const roleUsers = usersByRole[r.value] || []
              return (
                <Fragment key={r.value}>
                <tr style={{ background: isChanged ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                  <td style={{
                    padding: '8px 10px', borderBottom: '1px solid var(--border)',
                    position: 'sticky', left: 0, zIndex: 1,
                    background: isChanged ? 'var(--bg-input, rgba(99,102,241,0.06))' : 'var(--bg-card, var(--bg))',
                  }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <span style={{
                        width: 8, height: 8, borderRadius: '50%', flexShrink: 0,
                        background: ROLE_COLORS[r.value] || 'var(--text-muted)',
                      }} />
                      <span style={{ fontWeight: 600 }}>
                        {(ROLE_ICONS[r.value] || '') + roleLabel(t, r.value)}
                      </span>
                      {r.locked && <span title={t('pages.locked')}>🔒</span>}
                    </div>
                    {/* Sonini bosish — o'sha roldagi xodimlarni ochadi, har
                        biriga alohida ruxsat berish uchun */}
                    <button
                      type="button"
                      onClick={() => toggleExpand(r.value)}
                      disabled={r.user_count === 0}
                      title={r.user_count === 0 ? '' : t('pages.expandHint')}
                      style={{
                        marginLeft: 14, marginTop: 2, padding: 0, border: 'none',
                        background: 'none', font: 'inherit', fontSize: 11,
                        color: r.user_count === 0 ? 'var(--text-muted)' : 'var(--accent, #6366f1)',
                        cursor: r.user_count === 0 ? 'default' : 'pointer',
                        textDecoration: r.user_count === 0 ? 'none' : 'underline',
                      }}
                    >
                      {r.user_count > 0 && (isOpen ? '▾ ' : '▸ ')}
                      {t('pages.userCount', { n: r.user_count })}
                    </button>
                  </td>

                  {data.pages.map(p => (
                    <td key={p.key} style={{
                      textAlign: 'center', padding: '8px 6px',
                      borderBottom: '1px solid var(--border)',
                    }}>
                      <input
                        type="checkbox"
                        checked={r.locked ? true : set.has(p.key)}
                        disabled={r.locked || saving}
                        onChange={() => toggle(r.value, p.key)}
                        style={{ width: 16, height: 16, cursor: r.locked ? 'not-allowed' : 'pointer' }}
                      />
                    </td>
                  ))}

                  <td style={{ padding: '8px 6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                    {!r.locked && (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button className="btn btn-outline btn-sm" style={{ padding: '2px 7px', fontSize: 10 }}
                          onClick={() => setAll(r.value, true)} disabled={saving}>
                          {t('pages.all')}
                        </button>
                        <button className="btn btn-outline btn-sm" style={{ padding: '2px 7px', fontSize: 10 }}
                          onClick={() => setAll(r.value, false)} disabled={saving}>
                          {t('pages.none')}
                        </button>
                        <button className="btn btn-outline btn-sm" style={{ padding: '2px 7px', fontSize: 10 }}
                          onClick={() => resetRole(r.value)} disabled={saving}
                          title={t('pages.reset')}>
                          ↺
                        </button>
                      </div>
                    )}
                  </td>
                </tr>

                {/* Roldagi xodimlar — har biriga alohida ruxsat */}
                {isOpen && loadingUsers === r.value && (
                  <tr>
                    <td colSpan={data.pages.length + 2}
                      style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('state.loading')}
                    </td>
                  </tr>
                )}

                {isOpen && roleUsers.map(u => {
                  const uset = userDraft[u.id] || new Set()
                  const uChanged = changedUsers.some(c => c.id === u.id)
                  return (
                    <tr key={`u-${u.id}`} style={{ background: uChanged ? 'rgba(99,102,241,0.06)' : 'transparent' }}>
                      <td style={{
                        padding: '6px 10px 6px 26px', borderBottom: '1px solid var(--border)',
                        position: 'sticky', left: 0, zIndex: 1,
                        background: uChanged ? 'var(--bg-input, rgba(99,102,241,0.06))' : 'var(--bg-card, var(--bg))',
                        borderLeft: '3px solid ' + (ROLE_COLORS[r.value] || 'var(--border)'),
                      }}>
                        <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
                          {u.full_name}
                          {u.has_override && (
                            <span title={t('pages.overrideHint')} style={{
                              fontSize: 9, padding: '1px 5px', borderRadius: 3, fontWeight: 700,
                              background: 'rgba(99,102,241,0.18)', color: 'var(--accent, #6366f1)',
                            }}>
                              {t('pages.override')}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {[u.position, u.division_name].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>

                      {data.pages.map(p => (
                        <td key={p.key} style={{
                          textAlign: 'center', padding: '6px', borderBottom: '1px solid var(--border)',
                        }}>
                          <input
                            type="checkbox"
                            checked={u.locked ? true : uset.has(p.key)}
                            disabled={u.locked || saving}
                            onChange={() => toggleUserPage(u.id, p.key)}
                            style={{ width: 14, height: 14, cursor: u.locked ? 'not-allowed' : 'pointer' }}
                          />
                        </td>
                      ))}

                      <td style={{ padding: '6px', borderBottom: '1px solid var(--border)', whiteSpace: 'nowrap' }}>
                        {!u.locked && u.has_override && (
                          <button className="btn btn-outline btn-sm"
                            style={{ padding: '2px 7px', fontSize: 10 }}
                            onClick={() => resetUser(u)} disabled={saving}
                            title={t('pages.resetUser')}>
                            ↺ {t('pages.toRole')}
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
                </Fragment>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="card" style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
      }}>
        <div style={{ flex: 1, minWidth: 200, fontSize: 12, color: 'var(--text-muted)' }}>
          {changeCount > 0
            ? `⚠️ ${t('pages.unsaved', { n: changeCount })}`
            : saved ? `✅ ${t('pages.saved')}` : t('pages.hint')}
        </div>
        <button className="btn btn-outline" onClick={resetAll} disabled={saving}>
          {t('pages.resetAll')}
        </button>
        <button className="btn btn-primary" onClick={save}
          disabled={saving || changeCount === 0}>
          {saving ? t('btn.saving') : t('btn.save')}
        </button>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
        ⓘ {t('pages.serviceNote')}
      </p>
    </div>
  )
}
