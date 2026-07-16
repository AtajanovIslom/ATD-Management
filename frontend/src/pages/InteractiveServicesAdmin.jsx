import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios'

/**
 * Interaktiv xizmatlar boshqaruvi
 *  - Bo'limlar (kategoriyalar) jadvali
 *  - Har bir bo'lim "Turlar" tugmasi orqali o'z xizmat turlari dialogini ochadi
 */
export default function InteractiveServicesAdmin() {
  const [departments, setDepartments] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [deptDialog, setDeptDialog] = useState(null) // { mode: 'add'|'edit', item?: {...}, name: string }
  const [typesDialog, setTypesDialog] = useState(null) // department obj
  const [busy, setBusy] = useState(false)

  const loadDepartments = useCallback(async () => {
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/interactive/departments')
      setDepartments(res.data)
    } catch (err) {
      setError(err.response?.data?.error || "Ma'lumotlarni yuklashda xatolik")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDepartments() }, [loadDepartments])

  // Bo'lim CRUD
  const openAddDept = () => setDeptDialog({ mode: 'add', name: '' })
  const openEditDept = (d) => setDeptDialog({ mode: 'edit', item: d, name: d.name })
  const closeDeptDialog = () => setDeptDialog(null)

  const saveDept = async () => {
    if (!deptDialog) return
    const name = deptDialog.name.trim()
    if (!name) return
    setBusy(true)
    try {
      if (deptDialog.mode === 'add') {
        await api.post('/interactive/departments', { name })
      } else {
        await api.put(`/interactive/departments/${deptDialog.item.id}`, { name })
      }
      closeDeptDialog()
      loadDepartments()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  const deleteDept = async (d) => {
    if (!window.confirm(`"${d.name}" bo'limini o'chirmoqchimisiz? Barcha xizmat turlari ham o'chadi.`)) return
    try {
      await api.delete(`/interactive/departments/${d.id}`)
      loadDepartments()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  if (loading) return <div className="loading">Yuklanmoqda...</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>🧩 Interaktiv xizmatlar</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            Xizmat bo'limlari va ular ichidagi xizmat turlarini boshqarish
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddDept}>
          + Xizmat nomini qo'shish
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>№</th>
                <th>Nomi</th>
                <th style={{ width: 100, textAlign: 'center' }}>Turlar</th>
                <th style={{ width: 260, textAlign: 'right' }}>Действия</th>
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    Hali xizmat bo'limi qo'shilmagan
                  </td>
                </tr>
              ) : departments.map((d, i) => (
                <tr key={d.id}>
                  <td>{i + 1}</td>
                  <td><strong>{d.name}</strong></td>
                  <td style={{ textAlign: 'center' }}>
                    <span style={{
                      fontSize: 12, fontWeight: 600,
                      padding: '2px 8px', borderRadius: 10,
                      background: 'rgba(99,102,241,0.12)', color: '#6366f1',
                    }}>
                      {d.type_count}
                    </span>
                  </td>
                  <td style={{ textAlign: 'right' }}>
                    <IconBtn icon="➕" title="Xizmat turlarini boshqarish" tone="primary"
                      onClick={() => setTypesDialog(d)} />
                    <IconBtn icon="✏️" title="Tahrirlash"
                      onClick={() => openEditDept(d)} />
                    <IconBtn icon="🗑️" title="O'chirish" tone="danger"
                      onClick={() => deleteDept(d)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bo'lim (add/edit) dialogi */}
      {deptDialog && (
        <NameDialog
          title={deptDialog.mode === 'add' ? "Xizmat nomini qo'shish" : "Xizmat nomini tahrirlash"}
          value={deptDialog.name}
          onChange={(v) => setDeptDialog({ ...deptDialog, name: v })}
          onClose={closeDeptDialog}
          onSave={saveDept}
          busy={busy}
          placeholder="Masalan: Elektr taminoti"
        />
      )}

      {/* Xizmat turlari dialogi */}
      {typesDialog && (
        <TypesDialog
          department={typesDialog}
          onClose={() => { setTypesDialog(null); loadDepartments() }}
        />
      )}
    </div>
  )
}


/* -------------------------- Xizmat turlari dialogi ------------------------ */

function TypesDialog({ department, onClose }) {
  const [types, setTypes] = useState([])
  const [loading, setLoading] = useState(true)
  const [inner, setInner] = useState(null) // { mode: 'add'|'edit', item?, name }
  const [busy, setBusy] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.get(`/interactive/departments/${department.id}/types`)
      setTypes(res.data)
    } finally {
      setLoading(false)
    }
  }, [department.id])

  useEffect(() => { load() }, [load])

  const openAdd = () => setInner({ mode: 'add', name: '' })
  const openEdit = (t) => setInner({ mode: 'edit', item: t, name: t.name })
  const closeInner = () => setInner(null)

  const save = async () => {
    if (!inner) return
    const name = inner.name.trim()
    if (!name) return
    setBusy(true)
    try {
      if (inner.mode === 'add') {
        await api.post(`/interactive/departments/${department.id}/types`, { name })
      } else {
        await api.put(`/interactive/types/${inner.item.id}`, { name })
      }
      closeInner()
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    } finally {
      setBusy(false)
    }
  }

  const del = async (t) => {
    if (!window.confirm(`"${t.name}" xizmat turini o'chirmoqchimisiz?`)) return
    try {
      await api.delete(`/interactive/types/${t.id}`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || 'Xatolik')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>Xizmat turini qo'shish</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              Bo'lim: <strong style={{ color: 'var(--text)' }}>{department.name}</strong>
            </p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>
            + Yangi tur
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Yuklanmoqda...</div>
        ) : (
          <div style={{
            border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
          }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>№</th>
                    <th>Nomi</th>
                    <th style={{ width: 180, textAlign: 'right' }}>Действия</th>
                  </tr>
                </thead>
                <tbody>
                  {types.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                        Hali xizmat turi qo'shilmagan
                      </td>
                    </tr>
                  ) : types.map((t, i) => (
                    <tr key={t.id}>
                      <td>{i + 1}</td>
                      <td>{t.name}</td>
                      <td style={{ textAlign: 'right' }}>
                        <IconBtn icon="✏️" title="Tahrirlash" onClick={() => openEdit(t)} />
                        <IconBtn icon="🗑️" title="O'chirish" tone="danger" onClick={() => del(t)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-outline" onClick={onClose}>Yopish</button>
        </div>

        {inner && (
          <NameDialog
            title={inner.mode === 'add' ? "Xizmat turini qo'shish" : "Xizmat turini tahrirlash"}
            value={inner.name}
            onChange={(v) => setInner({ ...inner, name: v })}
            onClose={closeInner}
            onSave={save}
            busy={busy}
            placeholder="Masalan: Yorug'lik tarmog'ini ta'mirlash"
          />
        )}
      </div>
    </div>
  )
}


/* -------------------------- Umumiy nom dialogi ---------------------------- */

function NameDialog({ title, value, onChange, onClose, onSave, busy, placeholder }) {
  const canSave = useMemo(() => value.trim().length > 0, [value])

  const onKey = (e) => {
    if (e.key === 'Enter' && canSave && !busy) onSave()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 12 }}>{title}</h2>
        <div className="form-group">
          <label>Nomi *</label>
          <input
            className="form-input"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            autoFocus
          />
        </div>
        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>Bekor qilish</button>
          <button className="btn btn-primary" disabled={!canSave || busy} onClick={onSave}>
            {busy ? 'Saqlanmoqda...' : 'Saqlash'}
          </button>
        </div>
      </div>
    </div>
  )
}


/* ------------------------------ Ikon tugma ------------------------------- */

function IconBtn({ icon, title, onClick, tone }) {
  const color = tone === 'danger' ? '#ef4444' : tone === 'primary' ? '#6366f1' : 'var(--text-muted)'
  return (
    <button
      onClick={onClick}
      title={title}
      style={{
        background: 'transparent',
        border: '1px solid var(--border)',
        borderRadius: 6,
        padding: '4px 10px',
        marginLeft: 4,
        cursor: 'pointer',
        fontSize: 14,
        color,
        transition: 'all 0.15s',
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = tone === 'danger'
          ? 'rgba(239,68,68,0.1)'
          : tone === 'primary'
          ? 'rgba(99,102,241,0.1)'
          : 'rgba(255,255,255,0.05)'
      }}
      onMouseLeave={e => { e.currentTarget.style.background = 'transparent' }}
    >
      {icon}
    </button>
  )
}
