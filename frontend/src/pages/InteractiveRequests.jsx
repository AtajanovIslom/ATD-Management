import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'

/**
 * Interaktiv arizalar boshqaruv sahifasi.
 *
 * Ariza oqimi:
 *   new → in_progress → pending_review → completed
 *                  ↑          │
 *                  └── return ┘
 *   * → rejected  (istalgan paytda)
 */

const STATUS = {
  new:            { label: 'Yangi',                color: '#3b82f6', bg: 'rgba(59,130,246,0.15)',  icon: '🆕' },
  in_progress:    { label: 'Ishlash jarayonida',   color: '#f59e0b', bg: 'rgba(245,158,11,0.15)',  icon: '⚙️' },
  pending_review: { label: 'Tasdiqlash kutilmoqda', color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', icon: '⏳' },
  completed:      { label: 'Yakunlandi',           color: '#10b981', bg: 'rgba(16,185,129,0.15)',  icon: '✅' },
  rejected:       { label: 'Rad etildi',           color: '#ef4444', bg: 'rgba(239,68,68,0.15)',   icon: '❌' },
}

export default function InteractiveRequests() {
  const { user, isAnyAdmin } = useAuth()

  const [items, setItems] = useState([])
  const [summary, setSummary] = useState({ total: 0, by_status: {} })
  const [loading, setLoading] = useState(true)
  const [filter, setFilter] = useState('')
  const [selected, setSelected] = useState(null)
  const [workers, setWorkers] = useState([])

  const [modal, setModal] = useState(null) // { type, req }
  const [modalData, setModalData] = useState({})
  const [busy, setBusy] = useState(false)

  const [walkinOpen, setWalkinOpen] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const params = filter ? `?status=${filter}` : ''
      const [rRes, sRes] = await Promise.all([
        api.get('/interactive-requests' + params),
        api.get('/interactive-requests/stats/summary'),
      ])
      setItems(rRes.data)
      setSummary(sRes.data)
    } finally {
      setLoading(false)
    }
  }, [filter])

  useEffect(() => { load() }, [load])

  useEffect(() => {
    if (isAnyAdmin) api.get('/users/workers').then(r => setWorkers(r.data)).catch(() => {})
  }, [isAnyAdmin])

  const openReq = async (r) => {
    try {
      const res = await api.get(`/interactive-requests/${r.id}`)
      setSelected(res.data)
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  const submitModal = async () => {
    if (!modal) return
    setBusy(true)
    try {
      const { type, req } = modal
      if (type === 'assign') {
        if (!modalData.user_id) { alert('Xodim tanlang'); setBusy(false); return }
        await api.post(`/interactive-requests/${req.id}/assign`, { user_id: modalData.user_id })
      } else if (type === 'submit_review') {
        await api.post(`/interactive-requests/${req.id}/submit-review`, { result_note: modalData.result_note || '' })
      } else if (type === 'return') {
        if (!modalData.return_reason?.trim()) { alert("Sabab kiritilishi shart"); setBusy(false); return }
        await api.post(`/interactive-requests/${req.id}/return`, { return_reason: modalData.return_reason })
      } else if (type === 'reject') {
        if (!modalData.reject_reason?.trim()) { alert("Sabab kiritilishi shart"); setBusy(false); return }
        await api.post(`/interactive-requests/${req.id}/reject`, { reject_reason: modalData.reject_reason })
      } else if (type === 'approve') {
        await api.post(`/interactive-requests/${req.id}/approve`)
      }
      setModal(null); setModalData({})
      await load()
      if (selected?.id === req.id) openReq(selected)
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  const isMine = (r) => r.assigned_to === user?.id

  if (loading) return <div className="loading">Yuklanmoqda...</div>

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>📥 Interaktiv arizalar</h1>
        <button className="btn btn-primary" onClick={() => setWalkinOpen(true)}>
          + Ariza yaratish
        </button>
      </div>

      {/* Statistika kartalari */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <StatCard label="Jami" value={summary.total} color="#6366f1"
          onClick={() => setFilter('')} active={!filter} />
        {Object.entries(STATUS).map(([k, s]) => (
          <StatCard key={k}
            label={s.label} value={summary.by_status[k] || 0} color={s.color}
            onClick={() => setFilter(filter === k ? '' : k)} active={filter === k}
          />
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: selected ? '1fr 1fr' : '1fr', gap: 12 }}>
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div className="table-wrap">
            <table>
              <thead>
                <tr>
                  <th>Sana</th>
                  <th>Tabel</th>
                  <th>Telefon</th>
                  <th>Xizmat turlari</th>
                  <th>Holat</th>
                  <th>Bajaruvchi</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                    Arizalar yo'q
                  </td></tr>
                ) : items.map(r => (
                  <tr key={r.id}
                    onClick={() => openReq(r)}
                    style={{
                      cursor: 'pointer',
                      background: selected?.id === r.id ? 'rgba(99,102,241,0.05)' : (isMine(r) ? 'rgba(16,185,129,0.03)' : undefined),
                    }}
                  >
                    <td style={{ fontSize: 12, whiteSpace: 'nowrap' }}>{fmt(r.created_at)}</td>
                    <td>
                      <strong>{r.tabel_num}</strong>
                      {r.full_name && (
                        <div style={{ fontSize: 11, fontWeight: 500, marginTop: 1 }}>{r.full_name}</div>
                      )}
                      {r.position && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>{r.position}</div>
                      )}
                      {r.source === 'walkin' && (
                        <div style={{ fontSize: 10, color: '#f59e0b', fontWeight: 600, marginTop: 2 }}>WALK-IN</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>
                      {r.phone_num}
                      {r.division && (
                        <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{r.division}</div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                        {(r.types || []).map(t => (
                          <span key={t.id} style={{
                            fontSize: 11, padding: '1px 6px', borderRadius: 3,
                            background: 'rgba(99,102,241,0.1)', color: '#6366f1',
                          }}>{t.name}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{r.department_name}</div>
                    </td>
                    <td>
                      <StatusBadge status={r.status} />
                      {(r.return_count || 0) > 0 && (
                        <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>
                          ↩ {r.return_count} marta qaytarilgan
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{r.assignee_name || '—'}</td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); openReq(r) }}>
                        Ochish
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {selected && (
          <RequestDetail
            r={selected}
            isMine={isMine(selected)}
            isAnyAdmin={isAnyAdmin}
            onClose={() => setSelected(null)}
            onAction={(type, req) => { setModal({ type, req }); setModalData({}) }}
            onApprove={(req) => submitModalWith(req, 'approve')}
          />
        )}
      </div>

      {/* Modal — assign/submit_review/return/reject */}
      {modal && (
        <ActionModal
          modal={modal}
          workers={workers}
          modalData={modalData}
          setModalData={setModalData}
          onClose={() => setModal(null)}
          onSubmit={submitModal}
          busy={busy}
        />
      )}

      {/* Walk-in yaratish modal */}
      {walkinOpen && (
        <WalkinModal
          onClose={() => setWalkinOpen(false)}
          onCreated={async () => { setWalkinOpen(false); await load() }}
        />
      )}
    </div>
  )

  async function submitModalWith(req, type) {
    setBusy(true)
    try {
      await api.post(`/interactive-requests/${req.id}/${type}`)
      await load()
      if (selected?.id === req.id) openReq(selected)
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    } finally {
      setBusy(false)
    }
  }
}


/* -------------------------- Ariza tafsilotlari -------------------------- */

function RequestDetail({ r, isMine, isAnyAdmin, onClose, onAction, onApprove }) {
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <StatusBadge status={r.status} />
          <h2 style={{ fontSize: 15, margin: '6px 0 2px' }}>
            {r.types?.map(t => t.name).join(', ') || '—'}
          </h2>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {r.department_name} · Tracking: <code>{r.tracking_id}</code>
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onClose}>✕</button>
      </div>

      <Section title="Arizachi">
        <Row label="Tabel">{r.tabel_num}</Row>
        {r.full_name && <Row label="Ism sharifi">{r.full_name}</Row>}
        {r.position && <Row label="Lavozim">{r.position}</Row>}
        {r.division && <Row label="Bo'lim">{r.division}</Row>}
        <Row label="Telefon">{r.phone_num}</Row>
        <Row label="Manba">
          {r.source === 'walkin' ? '📝 Xodim tomonidan (walk-in)' : '📱 Mobil ilova'}
        </Row>
        {r.comment && (
          <div style={{
            padding: 10, background: 'var(--bg-input, rgba(255,255,255,0.03))',
            border: '1px solid var(--border)', borderRadius: 6,
            fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4,
          }}>{r.comment}</div>
        )}
      </Section>

      <Section title="Jarayon">
        {r.assignee_name && <Row label="Bajaruvchi">{r.assignee_name}</Row>}
        {r.assigner_name && <Row label="Biriktirdi">{r.assigner_name}</Row>}
        {r.reviewer_name && <Row label="Tasdiqladi/Ko'rdi">{r.reviewer_name}</Row>}
        {r.assigned_at && <Row label="Biriktirilgan">{fmt(r.assigned_at)}</Row>}
        {r.submitted_review_at && <Row label="Bajarildi deb yuborilgan">{fmt(r.submitted_review_at)}</Row>}
        {r.completed_at && <Row label="Yakunlangan">{fmt(r.completed_at)}</Row>}
        {(r.return_count || 0) > 0 && (
          <Row label="Qaytarilgan">
            <span style={{ color: '#ef4444', fontWeight: 600 }}>{r.return_count} marta</span>
          </Row>
        )}
        {r.result_note && (
          <div style={{
            padding: 10, background: 'rgba(16,185,129,0.08)',
            border: '1px solid #10b981', borderRadius: 6,
            fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4,
          }}><strong>✅ Xodim natijasi:</strong> {r.result_note}</div>
        )}
        {r.reject_reason && (
          <div style={{
            padding: 10, background: 'rgba(239,68,68,0.08)',
            border: '1px solid #ef4444', borderRadius: 6,
            fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4,
          }}><strong>❌ Rad etish sababi:</strong> {r.reject_reason}</div>
        )}
      </Section>

      {r.history?.length > 0 && (
        <Section title="Tarix">
          <div style={{ borderLeft: '2px solid var(--border)', paddingLeft: 12, marginLeft: 4 }}>
            {r.history.map((h, i) => {
              const s = STATUS[h.status]
              return (
                <div key={i} style={{ position: 'relative', paddingBottom: 10 }}>
                  <div style={{
                    position: 'absolute', left: -18, top: 3,
                    width: 10, height: 10, borderRadius: 5,
                    background: s?.color || 'var(--text-muted)',
                  }} />
                  <div style={{ fontSize: 13, fontWeight: 600, color: s?.color }}>
                    {s?.icon} {h.status_label}
                  </div>
                  {h.note && <div style={{ fontSize: 12, marginTop: 2 }}>{h.note}</div>}
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 2 }}>
                    {h.actor_name || '—'} · {fmt(h.created_at)}
                  </div>
                </div>
              )
            })}
          </div>
        </Section>
      )}

      {/* Amallar */}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', marginTop: 14 }}>
        {isAnyAdmin && r.status === 'new' && (
          <button className="btn btn-primary" onClick={() => onAction('assign', r)}>
            📌 Xodimga biriktirish
          </button>
        )}
        {isAnyAdmin && r.status === 'in_progress' && (
          <button className="btn btn-outline" onClick={() => onAction('assign', r)}>
            🔄 Boshqa xodimga
          </button>
        )}

        {(isMine || isAnyAdmin) && r.status === 'in_progress' && (
          <button className="btn btn-primary" onClick={() => onAction('submit_review', r)}>
            ✅ Bajarildi
          </button>
        )}

        {isAnyAdmin && r.status === 'pending_review' && (
          <>
            <button className="btn btn-primary" onClick={() => onApprove(r)}>
              ✔️ Tasdiqlash
            </button>
            <button className="btn btn-outline" onClick={() => onAction('return', r)}>
              ↩ Qaytarish
            </button>
          </>
        )}

        {isAnyAdmin && r.status !== 'completed' && r.status !== 'rejected' && (
          <button className="btn btn-danger" onClick={() => onAction('reject', r)}>
            ❌ Rad etish
          </button>
        )}
      </div>
    </div>
  )
}


/* -------------------------- Action modal ------------------------------- */

function ActionModal({ modal, workers, modalData, setModalData, onClose, onSubmit, busy }) {
  const titles = {
    assign: '📌 Xodimga biriktirish',
    submit_review: '✅ Ariza bajarildi',
    return: '↩ Qaytarish',
    reject: '❌ Rad etish',
  }
  const t = modal.type

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{titles[t]}</h2>

        {t === 'assign' && (
          <div className="form-group">
            <label>Xodimni tanlang</label>
            <select className="form-input" value={modalData.user_id || ''}
              onChange={e => setModalData({ user_id: e.target.value })}>
              <option value="">— Tanlang —</option>
              {workers.map(w => (
                <option key={w.id} value={w.id}>
                  {w.full_name} {w.position ? '· ' + w.position : ''}
                </option>
              ))}
            </select>
          </div>
        )}

        {t === 'submit_review' && (
          <div className="form-group">
            <label>Natija (ixtiyoriy)</label>
            <textarea className="form-input" rows={4}
              value={modalData.result_note || ''}
              onChange={e => setModalData({ ...modalData, result_note: e.target.value })}
              placeholder="Nima qilindi..."
            />
          </div>
        )}

        {t === 'return' && (
          <div className="form-group">
            <label>Qaytarish sababi *</label>
            <textarea className="form-input" rows={4}
              value={modalData.return_reason || ''}
              onChange={e => setModalData({ ...modalData, return_reason: e.target.value })}
              placeholder="Nima chala qolgan, nima to'g'rilash kerak..."
            />
          </div>
        )}

        {t === 'reject' && (
          <div className="form-group">
            <label>Rad etish sababi *</label>
            <textarea className="form-input" rows={4}
              value={modalData.reject_reason || ''}
              onChange={e => setModalData({ ...modalData, reject_reason: e.target.value })}
              placeholder="Nima uchun rad etilyapti..."
            />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Bekor</button>
          <button
            className={t === 'reject' ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={busy}
            onClick={onSubmit}>
            {busy ? 'Saqlanmoqda...' : 'Tasdiqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* -------------------------- Walk-in yaratish --------------------------- */

function WalkinModal({ onClose, onCreated }) {
  const [depts, setDepts] = useState([])
  const [types, setTypes] = useState([])
  const [form, setForm] = useState({
    phone_num: '', tabel_num: '', department_id: '', type_ids: [], comment: '',
  })
  const [emp, setEmp] = useState({ full_name: '', position: '', division: '' })
  const [empLoading, setEmpLoading] = useState(false)
  const [empError, setEmpError] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    api.get('/public/interactive/departments')
      .then(r => setDepts(r.data))
      .catch(() => setDepts([]))
  }, [])

  useEffect(() => {
    if (!form.department_id) { setTypes([]); return }
    api.get(`/public/interactive/departments/${form.department_id}/types`)
      .then(r => setTypes(r.data))
      .catch(() => setTypes([]))
  }, [form.department_id])

  // Tabel raqami kiritilganda ISUP dan xodim ma'lumotlarini avtomatik olib kelish (debounce bilan)
  useEffect(() => {
    const tab = form.tabel_num.trim()
    if (!tab) {
      setEmp({ full_name: '', position: '', division: '' })
      setEmpError('')
      return
    }
    setEmpLoading(true)
    setEmpError('')
    let cancelled = false
    const t = setTimeout(async () => {
      try {
        const res = await api.get(`/public/interactive/employee/${encodeURIComponent(tab)}`)
        if (cancelled) return
        setEmp({
          full_name: res.data.full_name || '',
          position: res.data.position || '',
          division: res.data.division || '',
        })
        // Telefon bo'sh bo'lsa ISUP dagi telefonni avtomatik qo'yamiz
        if (res.data.phone && !form.phone_num.trim()) {
          setForm(f => ({ ...f, phone_num: '+' + res.data.phone.replace(/^\+/, '') }))
        }
      } catch (err) {
        if (cancelled) return
        setEmp({ full_name: '', position: '', division: '' })
        setEmpError(err.response?.data?.error || 'Xodim topilmadi')
      } finally {
        if (!cancelled) setEmpLoading(false)
      }
    }, 500)  // 500ms debounce
    return () => { cancelled = true; clearTimeout(t) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.tabel_num])

  const currentDept = depts.find(d => d.id === parseInt(form.department_id))
  const isMulti = currentDept?.multi_type

  const toggleType = (id) => {
    setForm(f => {
      if (isMulti) {
        return { ...f, type_ids: f.type_ids.includes(id) ? f.type_ids.filter(x => x !== id) : [...f.type_ids, id] }
      }
      return { ...f, type_ids: [id] }
    })
  }

  const submit = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.phone_num || !form.tabel_num || !form.department_id) {
      setError('Barcha majburiy maydonlarni to\'ldiring'); return
    }
    if (form.type_ids.length === 0) {
      setError('Kamida bitta xizmat turini tanlang'); return
    }
    setBusy(true)
    try {
      await api.post('/interactive-requests/walkin', {
        phone_num: form.phone_num.trim(),
        tabel_num: form.tabel_num.trim(),
        department_id: parseInt(form.department_id),
        type_ids: form.type_ids,
        comment: form.comment.trim(),
      })
      onCreated()
    } catch (err) {
      setError(err.response?.data?.error || 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h2>📝 Yangi ariza yaratish</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Og'zaki kelgan zayavkani tizimga kiritish. Yaratilgach avtomatik sizga biriktiriladi.
        </p>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>Tabel raqami *</label>
              <input className="form-input" value={form.tabel_num}
                onChange={e => setForm({ ...form, tabel_num: e.target.value.replace(/\D/g, '') })}
                placeholder="104074" required />
              {empLoading && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  ⏳ Xodim ma'lumotlari yuklanmoqda...
                </div>
              )}
              {empError && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                  ⚠ {empError}
                </div>
              )}
              {emp.full_name && !empLoading && (
                <div style={{ fontSize: 11, color: '#10b981', marginTop: 3 }}>
                  ✓ Xodim topildi
                </div>
              )}
            </div>
            <div className="form-group">
              <label>Telefon raqami *</label>
              <input className="form-input" value={form.phone_num}
                onChange={e => setForm({ ...form, phone_num: e.target.value })}
                placeholder="+998..." required />
            </div>
          </div>

          {/* ISUP dan avtomatik keladigan 3 ta maydon (o'zgartirib bo'lmaydi) */}
          <div style={{
            background: emp.full_name ? 'rgba(16,185,129,0.05)' : 'var(--bg-input, rgba(255,255,255,0.02))',
            border: `1px solid ${emp.full_name ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
            borderRadius: 8, padding: 12, marginBottom: 12,
          }}>
            <div style={{
              fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
              textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8,
            }}>
              📇 Xodim ma'lumotlari (ISUP)
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11 }}>Ism sharifi</label>
              <input className="form-input" value={emp.full_name} readOnly disabled
                placeholder="Tabel raqami kiritilgach avtomatik chiqadi" />
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11 }}>Lavozim</label>
              <input className="form-input" value={emp.position} readOnly disabled
                placeholder="—" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>Bo'lim</label>
              <input className="form-input" value={emp.division} readOnly disabled
                placeholder="—" />
            </div>
          </div>

          <div className="form-group">
            <label>Bo'lim *</label>
            <select className="form-input" value={form.department_id}
              onChange={e => setForm({ ...form, department_id: e.target.value, type_ids: [] })}>
              <option value="">— Tanlang —</option>
              {depts.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.multi_type ? '(bir nechta tanlash mumkin)' : ''}
                </option>
              ))}
            </select>
          </div>

          {form.department_id && (
            <div className="form-group">
              <label>Xizmat turi {isMulti ? '(bir yoki bir nechta)' : ''}</label>
              <div style={{
                border: '1px solid var(--border)', borderRadius: 6,
                maxHeight: 220, overflowY: 'auto', padding: 4,
              }}>
                {types.length === 0 ? (
                  <p style={{ padding: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    Bu bo'limda tur yo'q
                  </p>
                ) : types.map(t => (
                  <label key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', cursor: 'pointer', borderRadius: 4,
                    background: form.type_ids.includes(t.id) ? 'rgba(99,102,241,0.1)' : 'transparent',
                  }}>
                    <input
                      type={isMulti ? 'checkbox' : 'radio'} name="type"
                      checked={form.type_ids.includes(t.id)}
                      onChange={() => toggleType(t.id)}
                    />
                    <span style={{ fontSize: 13 }}>{t.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>Izoh</label>
            <textarea className="form-input" rows={3}
              value={form.comment}
              onChange={e => setForm({ ...form, comment: e.target.value })}
              placeholder="Muammo tafsilotlari..."
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>Bekor</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? 'Yaratilyapti...' : 'Ariza yaratish'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


/* -------------------------- Kichik komponentlar ------------------------ */

function StatCard({ label, value, color, onClick, active }) {
  return (
    <div className="card" onClick={onClick}
      style={{
        cursor: 'pointer', borderLeft: `3px solid ${color}`,
        padding: '10px 14px',
        background: active ? `${color}10` : undefined,
      }}>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </div>
      <div style={{ fontSize: 22, fontWeight: 700, color, marginTop: 2 }}>{value}</div>
    </div>
  )
}

function StatusBadge({ status }) {
  const s = STATUS[status]
  if (!s) return <span>{status}</span>
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600,
      padding: '3px 8px', borderRadius: 4,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>
      {s.icon} {s.label}
    </span>
  )
}

function Section({ title, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{
        fontSize: 11, fontWeight: 700, color: 'var(--text-muted)',
        textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6,
      }}>{title}</div>
      {children}
    </div>
  )
}

function Row({ label, children }) {
  return (
    <div style={{ display: 'flex', gap: 8, fontSize: 13, padding: '2px 0' }}>
      <span style={{ minWidth: 130, color: 'var(--text-muted)' }}>{label}:</span>
      <span style={{ flex: 1 }}>{children}</span>
    </div>
  )
}

function fmt(iso) {
  if (!iso) return '—'
  return new Date(iso).toLocaleString('uz-UZ', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit',
  })
}
