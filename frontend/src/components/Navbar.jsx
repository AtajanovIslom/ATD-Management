import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import api from '../api/axios'

const ROLE_LABELS = {
  superadmin: '👑 Bosh Administrator',
  director: '🎖️ Direksiya Direktori',
  deputy_director: "🥈 Direktor O'rinbosari",
  admin: "Boshqarma Rahbari",
  department_admin: "Bo'lim Rahbari",
  user: 'Xodim',
}

export default function Navbar() {
  const { user, logout, isAdmin, isSuperAdmin, isDeptAdmin, canManageRoles } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const [interactiveCount, setInteractiveCount] = useState(0)

  useEffect(() => {
    let cancelled = false
    async function check() {
      try {
        const ir = await api.get('/interactive-requests/stats/summary').then(r => r.data).catch(() => ({}))
        if (cancelled) return
        setInteractiveCount((ir.by_status?.new || 0) + (ir.by_status?.assigned || 0))
      } catch { /* ignore */ }
    }
    check()
    const interval = setInterval(check, 30000) // har 30 soniyada yangilanadi
    return () => { cancelled = true; clearInterval(interval) }
  }, [])

  const link = (to, icon, label, end = false) => (
    <NavLink to={to} end={end} className={({ isActive }) => isActive ? 'active' : ''}>
      {icon} {label}
    </NavLink>
  )

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <img src="/logo.png" alt="ATD" className="brand-logo-img" />
          <div className="brand-text">
            <h2>ATD Management</h2>
            <span>Loyiha boshqaruv tizimi</span>
          </div>
        </div>
      </div>
      <nav className="sidebar-nav">
        {link('/', '📊', 'Boshqaruv paneli', true)}
        {link('/reminders', '🗓️', 'Eslatmalarim')}

        {isDeptAdmin && link('/statistics', '📈', 'Statistika')}

        {isAdmin && (
          <>
            {link('/create-project', '🚀', 'Loyiha yaratish')}
            {link('/create-task', '📝', 'Vazifa yaratish')}
            {link('/teams', '👥', 'Guruhlar')}
            {link('/departments', '🏢', 'Boshqarmalar')}
            {link('/users', '🧑‍💻', 'Xodimlar')}
            {link('/interactive-services', '🧩', 'Interaktiv xizmatlar Admin')}
          </>
        )}

        {!isAdmin && isDeptAdmin && (
          <>
            {link('/create-task', '📝', 'Vazifa yaratish')}
            {link('/users', '🧑‍💻', "Bo'lim xodimlari")}
          </>
        )}

        {canManageRoles && link('/roles', '🔑', 'Rol va huquqlar')}
        {isSuperAdmin && link('/audit-logs', '📋', 'Audit jurnali')}

        <NavLink to="/interactive-requests" className={({ isActive }) => isActive ? 'active' : ''}>
          📥 Interaktiv arizalar
          {interactiveCount > 0 && (
            <span style={{
              marginLeft: 8, background: '#3b82f6', color: '#fff',
              fontSize: 10, fontWeight: 700,
              padding: '1px 6px', borderRadius: 10,
            }}>
              {interactiveCount}
            </span>
          )}
        </NavLink>

      </nav>
      <div className="sidebar-footer">
        <button className="theme-toggle-btn" onClick={toggleTheme} title={theme === 'dark' ? "Yorug' rejim" : "Qorong'i rejim"}>
          {theme === 'dark' ? "☀️ Yorug' rejim" : "🌙 Qorong'i rejim"}
        </button>
        <div className="user-info">
          <strong>{user.full_name}</strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {ROLE_LABELS[user.role] || user.role}
          </span>
          {user.department_name && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {user.department_name}
            </span>
          )}
        </div>
        <button className="btn btn-outline btn-full logout-btn" onClick={logout}>
          Chiqish
        </button>
      </div>
    </aside>
  )
}
