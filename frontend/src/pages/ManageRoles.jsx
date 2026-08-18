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

// Matritsa jadval sifatida sig'maydigan enlik — bundan tor ekranda
// kartochka ko'rinishiga o'tamiz (16 ta ustunli jadval telefonda o'qilmaydi)
const NARROW_QUERY = '(max-width: 900px)'

function useIsNarrow() {
  const [narrow, setNarrow] = useState(
    () => typeof window !== 'undefined' && window.matchMedia(NARROW_QUERY).matches
  )
  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY)
    const onChange = e => setNarrow(e.matches)
    mq.addEventListener('change', onChange)
    setNarrow(mq.matches)
    return () => mq.removeEventListener('change', onChange)
  }, [])
  return narrow
}

const setEq = (a, b) => [...(a || [])].sort().join(',') === [...(b || [])].sort().join(',')

export default function ManageRoles() {
  const { canManagePageAccess } = useAuth()
  const { t } = useI18n()
  // Rol ↔ sahifa/huquq matritsasi faqat Bosh Administratorga ko'rinadi
  const [tab, setTab] = useState('users')

  return (
    <div>
      {canManagePageAccess && (
        <div className="card roles-tabs" style={{ marginBottom: 16 }}>
          <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
            🧑‍💻 {t('roles.tab.users')}
          </TabButton>
          <TabButton active={tab === 'pages'} onClick={() => setTab('pages')}>
            🗂️ {t('roles.tab.pages')}
          </TabButton>
        </div>
      )}

      {tab === 'pages' && canManagePageAccess ? <AccessMatrix /> : <UserRoles />}
    </div>
  )
}

