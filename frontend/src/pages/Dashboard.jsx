import { Link } from 'react-router-dom'
import { CheckCircle2, CircleDot, Clock, FilePlus2, Inbox } from 'lucide-react'
import { getDashboard } from '../api'
import { useAsync } from '../hooks'
import { useOptions } from '../components/OptionsContext'
import { EmptyState, ErrorState, Loading, PageHeader, PriorityBadge, StatusBadge } from '../components/ui'
import { formatDate, labelFor, percent } from '../utils'

const LEVELS = ['critical', 'high', 'medium', 'low']

function StatCard({ label, value, Icon, tone }) {
  return (
    <div className={`stat stat-${tone}`}>
      <Icon size={22} aria-hidden="true" />
      <div>
        <div className="stat-value">{value}</div>
        <div className="stat-label">{label}</div>
      </div>
    </div>
  )
}

export default function Dashboard() {
  const options = useOptions()
  const { data, error, loading, reload } = useAsync(getDashboard)

  const submit = (
    <Link className="btn btn-primary" to="/submit">
      <FilePlus2 size={18} aria-hidden="true" /> Submit a complaint
    </Link>
  )

  if (loading && !data) return <Loading label="Loading dashboard…" />
  if (error) return <ErrorState error={error} onRetry={reload} />

  const { total, priority_distribution: byLevel, category_distribution: byCategory, recent } = data
  const categories = Object.entries(byCategory).sort((a, b) => b[1] - a[1])
  const topCategory = categories[0]?.[1] || 0

  return (
    <>
      <PageHeader
        title="Dashboard"
        intro="Where complaints stand right now, and which ones need attention first."
        actions={submit}
      />

      {total === 0 ? (
        <EmptyState title="No complaints yet" action={submit}>
          Complaints you submit appear here with their priority and status.
        </EmptyState>
      ) : (
        <>
          <section className="stat-grid" aria-label="Complaint totals">
            <StatCard label="Total complaints" value={total} Icon={Inbox} tone="total" />
            <StatCard label="Pending" value={data.pending} Icon={Clock} tone="pending" />
            <StatCard label="In progress" value={data.in_progress} Icon={CircleDot} tone="progress" />
            <StatCard label="Resolved" value={data.resolved} Icon={CheckCircle2} tone="resolved" />
          </section>

          <div className="grid-2">
            <section className="panel" aria-labelledby="dist-title">
              <h2 id="dist-title">Priority distribution</h2>
              <div className="stack-bar" role="img" aria-label={LEVELS.map((l) => `${byLevel[l]} ${l}`).join(', ')}>
                {LEVELS.filter((l) => byLevel[l] > 0).map((level) => (
                  <span key={level} className={`zone zone-${level}`} style={{ flexGrow: byLevel[level] }} />
                ))}
              </div>
              <ul className="legend">
                {LEVELS.map((level) => (
                  <li key={level}>
                    <span className={`swatch zone-${level}`} aria-hidden="true" />
                    <span className="legend-name">{labelFor(options.priority_levels, level)}</span>
                    <span className="legend-count">{byLevel[level]}</span>
                    <span className="muted">{percent(byLevel[level], total)}%</span>
                  </li>
                ))}
              </ul>
            </section>

            <section className="panel" aria-labelledby="cat-title">
              <h2 id="cat-title">Complaints by category</h2>
              <ul className="bars">
                {categories.map(([category, count]) => (
                  <li key={category}>
                    <span className="bars-label">{labelFor(options.categories, category)}</span>
                    <span className="bars-track" aria-hidden="true">
                      <span style={{ width: `${(100 * count) / topCategory}%` }} />
                    </span>
                    <span className="bars-count">{count}</span>
                  </li>
                ))}
              </ul>
            </section>
          </div>

          <section className="panel" aria-labelledby="recent-title">
            <div className="panel-head">
              <h2 id="recent-title">Recent complaints</h2>
              <Link to="/complaints">View all complaints</Link>
            </div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th scope="col">ID</th>
                    <th scope="col">Complaint</th>
                    <th scope="col">Priority</th>
                    <th scope="col">Status</th>
                    <th scope="col">Submitted</th>
                  </tr>
                </thead>
                <tbody>
                  {recent.map((c) => (
                    <tr key={c.id}>
                      <td className="mono">{c.reference}</td>
                      <td>
                        <Link to={`/complaints/${c.id}`} className="row-link">
                          {c.title}
                        </Link>
                        <span className="hint">{c.location}</span>
                      </td>
                      <td>
                        <span className="score">{c.priority_score.toFixed(1)}</span>{' '}
                        <PriorityBadge level={c.priority_level} />
                      </td>
                      <td>
                        <StatusBadge status={c.status} />
                      </td>
                      <td>{formatDate(c.created_at)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </>
  )
}
