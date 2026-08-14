import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Register() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { setSession } = useAuth()
  const { t } = useI18n()
  const [info, setInfo] = useState(null)
  const [loadError, setLoadError] = useState('')
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    api.get(`/auth/register/${token}`)
      .then(res => setInfo(res.data))
      .catch(err => setLoadError(err.response?.data?.error || t('auth.register.invalidLink')))
  }, [token, t])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!login || login.includes(' ')) {
      setError(t('auth.err.loginRequired'))
      return
    }
    if (password.length < 4) {
      setError(t('auth.err.passwordShort'))
      return
    }
    if (password.includes(' ')) {
      setError(t('auth.err.passwordSpace'))
      return
    }
    if (password !== confirmPassword) {
      setError(t('auth.err.passwordMismatch'))
      return
    }

    setLoading(true)
    try {
      const res = await api.post(`/auth/register/${token}`, { login, password })
      setSession(res.data.token, res.data.user)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setLoading(false)
    }
  }

  if (loadError) {
    return (
      <div className="login-container">
        <div className="login-box">
          <LanguageSwitcher variant="plain" />
          <img src="/logo.png" alt="ATD" className="login-logo-img" />
          <h1 className="brand-title">{t('app.name')}</h1>
          <div className="alert alert-error">{loadError}</div>
          <Link to="/login" className="btn btn-outline btn-full">{t('auth.register.backToLogin')}</Link>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="login-container">
        <div className="login-box">
          <LanguageSwitcher variant="plain" />
          <img src="/logo.png" alt="ATD" className="login-logo-img" />
          <h1 className="brand-title">{t('app.name')}</h1>
          <p>{t('state.loading')}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <LanguageSwitcher variant="plain" />
        <img src="/logo.png" alt="ATD" className="login-logo-img" />
        <h1 className="brand-title">{t('app.name')}</h1>
        <p>{t('auth.register.welcome', { name: info.full_name })}</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('auth.field.loginRequired')}</label>
            <input
              className="form-input"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder={t('auth.field.login.placeholder')}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('auth.field.passwordRequired')}</label>
            <input
              className="form-input"
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('auth.field.password.placeholder')}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('auth.field.confirmPassword')}</label>
            <input
              className="form-input"
              type="text"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder={t('auth.field.confirmPassword.placeholder')}
              required
            />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? t('btn.saving') : t('auth.signup.submit')}
          </button>
        </form>
      </div>
    </div>
  )
}
