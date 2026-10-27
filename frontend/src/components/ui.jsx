import { AlertTriangle, CheckCircle2, CircleDot, Clock, Info, RefreshCw } from 'lucide-react'
import { PRIORITY_ZONES } from '../utils'

export function PageHeader({ title, intro, actions }) {
  return (
    <header className="page-header">
      <div>
        <h1>{title}</h1>
        {intro && <p className="page-intro">{intro}</p>}
      </div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  )
}

export function Loading({ label = 'Loading…' }) {
  return (
    <div className="state" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <p>{label}</p>
    </div>
  )
}

export function EmptyState({ title, children, action }) {
  return (
    <div className="state state-empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  )
}

export function ErrorState({ error, onRetry }) {
  return (
    <div className="state state-error" role="alert">
      <AlertTriangle aria-hidden="true" size={28} />
      <h2>We could not load this page</h2>
      <p className="preline">{error?.message || 'Something went wrong.'}</p>
      {onRetry && (
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          <RefreshCw size={16} aria-hidden="true" /> Try again
        </button>
      )}
    </div>
  )
}

const ALERT_ICONS = { success: CheckCircle2, error: AlertTriangle, info: Info, warning: AlertTriangle }

export function Alert({ kind = 'info', title, children }) {
  const Icon = ALERT_ICONS[kind]
  return (
    <div className={`alert alert-${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={20} aria-hidden="true" />
      <div>
        {title && <strong>{title}</strong>}
        {children && <div className="preline">{children}</div>}
      </div>
    </div>
  )
}

const STATUS_META = {
  pending: { label: 'Pending', Icon: Clock },
  in_progress: { label: 'In progress', Icon: CircleDot },
  resolved: { label: 'Resolved', Icon: CheckCircle2 },
}

export function StatusBadge({ status }) {
  const meta = STATUS_META[status] || { label: status, Icon: Info }
  const { Icon } = meta
  return (
    <span className={`badge status-${status}`}>
      <Icon size={14} aria-hidden="true" />
      {meta.label}
    </span>
  )
}

const LEVEL_LABEL = { low: 'Low', medium: 'Medium', high: 'High', critical: 'Critical' }

export function PriorityBadge({ level }) {
  return <span className={`badge level-${level}`}>{LEVEL_LABEL[level] || level}</span>
}

/**
 * The priority ruler: one 0-100 scale, four zones, a marker at the score.
 * The same ruler is used on the form preview, complaint details and dashboard.
 */
export function PriorityMeter({ score, level, size = 'normal' }) {
  const value = Math.max(0, Math.min(100, Number(score) || 0))
  return (
    <div
      className={`meter meter-${size}`}
      role="img"
      aria-label={`Priority score ${value} out of 100, ${LEVEL_LABEL[level] || level}`}
    >
      <div className="meter-zones" aria-hidden="true">
        {PRIORITY_ZONES.map((zone) => (
          <span key={zone.level} className={`zone zone-${zone.level}`} />
        ))}
      </div>
      <span className="meter-marker" style={{ left: `${value}%` }} aria-hidden="true" />
    </div>
  )
}

export function PriorityBreakdown({ breakdown, score }) {
  return (
    <table className="breakdown">
      <caption className="sr-only">How the priority score was calculated</caption>
      <thead>
        <tr>
          <th scope="col">Factor</th>
          <th scope="col">Value</th>
          <th scope="col" className="num">
            Points
          </th>
        </tr>
      </thead>
      <tbody>
        {breakdown.map((item) => (
          <tr key={item.factor}>
            <th scope="row">
              {item.label}
              <span className="hint">{item.note}</span>
            </th>
            <td>
              {item.input_value}
              {item.defaulted && <span className="hint">not provided, default used</span>}
            </td>
            <td className="num">
              {item.points.toFixed(1)} <span className="muted">/ {item.max_points}</span>
            </td>
          </tr>
        ))}
      </tbody>
      <tfoot>
        <tr>
          <th scope="row" colSpan={2}>
            Total score
          </th>
          <td className="num">
            <strong>{Number(score).toFixed(1)}</strong> <span className="muted">/ 100</span>
          </td>
        </tr>
      </tfoot>
    </table>
  )
}
