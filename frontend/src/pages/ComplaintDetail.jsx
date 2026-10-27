import { useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { ArrowLeft, Film, MapPin } from 'lucide-react'
import { attachmentUrl, getComplaint, updateStatus } from '../api'
import { useAsync } from '../hooks'
import { useOptions } from '../components/OptionsContext'
import {
  Alert,
  EmptyState,
  ErrorState,
  Loading,
  PriorityBadge,
  PriorityBreakdown,
  PriorityMeter,
  StatusBadge,
} from '../components/ui'
import { VideoStatusBadge } from '../components/VideoResult'
import { formatBytes, formatDate, labelFor } from '../utils'

function StatusPanel({ complaint, onChanged }) {
  const options = useOptions()
  const [status, setStatus] = useState(complaint.status)
  const [note, setNote] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState(null)

  const unchanged = status === complaint.status

  async function save(event) {
    event.preventDefault()
    setBusy(true)
    setMessage(null)
    try {
      const updated = await updateStatus(complaint.id, status, note.trim())
      setNote('')
      setMessage({ kind: 'success', text: `Status changed to ${labelFor(options.statuses, updated.status)}.` })
      onChanged(updated)
    } catch (error) {
      setMessage({ kind: 'error', text: error.message })
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="panel" aria-labelledby="status-title">
      <h2 id="status-title">Update status</h2>
      <form onSubmit={save}>
        <div className="field">
          <label htmlFor="new-status">Status</label>
          <select id="new-status" value={status} onChange={(event) => setStatus(event.target.value)}>
            {options.statuses.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
        <div className="field">
          <label htmlFor="status-note">Note (optional)</label>
          <input
            id="status-note"
            value={note}
            maxLength={500}
            onChange={(event) => setNote(event.target.value)}
            placeholder="For example: repair crew scheduled for Friday"
          />
        </div>
        <button type="submit" className="btn btn-primary" disabled={busy || unchanged}>
          {busy ? 'Saving…' : 'Save status'}
        </button>
        {unchanged && <p className="muted">Choose a different status to save a change.</p>}
      </form>
      {message && (
        <Alert kind={message.kind} title={message.kind === 'success' ? 'Saved' : 'Status not changed'}>
          {message.text}
        </Alert>
      )}
    </section>
  )
}

export default function ComplaintDetail() {
  const { id } = useParams()
  const options = useOptions()
  const { data, error, loading, reload } = useAsync(() => getComplaint(id), [id])
  const [override, setOverride] = useState(null)

  if (loading && !data) return <Loading label="Loading complaint…" />
  if (error) {
    return error.status === 404 ? (
      <EmptyState
        title="Complaint not found"
        action={
          <Link className="btn btn-primary" to="/complaints">
            Back to complaints
          </Link>
        }
      >
        {error.message}
      </EmptyState>
    ) : (
      <ErrorState error={error} onRetry={reload} />
    )
  }

  const complaint = override && override.id === data.id ? override : data

  return (
    <>
      <Link to="/complaints" className="back-link">
        <ArrowLeft size={16} aria-hidden="true" /> All complaints
      </Link>

      <header className="detail-head">
        <div>
          <p className="mono ref">{complaint.reference}</p>
          <h1>{complaint.title}</h1>
          <p className="muted with-icon">
            <MapPin size={16} aria-hidden="true" /> {complaint.location}
          </p>
        </div>
        <div className="detail-badges">
          <StatusBadge status={complaint.status} />
          <PriorityBadge level={complaint.priority_level} />
        </div>
      </header>

      <div className="detail-layout">
        <div className="detail-main">
          <section className="panel" aria-labelledby="desc-title">
            <h2 id="desc-title">Description</h2>
            <p className="preline">{complaint.description}</p>
            <dl className="facts">
              <div>
                <dt>Category</dt>
                <dd>{labelFor(options.categories, complaint.category)}</dd>
              </div>
              <div>
                <dt>Severity</dt>
                <dd>
                  {complaint.severity} of 5 ({labelFor(options.severities, complaint.severity)})
                </dd>
              </div>
              <div>
                <dt>People affected</dt>
                <dd>{complaint.people_affected.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Previous complaints</dt>
                <dd>{complaint.previous_complaints}</dd>
              </div>
              <div>
                <dt>Area</dt>
                <dd>{labelFor(options.location_types, complaint.location_type)}</dd>
              </div>
              <div>
                <dt>Traffic</dt>
                <dd>{labelFor(options.traffic_levels, complaint.traffic_level)}</dd>
              </div>
              <div>
                <dt>Near a school</dt>
                <dd>{complaint.near_school ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Near a hospital</dt>
                <dd>{complaint.near_hospital ? 'Yes' : 'No'}</dd>
              </div>
              <div>
                <dt>Submitted</dt>
                <dd>{formatDate(complaint.created_at, true)}</dd>
              </div>
              <div>
                <dt>Last updated</dt>
                <dd>{formatDate(complaint.updated_at, true)}</dd>
              </div>
            </dl>
          </section>

          <section className="panel" aria-labelledby="prio-title">
            <h2 id="prio-title">Priority score</h2>
            <div className="preview-score">
              <span className="score-big">{complaint.priority_score.toFixed(1)}</span>
              <span className="muted">out of 100</span>
              <PriorityBadge level={complaint.priority_level} />
            </div>
            <PriorityMeter score={complaint.priority_score} level={complaint.priority_level} />
            <PriorityBreakdown breakdown={complaint.priority_breakdown} score={complaint.priority_score} />
          </section>

          {complaint.has_attachment && (
            <section className="panel" aria-labelledby="photo-title">
              <h2 id="photo-title">Photo</h2>
              <img
                className="attachment"
                src={attachmentUrl(complaint.id)}
                alt={`Photo attached to ${complaint.reference}: ${complaint.attachment_name}`}
              />
            </section>
          )}
        </div>

        <div className="detail-side">
          {/* keyed by complaint only: keying by status would remount the panel and erase its "Saved" message */}
          <StatusPanel key={complaint.id} complaint={complaint} onChanged={setOverride} />

          <section className="panel" aria-labelledby="hist-title">
            <h2 id="hist-title">Status history</h2>
            <ol className="history">
              {[...complaint.status_history].reverse().map((entry) => (
                <li key={entry.id}>
                  <StatusBadge status={entry.new_status} />
                  <span className="muted">{formatDate(entry.created_at, true)}</span>
                  {entry.note && <span className="history-note">{entry.note}</span>}
                </li>
              ))}
            </ol>
          </section>

          <section className="panel" aria-labelledby="vid-title">
            <h2 id="vid-title">Videos</h2>
            {complaint.videos.length === 0 ? (
              <p className="muted">No videos are linked to this complaint.</p>
            ) : (
              <ul className="video-list">
                {complaint.videos.map((video) => (
                  <li key={video.id}>
                    <Film size={18} aria-hidden="true" />
                    <div>
                      <Link to={`/video-review?video=${video.id}`} className="row-link">
                        {video.original_filename}
                      </Link>
                      <span className="hint">{formatBytes(video.size_bytes)}</span>
                      <VideoStatusBadge status={video.status} />
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <Link className="btn btn-secondary" to={`/video-review?complaint=${complaint.id}`}>
              Add a video
            </Link>
          </section>
        </div>
      </div>
    </>
  )
}
