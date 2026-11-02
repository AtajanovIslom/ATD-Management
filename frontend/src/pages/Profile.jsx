import { useCallback, useEffect, useRef, useState } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { roleLabel } from '../i18n/labels'

/**
 * Foydalanuvchi profili va Telegram'ga ulash.
 *
 * Tashkilotda bitta umumiy bot. Xodim token kiritmaydi — "Telegram'ga
 * ulash" bosilganda bir martalik havola ochiladi, botda "Start" bosilsa
 * akkaunt ulanadi. Ulangandan keyin bildirishnomalar botga ham keladi,
 * rahbar esa xodim yuborgan ishni botning o'zida qabul qiladi/qaytaradi.
 */
export default function Profile() {
  const { user, isDeptAdmin } = useAuth()
  const { t, formatDateTime } = useI18n()

  const [tg, setTg] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [busy, setBusy] = useState('')
  const [pendingUrl, setPendingUrl] = useState('')
  const [notice, setNotice] = useState('')
  const pollUntil = useRef(0)

  const loadStatus = useCallback(async () => {
    try {
      const res = await api.get('/telegram/status')
      setTg(res.data)
      setLoadError('')
      return res.data
    } catch (err) {
      setLoadError(err.response?.data?.error || t('state.error'))
      return null
    }
  }, [t])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Havola ochilgach botda "Start" bosilishini kutamiz (havola 15 daqiqa amal qiladi)
  useEffect(() => {
    if (!pendingUrl) return
    const timer = setInterval(async () => {
      if (Date.now() > pollUntil.current) {
        setPendingUrl('')
        return
      }
      const s = await loadStatus()
      if (s?.linked) {
        setPendingUrl('')
        setNotice(t('tg.linkedNow'))
      }
    }, 3000)
    return () => clearInterval(timer)
  }, [pendingUrl, loadStatus, t])

  const connect = async () => {
    setNotice('')
    // Brauzer popup'ni bloklamasligi uchun oyna bosilgan zahoti ochiladi
    const win = window.open('', '_blank')
    setBusy('link')
    try {
      const res = await api.post('/telegram/link')
      pollUntil.current = Date.now() + 15 * 60 * 1000
      setPendingUrl(res.data.url)
      if (win) win.location.href = res.data.url
    } catch (err) {
      if (win) win.close()
      alert(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy('')
    }
  }

  const disconnect = async () => {
    if (!window.confirm(t('tg.unlinkConfirm'))) return
    setBusy('unlink')
    try {
      await api.delete('/telegram/link')
      setNotice('')
      await loadStatus()
    } finally {
      setBusy('')
    }
  }

  const sendTest = async () => {
    setBusy('test')
    try {
      await api.post('/telegram/test')
      setNotice(t('tg.testSent'))
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy('')
    }
  }

  const unit = user.division_name || user.department_name

  return (
    <div>
      <div className="page-header">
        <h1>👤 {t('prof.title')}</h1>
      </div>

      <div className="card">
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
          <Info label={t('prof.name')} value={user.full_name} />
          <Info label={t('prof.role')} value={roleLabel(t, user.role)} />
          <Info label={t('prof.position')} value={user.position} />
          <Info label={t('prof.unit')} value={unit} />
          <Info label={t('prof.login')} value={user.login} mono />
          <Info label={t('prof.tab')} value={user.tab_number} mono />
        </div>
      </div>

      <div className="card">
        <h2 style={{ fontSize: 16, marginBottom: 4 }}>✈️ {t('tg.title')}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, maxWidth: 680 }}>
          {isDeptAdmin ? t('tg.intro.leader') : t('tg.intro.worker')}
        </p>

        {loadError && <div className="alert alert-error">{loadError}</div>}
        {notice && <div className="alert alert-success" style={{ marginBottom: 12 }}>{notice}</div>}

        {!tg && !loadError && <p style={{ color: 'var(--text-muted)' }}>{t('state.loading')}</p>}

        {tg && !tg.enabled && (
          <div className="alert alert-error">{t('tg.notConfigured')}</div>
        )}

        {tg?.enabled && !tg.bot_username && (
          <div className="alert alert-error">
            {t('tg.unreachable')}{tg.error ? ` (${tg.error})` : ''}
          </div>
        )}

        {tg?.enabled && tg.linked && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: 220 }}>
              <div style={{ fontWeight: 600 }}>
                ✅ {t('tg.linked')}{tg.link?.username ? `: @${tg.link.username}` : ''}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                {tg.link?.first_name}{tg.link?.linked_at ? ` · ${formatDateTime(tg.link.linked_at)}` : ''}
                {tg.bot_username && <> · {t('tg.bot')}: <a href={`https://t.me/${tg.bot_username}`} target="_blank" rel="noopener noreferrer">@{tg.bot_username}</a></>}
              </div>
            </div>
            <button className="btn btn-outline btn-sm" onClick={sendTest} disabled={!!busy}>
              {busy === 'test' ? t('btn.saving') : `🔔 ${t('tg.test')}`}
            </button>
            <button className="btn btn-danger btn-sm" onClick={disconnect} disabled={!!busy}>
              {t('tg.unlink')}
            </button>
          </div>
        )}

        {tg?.enabled && tg.link && !tg.link.is_active && (
          <div className="alert alert-error" style={{ marginTop: 12 }}>{t('tg.blocked')}</div>
        )}

        {tg?.enabled && tg.bot_username && !tg.linked && (
          <div>
            <ol style={{ fontSize: 13, color: 'var(--text-secondary)', paddingLeft: 18, marginBottom: 14, lineHeight: 1.8 }}>
              <li>{t('tg.step1')}</li>
              <li>{t('tg.step2')}</li>
              <li>{t('tg.step3')}</li>
            </ol>
            <button className="btn btn-primary" onClick={connect} disabled={!!busy}>
              {busy === 'link' ? t('btn.saving') : `📲 ${t('tg.connect')}`}
            </button>
            {pendingUrl && (
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                ⏳ {t('tg.waiting')}{' '}
                <a href={pendingUrl} target="_blank" rel="noopener noreferrer">{t('tg.openAgain')}</a>
              </div>
            )}
          </div>
        )}
      </div>

      <MailSection t={t} formatDateTime={formatDateTime} telegramLinked={!!tg?.linked} />
    </div>
  )
}


