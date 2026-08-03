import { createContext, useContext, useState, useCallback } from 'react'

const ToastContext = createContext(null)

const ICONS = {
  info: '📋',
  success: '✅',
  warning: '⚠️',
  danger: '🔴',
}

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([])

  const addToast = useCallback((message, opts = {}) => {
    const {
      title = null,
      type = 'info',
      duration = 6000,
      onClick = null,
    } = typeof opts === 'number' ? { duration: opts } : opts

    const id = Date.now() + Math.random()
    setToasts(prev => [...prev, { id, message, title, type, onClick }])
    setTimeout(() => {
      setToasts(prev => prev.map(t => t.id === id ? { ...t, exiting: true } : t))
      setTimeout(() => {
        setToasts(prev => prev.filter(t => t.id !== id))
      }, 300)
    }, duration)
  }, [])

  return (
    <ToastContext.Provider value={{ addToast }}>
      {children}
      <div className="toast-container">
        {toasts.map(t => (
          <div
            key={t.id}
            className={`toast toast-${t.type} ${t.exiting ? 'toast-exit' : ''} ${t.onClick ? 'toast-clickable' : ''}`}
            onClick={() => { if (t.onClick) t.onClick() }}
          >
            <span className="toast-icon">{ICONS[t.type] || ICONS.info}</span>
            <div className="toast-body">
              {t.title && <div className="toast-title">{t.title}</div>}
              <div className="toast-message">{t.message}</div>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export const useToast = () => useContext(ToastContext)
