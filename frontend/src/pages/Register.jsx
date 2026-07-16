import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function Register() {
  const { token } = useParams()
  const navigate = useNavigate()
  const { setSession } = useAuth()
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
      .catch(err => setLoadError(err.response?.data?.error || 'Havola yaroqsiz'))
  }, [token])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')

    if (!login || login.includes(' ')) {
      setError('Login kiritilishi va probelsiz bo\'lishi shart')
      return
    }
    if (password.length < 4) {
      setError('Parol kamida 4 ta belgidan iborat bo\'lishi kerak')
      return
    }
    if (password.includes(' ')) {
      setError('Parolda probel bo\'lmasligi kerak')
      return
    }
    if (password !== confirmPassword) {
      setError('Parollar mos kelmadi')
      return
    }

    setLoading(true)
    try {
      const res = await api.post(`/auth/register/${token}`, { login, password })
      setSession(res.data.token, res.data.user)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  if (loadError) {
    return (
      <div className="login-container">
        <div className="login-box">
          <img src="/logo.png" alt="ATD" className="login-logo-img" />
          <h1 className="brand-title">ATD Management</h1>
          <div className="alert alert-error">{loadError}</div>
          <Link to="/login" className="btn btn-outline btn-full">Kirish sahifasiga qaytish</Link>
        </div>
      </div>
    )
  }

  if (!info) {
    return (
      <div className="login-container">
        <div className="login-box">
          <img src="/logo.png" alt="ATD" className="login-logo-img" />
          <h1 className="brand-title">ATD Management</h1>
          <p>Yuklanmoqda...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <img src="/logo.png" alt="ATD" className="login-logo-img" />
          <h1 className="brand-title">ATD Management</h1>
        <p>Xush kelibsiz, <strong>{info.full_name}</strong>! Tizimga kirish uchun login va parol o'rnating.</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Login *</label>
            <input
              className="form-input"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder="Loginingizni tanlang"
              required
            />
          </div>
          <div className="form-group">
            <label>Parol * (kamida 4 belgi, probelsiz)</label>
            <input
              className="form-input"
              type="text"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Parolingizni tanlang"
              required
            />
          </div>
          <div className="form-group">
            <label>Parolni tasdiqlang *</label>
            <input
              className="form-input"
              type="text"
              value={confirmPassword}
              onChange={e => setConfirmPassword(e.target.value)}
              placeholder="Parolni qayta kiriting"
              required
            />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? 'Saqlanmoqda...' : 'Ro\'yxatdan o\'tish'}
          </button>
        </form>
      </div>
    </div>
  )
}
