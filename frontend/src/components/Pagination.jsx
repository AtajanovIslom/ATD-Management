/**
 * Sahifalash — ro'yxat sahifalarida (loyihalar, vazifalar) ishlatiladi.
 * Sahifalar ko'p bo'lsa joriy sahifa atrofidagi oyna ko'rsatiladi, chetlariga
 * birinchi/oxirgi sahifa qo'shiladi.
 */
export default function Pagination({ page, pages, onChange }) {
  if (!pages || pages <= 1) return null

  const window = []
  const from = Math.max(1, page - 2)
  const to = Math.min(pages, page + 2)
  for (let p = from; p <= to; p++) window.push(p)
  if (window[0] > 1) window.unshift(1)
  if (window[window.length - 1] < pages) window.push(pages)

  const btn = (p) => (
    <button key={p} className="btn btn-outline btn-sm"
      onClick={() => onChange(p)}
      style={{
        background: page === p ? 'var(--accent, #6366f1)' : undefined,
        color: page === p ? '#fff' : undefined,
        minWidth: 32,
      }}>{p}</button>
  )

  return (
    <div style={{ display: 'flex', justifyContent: 'center', gap: 4, marginTop: 12, flexWrap: 'wrap' }}>
      <button className="btn btn-outline btn-sm" disabled={page <= 1}
        onClick={() => onChange(page - 1)}>‹</button>
      {window.map(btn)}
      <button className="btn btn-outline btn-sm" disabled={page >= pages}
        onClick={() => onChange(page + 1)}>›</button>
    </div>
  )
}
