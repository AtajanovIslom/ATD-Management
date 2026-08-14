import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import LanguageSwitcher from '../components/LanguageSwitcher'

export default function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login: doLogin } = useAuth()
  const { t } = useI18n()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await doLogin(login, password)
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
        <p>{t('auth.login.subtitle')}</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>{t('auth.login.label')}</label>
            <input
              className="form-input"
              type="text"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder={t('auth.login.placeholder')}
              required
            />
          </div>
          <div className="form-group">
            <label>{t('auth.password.label')}</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder={t('auth.password.placeholder')}
              required
            />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? t('auth.login.submitting') : t('auth.login.submit')}
          </button>
        </form>
        <p style={{ marginTop: 16, textAlign: 'center' }}>
          {t('auth.noAccount')} <Link to="/signup">{t('auth.signup.link')}</Link>
        </p>
      </div>
    </div>
  )
}
