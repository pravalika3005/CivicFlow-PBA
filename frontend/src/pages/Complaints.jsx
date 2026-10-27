import { useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, FilePlus2, Search } from 'lucide-react'
import { listComplaints } from '../api'
import { useAsync, useDebounced } from '../hooks'
import { useOptions } from '../components/OptionsContext'
import { EmptyState, ErrorState, Loading, PageHeader, PriorityBadge, StatusBadge } from '../components/ui'
import { formatDate, labelFor } from '../utils'

const PAGE_SIZE = 15

function Select({ id, label, value, onChange, items, allLabel }) {
  return (
    <div className="filter">
      <label htmlFor={id}>{label}</label>
      <select id={id} value={value} onChange={onChange}>
        <option value="">{allLabel}</option>
        {items.map((item) => (
          <option key={item.value} value={item.value}>
            {item.label}
          </option>
        ))}
      </select>
    </div>
  )
}

export default function Complaints() {
  const options = useOptions()
  const [search, setSearch] = useState('')
  const [status, setStatus] = useState('')
  const [level, setLevel] = useState('')
  const [category, setCategory] = useState('')
  const [sort, setSort] = useState('newest')
  const [page, setPage] = useState(0)
  const term = useDebounced(search)

  const { data, error, loading, reload } = useAsync(
    () =>
      listComplaints({
        search: term.trim(),
        status,
        priority_level: level,
        category,
        sort,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
    [term, status, level, category, sort, page],
  )

  const filtering = Boolean(term.trim() || status || level || category)
  const changing = (setter) => (event) => {
    setter(event.target.value)
    setPage(0)
  }
  const clear = () => {
    setSearch('')
    setStatus('')
    setLevel('')
    setCategory('')
    setPage(0)
  }

  const total = data?.total ?? 0
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE))

  return (
    <>
      <PageHeader
        title="Complaints"
        intro="Search, filter and open any complaint to update its status."
        actions={
          <Link className="btn btn-primary" to="/submit">
            <FilePlus2 size={18} aria-hidden="true" /> Submit a complaint
          </Link>
        }
      />

      <section className="panel toolbar" aria-label="Search and filters">
        <div className="filter filter-search">
          <label htmlFor="search">Search</label>
          <div className="search-box">
            <Search size={18} aria-hidden="true" />
            <input
              id="search"
              type="search"
              placeholder="Title, description, location or ID such as CF-0004"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(0)
              }}
            />
          </div>
        </div>
        <Select id="f-status" label="Status" value={status} onChange={changing(setStatus)} items={options.statuses} allLabel="All statuses" />
        <Select id="f-level" label="Priority" value={level} onChange={changing(setLevel)} items={options.priority_levels} allLabel="All priorities" />
        <Select id="f-category" label="Category" value={category} onChange={changing(setCategory)} items={options.categories} allLabel="All categories" />
        <div className="filter">
          <label htmlFor="f-sort">Sort by</label>
          <select id="f-sort" value={sort} onChange={changing(setSort)}>
            <option value="newest">Newest first</option>
            <option value="priority">Highest priority first</option>
          </select>
        </div>
      </section>

      {loading && !data ? (
        <Loading label="Loading complaints…" />
      ) : error ? (
        <ErrorState error={error} onRetry={reload} />
      ) : total === 0 ? (
        filtering ? (
          <EmptyState
            title="No complaints match these filters"
            action={
              <button type="button" className="btn btn-secondary" onClick={clear}>
                Clear filters
              </button>
            }
          >
            Try a different search term or remove a filter.
          </EmptyState>
        ) : (
          <EmptyState
            title="No complaints yet"
            action={
              <Link className="btn btn-primary" to="/submit">
                Submit the first complaint
              </Link>
            }
          >
            Submitted complaints are listed here.
          </EmptyState>
        )
      ) : (
        <section className={`panel table-panel ${loading ? 'is-refreshing' : ''}`} aria-busy={loading}>
          <div className="table-wrap">
            <table className="data-table">
              <caption className="sr-only">Complaints</caption>
              <thead>
                <tr>
                  <th scope="col">ID</th>
                  <th scope="col">Title</th>
                  <th scope="col">Category</th>
                  <th scope="col">Location</th>
                  <th scope="col" className="num">
                    Score
                  </th>
                  <th scope="col">Priority</th>
                  <th scope="col">Created</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((c) => (
                  <tr key={c.id}>
                    <td className="mono">{c.reference}</td>
                    <td>
                      <Link to={`/complaints/${c.id}`} className="row-link">
                        {c.title}
                      </Link>
                    </td>
                    <td>{labelFor(options.categories, c.category)}</td>
                    <td>{c.location}</td>
                    <td className="num">
                      <span className="score">{c.priority_score.toFixed(1)}</span>
                    </td>
                    <td>
                      <PriorityBadge level={c.priority_level} />
                    </td>
                    <td>{formatDate(c.created_at)}</td>
                    <td>
                      <StatusBadge status={c.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <nav className="pager" aria-label="Pages">
            <span className="muted" aria-live="polite">
              Showing {page * PAGE_SIZE + 1}–{page * PAGE_SIZE + data.items.length} of {total}
            </span>
            <div className="button-row">
              <button type="button" className="btn btn-secondary" disabled={page === 0} onClick={() => setPage(page - 1)}>
                <ChevronLeft size={16} aria-hidden="true" /> Previous
              </button>
              <span className="muted">
                Page {page + 1} of {pages}
              </span>
              <button type="button" className="btn btn-secondary" disabled={page + 1 >= pages} onClick={() => setPage(page + 1)}>
                Next <ChevronRight size={16} aria-hidden="true" />
              </button>
            </div>
          </nav>
        </section>
      )}
    </>
  )
}
