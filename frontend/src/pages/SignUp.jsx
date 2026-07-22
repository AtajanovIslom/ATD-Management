import { useState } from 'react'
import { useNavigate, Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

export default function SignUp() {
  const navigate = useNavigate()
  const { setSession } = useAuth()
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
      setError('Loginda probel bo\'lmasligi kerak')
      return
    }
    if (form.password.length < 4) {
      setError('Parol kamida 4 ta belgidan iborat bo\'lishi kerak')
      return
    }
    if (form.password.includes(' ')) {
      setError('Parolda probel bo\'lmasligi kerak')
      return
    }
    if (form.password !== form.confirmPassword) {
      setError('Parollar mos kelmadi')
      return
    }

    setLoading(true)
    try {
      const { confirmPassword, ...payload } = form
      const res = await api.post('/auth/signup', payload)
      setSession(res.data.token, res.data.user)
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
        <p>Yangi xodim ro'yxatdan o'tishi</p>
        {error && <div className="alert alert-error">{error}</div>}
        <form onSubmit={handleSubmit}>
          <div className="form-group">
            <label>Ism sharifi *</label>
            <input className="form-input" value={form.full_name}
              onChange={set('full_name')} placeholder="F.I.Sh." required />
          </div>
          <div className="form-group">
            <label>Lavozim</label>
            <input className="form-input" value={form.position}
              onChange={set('position')} placeholder="Lavozimingiz" />
          </div>
          <div className="form-group">
            <label>Tabel raqami *</label>
            <input className="form-input" value={form.tab_number}
              onChange={set('tab_number')} placeholder="Tabel raqamingiz" required />
          </div>
          <div className="form-group">
            <label>Login *</label>
            <input className="form-input" value={form.login}
              onChange={set('login')} placeholder="Loginingizni tanlang" required />
          </div>
          <div className="form-group">
            <label>Parol * (kamida 4 belgi, probelsiz)</label>
            <input className="form-input" type="text" value={form.password}
              onChange={set('password')} placeholder="Parolingizni tanlang" required />
          </div>
          <div className="form-group">
            <label>Parolni tasdiqlang *</label>
            <input className="form-input" type="text" value={form.confirmPassword}
              onChange={set('confirmPassword')} placeholder="Parolni qayta kiriting" required />
          </div>
          <button className="btn btn-primary btn-full" type="submit" disabled={loading}>
            {loading ? 'Saqlanmoqda...' : 'Ro\'yxatdan o\'tish'}
          </button>
        </form>
        <p style={{ marginTop: 16, textAlign: 'center' }}>
          Akkauntingiz bormi? <Link to="/login">Kirish</Link>
        </p>
      </div>
    </div>
  )
}
