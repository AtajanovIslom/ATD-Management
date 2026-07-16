import { createContext, useContext, useState } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  })

  const login = async (loginName, password) => {
    const res = await api.post('/auth/login', { login: loginName, password })
    localStorage.setItem('token', res.data.token)
    localStorage.setItem('user', JSON.stringify(res.data.user))
    // Har login uchun eslatma notification qayta chiqsin
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('reminder_notif_shown_')) sessionStorage.removeItem(k)
    })
    setUser(res.data.user)
    return res.data.user
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('reminder_notif_shown_')) sessionStorage.removeItem(k)
    })
    setUser(null)
  }

  const setSession = (token, userData) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    setUser(userData)
  }

  const role = user?.role || 'user'

  // To'liq ma'lumot ko'ra oluvchi rollar
  const FULL_ACCESS = ['superadmin', 'director', 'deputy_director']
  // Rol berish huquqiga ega rollar
  const ROLE_MANAGERS = ['superadmin', 'director']

  // Rol daraja tekshiruvlari
  const isSuperAdmin = FULL_ACCESS.includes(role)
  const canManageRoles = ROLE_MANAGERS.includes(role)
  const isAdmin = isSuperAdmin || role === 'admin'
  const isDeptAdmin = isAdmin || role === 'department_admin'
  const isAnyAdmin = isDeptAdmin

  // Soddalashtirilgan huquq tekshiruvi
  const can = (permission) => {
    if (!user) return false
    if (isSuperAdmin) return true

    const adminPerms = [
      'project.create', 'project.edit', 'task.create', 'task.edit',
      'user.view', 'user.create', 'user.edit', 'user.delete',
      'dept.view', 'div.view', 'stats.view',
    ]

    if (role === 'admin') {
      return adminPerms.includes(permission)
    }

    if (role === 'department_admin') {
      const deptAdminPerms = [
        'project.view', 'task.create', 'task.edit',
        'user.view', 'div.view', 'stats.view',
      ]
      return deptAdminPerms.includes(permission)
    }

    return false
  }

  return (
    <AuthContext.Provider value={{
      user, login, logout, setSession,
      can, isAdmin, isSuperAdmin, isDeptAdmin, isAnyAdmin, canManageRoles,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
