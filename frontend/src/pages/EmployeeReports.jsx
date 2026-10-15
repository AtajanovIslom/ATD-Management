import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import api from '../api/axios'
import { useAuth } from '../context/AuthContext'
import { useI18n } from '../i18n'
import { statusLabel } from '../i18n/labels'
import { statusClass } from '../components/ProjectCard'
import { todayLocal } from '../utils/dates'

/**
 * "Xodim hisobotlari" / "Mening hisobotlarim".
 *
 * Hisobot qo'lda yig'ilmaydi: xodim vazifa yoki loyiha bosqichi bo'yicha
 * ishini topshirgan zahoti u shu jadvalga o'zi tushadi. Xodim xohlasa
 * qo'shimcha matnli hisobot yozadi — u ham jadvalda chiqadi.
 *
 *  - Rahbar: o'ziga bo'ysunuvchi xodimlar (barchasi yoki bittasi), davr
 *    (bugun / hafta / oy / oraliq) va PDF yoki Word yuklab olish.
 *  - Oddiy xodim: faqat o'z hisoboti; uni ham PDF/Word qilib yuklab oladi.
 *
 * Kim kimni ko'rishini backend hal qiladi (/api/employee-reports).
 */
const PERIODS = ['today', 'week', 'month', 'custom']

const readSaved = () => {
  try {
    return JSON.parse(localStorage.getItem('employee_reports_filter') || '{}')
  } catch {
    return {}
  }
}

