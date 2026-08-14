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
  const { user, logout, isAdmin, isSuperAdmin, isDeptAdmin, canManageRoles } = useAuth()
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
      <nav className="sidebar-nav">
        {link('/', '📊', t('nav.dashboard'), true)}
        {link('/reminders', '🗓️', t('nav.reminders'))}
        {/* Kunlik hisobotim — faqat oddiy xodimlarda (rahbarlar hisobot topshirmaydi) */}
        {!isDeptAdmin && link('/work-logs', '📓', t('nav.workLogs'))}
        {isDeptAdmin && link('/department-work-logs', '👥', t('nav.departmentWorkLogs'))}

        {isDeptAdmin && link('/statistics', '📈', t('nav.statistics'))}

        {isAdmin && (
          <>
            {link('/create-project', '🚀', t('nav.createProject'))}
            {link('/create-task', '📝', t('nav.createTask'))}
            {link('/teams', '👥', t('nav.teams'))}
            {link('/departments', '🏢', t('nav.departments'))}
            {link('/users', '🧑‍💻', t('nav.users'))}
            {link('/interactive-services', '🧩', t('nav.interactiveServices'))}
          </>
        )}

        {!isAdmin && isDeptAdmin && (
          <>
            {link('/create-project', '🚀', t('nav.createProject'))}
            {link('/create-task', '📝', t('nav.createTask'))}
            {link('/users', '🧑‍💻', t('nav.deptUsers'))}
          </>
        )}

        {canManageRoles && link('/roles', '🔑', t('nav.roles'))}
        {isSuperAdmin && link('/audit-logs', '📋', t('nav.auditLogs'))}

        {/* Interaktiv arizalar — faqat barcha boshqarma boshliqlari (admin+) va
            "Interaktiv xizmat ko'rsatadi" deb belgilangan bo'lim a'zolariga
            (bo'lim rahbari + xodim). Servis xizmati yoqilmagan bo'limlarga
            ko'rinmaydi. */}
        {(isAdmin || user.division_is_service_provider) && (
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
