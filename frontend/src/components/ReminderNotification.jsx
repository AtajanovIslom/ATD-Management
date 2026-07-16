import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

/**
 * Har logindan keyin bir marta ko'rsatiladi:
 * agar user'da 5 kun ichida muddati keladigan yoki muddati o'tgan
 * BAJARILMAGAN eslatmalar bo'lsa, notification chiqadi.
 */
export default function ReminderNotification() {
  const { user } = useAuth()
  const navigate = useNavigate()
  const [items, setItems] = useState([])
  const [show, setShow] = useState(false)

  useEffect(() => {
    if (!user) return
    // Har login uchun bir marta ko'rsatamiz (sessionStorage)
    const key = `reminder_notif_shown_${user.id}`
    if (sessionStorage.getItem(key)) return

    api.get('/reminders/upcoming?days=5')
      .then(res => {
        if (res.data.total > 0) {
          setItems(res.data.items)
          setShow(true)
        }
        sessionStorage.setItem(key, '1')
      })
      .catch(() => { /* ignore */ })
  }, [user])

  if (!show || items.length === 0) return null

  const close = () => setShow(false)
  const goToPage = () => { close(); navigate('/reminders') }

  const toggle = async (id) => {
    try {
      await api.post(`/reminders/${id}/toggle`)
      setItems(prev => prev.filter(r => r.id !== id))
    } catch { /* ignore */ }
  }

  return (
    <div className="modal-overlay" onClick={close} style={{ zIndex: 9999 }}>
      <div className="modal" style={{ maxWidth: 520 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12 }}>
          <div style={{
            fontSize: 32,
            background: 'rgba(239,68,68,0.15)',
            width: 56, height: 56, borderRadius: 12,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>🔔</div>
          <div style={{ flex: 1 }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>Yaqinlashayotgan eslatmalar</h2>
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>
              {items.length} ta eslatma 5 kun ichida yakunlanishi kerak
            </p>
          </div>
        </div>

        <div style={{
          maxHeight: 340, overflowY: 'auto',
          border: '1px solid var(--border)', borderRadius: 8, padding: 4,
        }}>
          {items.map(r => {
            const color = colorForDays(r.days_left)
            return (
              <div key={r.id} style={{
                display: 'flex', alignItems: 'flex-start', gap: 10,
                padding: '10px 12px',
                borderLeft: `3px solid ${color}`,
                background: 'var(--bg-input, rgba(255,255,255,0.02))',
                borderRadius: 4, marginBottom: 4,
              }}>
                <button
                  onClick={() => toggle(r.id)}
                  title="Bajardim"
                  style={{
                    width: 20, height: 20, minWidth: 20,
                    border: `2px solid ${color}`,
                    background: 'transparent', borderRadius: 4,
                    cursor: 'pointer', marginTop: 2,
                  }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontSize: 13, fontWeight: 500, whiteSpace: 'pre-wrap' }}>
                    {r.message}
                  </div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2, display: 'flex', gap: 8 }}>
                    <span>📅 {formatDate(r.remind_date)}</span>
                    <span style={{ color, fontWeight: 600 }}>{daysText(r.days_left)}</span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>

        <div className="modal-actions" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <button className="btn btn-outline" onClick={close}>Keyinroq</button>
          <button className="btn btn-primary" onClick={goToPage}>
            🗓️ Eslatmalarim
          </button>
        </div>
      </div>
    </div>
  )
}

function colorForDays(days) {
  if (days === null || days === undefined) return '#64748b'
  if (days < 0) return '#dc2626'
  if (days <= 2) return '#ef4444'
  if (days <= 5) return '#f97316'
  if (days <= 14) return '#eab308'
  return '#22c55e'
}

function daysText(days) {
  if (days === null || days === undefined) return ''
  if (days < 0) return `Muddati o‘tgan (${Math.abs(days)} kun)`
  if (days === 0) return 'Bugun!'
  if (days === 1) return 'Ertaga'
  return `${days} kun qoldi`
}

function formatDate(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return d.toLocaleDateString('uz-UZ', { day: '2-digit', month: 'long', year: 'numeric' })
}
