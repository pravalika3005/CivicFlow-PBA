import { Alert } from './ui'
import { formatDuration } from '../utils'

const VIDEO_STATUS_LABEL = {
  queued: 'Waiting to start',
  processing: 'Analysing',
  completed: 'Analysis complete',
  failed: 'Analysis failed',
}

export function VideoStatusBadge({ status }) {
  return <span className={`badge video-${status}`}>{VIDEO_STATUS_LABEL[status] || status}</span>
}

function MotionTimeline({ timeline, duration, threshold, peak }) {
  if (!timeline.length) return null
  const width = 600
  const height = 120
  const top = 8
  const bottom = 22
  const plotHeight = height - top - bottom
  const maxY = Math.max(peak, threshold * 2, 5)
  const x = (t) => (duration > 0 ? (t / duration) * width : 0)
  const y = (value) => top + plotHeight - (Math.min(value, maxY) / maxY) * plotHeight
  const points = timeline.map((p) => `${x(p.t).toFixed(1)},${y(p.motion_pct).toFixed(1)}`).join(' ')

  return (
    <figure className="timeline">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Motion over time. Peak motion ${peak.toFixed(1)} percent of pixels.`}
        preserveAspectRatio="none"
      >
        <line className="tl-base" x1="0" x2={width} y1={top + plotHeight} y2={top + plotHeight} />
        <line className="tl-threshold" x1="0" x2={width} y1={y(threshold)} y2={y(threshold)} />
        <polyline className="tl-line" points={points} fill="none" vectorEffect="non-scaling-stroke" />
      </svg>
      <figcaption>
        <span>0s</span>
        <span>Dashed line: motion event threshold ({threshold}%)</span>
        <span>{formatDuration(duration)}</span>
      </figcaption>
    </figure>
  )
}

export default function VideoResult({ result }) {
  const { metadata: meta, motion, people, behavior_classification: behavior, limitations, summary } = result

  return (
    <div className="video-result">
      <p className="result-summary">{summary}</p>

      <dl className="facts">
        <div>
          <dt>Duration</dt>
          <dd>{formatDuration(meta.duration_s)}</dd>
        </div>
        <div>
          <dt>Resolution</dt>
          <dd>
            {meta.width} × {meta.height}
          </dd>
        </div>
        <div>
          <dt>Frame rate</dt>
          <dd>
            {meta.fps} fps{meta.fps_assumed ? ' (assumed)' : ''}
          </dd>
        </div>
        <div>
          <dt>Frames</dt>
          <dd>
            {meta.frame_count} ({meta.frames_sampled} checked)
          </dd>
        </div>
      </dl>

      <h3>Motion activity</h3>
      <div className="motion-head">
        <span className={`badge activity-${motion.activity_level}`}>
          {motion.activity_level.charAt(0).toUpperCase() + motion.activity_level.slice(1)} activity
        </span>
        <span className="muted">
          Average {motion.mean_pct.toFixed(2)}% of pixels changing · peak {motion.peak_pct.toFixed(2)}%
        </span>
      </div>
      <MotionTimeline
        timeline={motion.timeline}
        duration={meta.duration_s}
        threshold={motion.event_threshold_pct}
        peak={motion.peak_pct}
      />
      {motion.events.length > 0 ? (
        <ul className="events">
          {motion.events.map((event, index) => (
            <li key={index}>
              Motion from <strong>{event.start_s}s</strong> to <strong>{event.end_s}s</strong>, peaking at{' '}
              {event.peak_pct}%
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">No distinct motion events were found.</p>
      )}

      <h3>People detection</h3>
      {people.available ? (
        <p>
          {people.frames_with_people > 0
            ? `People were detected in ${people.frames_with_people} of ${people.frames_checked} checked frames, up to ${people.max_in_frame} at once.`
            : `No people were detected in the ${people.frames_checked} frames that were checked.`}{' '}
          <span className="muted">{people.method}.</span>
        </p>
      ) : (
        <Alert kind="info" title="People detection unavailable">
          {people.reason}
        </Alert>
      )}

      <h3>Behaviour recognition</h3>
      {!behavior.available && (
        <Alert kind="info" title="Not performed">
          {behavior.reason}
        </Alert>
      )}

      <details className="limits">
        <summary>What this analysis can and cannot tell you</summary>
        <ul>
          {limitations.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </details>
    </div>
  )
}
