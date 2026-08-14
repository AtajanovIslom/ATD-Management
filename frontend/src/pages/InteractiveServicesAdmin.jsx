import { useCallback, useEffect, useMemo, useState } from 'react'
import api from '../api/axios'
import { useI18n } from '../i18n'

/**
 * Interaktiv xizmatlar boshqaruvi
 *  - Bo'limlar (kategoriyalar) jadvali
 *  - Har bir bo'lim "Turlar" tugmasi orqali o'z xizmat turlari dialogini ochadi
 */
export default function InteractiveServicesAdmin() {
  const { t } = useI18n()
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
      setError(err.response?.data?.error || t('isa.loadError'))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { loadDepartments() }, [loadDepartments])

  // Bo'lim CRUD
  const openAddDept = () => setDeptDialog({ mode: 'add', name: '', multiType: false })
  const openEditDept = (d) => setDeptDialog({
    mode: 'edit', item: d, name: d.name, multiType: !!d.multi_type,
  })
  const closeDeptDialog = () => setDeptDialog(null)

  const saveDept = async () => {
    if (!deptDialog) return
    const name = deptDialog.name.trim()
    if (!name) return
    setBusy(true)
    try {
      const payload = { name, multi_type: deptDialog.multiType }
      if (deptDialog.mode === 'add') {
        await api.post('/interactive/departments', payload)
      } else {
        await api.put(`/interactive/departments/${deptDialog.item.id}`, payload)
      }
      closeDeptDialog()
      loadDepartments()
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy(false)
    }
  }

  const deleteDept = async (d) => {
    if (!window.confirm(t('isa.dept.delete.confirm', { name: d.name }))) return
    try {
      await api.delete(`/interactive/departments/${d.id}`)
      loadDepartments()
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  if (loading) return <div className="loading">{t('state.loading')}</div>

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 style={{ margin: 0 }}>🧩 {t('isa.title')}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
            {t('isa.subtitle')}
          </p>
        </div>
        <button className="btn btn-primary" onClick={openAddDept}>
          {t('isa.add')}
        </button>
      </div>

      {error && <div className="alert alert-error" style={{ marginBottom: 12 }}>{error}</div>}

      <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th style={{ width: 60 }}>№</th>
                <th>{t('field.name')}</th>
                <th style={{ width: 100, textAlign: 'center' }}>{t('isa.th.types')}</th>
                <th style={{ width: 260, textAlign: 'right' }}>{t('field.actions')}</th>
              </tr>
            </thead>
            <tbody>
              {departments.length === 0 ? (
                <tr>
                  <td colSpan={4} style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                    {t('isa.empty')}
                  </td>
                </tr>
              ) : departments.map((d, i) => (
                <tr key={d.id}>
                  <td>{i + 1}</td>
                  <td>
                    <strong>{d.name}</strong>
                    {d.multi_type && (
                      <span style={{
                        marginLeft: 8, fontSize: 11, fontWeight: 600,
                        padding: '2px 8px', borderRadius: 10, whiteSpace: 'nowrap',
                        background: 'rgba(34,197,94,0.12)', color: '#22c55e',
                      }} title={t('isa.multiBadge.title')}>
                        {t('isa.multiBadge')}
                      </span>
                    )}
                  </td>
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
                    <IconBtn icon="➕" title={t('isa.manageTypes')} tone="primary"
                      onClick={() => setTypesDialog(d)} />
                    <IconBtn icon="✏️" title={t('btn.edit')}
                      onClick={() => openEditDept(d)} />
                    <IconBtn icon="🗑️" title={t('btn.delete')} tone="danger"
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
          title={deptDialog.mode === 'add' ? t('isa.dept.add') : t('isa.dept.edit')}
          value={deptDialog.name}
          onChange={(v) => setDeptDialog({ ...deptDialog, name: v })}
          onClose={closeDeptDialog}
          onSave={saveDept}
          busy={busy}
          placeholder={t('isa.dept.placeholder')}
          switchValue={deptDialog.multiType}
          onSwitchChange={(v) => setDeptDialog({ ...deptDialog, multiType: v })}
          switchLabel={t('isa.multi.label')}
          switchHint={t('isa.multi.hint')}
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
  const { t } = useI18n()
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
  const openEdit = (item) => setInner({ mode: 'edit', item, name: item.name })
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
      alert(err.response?.data?.error || t('state.error'))
    } finally {
      setBusy(false)
    }
  }

  const del = async (item) => {
    if (!window.confirm(t('isa.type.delete.confirm', { name: item.name }))) return
    try {
      await api.delete(`/interactive/types/${item.id}`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 720 }} onClick={e => e.stopPropagation()}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 14 }}>
          <div>
            <h2 style={{ margin: 0 }}>{t('isa.types.title')}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-muted)' }}>
              {t('isa.types.department')}<strong style={{ color: 'var(--text)' }}>{department.name}</strong>
            </p>
          </div>
          <button className="btn btn-primary" onClick={openAdd}>
            {t('isa.types.add')}
          </button>
        </div>

        {loading ? (
          <div style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>{t('state.loading')}</div>
        ) : (
          <div style={{
            border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden',
          }}>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th style={{ width: 60 }}>№</th>
                    <th>{t('field.name')}</th>
                    <th style={{ width: 180, textAlign: 'right' }}>{t('field.actions')}</th>
                  </tr>
                </thead>
                <tbody>
                  {types.length === 0 ? (
                    <tr>
                      <td colSpan={3} style={{ textAlign: 'center', padding: 30, color: 'var(--text-muted)' }}>
                        {t('isa.types.empty')}
                      </td>
                    </tr>
                  ) : types.map((item, i) => (
                    <tr key={item.id}>
                      <td>{i + 1}</td>
                      <td>{item.name}</td>
                      <td style={{ textAlign: 'right' }}>
                        <IconBtn icon="✏️" title={t('btn.edit')} onClick={() => openEdit(item)} />
                        <IconBtn icon="🗑️" title={t('btn.delete')} tone="danger" onClick={() => del(item)} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div className="modal-actions" style={{ marginTop: 16 }}>
          <button className="btn btn-outline" onClick={onClose}>{t('btn.close')}</button>
        </div>

        {inner && (
          <NameDialog
            title={inner.mode === 'add' ? t('isa.type.add') : t('isa.type.edit')}
            value={inner.name}
            onChange={(v) => setInner({ ...inner, name: v })}
            onClose={closeInner}
            onSave={save}
            busy={busy}
            placeholder={t('isa.type.placeholder')}
          />
        )}
      </div>
    </div>
  )
}


/* -------------------------- Umumiy nom dialogi ---------------------------- */

function NameDialog({
  title, value, onChange, onClose, onSave, busy, placeholder,
  switchValue, onSwitchChange, switchLabel, switchHint,
}) {
  const { t } = useI18n()
  const canSave = useMemo(() => value.trim().length > 0, [value])
  const hasSwitch = typeof onSwitchChange === 'function'

  const onKey = (e) => {
    if (e.key === 'Enter' && canSave && !busy) onSave()
    if (e.key === 'Escape') onClose()
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 460 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 12 }}>{title}</h2>
        <div className="form-group">
          <label>{t('isa.field.name')}</label>
          <input
            className="form-input"
            value={value}
            onChange={e => onChange(e.target.value)}
            onKeyDown={onKey}
            placeholder={placeholder}
            autoFocus
          />
        </div>

        {hasSwitch && (
          <div className="form-group">
            <Switch
              checked={!!switchValue}
              onChange={onSwitchChange}
              label={switchLabel}
              hint={switchHint}
            />
          </div>
        )}

        <div className="modal-actions">
          <button className="btn btn-outline" onClick={onClose}>{t('btn.cancel')}</button>
          <button className="btn btn-primary" disabled={!canSave || busy} onClick={onSave}>
            {busy ? t('btn.saving') : t('btn.save')}
          </button>
        </div>
      </div>
    </div>
  )
}


/* -------------------------------- Switch --------------------------------- */

/**
 * ARIA switch — yashirin checkbox o'rniga role="switch" tugmasi.
 * Sabab: 0x0 / opacity:0 input accessibility daraxtiga tushmaydi va
 * <label> ichida bo'lgani uchun bosilganda hodisa ikki marta ishlaydi.
 * Tugma esa klaviaturadan ham ishlaydi (Space/Enter — brauzer o'zi).
 */
function Switch({ checked, onChange, label, hint }) {
  return (
    <div
      role="switch"
      aria-checked={checked}
      aria-label={label}
      tabIndex={0}
      onClick={() => onChange(!checked)}
      onKeyDown={e => {
        if (e.key === ' ' || e.key === 'Enter') {
          e.preventDefault()
          onChange(!checked)
        }
      }}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        cursor: 'pointer', userSelect: 'none',
      }}
    >
      <span style={{
        flexShrink: 0, marginTop: 1,
        width: 40, height: 22, borderRadius: 11,
        background: checked ? 'var(--accent, #6366f1)' : 'var(--border, #475569)',
        position: 'relative',
        transition: 'background 0.2s',
      }}>
        <span style={{
          position: 'absolute', top: 3, left: checked ? 21 : 3,
          width: 16, height: 16, borderRadius: '50%',
          background: '#fff',
          transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.3)',
        }} />
      </span>
      <span style={{ minWidth: 0 }}>
        <span style={{ fontSize: 13, fontWeight: 500 }}>{label}</span>
        {hint && (
          <span style={{
            display: 'block', fontSize: 11, color: 'var(--text-muted)', marginTop: 2,
          }}>{hint}</span>
        )}
      </span>
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
