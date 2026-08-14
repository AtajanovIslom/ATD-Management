import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function SignUp() {
  const navigate = useNavigate()
  const { setSession } = useAuth()
  const { t } = useI18n()
  const [form, setForm] = useState({
    full_name: '', position: '', tab_number: '', login: '', password: '', confirmPassword: ''
  })
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const set = (key) => (e) => setForm({ ...form, [key]: e.target.value })

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (form.login.includes(' ')) {
      setError(t('auth.err.loginSpace'))
      return
    }
    if (form.password.length < 4) {
      setError(t('auth.err.passwordShort'))
      return
    }
    if (form.password.includes(' ')) {
      setError(t('auth.err.passwordSpace'))
      return
    }
    if (form.password !== form.confirmPassword) {
      setError(t('auth.err.passwordMismatch'))
      return
    }

    setLoading(true)
    try {
      const { confirmPassword, ...payload } = form
      const res = await api.post('/auth/signup', payload)
      setSession(res.data.token, res.data.user)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <LanguageSwitcher variant="plain" />
        <img src="/logo.png" alt="ATD" className="login-logo-img" />
        <h1 className="brand-title">{t('app.name')}</h1>
        <p>{t('auth.signup.subtitle')}</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('auth.field.fullName')}</label>
            <input className="form-input" value={form.full_name}
              onChange={set('full_name')} placeholder={t('auth.field.fullName.placeholder')} required />
          </div>
          <div className="form-group">
            <label>{t('auth.field.position')}</label>
            <input className="form-input" value={form.position}
              onChange={set('position')} placeholder={t('auth.field.position.placeholder')} />
          </div>
          <div className="form-group">
            <label>{t('auth.field.tabNumber')}</label>
            <input className="form-input" value={form.tab_number}
              onChange={set('tab_number')} placeholder={t('auth.field.tabNumber.placeholder')} required />
          </div>
          <div className="form-group">
            <label>{t('auth.field.loginRequired')}</label>
            <input className="form-input" value={form.login}
              onChange={set('login')} placeholder={t('auth.field.login.placeholder')} required />
          </div>
          <div className="form-group">
            <label>{t('auth.field.passwordRequired')}</label>
            <input className="form-input" type="text" value={form.password}
              onChange={set('password')} placeholder={t('auth.field.password.placeholder')} required />
          </div>
          <div className="form-group">
            <label>{t('auth.field.confirmPassword')}</label>
            <input className="form-input" type="text" value={form.confirmPassword}
              onChange={set('confirmPassword')} placeholder={t('auth.field.confirmPassword.placeholder')} required />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? t('btn.saving') : t('auth.signup.submit')}
          </button>
        </form>
        <p style={{ marginTop: 16, textAlign: 'center' }}>
          {t('auth.haveAccount')} <Link to="/login">{t('auth.login.link')}</Link>
        </p>
      </div>
    </div>
  )
}