/**
 * Korporativ pochta: manzil va parol bir marta kiritiladi, server IMAP'ga
 * kirib tekshiradi va parolni shifrlab saqlaydi. Yangi xatlar botga keladi.
 */
function MailSection({ t, formatDateTime, telegramLinked }) {
  const [st, setSt] = useState(null)
  const [form, setForm] = useState({ email: '', password: '' })
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  const load = useCallback(async () => {
    try {
      const res = await api.get('/mail/status')
      setSt(res.data)
      if (!res.data.connected) {
        setForm(f => ({ ...f, email: f.email || res.data.suggested_email || '' }))
      }
    } catch {
      setSt(null)
    }
  }, [])

  useEffect(() => { load() }, [load])

  const submit = async (e) => {
    e.preventDefault()
    setBusy(true)
    setError('')
    try {
      const res = await api.post('/mail/connect', form)
      setSt(res.data)
      setEditing(false)
      setForm(f => ({ ...f, password: '' }))
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy(false)
    }
  }

  const disconnect = async () => {
    if (!window.confirm(t('mail.disconnectConfirm'))) return
    setBusy(true)
    try {
      const res = await api.delete('/mail/connect')
      setSt(res.data)
    } finally {
      setBusy(false)
    }
  }

  if (!st) return null
  const acc = st.account
  const showForm = !st.connected || editing

  return (
    <div className="card">
      <h2 style={{ fontSize: 16, marginBottom: 4 }}>📧 {t('mail.title')}</h2>
      <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 14, maxWidth: 680 }}>
        {t('mail.intro')}
      </p>

      {!telegramLinked && (
        <div className="alert alert-error" style={{ marginBottom: 12 }}>{t('mail.needTelegram')}</div>
      )}

      {st.connected && !editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 220 }}>
            <div style={{ fontWeight: 600 }}>
              {acc.is_active ? '🟢' : '🔴'} {acc.email}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {acc.is_active ? t('mail.watching', { n: st.check_interval }) : t('mail.stopped')}
              {acc.last_checked_at && ` · ${t('mail.lastCheck')}: ${formatDateTime(acc.last_checked_at)}`}
            </div>
            {acc.last_error && (
              <div style={{ fontSize: 12, color: 'var(--danger)', marginTop: 4 }}>⚠️ {acc.last_error}</div>
            )}
          </div>
          <a className="btn btn-outline btn-sm" href={st.web_url} target="_blank" rel="noopener noreferrer">
            🌐 {t('mail.openWeb')}
          </a>
          <button className="btn btn-outline btn-sm" onClick={() => { setEditing(true); setForm({ email: acc.email, password: '' }) }}>
            🔑 {t('mail.updatePassword')}
          </button>
          <button className="btn btn-danger btn-sm" onClick={disconnect} disabled={busy}>{t('tg.unlink')}</button>
        </div>
      )}

      {showForm && (
        <form onSubmit={submit} style={{ maxWidth: 460 }}>
          {error && <div className="alert alert-error">{error}</div>}
          <div className="form-group">
            <label>{t('mail.email')}</label>
            <input className="form-input" type="email" autoComplete="username" required
              placeholder="ism.familiya@uzbeksteel.uz"
              value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          </div>
          <div className="form-group">
            <label>{t('mail.password')}</label>
            <input className="form-input" type="password" autoComplete="current-password" required
              value={form.password} onChange={e => setForm({ ...form, password: e.target.value })} />
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 12 }}>🔒 {t('mail.privacy')}</p>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t('mail.checking') : `📧 ${t('mail.connect')}`}
            </button>
            {editing && (
              <button type="button" className="btn btn-outline" onClick={() => setEditing(false)}>{t('btn.cancel')}</button>
            )}
          </div>
        </form>
      )}
    </div>
  )
}


function Info({ label, value, mono }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>{label}</div>
      <div style={{ fontSize: 14, marginTop: 2, fontFamily: mono ? 'monospace' : undefined }}>{value || '—'}</div>
    </div>
  )
}
