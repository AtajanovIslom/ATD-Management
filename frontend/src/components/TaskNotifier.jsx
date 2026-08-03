import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import api from '../api/axios'

const POLL_INTERVAL_MS = 20000
const STORAGE_KEY_PREFIX = 'task_snapshot_v1_'
const UNREAD_KEY_PREFIX = 'task_unread_v1_'
const ORIG_TITLE = 'HISOBOT'

/**
 * Vazifa hodisalari uchun ogohlantirish:
 *   - Hodimga yangi vazifa yuklandi
 *   - Hodimga vazifa qaytarildi
 *   - Boshliqqa: hodim vazifani bajarib tasdiqlashga yubordi (review)
 *   - Hodimga: vazifasi tasdiqlandi
 *
 * Uch xil kanal:
 *   1) Brauzer notification (OS darajasida) — tab fokusda bo‘lmasa ham chiqadi
 *   2) In-app toast — tab fokusda bo‘lganda ko‘rinadi
 *   3) Tab title `(N) HISOBOT` — foydalanuvchi boshqa tab’da bo‘lsa
 *
 * Yandex Browser Chromium asosida — bir xil ishlaydi.
 */
export default function TaskNotifier() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const navigate = useNavigate()
  const snapshotRef = useRef(null)
  const permissionAsked = useRef(false)
  const unreadRef = useRef(0)
  const isFocusedRef = useRef(typeof document !== 'undefined' ? !document.hidden : true)

  // Notification API ruxsat so‘rash — brauzer ochilganda bir marta
  useEffect(() => {
    if (!user) return
    if (permissionAsked.current) return
    if (typeof window === 'undefined' || !('Notification' in window)) return
    permissionAsked.current = true
    if (Notification.permission === 'default') {
      Notification.requestPermission().catch(() => {})
    }
  }, [user])

  // Tab fokus holatini kuzatib borish + title tozalash
  useEffect(() => {
    if (!user) return
    const onVis = () => {
      isFocusedRef.current = !document.hidden
      if (!document.hidden) {
        unreadRef.current = 0
        localStorage.setItem(UNREAD_KEY_PREFIX + user.id, '0')
        document.title = ORIG_TITLE
      }
    }
    document.addEventListener('visibilitychange', onVis)
    window.addEventListener('focus', onVis)
    // Boshlang‘ich unread — sahifa ochilganda 0'dan boshlaymiz
    unreadRef.current = 0
    document.title = ORIG_TITLE
    return () => {
      document.removeEventListener('visibilitychange', onVis)
      window.removeEventListener('focus', onVis)
      document.title = ORIG_TITLE
    }
  }, [user])

  useEffect(() => {
    if (!user) return
    let cancelled = false
    const storageKey = STORAGE_KEY_PREFIX + user.id
    const myId = user.id

    const isMyAssignment = (t) => {
      if (t.assignee_id === myId) return true
      if (Array.isArray(t.assignee_ids) && t.assignee_ids.includes(myId)) return true
      return false
    }

    const bumpUnread = () => {
      if (!isFocusedRef.current) {
        unreadRef.current += 1
        localStorage.setItem(UNREAD_KEY_PREFIX + user.id, String(unreadRef.current))
        document.title = `(${unreadRef.current}) ${ORIG_TITLE}`
      }
    }

    const notify = ({ title, body, taskId, type = 'info' }) => {
      // Brauzer notification (OS darajasida)
      try {
        if ('Notification' in window && Notification.permission === 'granted') {
          const n = new Notification(title, {
            body,
            icon: '/favicon.svg',
            tag: `task-${taskId}-${type}`,
            requireInteraction: false,
          })
          n.onclick = () => {
            window.focus()
            navigate(`/tasks/${taskId}`)
            n.close()
          }
          setTimeout(() => { try { n.close() } catch {} }, 15000)
        }
      } catch { /* ignore */ }

      // In-app toast (tab fokusda bo‘lsa)
      addToast(body, {
        title,
        type,
        duration: 8000,
        onClick: () => navigate(`/tasks/${taskId}`),
      })

      bumpUnread()
    }

    const loadSnapshot = () => {
      try {
        const raw = localStorage.getItem(storageKey)
        return raw ? JSON.parse(raw) : null
      } catch {
        return null
      }
    }

    const saveSnapshot = (map) => {
      try {
        localStorage.setItem(storageKey, JSON.stringify(map))
      } catch { /* quota */ }
    }

    const check = async () => {
      if (cancelled) return
      try {
        const res = await api.get('/tasks')
        if (cancelled) return
        const tasks = Array.isArray(res.data) ? res.data : []

        const prev = snapshotRef.current || loadSnapshot()
        const nextMap = {}
        for (const t of tasks) {
          nextMap[t.id] = {
            status: t.status,
            assignee_id: t.assignee_id,
            assignee_ids: t.assignee_ids || [],
            created_by: t.created_by,
          }
        }

        // Birinchi tekshiruv — faqat snapshot saqlab qo‘yamiz, ogohlantirmasdan
        if (!prev) {
          snapshotRef.current = nextMap
          saveSnapshot(nextMap)
          return
        }

        for (const t of tasks) {
          const before = prev[t.id]
          const iAmAssignee = isMyAssignment(t)
          const iAmCreator = t.created_by === myId

          if (!before) {
            // Yangi vazifa (mening ro‘yxatimda ilgari yo‘q edi)
            if (iAmAssignee && (t.status === 'active' || t.status === 'in_progress')) {
              notify({
                title: '📌 Yangi vazifa',
                body: t.name,
                taskId: t.id,
                type: 'info',
              })
            }
          } else if (before.status !== t.status) {
            // Status o‘zgardi
            if (t.status === 'review' && iAmCreator && !iAmAssignee) {
              notify({
                title: '📥 Tasdiqlashga yuborildi',
                body: `Xodim vazifani bajardi: ${t.name}`,
                taskId: t.id,
                type: 'warning',
              })
            } else if (t.status === 'completed' && iAmAssignee) {
              notify({
                title: '✅ Vazifa tasdiqlandi',
                body: t.name,
                taskId: t.id,
                type: 'success',
              })
            } else if (t.status === 'returned' && iAmAssignee) {
              notify({
                title: '↩️ Vazifa qaytarildi',
                body: t.name,
                taskId: t.id,
                type: 'danger',
              })
            }
          }
        }

        snapshotRef.current = nextMap
        saveSnapshot(nextMap)
      } catch { /* ignore */ }
    }

    check()
    const timer = setInterval(check, POLL_INTERVAL_MS)
    return () => { cancelled = true; clearInterval(timer) }
  }, [user, addToast, navigate])

  return null
}
