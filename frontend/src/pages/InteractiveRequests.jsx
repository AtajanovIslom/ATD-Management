import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'

/**
 * Interaktiv arizalar boshqaruv sahifasi.
 *
 * Ariza oqimi:
 *   new → in_progress → pending_review → completed
 *                  ↑          │
 *                  └── return ┘
 *   * → rejected  (istalgan paytda)
 */

// Matnlari `ir.status.*` kalitlaridan olinadi
const STATUS = {
  new:            { color: '#3b82f6', bg: 'rgba(59,130,246,0.15)', icon: '🆕' },
  in_progress:    { color: '#f59e0b', bg: 'rgba(245,158,11,0.15)', icon: '⚙️' },
  pending_review: { color: '#8b5cf6', bg: 'rgba(139,92,246,0.15)', icon: '⏳' },
  completed:      { color: '#10b981', bg: 'rgba(16,185,129,0.15)', icon: '✅' },
  rejected:       { color: '#ef4444', bg: 'rgba(239,68,68,0.15)',  icon: '❌' },
}

// Ariza statusi matni — tarjima topilmasa kodning o'zi ko'rsatiladi
const statusText = (t, code) => {
  const key = `ir.status.${code}`
  return t(key) === key ? code : t(key)
}

export default function InteractiveRequests() {
  const { user, isAnyAdmin, isAdmin } = useAuth()
  const { t, formatDateTime } = useI18n()
  const fmt = (iso) => formatDateTime(iso) || '—'

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
  const [editReq, setEditReq] = useState(null)

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
    // Biriktirish ierarxiyasi bo'yicha xodimlar: boshqarma rahbari -> bo'lim rahbarlariga,
    // bo'lim rahbari -> o'z xodimlariga (backend rol bo'yicha aniqlaydi)
    if (isAnyAdmin) api.get('/interactive-requests/assignable-workers').then(r => setWorkers(r.data)).catch(() => {})
  }, [isAnyAdmin])

  const openReq = async (r) => {
    try {
      const res = await api.get(`/interactive-requests/${r.id}`)
      setSelected(res.data)
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  const submitModal = async () => {
    if (!modal) return
    setBusy(true)
    try {
      const { type, req } = modal
      if (type === 'assign') {
        if (!modalData.user_id) { alert(t('ir.err.pickWorker')); setBusy(false); return }
        await api.post(`/interactive-requests/${req.id}/assign`, { user_id: modalData.user_id })
      } else if (type === 'submit_review') {
        await api.post(`/interactive-requests/${req.id}/submit-review`, { result_note: modalData.result_note || '' })
      } else if (type === 'return') {
        if (!modalData.return_reason?.trim()) { alert(t('ir.err.needReason')); setBusy(false); return }
        await api.post(`/interactive-requests/${req.id}/return`, { return_reason: modalData.return_reason })
      } else if (type === 'reject') {
        if (!modalData.reject_reason?.trim()) { alert(t('ir.err.needReason')); setBusy(false); return }
        await api.post(`/interactive-requests/${req.id}/reject`, { reject_reason: modalData.reject_reason })
      } else if (type === 'approve') {
        await api.post(`/interactive-requests/${req.id}/approve`)
      }
      setModal(null); setModalData({})
      await load()
      if (selected?.id === req.id) openReq(selected)
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy(false)
    }
  }

  const isMine = (r) => r.assigned_to === user?.id

  const handleDelete = async (req) => {
    if (!window.confirm(t('ir.delete.confirm', { id: req.id }))) return
    try {
      await api.delete(`/interactive-requests/${req.id}`)
      if (selected?.id === req.id) setSelected(null)
      await load()
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  if (loading) return <div className="loading">{t('state.loading')}</div>

  return (
    <div>
      <div className="page-header">
        <h1 style={{ margin: 0 }}>📥 {t('ir.title')}</h1>
        <button className="btn btn-primary" onClick={() => setWalkinOpen(true)}>
          {t('ir.create')}
        </button>
      </div>

      {/* Statistika kartalari */}
      <div style={{
        display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))',
        gap: 10, marginBottom: 12,
      }}>
        <StatCard label={t('ir.stat.total')} value={summary.total} color="#6366f1"
          onClick={() => setFilter('')} active={!filter} />
        {Object.entries(STATUS).map(([k, s]) => (
          <StatCard key={k}
            label={statusText(t, k)} value={summary.by_status[k] || 0} color={s.color}
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
                  <th>{t('ir.th.date')}</th>
                  <th>{t('ir.th.tab')}</th>
                  <th>{t('ir.th.phone')}</th>
                  <th>{t('ir.th.serviceTypes')}</th>
                  <th>{t('field.status')}</th>
                  <th>{t('ir.th.executor')}</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {items.length === 0 ? (
                  <tr><td colSpan={7} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                    {t('ir.empty')}
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
                        {(r.types || []).map(type => (
                          <span key={type.id} style={{
                            fontSize: 11, padding: '1px 6px', borderRadius: 3,
                            background: 'rgba(99,102,241,0.1)', color: '#6366f1',
                          }}>{type.name}</span>
                        ))}
                      </div>
                      <div style={{ fontSize: 10, color: 'var(--text-muted)', marginTop: 2 }}>{r.department_name}</div>
                    </td>
                    <td>
                      <StatusBadge status={r.status} t={t} />
                      {(r.return_count || 0) > 0 && (
                        <div style={{ fontSize: 10, color: '#ef4444', fontWeight: 600, marginTop: 2 }}>
                          {t('ir.returnedTimes', { n: r.return_count })}
                        </div>
                      )}
                    </td>
                    <td style={{ fontSize: 12 }}>{r.assignee_name || '—'}</td>
                    <td>
                      <button className="btn btn-outline btn-sm" onClick={e => { e.stopPropagation(); openReq(r) }}>
                        {t('ir.open')}
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
            isAdmin={isAdmin}
            onClose={() => setSelected(null)}
            onAction={(type, req) => { setModal({ type, req }); setModalData({}) }}
            onApprove={(req) => submitModalWith(req, 'approve')}
            onEdit={(req) => setEditReq(req)}
            onDelete={handleDelete}
            t={t}
            fmt={fmt}
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
          t={t}
        />
      )}

      {/* Walk-in yaratish modal */}
      {walkinOpen && (
        <WalkinModal
          t={t}
          onClose={() => setWalkinOpen(false)}
          onCreated={async () => { setWalkinOpen(false); await load() }}
        />
      )}

      {/* Ariza tahrirlash modal */}
      {editReq && (
        <EditModal
          t={t}
          req={editReq}
          onClose={() => setEditReq(null)}
          onSaved={async (updated) => {
            setEditReq(null)
            await load()
            if (selected?.id === updated.id) setSelected(updated)
          }}
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
      alert(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy(false)
    }
  }
}


/* -------------------------- Ariza tafsilotlari -------------------------- */

function RequestDetail({ r, isMine, isAnyAdmin, isAdmin, onClose, onAction, onApprove, onEdit, onDelete, t, fmt }) {
  const canEdit = isAnyAdmin && r.status !== 'completed' && r.status !== 'rejected'
  // Tarixdan oxirgi "uzatish" yozuvini topamiz — ariza sizga peer bo'lim
  // rahbaridan uzatilgan bo'lsa banner ko'rsatish uchun.
  const lastTransfer = (r.history || []).slice().reverse().find(h => (h.note || '').startsWith('🔄'))
  const isTransferredToMe = isMine && r.status === 'new' && !!lastTransfer
  return (
    <div className="card">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
        <div>
          <StatusBadge status={r.status} t={t} />
          <h2 style={{ fontSize: 15, margin: '6px 0 2px' }}>
            {r.types?.map(type => type.name).join(', ') || '—'}
          </h2>
          <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
            {r.department_name} · Tracking: <code>{r.tracking_id}</code>
          </div>
        </div>
        <button className="btn btn-outline btn-sm" onClick={onClose}>✕</button>
      </div>

      {isTransferredToMe && (
        <div style={{
          padding: 10, marginBottom: 12,
          background: 'rgba(59,130,246,0.08)',
          border: '1px solid #3b82f6', borderRadius: 6,
          fontSize: 13,
        }}>
          🔄 <strong>{t('ir.transferredToYou')}</strong> {lastTransfer.note}
          <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>
            {t('ir.transferredToYou.hint')}
          </div>
        </div>
      )}

      <Section title={t('ir.section.applicant')}>
        <Row label={t('ir.row.tab')}>{r.tabel_num}</Row>
        {r.full_name && <Row label={t('ir.row.fullName')}>{r.full_name}</Row>}
        {r.position && <Row label={t('ir.row.position')}>{r.position}</Row>}
        {r.division && <Row label={t('ir.row.division')}>{r.division}</Row>}
        <Row label={t('ir.row.phone')}>{r.phone_num}</Row>
        <Row label={t('ir.row.source')}>
          {r.source === 'walkin' ? t('ir.source.walkin') : t('ir.source.mobile')}
        </Row>
        {r.comment && (
          <div style={{
            padding: 10, background: 'var(--bg-input, rgba(255,255,255,0.03))',
            border: '1px solid var(--border)', borderRadius: 6,
            fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4,
          }}>{r.comment}</div>
        )}
      </Section>

      <Section title={t('ir.section.process')}>
        {r.assignee_name && <Row label={t('ir.row.executor')}>{r.assignee_name}</Row>}
        {r.assigner_name && <Row label={t('ir.row.assigner')}>{r.assigner_name}</Row>}
        {r.reviewer_name && <Row label={t('ir.row.reviewer')}>{r.reviewer_name}</Row>}
        {r.assigned_at && <Row label={t('ir.row.assignedAt')}>{fmt(r.assigned_at)}</Row>}
        {r.submitted_review_at && <Row label={t('ir.row.submittedAt')}>{fmt(r.submitted_review_at)}</Row>}
        {r.completed_at && <Row label={t('ir.row.completedAt')}>{fmt(r.completed_at)}</Row>}
        {(r.return_count || 0) > 0 && (
          <Row label={t('ir.row.returned')}>
            <span style={{ color: '#ef4444', fontWeight: 600 }}>{t('ir.returnedCount', { n: r.return_count })}</span>
          </Row>
        )}
        {r.result_note && (
          <div style={{
            padding: 10, background: 'rgba(16,185,129,0.08)',
            border: '1px solid #10b981', borderRadius: 6,
            fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4,
          }}><strong>{t('ir.resultNote')}</strong> {r.result_note}</div>
        )}
        {r.reject_reason && (
          <div style={{
            padding: 10, background: 'rgba(239,68,68,0.08)',
            border: '1px solid #ef4444', borderRadius: 6,
            fontSize: 13, whiteSpace: 'pre-wrap', marginTop: 4,
          }}><strong>{t('ir.rejectReason')}</strong> {r.reject_reason}</div>
        )}
      </Section>

      {r.history?.length > 0 && (
        <Section title={t('ir.section.history')}>
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
                    {s?.icon} {statusText(t, h.status)}
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
        {canEdit && (
          <button className="btn btn-outline" onClick={() => onEdit(r)}>
            ✏️ {t('btn.edit')}
          </button>
        )}
        {isAnyAdmin && r.status === 'new' && (
          <button className="btn btn-primary" onClick={() => onAction('assign', r)}>
            {t('ir.action.assign')}
          </button>
        )}
        {isAnyAdmin && r.status === 'in_progress' && (
          <button className="btn btn-outline" onClick={() => onAction('assign', r)}>
            {t('ir.action.reassign')}
          </button>
        )}

        {(isMine || isAnyAdmin) && r.status === 'in_progress' && (
          <button className="btn btn-primary" onClick={() => onAction('submit_review', r)}>
            {t('ir.action.done')}
          </button>
        )}

        {isAnyAdmin && r.status === 'pending_review' && (
          <>
            <button className="btn btn-primary" onClick={() => onApprove(r)}>
              {t('ir.action.approve')}
            </button>
            <button className="btn btn-outline" onClick={() => onAction('return', r)}>
              {t('ir.action.return')}
            </button>
          </>
        )}

        {isAnyAdmin && r.status !== 'completed' && r.status !== 'rejected' && (
          <button className="btn btn-danger" onClick={() => onAction('reject', r)}>
            {t('ir.action.reject')}
          </button>
        )}
        {isAdmin && (
          <button className="btn btn-danger" onClick={() => onDelete(r)}
            title={t('ir.action.delete.title')}>
            {t('ir.action.delete')}
          </button>
        )}
      </div>
    </div>
  )
}


/* -------------------------- Action modal ------------------------------- */

function ActionModal({ modal, workers, modalData, setModalData, onClose, onSubmit, busy, t }) {
  const kind = modal.type

  // O'z bo'lim xodimlari va peer bo'lim rahbarlarini ajratamiz
  const ownWorkers = workers.filter(w => w.role !== 'department_admin')
  const peerAdmins = workers.filter(w => w.role === 'department_admin')

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={e => e.stopPropagation()}>
        <h2>{t(`ir.modal.${kind}`)}</h2>

        {kind === 'assign' && (
          <div className="form-group">
            <label>{t('ir.assign.label')}</label>
            <select className="form-input" value={modalData.user_id || ''}
              onChange={e => setModalData({ user_id: e.target.value })}>
              <option value="">{t('users.select')}</option>
              {ownWorkers.length > 0 && (
                <optgroup label={t('ir.assign.ownWorkers')}>
                  {ownWorkers.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.full_name}{w.position ? ' · ' + w.position : ''}
                    </option>
                  ))}
                </optgroup>
              )}
              {peerAdmins.length > 0 && (
                <optgroup label={t('ir.assign.peerAdmins')}>
                  {peerAdmins.map(w => (
                    <option key={w.id} value={w.id}>
                      {w.full_name}{w.division_name ? ' — ' + w.division_name : ''}
                    </option>
                  ))}
                </optgroup>
              )}
            </select>
            {peerAdmins.length > 0 && (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 6 }}>
                {t('ir.assign.hint')}
              </div>
            )}
          </div>
        )}

        {kind === 'submit_review' && (
          <div className="form-group">
            <label>{t('ir.result.label')}</label>
            <textarea className="form-input" rows={4}
              value={modalData.result_note || ''}
              onChange={e => setModalData({ ...modalData, result_note: e.target.value })}
              placeholder={t('ir.result.placeholder')}
            />
          </div>
        )}

        {kind === 'return' && (
          <div className="form-group">
            <label>{t('ir.return.label')}</label>
            <textarea className="form-input" rows={4}
              value={modalData.return_reason || ''}
              onChange={e => setModalData({ ...modalData, return_reason: e.target.value })}
              placeholder={t('ir.return.placeholder')}
            />
          </div>
        )}

        {kind === 'reject' && (
          <div className="form-group">
            <label>{t('ir.reject.label')}</label>
            <textarea className="form-input" rows={4}
              value={modalData.reject_reason || ''}
              onChange={e => setModalData({ ...modalData, reject_reason: e.target.value })}
              placeholder={t('ir.reject.placeholder')}
            />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>{t('btn.cancel')}</button>
          <button
            className={kind === 'reject' ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={busy}
            onClick={onSubmit}>
            {busy ? t('btn.saving') : t('btn.confirm')}
          </button>
        </div>
      </div>
    </div>
  )
}


/* -------------------------- Walk-in yaratish --------------------------- */

function WalkinModal({ onClose, onCreated, t }) {
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
    const timer = setTimeout(async () => {
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
        setEmpError(err.response?.data?.error || t('ir.emp.notFound'))
      } finally {
        if (!cancelled) setEmpLoading(false)
      }
    }, 500)  // 500ms debounce
    return () => { cancelled = true; clearTimeout(timer) }
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
      setError(t('ir.err.requiredFields')); return
    }
    if (form.type_ids.length === 0) {
      setError(t('ir.err.pickType')); return
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
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h2>{t('ir.walkin.title')}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          {t('ir.walkin.hint')}
        </p>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>{t('ir.field.tabNumber')}</label>
              <input className="form-input" value={form.tabel_num}
                onChange={e => setForm({ ...form, tabel_num: e.target.value.replace(/\D/g, '') })}
                placeholder="104074" required />
              {empLoading && (
                <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 3 }}>
                  {t('ir.emp.loading')}
                </div>
              )}
              {empError && (
                <div style={{ fontSize: 11, color: '#ef4444', marginTop: 3 }}>
                  ⚠ {empError}
                </div>
              )}
              {emp.full_name && !empLoading && (
                <div style={{ fontSize: 11, color: '#10b981', marginTop: 3 }}>
                  {t('ir.emp.found')}
                </div>
              )}
            </div>
            <div className="form-group">
              <label>{t('ir.field.phone')}</label>
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
              {t('ir.emp.block')}
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11 }}>{t('ir.emp.fullName')}</label>
              <input className="form-input" value={emp.full_name} readOnly disabled
                placeholder={t('ir.emp.fullName.placeholder')} />
            </div>
            <div className="form-group" style={{ marginBottom: 8 }}>
              <label style={{ fontSize: 11 }}>{t('ir.emp.position')}</label>
              <input className="form-input" value={emp.position} readOnly disabled
                placeholder="—" />
            </div>
            <div className="form-group" style={{ marginBottom: 0 }}>
              <label style={{ fontSize: 11 }}>{t('ir.emp.division')}</label>
              <input className="form-input" value={emp.division} readOnly disabled
                placeholder="—" />
            </div>
          </div>

          <div className="form-group">
            <label>{t('ir.field.category')}</label>
            <select className="form-input" value={form.department_id}
              onChange={e => setForm({ ...form, department_id: e.target.value, type_ids: [] })}>
              <option value="">{t('users.select')}</option>
              {depts.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.multi_type ? t('ir.multiHint') : ''}
                </option>
              ))}
            </select>
            {depts.length === 0 && (
              <div style={{ fontSize: 11, color: '#ef4444', marginTop: 4 }}>
                {t('ir.noCategories')}
              </div>
            )}
          </div>

          {form.department_id && (
            <div className="form-group">
              <label>{t('ir.field.serviceType')} {isMulti ? t('ir.field.serviceType.multi') : ''}</label>
              <div style={{
                border: '1px solid var(--border)', borderRadius: 6,
                maxHeight: 220, overflowY: 'auto', padding: 4,
              }}>
                {types.length === 0 ? (
                  <p style={{ padding: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    {t('ir.noTypes')}
                  </p>
                ) : types.map(type => (
                  <label key={type.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', cursor: 'pointer', borderRadius: 4,
                    background: form.type_ids.includes(type.id) ? 'rgba(99,102,241,0.1)' : 'transparent',
                  }}>
                    <input
                      type={isMulti ? 'checkbox' : 'radio'} name="type"
                      checked={form.type_ids.includes(type.id)}
                      onChange={() => toggleType(type.id)}
                    />
                    <span style={{ fontSize: 13 }}>{type.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>{t('ir.field.comment')}</label>
            <textarea className="form-input" rows={3}
              value={form.comment}
              onChange={e => setForm({ ...form, comment: e.target.value })}
              placeholder={t('ir.field.comment.placeholder')}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>{t('btn.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t('ir.walkin.submitting') : t('ir.walkin.submit')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}


/* -------------------------- Ariza tahrirlash --------------------------- */

function EditModal({ req, onClose, onSaved, t }) {
  const [depts, setDepts] = useState([])
  const [types, setTypes] = useState([])
  const [form, setForm] = useState({
    phone_num: req.phone_num || '',
    tabel_num: req.tabel_num || '',
    department_id: String(req.department_id || ''),
    type_ids: (req.types || []).map(type => type.id),
    comment: req.comment || '',
  })
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
    if (!form.phone_num.trim() || !form.tabel_num.trim() || !form.department_id) {
      setError(t('ir.err.requiredFieldsShort')); return
    }
    if (form.type_ids.length === 0) {
      setError(t('ir.err.pickType')); return
    }
    setBusy(true)
    try {
      const res = await api.put(`/interactive-requests/${req.id}`, {
        phone_num: form.phone_num.trim(),
        tabel_num: form.tabel_num.trim(),
        department_id: parseInt(form.department_id),
        type_ids: form.type_ids,
        comment: form.comment.trim(),
      })
      onSaved(res.data)
    } catch (err) {
      setError(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h2>{t('ir.edit.title')}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>
          Tracking: <code>{req.tracking_id}</code>
        </p>
        {error && <div className="alert alert-error" style={{ marginBottom: 10 }}>{error}</div>}

        <form onSubmit={submit}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div className="form-group">
              <label>{t('ir.field.tabNumber')}</label>
              <input className="form-input" value={form.tabel_num}
                onChange={e => setForm({ ...form, tabel_num: e.target.value.replace(/\D/g, '') })}
                required />
            </div>
            <div className="form-group">
              <label>{t('ir.field.phone')}</label>
              <input className="form-input" value={form.phone_num}
                onChange={e => setForm({ ...form, phone_num: e.target.value })}
                required />
            </div>
          </div>

          <div className="form-group">
            <label>{t('ir.field.category')}</label>
            <select className="form-input" value={form.department_id}
              onChange={e => setForm({ ...form, department_id: e.target.value, type_ids: [] })}>
              <option value="">{t('users.select')}</option>
              {depts.map(d => (
                <option key={d.id} value={d.id}>
                  {d.name} {d.multi_type ? t('ir.multiHint') : ''}
                </option>
              ))}
            </select>
          </div>

          {form.department_id && (
            <div className="form-group">
              <label>{t('ir.field.serviceType')} {isMulti ? t('ir.field.serviceType.multi') : ''}</label>
              <div style={{
                border: '1px solid var(--border)', borderRadius: 6,
                maxHeight: 220, overflowY: 'auto', padding: 4,
              }}>
                {types.length === 0 ? (
                  <p style={{ padding: 10, textAlign: 'center', color: 'var(--text-muted)', fontSize: 12 }}>
                    {t('ir.noTypes')}
                  </p>
                ) : types.map(type => (
                  <label key={type.id} style={{
                    display: 'flex', alignItems: 'center', gap: 8,
                    padding: '6px 10px', cursor: 'pointer', borderRadius: 4,
                    background: form.type_ids.includes(type.id) ? 'rgba(99,102,241,0.1)' : 'transparent',
                  }}>
                    <input
                      type={isMulti ? 'checkbox' : 'radio'} name="type"
                      checked={form.type_ids.includes(type.id)}
                      onChange={() => toggleType(type.id)}
                    />
                    <span style={{ fontSize: 13 }}>{type.name}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          <div className="form-group">
            <label>{t('ir.field.comment')}</label>
            <textarea className="form-input" rows={3}
              value={form.comment}
              onChange={e => setForm({ ...form, comment: e.target.value })}
              placeholder={t('ir.field.comment.placeholder')}
            />
          </div>

          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>{t('btn.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={busy}>
              {busy ? t('btn.saving') : t('btn.save')}
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

function StatusBadge({ status, t }) {
  const s = STATUS[status]
  if (!s) return <span>{status}</span>
  return (
    <span style={{
      display: 'inline-block', fontSize: 11, fontWeight: 600,
      padding: '3px 8px', borderRadius: 4,
      background: s.bg, color: s.color, whiteSpace: 'nowrap',
    }}>
      {s.icon} {statusText(t, status)}
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