function TabButton({ active, onClick, children }) {
  return (
    <button onClick={onClick} className={active ? 'btn btn-primary' : 'btn btn-outline'}>
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
      <div className="roles-head">
        <div className="roles-head__text">
          <h1>{t('roles.title')}</h1>
          <p className="roles-head__sub">{t('roles.subtitle')}</p>
        </div>
      </div>

      <div className="card roles-toolbar" style={{ marginBottom: 16 }}>
        <input
          className="form-input"
          placeholder={t('roles.search')}
          value={search}
          onChange={e => setSearch(e.target.value)}
        />
      </div>

      {/* Yuqori bo'g'in rahbariyat */}
      {topLeadership.length > 0 && (
        <div className="card" style={{ marginBottom: 12, borderLeft: '3px solid #f59e0b' }}>
          <h2 className="role-group">
            ⭐ {t('roles.topLeadership')}
            <span className="role-group__count">
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
            <h2 className="role-group">
              🏢 {deptName}
              <span className="role-group__count">
                {t('users.peopleCount', { n: deptCount })}
              </span>
            </h2>
            {Object.entries(divsMap).map(([divName, divUsers]) => (
              <div key={divName} className="role-subgroup">
                <div className="role-subgroup__title">
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
          <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ marginBottom: 4 }}>{modal.full_name}</h2>
            <p style={{ color: 'var(--text-muted)', fontSize: 13, marginBottom: 20 }}>
              {modal.position || modal.department}
            </p>

            {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

            {/* Rol tanlash */}
            <div className="form-group">
              <label>{t('roles.field.role')}</label>
              <div className="role-picker">
                {ASSIGNABLE_ROLES.map(value => ({
                  value,
                  label: (ROLE_ICONS[value] || '') + roleLabel(t, value),
                  desc: t(`roles.desc.${value}`),
                })).map(r => (
                  <label key={r.value}
                    className={'role-option' + (newRole === r.value ? ' role-option--on' : '')}>
                    <input type="radio" name="role" value={r.value}
                      checked={newRole === r.value}
                      onChange={() => handleRoleChange(r.value)}
                      style={{ marginTop: 2 }}
                    />
                    <div>
                      <div className="role-option__title">{r.label}</div>
                      <div className="role-option__desc">{r.desc}</div>
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
                (masalan "Loyihani o'chirish", "Barcha loyihalarni ko'rish") */}
            {permDefs.length > 0 && (
              <div className="form-group">
                <label>{t('roles.field.extraPermissions')}</label>
                <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 8 }}>
                  {t('roles.extraPermissions.hint')}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {permDefs.map(p => (
                    <label key={p.key}
                      className={'role-option' + (newPerms.includes(p.key) ? ' role-option--on' : '')}
                      style={{ padding: 10 }}>
                      <input type="checkbox" checked={newPerms.includes(p.key)}
                        onChange={() => togglePerm(p.key)} style={{ marginTop: 2 }} />
                      <div>
                        <div className="role-option__title">{permLabel(t, p)}</div>
                        <div className="role-option__desc">{permDesc(t, p)}</div>
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

// Huquq nomi/tavsifi — tarjima bo'lsa undan, bo'lmasa serverdagi matn
function permLabel(t, p) {
  const key = `perm.${p.key}`
  return t(key) === key ? p.label : t(key)
}

function permDesc(t, p) {
  const key = `perm.${p.key}.desc`
  return t(key) === key ? p.description : t(key)
}

function UserCard({ u, onEdit, readonly }) {
  const { t } = useI18n()
  const roleColor = ROLE_COLORS[u.role] || 'var(--text-muted)'
  return (
    <div className="role-user">
      <div className="role-user__main">
        <div className="role-user__name">
          {u.full_name}
          <span className="role-chip" style={{ background: roleColor + '20', color: roleColor }}>
            {(ROLE_ICONS[u.role] || '') + roleLabel(t, u.role)}
          </span>
          {/* Roldan tashqari berilgan huquqlar ko'rinib tursin */}
          {(u.permissions || []).map(p => (
            <span key={p} className="role-chip"
              style={{ background: 'rgba(6, 214, 160, 0.15)', color: 'var(--accent)' }}>
              {t(`perm.${p}`) === `perm.${p}` ? p : t(`perm.${p}`)}
            </span>
          ))}
        </div>
        <div className="role-user__meta">{u.position || '—'}</div>
      </div>
      {!readonly && (
        <button className="btn btn-outline btn-sm" onClick={() => onEdit(u)}>
          {t('roles.assign')}
        </button>
      )}
      {readonly && (
        <span style={{ fontSize: 14, flexShrink: 0 }}>{u.role === 'director' ? '🎖️' : '👑'}</span>
      )}
    </div>
  )
}


// =========================================================================
// ROL ↔ SAHIFA VA HUQUQ MATRITSASI — faqat Bosh Administrator uchun
//
// Ilgari qaysi rol qaysi sahifani ko'rishi App.jsx/Navbar.jsx ichida qattiq
// yozilgan edi. Endi bu yerdan boshqariladi; standart qiymatlar avvalgi
// holatning aynan o'zi, shuning uchun tegilmasa hech nima o'zgarmaydi.
//
// Sahifalar bilan bir qatorda qo'shimcha huquqlar ham shu oynadan beriladi
// ("Loyihani o'chirish", "Barcha loyihalarni ko'rish", ...). Ikkalasi bir xil
// tuzilishga ega bo'lgani uchun bitta matritsa komponenti ustunlarni
// almashtirib chizadi — yuqoridagi segment tugmasi shuni tanlaydi.
// =========================================================================

function AccessMatrix() {
  const { t } = useI18n()
  const narrow = useIsNarrow()

  const [data, setData] = useState(null)      // {roles, pages, matrix, permissions, ...}
  const [view, setView] = useState('pages')   // 'pages' | 'perms'
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  // Rol darajasidagi qoralamalar
  const [draft, setDraft] = useState({})          // {role: Set(pageKey)}
  const [permDraft, setPermDraft] = useState({})  // {role: Set(permKey)}

  // Rol qatori ochilganda o'sha roldagi xodimlar yuklanadi. Bir roldagi
  // xodimlarga har xil oyna/huquq kerak bo'lishi mumkin — har biri alohida.
  const [expanded, setExpanded] = useState(null)          // ochiq rol
  const [usersByRole, setUsersByRole] = useState({})      // {role: [user, ...]}
  const [loadingUsers, setLoadingUsers] = useState(null)  // yuklanayotgan rol
  const [userDraft, setUserDraft] = useState({})          // {userId: Set(pageKey)}
  const [userPermDraft, setUserPermDraft] = useState({})  // {userId: Set(permKey)}

  const isPages = view === 'pages'

  useEffect(() => { load() }, [])

  const load = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/permissions/page-access')
      setData(res.data)
      setDraft(toDraft(res.data.matrix))
      setPermDraft(toDraft(res.data.permission_matrix))
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setLoading(false)
    }
  }

  const toDraft = (matrix) => {
    const d = {}
    Object.entries(matrix || {}).forEach(([role, keys]) => { d[role] = new Set(keys) })
    return d
  }

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
      setUserPermDraft(prev => {
        const next = { ...prev }
        res.data.forEach(u => { next[u.id] = new Set(u.permissions || []) })
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

  // ── Ustunlar: ko'rinishga qarab sahifalar yoki huquqlar ────────────────
  const pageLabel = (p) => {
    const key = PAGE_LABEL_KEYS[p.key]
    if (!key) return p.label
    const val = t(key)
    return val === key ? p.label : val
  }

  const columns = !data ? [] : (isPages
    ? (data.pages || []).map(p => ({
        key: p.key,
        icon: p.icon,
        label: pageLabel(p),
        note: (data.service_provider_pages || []).includes(p.key) ? t('pages.serviceNote') : '',
      }))
    : (data.permissions || []).map(p => ({
        key: p.key,
        icon: '🔑',
        label: permLabel(t, p),
        desc: permDesc(t, p),
      }))
  )

  // ── Rol darajasi ──────────────────────────────────────────────────────
  const roleSet = (role) => (isPages ? draft[role] : permDraft[role]) || new Set()
  const roleLocked = (r) => (isPages ? r.locked : r.perm_locked)

  const toggleRole = (role, key) => {
    setSaved(false)
    const setter = isPages ? setDraft : setPermDraft
    setter(prev => {
      const s = new Set(prev[role] || [])
      if (s.has(key)) s.delete(key)
      else s.add(key)
      return { ...prev, [role]: s }
    })
  }

  const setAll = (role, on) => {
    setSaved(false)
    const setter = isPages ? setDraft : setPermDraft
    setter(prev => ({ ...prev, [role]: on ? new Set(columns.map(c => c.key)) : new Set() }))
  }

  const resetRole = (role) => {
    setSaved(false)
    const defaults = isPages ? data.defaults : data.permission_defaults
    const setter = isPages ? setDraft : setPermDraft
    setter(prev => ({ ...prev, [role]: new Set((defaults || {})[role] || []) }))
  }

  // ── Xodim darajasi ────────────────────────────────────────────────────
  const userSet = (id) => (isPages ? userDraft[id] : userPermDraft[id]) || new Set()

  const toggleUser = (userId, key) => {
    setSaved(false)
    const setter = isPages ? setUserDraft : setUserPermDraft
    setter(prev => {
      const s = new Set(prev[userId] || [])
      if (s.has(key)) s.delete(key)
      else s.add(key)
      return { ...prev, [userId]: s }
    })
  }

  // Xodim katakchasi holati. Huquqda rolga berilgani doim yoqiq turadi va
  // bitta xodimdan alohida olib bo'lmaydi — buning uchun rol o'zgartiriladi.
  const userCell = (u, key) => {
    if (isPages) {
      return { checked: u.locked ? true : userSet(u.id).has(key), disabled: !!u.locked, fromRole: false }
    }
    const fromRole = (u.role_permissions || []).includes(key)
    return {
      checked: u.perm_locked || fromRole || userSet(u.id).has(key),
      disabled: !!u.perm_locked || fromRole,
      fromRole,
    }
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
          ? {
              ...u,
              pages: payload.pages,
              has_override: payload.has_override,
              permissions: payload.permissions ?? u.permissions,
              role_permissions: payload.role_permissions ?? u.role_permissions,
            }
          : u)
      })
      return next
    })
    setUserDraft(prev => ({ ...prev, [payload.user_id]: new Set(payload.pages) }))
    if (payload.permissions) {
      setUserPermDraft(prev => ({ ...prev, [payload.user_id]: new Set(payload.permissions) }))
    }
  }

  // ── O'zgarishlar ──────────────────────────────────────────────────────
  // Serverdagi holatdan farq qiladigan rollar — faqat shular yuboriladi
  const diffRoles = (drafts, matrix, lockedOf) => (data ? data.roles
    .filter(r => !lockedOf(r))
    .filter(r => !setEq(drafts[r.value], (matrix || {})[r.value]))
    .map(r => r.value) : [])

  const changedRoles = diffRoles(draft, data?.matrix, r => r.locked)
  const changedPermRoles = diffRoles(permDraft, data?.permission_matrix, r => r.perm_locked)

  const allUsers = Object.values(usersByRole).flat()
  const changedUsers = allUsers.filter(u => !u.locked && !setEq(userDraft[u.id], u.pages))
  const changedPermUsers = allUsers.filter(
    u => !u.perm_locked && !setEq(userPermDraft[u.id], u.permissions || [])
  )

  const changedUserIds = new Set([
    ...changedUsers.map(u => u.id), ...changedPermUsers.map(u => u.id),
  ])
  const changeCount =
    new Set([...changedRoles, ...changedPermRoles]).size + changedUserIds.size

  const isRoleChanged = (role) =>
    (isPages ? changedRoles : changedPermRoles).includes(role)
  const isUserChanged = (id) =>
    (isPages ? changedUsers : changedPermUsers).some(u => u.id === id)

  const save = async () => {
    if (!changeCount) return
    setSaving(true)
    setError('')
    try {
      if (changedRoles.length || changedPermRoles.length) {
        const body = {}
        if (changedRoles.length) {
          body.matrix = {}
          changedRoles.forEach(role => { body.matrix[role] = [...(draft[role] || [])] })
        }
        if (changedPermRoles.length) {
          body.permission_matrix = {}
          changedPermRoles.forEach(role => {
            body.permission_matrix[role] = [...(permDraft[role] || [])]
          })
        }
        const res = await api.put('/permissions/page-access', body)
        setData(prev => ({
          ...prev,
          matrix: res.data.matrix,
          permission_matrix: res.data.permission_matrix || prev.permission_matrix,
        }))
        setDraft(toDraft(res.data.matrix))
        if (res.data.permission_matrix) setPermDraft(toDraft(res.data.permission_matrix))
      }

      for (const id of changedUserIds) {
        const body = { user_id: id }
        if (changedUsers.some(u => u.id === id)) body.pages = [...(userDraft[id] || [])]
        if (changedPermUsers.some(u => u.id === id)) {
          body.permissions = [...(userPermDraft[id] || [])]
        }
        const res = await api.put('/permissions/page-access/user', body)
        applyUserResult(res.data)
      }

      // Rol qiymati o'zgargan bo'lsa, shaxsiy sozlamasi yo'q xodimlarning
      // amaldagi ruxsati ham o'zgardi — ochiq ro'yxatni qayta o'qiymiz
      if (expanded && (changedRoles.includes(expanded) || changedPermRoles.includes(expanded))) {
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
    if (!window.confirm(t('pages.resetConfirmAll'))) return
    setSaving(true)
    setError('')
    try {
      const res = await api.post('/permissions/page-access/reset', {})
      setData(prev => ({
        ...prev,
        matrix: res.data.matrix,
        permission_matrix: res.data.permission_matrix || prev.permission_matrix,
      }))
      setDraft(toDraft(res.data.matrix))
      if (res.data.permission_matrix) setPermDraft(toDraft(res.data.permission_matrix))
      // Shaxsiy sozlamalar ham o'chdi — ochiq rollar qayta yuklanadi
      const openRoles = Object.keys(usersByRole)
      setUsersByRole({})
      setUserDraft({})
      setUserPermDraft({})
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

  const rowProps = {
    data, columns, isPages, saving, expanded, usersByRole, loadingUsers,
    roleSet, roleLocked, toggleRole, setAll, resetRole,
    userSet, userCell, toggleUser, resetUser, toggleExpand,
    isRoleChanged, isUserChanged,
  }

  return (
    <div>
      <div className="roles-head">
        <div className="roles-head__text">
          <h1>{isPages ? t('pages.title') : t('pages.permTitle')}</h1>
          <p className="roles-head__sub">
            {isPages ? t('pages.subtitle') : t('pages.permSubtitle')}
          </p>
        </div>
        <div className="seg" role="group">
          <button type="button" aria-pressed={isPages} onClick={() => setView('pages')}>
            🗂️ {t('pages.view.pages')}
          </button>
          <button type="button" aria-pressed={!isPages} onClick={() => setView('perms')}>
            🔑 {t('pages.view.perms')}
          </button>
        </div>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      {narrow
        ? <MatrixCards {...rowProps} />
        : <MatrixTable {...rowProps} />}

      <div className="card matrix-savebar">
        <div className="matrix-savebar__status">
          {changeCount > 0
            ? `⚠️ ${t('pages.unsaved', { n: changeCount })}`
            : saved
              ? `✅ ${isPages ? t('pages.saved') : t('pages.permSaved')}`
              : (isPages ? t('pages.hint') : t('pages.permHint'))}
        </div>
        <button className="btn btn-outline" onClick={resetAll} disabled={saving}>
          {t('pages.resetAll')}
        </button>
        <button className="btn btn-primary" onClick={save}
          disabled={saving || changeCount === 0}>
          {saving ? t('btn.saving') : t('btn.save')}
        </button>
      </div>

      {isPages && (
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 12 }}>
          ⓘ {t('pages.serviceNote')}
        </p>
      )}
    </div>
  )
}

// Rol/xodim sarlavhasi yonidagi rangli nuqta
function RoleDot({ role, size = 8 }) {
  return (
    <span style={{
      width: size, height: size, borderRadius: '50%', flexShrink: 0,
      background: ROLE_COLORS[role] || 'var(--text-muted)',
    }} />
  )
}

// Rol qatoridagi "Hammasi / Hech biri / ↺" tugmalari
function RowActions({ role, onAll, onNone, onReset, saving, t }) {
  return (
    <div className="matrix-card__actions">
      <button className="btn btn-outline btn-sm" style={{ padding: '2px 7px', fontSize: 10 }}
        onClick={onAll} disabled={saving}>{t('pages.all')}</button>
      <button className="btn btn-outline btn-sm" style={{ padding: '2px 7px', fontSize: 10 }}
        onClick={onNone} disabled={saving}>{t('pages.none')}</button>
      <button className="btn btn-outline btn-sm" style={{ padding: '2px 7px', fontSize: 10 }}
        onClick={onReset} disabled={saving} title={t('pages.reset')}>↺</button>
    </div>
  )
}

// "N ta foydalanuvchi" — bosilsa roldagi xodimlar ochiladi
function ExpandButton({ r, isOpen, isPages, onClick, t }) {
  return (
    <button
      type="button"
      className="matrix-expand"
      onClick={onClick}
      disabled={r.user_count === 0}
      title={r.user_count === 0 ? '' : (isPages ? t('pages.expandHint') : t('pages.permExpandHint'))}
    >
      {r.user_count > 0 && (isOpen ? '▾ ' : '▸ ')}
      {t('pages.userCount', { n: r.user_count })}
    </button>
  )
}

// Katakcha to'plami — kartochka ko'rinishida ishlatiladi
function ToggleGrid({ columns, state, onToggle, saving, t }) {
  return (
    <div className="access-grid">
      {columns.map(c => {
        const { checked, disabled, fromRole } = state(c.key)
        const off = disabled || saving
        return (
          <label key={c.key}
            className={'access-toggle'
              + (checked ? ' access-toggle--on' : '')
              + (off ? ' access-toggle--locked' : '')}
            title={c.desc || c.note || c.label}>
            <input type="checkbox" checked={checked} disabled={off}
              onChange={() => onToggle(c.key)} />
            <span>{c.icon}</span>
            <span className="access-toggle__text">{c.label}</span>
            {fromRole && (
              <span className="access-toggle__badge" title={t('pages.fromRoleHint')}>
                {t('pages.fromRole')}
              </span>
            )}
          </label>
        )
      })}
    </div>
  )
}

// ── Keng ekran: klassik matritsa jadvali ────────────────────────────────
function MatrixTable(p) {
  const { t } = useI18n()
  const {
    data, columns, isPages, saving, expanded, usersByRole, loadingUsers,
    roleSet, roleLocked, toggleRole, setAll, resetRole,
    userCell, toggleUser, resetUser, toggleExpand, isRoleChanged, isUserChanged,
  } = p

  return (
    <div className="card matrix-scroll" style={{ marginBottom: 12 }}>
      <table className="matrix-table">
        <thead>
          <tr>
            <th className="col-role">{t('pages.col.role')}</th>
            {columns.map(c => (
              <th key={c.key} className="col-head" title={c.desc || ''}>
                <div style={{ fontSize: 15 }}>{c.icon}</div>
                <div>{c.label}</div>
                {c.note && <div title={c.note} style={{ color: '#0ea5e9', fontSize: 12 }}>ⓘ</div>}
              </th>
            ))}
            <th className="col-actions" />
          </tr>
        </thead>
        <tbody>
          {data.roles.map(r => {
            const locked = roleLocked(r)
            const set = roleSet(r.value)
            const isOpen = expanded === r.value
            const roleUsers = usersByRole[r.value] || []
            return (
              <Fragment key={r.value}>
                <tr className={isRoleChanged(r.value) ? 'is-changed' : ''}>
                  <td className="col-role">
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <RoleDot role={r.value} />
                      <span style={{ fontWeight: 600 }}>
                        {(ROLE_ICONS[r.value] || '') + roleLabel(t, r.value)}
                      </span>
                      {locked && (
                        <span title={isPages ? t('pages.locked') : t('pages.permLocked')}>🔒</span>
                      )}
                    </div>
                    {/* Sonini bosish — o'sha roldagi xodimlarni ochadi, har
                        biriga alohida ruxsat/huquq berish uchun */}
                    <div style={{ marginLeft: 14 }}>
                      <ExpandButton r={r} isOpen={isOpen} isPages={isPages}
                        onClick={() => toggleExpand(r.value)} t={t} />
                    </div>
                  </td>

                  {columns.map(c => (
                    <td key={c.key} className="col-cell">
                      <input
                        type="checkbox"
                        checked={locked ? true : set.has(c.key)}
                        disabled={locked || saving}
                        onChange={() => toggleRole(r.value, c.key)}
                      />
                    </td>
                  ))}

                  <td className="col-actions">
                    {!locked && (
                      <RowActions role={r.value} saving={saving} t={t}
                        onAll={() => setAll(r.value, true)}
                        onNone={() => setAll(r.value, false)}
                        onReset={() => resetRole(r.value)} />
                    )}
                  </td>
                </tr>

                {isOpen && loadingUsers === r.value && (
                  <tr>
                    <td colSpan={columns.length + 2}
                      style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('state.loading')}
                    </td>
                  </tr>
                )}

                {isOpen && loadingUsers !== r.value && roleUsers.length === 0 && (
                  <tr>
                    <td colSpan={columns.length + 2}
                      style={{ padding: 12, fontSize: 12, color: 'var(--text-muted)' }}>
                      {t('pages.noUsers')}
                    </td>
                  </tr>
                )}

                {/* Roldagi xodimlar — har biriga alohida ruxsat/huquq */}
                {isOpen && roleUsers.map(u => {
                  const uChanged = isUserChanged(u.id)
                  const hasOwn = u.has_override || (u.permissions || []).length > 0
                  return (
                    <tr key={`u-${u.id}`} className={uChanged ? 'is-changed' : ''}>
                      <td className="col-role" style={{
                        padding: '6px 10px 6px 26px',
                        borderLeft: '3px solid ' + (ROLE_COLORS[r.value] || 'var(--border)'),
                      }}>
                        <div style={{ fontSize: 12, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          {u.full_name}
                          {isPages && u.has_override && (
                            <span className="role-chip" title={t('pages.overrideHint')}
                              style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                              {t('pages.override')}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                          {[u.position, u.division_name].filter(Boolean).join(' · ') || '—'}
                        </div>
                      </td>

                      {columns.map(c => {
                        const { checked, disabled, fromRole } = userCell(u, c.key)
                        return (
                          <td key={c.key} className="col-cell">
                            <input
                              type="checkbox"
                              checked={checked}
                              disabled={disabled || saving}
                              title={fromRole ? t('pages.fromRoleHint') : ''}
                              onChange={() => toggleUser(u.id, c.key)}
                              style={{ width: 14, height: 14 }}
                            />
                          </td>
                        )
                      })}

                      <td className="col-actions">
                        {!u.locked && hasOwn && (
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
  )
}

// ── Tor ekran: har bir rol alohida kartochka ────────────────────────────
function MatrixCards(p) {
  const { t } = useI18n()
  const {
    data, columns, isPages, saving, expanded, usersByRole, loadingUsers,
    roleSet, roleLocked, toggleRole, setAll, resetRole,
    userCell, toggleUser, resetUser, toggleExpand, isRoleChanged, isUserChanged,
  } = p

  return (
    <div className="matrix-cards" style={{ marginBottom: 12 }}>
      {data.roles.map(r => {
        const locked = roleLocked(r)
        const set = roleSet(r.value)
        const isOpen = expanded === r.value
        const roleUsers = usersByRole[r.value] || []
        return (
          <div key={r.value}
            className={'card matrix-card' + (isRoleChanged(r.value) ? ' matrix-card--changed' : '')}
            style={{ marginBottom: 0 }}>
            <div className="matrix-card__head">
              <div>
                <div className="matrix-card__title">
                  <RoleDot role={r.value} size={9} />
                  {(ROLE_ICONS[r.value] || '') + roleLabel(t, r.value)}
                  {locked && (
                    <span title={isPages ? t('pages.locked') : t('pages.permLocked')}>🔒</span>
                  )}
                </div>
                <ExpandButton r={r} isOpen={isOpen} isPages={isPages}
                  onClick={() => toggleExpand(r.value)} t={t} />
              </div>
              {!locked && (
                <RowActions role={r.value} saving={saving} t={t}
                  onAll={() => setAll(r.value, true)}
                  onNone={() => setAll(r.value, false)}
                  onReset={() => resetRole(r.value)} />
              )}
            </div>

            <ToggleGrid
              columns={columns}
              saving={saving}
              t={t}
              state={key => ({ checked: locked ? true : set.has(key), disabled: locked })}
              onToggle={key => toggleRole(r.value, key)}
            />

            {isOpen && loadingUsers === r.value && (
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                {t('state.loading')}
              </p>
            )}

            {isOpen && loadingUsers !== r.value && roleUsers.length === 0 && (
              <p style={{ marginTop: 10, fontSize: 12, color: 'var(--text-muted)' }}>
                {t('pages.noUsers')}
              </p>
            )}

            {isOpen && roleUsers.map(u => {
              const hasOwn = u.has_override || (u.permissions || []).length > 0
              return (
                <div key={u.id}
                  className={'matrix-card matrix-card--user'
                    + (isUserChanged(u.id) ? ' matrix-card--changed' : '')}
                  style={{ marginTop: 10, borderLeftColor: ROLE_COLORS[r.value] || 'var(--border)' }}>
                  <div className="matrix-card__head" style={{ marginBottom: 8 }}>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600, display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                        {u.full_name}
                        {isPages && u.has_override && (
                          <span className="role-chip" title={t('pages.overrideHint')}
                            style={{ background: 'var(--primary-glow)', color: 'var(--primary)' }}>
                            {t('pages.override')}
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                        {[u.position, u.division_name].filter(Boolean).join(' · ') || '—'}
                      </div>
                    </div>
                    {!u.locked && hasOwn && (
                      <button className="btn btn-outline btn-sm"
                        style={{ padding: '2px 7px', fontSize: 10 }}
                        onClick={() => resetUser(u)} disabled={saving}
                        title={t('pages.resetUser')}>
                        ↺ {t('pages.toRole')}
                      </button>
                    )}
                  </div>

                  <ToggleGrid
                    columns={columns}
                    saving={saving}
                    t={t}
                    state={key => userCell(u, key)}
                    onToggle={key => toggleUser(u.id, key)}
                  />
                </div>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}
