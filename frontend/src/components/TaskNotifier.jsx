import { useEffect, useRef } from 'react'
import { useAuth } from '../context/AuthContext'
import { useToast } from './Toast'
import api from '../api/axios'

export default function TaskNotifier() {
  const { user } = useAuth()
  const { addToast } = useToast()
  const lastCountRef = useRef(null)

  useEffect(() => {
    if (!user || user.role === 'admin') return

    const checkNewTasks = async () => {
      try {
        const res = await api.get('/tasks/my')
        const newTasks = res.data.filter(t => t.status === 'korilmagan')
        const currentCount = newTasks.length

        if (lastCountRef.current !== null && currentCount > lastCountRef.current) {
          const diff = currentCount - lastCountRef.current
          addToast(`Sizga ${diff} ta yangi vazifa yuklandi!`)
        }
        lastCountRef.current = currentCount
      } catch (err) {
        // ignore
      }
    }

    checkNewTasks()
    const interval = setInterval(checkNewTasks, 15000)
    return () => clearInterval(interval)
  }, [user, addToast])

  return null
}
