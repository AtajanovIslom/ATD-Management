import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import { useAuth } from '../context/AuthContext'

export default function Login() {
  const [login, setLogin] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const { login: doLogin } = useAuth()
  const navigate = useNavigate()

  const handleSubmit = async (e) => {
    e.preventDefault()
    setError('')
    setLoading(true)
    try {
      await doLogin(login, password)
      navigate('/')
    } catch (err) {
      setError(err.response?.data?.error || 'Xatolik yuz berdi')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="login-container">
      <div className="login-box">
        <img src="/logo.png" alt="ATD" className="login-logo-img" />
        <h1 className="brand-title">ATD Management</h1>
        <p>Loyiha boshqaruv tizimiga kirish</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Login</label>
            <input
              className="form-input"
              type="text"
              value={login}
              onChange={e => setLogin(e.target.value)}
              placeholder="Loginni kiriting"
              required
            />
          </div>
          <div className="form-group">
            <label>Parol</label>
            <input
              className="form-input"
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="Parolni kiriting"
              required
            />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? 'Kirish...' : 'Kirish'}
          </button>
        </form>
        <p style={{ marginTop: 16, textAlign: 'center' }}>
          Akkauntingiz yo'qmi? <Link to="/signup">Ro'yxatdan o'tish</Link>
        </p>
      </div>
    </div>
  )
}
