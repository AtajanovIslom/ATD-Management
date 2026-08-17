/**
 * Holat oynalari (Faol / Tugallangan / Bekor qilingan / Nofaol).
 * `tabs` — [{ value, label, count }] ko'rinishida.
 */
export default function StatusTabs({ tabs, value, onChange }) {
  return (
    <div className="status-tabs">
      {tabs.map(tab => {
        const active = tab.value === value
        return (
          <button key={tab.value} type="button"
            onClick={() => onChange(tab.value)}
            className={`status-tab ${active ? 'status-tab-active' : ''}`}>
            {tab.label}
            {tab.count != null && (
              <span className="status-tab-count">{tab.count}</span>
            )}
          </button>
        )
      })}
    </div>
  )
}
