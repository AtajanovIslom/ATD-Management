import { useEffect, useState } from 'react'
import { NavLink } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useTheme } from '../context/ThemeContext'
import { useI18n } from '../i18n'
import LanguageSwitcher from './LanguageSwitcher'
import api from '../api/axios'

// Rol yonidagi belgilar — matn tarjimasi `role.*` kalitlaridan olinadi
const ROLE_ICONS = {
  superadmin: '👑 ',
  director: '🎖️ ',
  deputy_director: '🥈 ',
}

export default function Navbar() {
  const { user, logout, isAdmin, canView } = useAuth()
  const { theme, toggleTheme } = useTheme()
  const { t } = useI18n()
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

  // Noma'lum rol kelsa kalit o'rniga rol kodining o'zi ko'rsatiladi
  const roleKey = `role.${user.role}`
  const roleName = t(roleKey) === roleKey ? user.role : t(roleKey)
  const roleLabel = (ROLE_ICONS[user.role] || '') + roleName

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <div className="brand">
          <img src="/logo.png" alt="ATD" className="brand-logo-img" />
          <div className="brand-text">
            <h2>{t('app.name')}</h2>
            <span>{t('app.tagline')}</span>
          </div>
        </div>
      </div>
      {/* Menyu bandlari rol ↔ sahifa matritsasidan chiziladi (backend:
          /permissions/my-pages). Bosh Administrator uni /roles sahifasidagi
          "Rol va sahifalar" bo'limida o'zgartiradi. */}
      <nav className="sidebar-nav">
        {canView('dashboard') && link('/', '📊', t('nav.dashboard'), true)}
        {canView('reminders') && link('/reminders', '🗓️', t('nav.reminders'))}
        {canView('work_logs') && link('/work-logs', '📓', t('nav.workLogs'))}
        {canView('department_work_logs') && link('/department-work-logs', '👥', t('nav.departmentWorkLogs'))}
        {canView('statistics') && link('/statistics', '📈', t('nav.statistics'))}
        {canView('create_project') && link('/create-project', '🚀', t('nav.createProject'))}
        {canView('create_task') && link('/create-task', '📝', t('nav.createTask'))}
        {canView('teams') && link('/teams', '👥', t('nav.teams'))}
        {canView('departments') && link('/departments', '🏢', t('nav.departments'))}
        {/* Boshqarma rahbari va yuqorisi butun xodimlar ro'yxatini, bo'lim
            rahbari faqat o'z bo'limini ko'radi — sarlavha shunga qarab */}
        {canView('users') && link('/users', '🧑‍💻', isAdmin ? t('nav.users') : t('nav.deptUsers'))}
        {canView('interactive_services') && link('/interactive-services', '🧩', t('nav.interactiveServices'))}

        {canView('interactive_requests') && (
          <NavLink to="/interactive-requests" className={({ isActive }) => isActive ? 'active' : ''}>
            📥 {t('nav.interactiveRequests')}
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
        )}

        {canView('roles') && link('/roles', '🔑', t('nav.roles'))}
        {canView('audit_logs') && link('/audit-logs', '📋', t('nav.auditLogs'))}
      </nav>
      <div className="sidebar-footer">
        <LanguageSwitcher variant="compact" />
        <button className="theme-toggle-btn" onClick={toggleTheme} title={theme === 'dark' ? t('theme.light') : t('theme.dark')}>
          {theme === 'dark' ? `☀️ ${t('theme.light')}` : `🌙 ${t('theme.dark')}`}
        </button>
        <div className="user-info">
          <strong>{user.full_name}</strong>
          <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {roleLabel}
          </span>
          {user.department_name && (
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>
              {user.department_name}
            </span>
          )}
        </div>
        <button className="btn btn-outline btn-full logout-btn" onClick={logout}>
          {t('nav.logout')}
        </button>
      </div>
    </aside>
  )
}
