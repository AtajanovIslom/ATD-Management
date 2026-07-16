import { useState } from 'react'
import api from '../api/axios'

export default function Reports() {
  const [filters, setFilters] = useState({
    worker_name: '', tab_number: '', status: '', date_from: '', date_to: ''
  })
  const [results, setResults] = useState([])
  const [searched, setSearched] = useState(false)
  const [loading, setLoading] = useState(false)

  const handleSearch = async () => {
    setLoading(true)
    try {
      const params = {}
      Object.entries(filters).forEach(([k, v]) => { if (v) params[k] = v })
      const res = await api.get('/tasks/report', { params })
      setResults(res.data)
      setSearched(true)
    } catch (err) {
      console.error(err)
    } finally {
      setLoading(false)
    }
  }

  const handleReset = () => {
    setFilters({ worker_name: '', tab_number: '', status: '', date_from: '', date_to: '' })
    setResults([])
    setSearched(false)
  }

  const formatDate = (iso) => {
    if (!iso) return '—'
    return new Date(iso).toLocaleDateString('uz-UZ', {
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit'
    })
  }

  const isOverdue = (deadline, status) => {
    return status !== 'bajarilgan' && new Date(deadline) < new Date()
  }

  const statusLabel = (s) => {
    if (s === 'korilmagan') return "Ko'rilmagan"
    if (s === 'jarayonda') return 'Jarayonda'
    if (s === 'bajarilgan') return 'Bajarilgan'
    return s
  }

  return (
    <div>
      <div className="page-header">
        <h1>Hisobotlar</h1>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="filter-bar">
          <div className="form-group">
            <label>Ishchi ismi</label>
            <input className="form-input" value={filters.worker_name}
              onChange={e => setFilters({ ...filters, worker_name: e.target.value })}
              placeholder="Ism bo'yicha..." />
          </div>
          <div className="form-group">
            <label>Tabel raqami</label>
            <input className="form-input" value={filters.tab_number}
              onChange={e => setFilters({ ...filters, tab_number: e.target.value })}
              placeholder="Tabel..." />
          </div>
          <div className="form-group">
            <label>Holat</label>
            <select className="form-input" value={filters.status}
              onChange={e => setFilters({ ...filters, status: e.target.value })}>
              <option value="">Barchasi</option>
              <option value="korilmagan">Ko'rilmagan</option>
              <option value="jarayonda">Jarayonda</option>
              <option value="bajarilgan">Bajarilgan</option>
            </select>
          </div>
          <div className="form-group">
            <label>Sanadan</label>
            <input type="date" className="form-input" value={filters.date_from}
              onChange={e => setFilters({ ...filters, date_from: e.target.value })} />
          </div>
          <div className="form-group">
            <label>Sanagacha</label>
            <input type="date" className="form-input" value={filters.date_to}
              onChange={e => setFilters({ ...filters, date_to: e.target.value })} />
          </div>
          <div className="form-group" style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary" onClick={handleSearch} disabled={loading}>
              {loading ? 'Qidirilmoqda...' : 'Qidirish'}
            </button>
            <button className="btn btn-outline" onClick={handleReset}>Tozalash</button>
          </div>
        </div>
      </div>

      <div className="card">
        {!searched ? (
          <div className="empty-state">
            <p>Filtr bo'yicha qidirish uchun yuqoridagi maydonlarni to'ldiring</p>
          </div>
        ) : results.length === 0 ? (
          <div className="empty-state">
            <p>Natija topilmadi</p>
          </div>
        ) : (
          <>
            <div style={{ marginBottom: 12, fontSize: 13, color: '#6b7280' }}>
              Jami: {results.length} ta natija
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>Ishchi</th>
                    <th>Bo'linma</th>
                    <th>Tabel</th>
                    <th>Vazifa</th>
                    <th>Muddat</th>
                    <th>Holat</th>
                    <th>Tafsilot</th>
                    <th>Bajarilgan vaqt</th>
                    <th>Rahbar</th>
                  </tr>
                </thead>
                <tbody>
                  {results.map((r, i) => (
                    <tr key={r.id}>
                      <td>{i + 1}</td>
                      <td>{r.assignee_name}</td>
                      <td>{r.assignee_department}</td>
                      <td>{r.assignee_tab_number}</td>
                      <td style={{ maxWidth: 250 }}>
                        {r.task_description?.length > 60
                          ? r.task_description.slice(0, 60) + '...'
                          : r.task_description}
                      </td>
                      <td className={isOverdue(r.task_deadline, r.status) ? 'overdue' : ''}>
                        {formatDate(r.task_deadline)}
                      </td>
                      <td>
                        <span className={`badge badge-${r.status}`}>{statusLabel(r.status)}</span>
                      </td>
                      <td style={{ maxWidth: 200 }}>
                        {r.completion_details || '—'}
                      </td>
                      <td>{formatDate(r.completed_at)}</td>
                      <td>{r.creator_name}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
