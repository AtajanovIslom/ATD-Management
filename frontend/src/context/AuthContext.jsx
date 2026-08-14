import { createContext, useContext, useEffect, useState } from 'react'
import api from '../api/axios'

const AuthContext = createContext(null)

// Sahifa ruxsatlari serverdan keladi (/permissions/my-pages) — yagona manba
// backenddagi utils.DEFAULT_ROLE_PAGES + role_pages jadvali. Bu yerda nusxa
// saqlanmaydi, faqat localStorage'da keshlanadi: qayta ochilganda nav
// darhol chizilsin, so'ng server javobi bilan yangilansin.
const readCache = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

// Menyudagi tartib — rolning "bosh sahifasi" shu tartibdagi birinchi ruxsat
// etilgan sahifa bo'ladi (backenddagi utils.PAGES bilan bir xil).
const PAGE_ORDER = [
  ['dashboard', '/'],
  ['reminders', '/reminders'],
  ['work_logs', '/work-logs'],
  ['department_work_logs', '/department-work-logs'],
  ['statistics', '/statistics'],
  ['create_project', '/create-project'],
  ['create_task', '/create-task'],
  ['teams', '/teams'],
  ['departments', '/departments'],
  ['users', '/users'],
  ['interactive_services', '/interactive-services'],
  ['interactive_requests', '/interactive-requests'],
  ['roles', '/roles'],
  ['audit_logs', '/audit-logs'],
]

const homeFor = (pages) => {
  const found = PAGE_ORDER.find(([key]) => pages.includes(key))
  return found ? found[1] : '/'
}

/**
 * ZAXIRA YO'L: server ruxsatlarni bera olmaganda ishlatiladi (backend hali
 * yangilanmagan, 500, tarmoq uzilishi...). Bu — matritsa joriy qilinishidan
 * oldingi qattiq yozilgan qoidalarning aynan o'zi, shuning uchun eng yomon
 * holatda ham tizim avvalgidek ishlayveradi, hech kim ekranda qolib ketmaydi.
 * Bu yerda matritsaning bazadagi o'zgarishlari hisobga olinmaydi.
 */
const legacyPages = (user) => {
  const role = user?.role || 'user'
  if (role === 'agent') return ['interactive_requests']

  const isSuper = ['superadmin', 'director', 'deputy_director'].includes(role)
  const isAdmin = isSuper || role === 'admin'
  const isDept = isAdmin || role === 'department_admin'
  const isProvider = !!user?.division_is_service_provider

  const allow = new Set(['dashboard', 'reminders'])
  if (!isDept) allow.add('work_logs')
  if (isDept) {
    ;['department_work_logs', 'statistics', 'create_project', 'create_task', 'users']
      .forEach(k => allow.add(k))
  }
  if (isAdmin) ['teams', 'departments', 'interactive_services'].forEach(k => allow.add(k))
  if (isAdmin || isProvider) allow.add('interactive_requests')
  if (['superadmin', 'director'].includes(role)) allow.add('roles')
  if (isSuper) allow.add('audit_logs')

  return PAGE_ORDER.map(([key]) => key).filter(k => allow.has(k))
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('user')
    return saved ? JSON.parse(saved) : null
  })
  const [pages, setPages] = useState(() => readCache('page_access', null))

  // Har ochilishda va foydalanuvchi almashganda ruxsatlar qayta so'raladi —
  // Bosh Administrator matritsani o'zgartirsa, xodim qayta login qilmasdan
  // (sahifani yangilaganda) yangi ko'rinishni oladi.
  useEffect(() => {
    if (!user) return
    let cancelled = false
    api.get('/permissions/my-pages')
      .then(res => {
        if (cancelled) return
        const list = Array.isArray(res.data.pages) ? res.data.pages : []
        setPages(list)
        localStorage.setItem('page_access', JSON.stringify(list))
      })
      .catch(() => {
        // Server javob bermadi — keshdagi qiymat bo'lsa o'sha qoladi, aks holda
        // eski qattiq yozilgan qoidalarga tushamiz. Hech qachon `null` da
        // qolmaymiz: bo'lmasa foydalanuvchi yuklanish ekranida qotib qolardi.
        if (cancelled) return
        setPages(prev => (Array.isArray(prev) ? prev : legacyPages(user)))
      })
    return () => { cancelled = true }
  }, [user?.id, user?.role])

  const login = async (loginName, password) => {
    const res = await api.post('/auth/login', { login: loginName, password })
    localStorage.setItem('token', res.data.token)
    localStorage.setItem('user', JSON.stringify(res.data.user))
    // Har login uchun eslatma notification qayta chiqsin
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('reminder_notif_shown_')) sessionStorage.removeItem(k)
    })
    // Oldingi foydalanuvchining ruxsatlari yangi hisobga o'tib ketmasin
    localStorage.removeItem('page_access')
    setPages(null)
    setUser(res.data.user)
    return res.data.user
  }

  const logout = () => {
    localStorage.removeItem('token')
    localStorage.removeItem('user')
    localStorage.removeItem('page_access')
    Object.keys(sessionStorage).forEach(k => {
      if (k.startsWith('reminder_notif_shown_')) sessionStorage.removeItem(k)
    })
    setPages(null)
    setUser(null)
  }

  const setSession = (token, userData) => {
    localStorage.setItem('token', token)
    localStorage.setItem('user', JSON.stringify(userData))
    localStorage.removeItem('page_access')
    setPages(null)
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
  // Rol ↔ sahifa matritsasini tahrirlash — faqat Bosh Administrator
  const canManagePageAccess = role === 'superadmin'
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
        // Bo'lim rahbari o'z bo'limi doirasida loyiha yaratadi va o'zi
        // yaratgan loyihani tahrirlaydi
        'project.view', 'project.create', 'project.edit',
        'task.create', 'task.edit',
        'user.view', 'div.view', 'stats.view',
      ]
      return deptAdminPerms.includes(permission)
    }

    return false
  }

  // Sahifa ko'rinishi — rol ↔ sahifa matritsasidan (server aniqlaydi)
  const pagesLoaded = Array.isArray(pages)
  const canView = (pageKey) => pagesLoaded && pages.includes(pageKey)
  // Bosh sahifa har doim `pages` dan hisoblanadi — alohida saqlansa ular
  // mos kelmay qolib, "/" ga cheksiz yo'naltirish bo'lishi mumkin edi
  const home = pagesLoaded ? homeFor(pages) : '/'

  return (
    <AuthContext.Provider value={{
      user, login, logout, setSession,
      can, isAdmin, isSuperAdmin, isDeptAdmin, isAnyAdmin, canManageRoles,
      canManagePageAccess, canView, pages, pagesLoaded, home,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