export default function EmployeeReports() {
  const { user, isDeptAdmin } = useAuth()
  const { t, lang, formatDate, formatDateTime } = useI18n()

  const saved = useMemo(readSaved, [])
  const [period, setPeriod] = useState(PERIODS.includes(saved.period) ? saved.period : 'today')
  const [anchor, setAnchor] = useState(todayLocal())
  const [range, setRange] = useState({ from: todayLocal(), to: todayLocal() })
  const [userId, setUserId] = useState('all')
  const [divisionId, setDivisionId] = useState('')
  const [departmentId, setDepartmentId] = useState('')

  const [meta, setMeta] = useState({ is_leader: false, employees: [], divisions: [], departments: [] })
  const [report, setReport] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [downloading, setDownloading] = useState('')
  const [noteDialog, setNoteDialog] = useState(null) // { id?, work_date, content }

  const isLeader = meta.is_leader || isDeptAdmin

  useEffect(() => {
    try {
      localStorage.setItem('employee_reports_filter', JSON.stringify({ period }))
    } catch { /* xotira yopiq bo'lsa ham sahifa ishlayveradi */ }
  }, [period])

  useEffect(() => {
    api.get('/employee-reports/employees')
      .then(r => setMeta(r.data))
      .catch(() => {})
  }, [])

  const params = useMemo(() => {
    const p = new URLSearchParams({ period })
    if (period === 'custom') {
      p.set('from', range.from)
      p.set('to', range.to)
    } else {
      p.set('date', anchor)
    }
    if (isLeader) {
      p.set('user_id', userId)
      if (userId === 'all' && divisionId) p.set('division_id', divisionId)
      if (userId === 'all' && departmentId) p.set('department_id', departmentId)
    }
    return p
  }, [period, anchor, range, userId, divisionId, departmentId, isLeader])

  // Filtr tez almashtirilganda kech kelgan eski javob yangisini bosib
  // ketmasligi uchun faqat oxirgi so'rov natijasi olinadi
  const reqId = useRef(0)
  const load = useCallback(async () => {
    const my = ++reqId.current
    setLoading(true)
    setError('')
    try {
      const res = await api.get('/employee-reports?' + params.toString())
      if (my === reqId.current) setReport(res.data)
    } catch (err) {
      if (my === reqId.current) {
        setReport(null)
        setError(err.response?.data?.error || t('state.error'))
      }
    } finally {
      if (my === reqId.current) setLoading(false)
    }
  }, [params, t])

  useEffect(() => { load() }, [load])

  const download = async (format) => {
    setSaveOpen(false)
    setDownloading(format)
    try {
      const p = new URLSearchParams(params)
      p.set('format', format)
      p.set('lang', lang)
      const res = await api.get('/employee-reports/export?' + p.toString(), { responseType: 'blob' })
      const disposition = res.headers['content-disposition'] || ''
      const match = disposition.match(/filename\*?=(?:UTF-8'')?"?([^";]+)"?/i)
      const name = match ? decodeURIComponent(match[1]) : `xodim_hisoboti.${format}`
      const url = URL.createObjectURL(res.data)
      const a = document.createElement('a')
      a.href = url
      a.download = name
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch (err) {
      // Xato javob ham blob bo'lib keladi — ichidagi JSON xabarni o'qiymiz
      let msg = t('er.downloadError')
      try {
        const text = await err.response?.data?.text?.()
        msg = JSON.parse(text).error || msg
      } catch { /* matn JSON emas */ }
      alert(msg)
    } finally {
      setDownloading('')
    }
  }

  const saveNote = async ({ id, work_date, content }) => {
    if (id) await api.put(`/work-logs/${id}`, { work_date, content })
    else await api.post('/work-logs', { work_date, content })
    setNoteDialog(null)
    load()
  }

  const deleteNote = async (noteId) => {
    if (!window.confirm(t('er.note.deleteConfirm'))) return
    try {
      await api.delete(`/work-logs/${noteId}`)
      load()
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
    }
  }

  const employees = report?.employees || []
  const withItems = employees.filter(e => e.items.length > 0)
  const withoutItems = employees.filter(e => e.items.length === 0)
  const totals = report?.totals

  const periodText = report
    ? (report.period.from === report.period.to
      ? formatDate(report.period.from)
      : `${formatDate(report.period.from)} — ${formatDate(report.period.to)}`)
    : ''

  return (
    <div>
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ margin: 0 }}>{isLeader ? `👥 ${t('er.title.leader')}` : `📓 ${t('er.title.mine')}`}</h1>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)', maxWidth: 680 }}>
            {isLeader ? t('er.subtitle.leader') : t('er.subtitle.mine')}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <button className="btn btn-outline"
            onClick={() => setNoteDialog({ work_date: todayLocal(), content: '' })}>
            ✍️ {t('er.note.add')}
          </button>
          <div style={{ position: 'relative' }}>
            <button className="btn btn-primary" disabled={!!downloading || !report}
              onClick={() => setSaveOpen(o => !o)} aria-haspopup="menu" aria-expanded={saveOpen}>
              {downloading ? t('er.downloading') : `💾 ${t('er.save')}`}
            </button>
            {saveOpen && (
              <>
                <div style={{ position: 'fixed', inset: 0, zIndex: 50 }} onClick={() => setSaveOpen(false)} />
                <div role="menu" className="card" style={{
                  position: 'absolute', right: 0, top: 'calc(100% + 6px)', zIndex: 51,
                  padding: 6, margin: 0, minWidth: 200, display: 'flex', flexDirection: 'column', gap: 4,
                }}>
                  <button role="menuitem" className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start' }}
                    onClick={() => download('pdf')}>📕 {t('er.save.pdf')}</button>
                  <button role="menuitem" className="btn btn-outline btn-sm" style={{ justifyContent: 'flex-start' }}
                    onClick={() => download('docx')}>📘 {t('er.save.docx')}</button>
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ padding: 12, marginBottom: 12 }}>
        <div className="status-tabs" style={{ marginBottom: 12 }}>
          {PERIODS.map(p => (
            <button key={p} type="button"
              className={'status-tab' + (period === p ? ' status-tab-active' : '')}
              onClick={() => setPeriod(p)}>
              {t(`er.period.${p}`)}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          {period === 'custom' ? (
            <>
              <Field label={t('er.from')}>
                <input type="date" className="form-input" value={range.from}
                  onChange={e => setRange(r => ({ ...r, from: e.target.value }))} />
              </Field>
              <Field label={t('er.to')}>
                <input type="date" className="form-input" value={range.to}
                  onChange={e => setRange(r => ({ ...r, to: e.target.value }))} />
              </Field>
            </>
          ) : (
            <Field label={t(`er.anchor.${period}`)}>
              <input type="date" className="form-input" value={anchor}
                onChange={e => setAnchor(e.target.value || todayLocal())} />
            </Field>
          )}

          {isLeader && (
            <Field label={t('er.employee')}>
              <select className="form-input" value={userId} onChange={e => setUserId(e.target.value)}
                style={{ minWidth: 220 }}>
                <option value="all">{t('er.allEmployees')}</option>
                {meta.employees.map(e => (
                  <option key={e.id} value={String(e.id)}>
                    {e.full_name}{e.id === user.id ? ` (${t('er.you')})` : ''}
                  </option>
                ))}
              </select>
            </Field>
          )}

          {isLeader && userId === 'all' && meta.can_filter_department && meta.departments.length > 0 && (
            <Field label={t('er.department')}>
              <select className="form-input" value={departmentId}
                onChange={e => { setDepartmentId(e.target.value); setDivisionId('') }}>
                <option value="">{t('er.all')}</option>
                {meta.departments.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}

          {isLeader && userId === 'all' && meta.divisions.length > 1 && (
            <Field label={t('er.division')}>
              <select className="form-input" value={divisionId} onChange={e => setDivisionId(e.target.value)}>
                <option value="">{t('er.all')}</option>
                {meta.divisions.map(d => <option key={d.id} value={d.id}>{d.name}</option>)}
              </select>
            </Field>
          )}
        </div>
      </div>

      {totals && !loading && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 12, fontSize: 12, color: 'var(--text-muted)' }}>
          <span className="badge badge-on_hold">📅 {periodText}</span>
          {isLeader && <span className="badge badge-pending">👥 {t('er.sum.employees', { n: totals.employees })}</span>}
          <span className="badge badge-completed">{t('er.sum.total', { n: totals.total })}</span>
          <span className="badge badge-active">📝 {t('er.sum.tasks', { n: totals.task })}</span>
          <span className="badge badge-review">🚀 {t('er.sum.projects', { n: totals.project })}</span>
          <span className="badge badge-pending">✍️ {t('er.sum.notes', { n: totals.note })}</span>
        </div>
      )}

      {loading ? (
        <div className="card" style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>{t('state.loading')}</div>
      ) : error ? (
        <div className="alert alert-error">{error}</div>
      ) : withItems.length === 0 ? (
        <div className="card" style={{ padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
          {isLeader ? t('er.empty.leader') : t('er.empty.mine')}
        </div>
      ) : (
        withItems.map(e => (
          <EmployeeCard key={e.id} employee={e} showHeader={isLeader} currentUserId={user.id}
            t={t} formatDate={formatDate} formatDateTime={formatDateTime}
            onEditNote={(it) => setNoteDialog({ id: it.ref_id, work_date: it.work_date, content: it.content })}
            onDeleteNote={(it) => deleteNote(it.ref_id)} />
        ))
      )}

      {!loading && !error && isLeader && withoutItems.length > 0 && (
        <div className="card" style={{ padding: 14 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>
            ⚠️ {t('er.noReports', { n: withoutItems.length })}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {withoutItems.map(e => (
              <span key={e.id} className="member-mini-chip">
                {e.full_name}{e.division_name ? ` · ${e.division_name}` : ''}
              </span>
            ))}
          </div>
        </div>
      )}

      {noteDialog && (
        <NoteDialog initial={noteDialog} t={t} onClose={() => setNoteDialog(null)} onSave={saveNote} />
      )}
    </div>
  )
}


function Field({ label, children }) {
  return (
    <div>
      <label style={{ fontSize: 11, color: 'var(--text-muted)', display: 'block', marginBottom: 4 }}>{label}</label>
      {children}
    </div>
  )
}


const KIND_ICON = { task: '📝', project: '🚀', note: '✍️' }

function EmployeeCard({ employee: e, showHeader, currentUserId, t, formatDate, formatDateTime, onEditNote, onDeleteNote }) {
  const dt = (iso) => formatDateTime(iso, { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
  const unit = e.division_name || e.department_name

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      {showHeader && (
        <div style={{
          padding: '12px 16px', borderBottom: '1px solid var(--border)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        }}>
          <div>
            <strong style={{ fontSize: 14 }}>{e.full_name}</strong>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
              {[e.position, unit].filter(Boolean).join(' · ')}
            </div>
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {t('er.card.summary', { total: e.totals.total, task: e.totals.task, project: e.totals.project, note: e.totals.note })}
          </div>
        </div>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th style={{ width: 36 }}>№</th>
              <th style={{ width: 120 }}>{t('er.th.kind')}</th>
              <th style={{ minWidth: 200 }}>{t('er.th.title')}</th>
              <th style={{ width: 140 }}>{t('er.th.time')}</th>
              <th style={{ width: 140 }}>{t('er.th.status')}</th>
              <th style={{ minWidth: 240 }}>{t('er.th.content')}</th>
            </tr>
          </thead>
          <tbody>
            {e.items.map((it, i) => (
              <tr key={it.id}>
                <td style={{ verticalAlign: 'top', color: 'var(--text-muted)' }}>{i + 1}</td>
                <td style={{ verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                  {KIND_ICON[it.kind]} {t(`er.kind.${it.kind}`)}
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  {it.kind === 'task' && <Link to={`/tasks/${it.ref_id}`}>{it.title}</Link>}
                  {it.kind === 'project' && <Link to={`/projects/${it.ref_id}`}>{it.title}</Link>}
                  {it.kind === 'note' && <span style={{ color: 'var(--text-muted)' }}>—</span>}
                  {it.files > 0 && (
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>📎 {t('er.files', { n: it.files })}</div>
                  )}
                </td>
                <td style={{ verticalAlign: 'top', fontSize: 12, whiteSpace: 'nowrap' }}>
                  {it.kind === 'note' ? formatDate(it.work_date) : dt(it.at)}
                </td>
                <td style={{ verticalAlign: 'top' }}>
                  {it.kind === 'note' ? (
                    <span style={{ color: 'var(--text-muted)' }}>—</span>
                  ) : (
                    <>
                      <span className={`badge ${statusClass(it.status)}`}>{statusLabel(t, it.status)}</span>
                      {it.approved_at && (
                        <div style={{ fontSize: 11, color: 'var(--text-muted)', marginTop: 4 }}>{dt(it.approved_at)}</div>
                      )}
                    </>
                  )}
                </td>
                <td style={{ verticalAlign: 'top', fontSize: 13, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                  {it.content}
                  {it.kind === 'note' && e.id === currentUserId && (
                    <div style={{ display: 'flex', gap: 4, marginTop: 6 }}>
                      <button className="btn btn-outline btn-sm" onClick={() => onEditNote(it)}>✏️ {t('btn.edit')}</button>
                      <button className="btn btn-danger btn-sm" onClick={() => onDeleteNote(it)}>🗑️</button>
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}


function NoteDialog({ initial, t, onClose, onSave }) {
  const [workDate, setWorkDate] = useState(initial.work_date || todayLocal())
  const [content, setContent] = useState(initial.content || '')
  const [busy, setBusy] = useState(false)

  const submit = async (e) => {
    e.preventDefault()
    if (!content.trim() || busy) return
    setBusy(true)
    try {
      await onSave({ id: initial.id, work_date: workDate, content: content.trim() })
    } catch (err) {
      alert(err.response?.data?.error || t('state.error'))
      setBusy(false)
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" style={{ maxWidth: 560 }} onClick={e => e.stopPropagation()}>
        <h2 style={{ marginBottom: 4 }}>✍️ {initial.id ? t('er.note.edit') : t('er.note.add')}</h2>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 12 }}>{t('er.note.hint')}</p>
        <form onSubmit={submit}>
          <div className="form-group">
            <label>{t('er.note.date')}</label>
            <input type="date" className="form-input" style={{ maxWidth: 200 }}
              value={workDate} onChange={e => setWorkDate(e.target.value)} required />
          </div>
          <div className="form-group">
            <label>{t('er.note.text')}</label>
            <textarea className="form-input" rows={6} value={content} autoFocus
              onChange={e => setContent(e.target.value)} placeholder={t('er.note.placeholder')} />
          </div>
          <div className="modal-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>{t('btn.cancel')}</button>
            <button type="submit" className="btn btn-primary" disabled={!content.trim() || busy}>
              {busy ? t('btn.saving') : t('btn.save')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
