import { useEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { CheckCircle2, Circle, Loader2, Upload, XCircle } from 'lucide-react'
import { getVideo, listComplaints, listVideos, uploadVideo } from '../api'
import { useAsync } from '../hooks'
import { useOptions } from '../components/OptionsContext'
import { Alert, EmptyState, PageHeader } from '../components/ui'
import VideoResult, { VideoStatusBadge } from '../components/VideoResult'
import { VIDEO_EXTENSIONS, checkFile, formatBytes, formatDate } from '../utils'

function Steps({ uploading, uploadPct, video }) {
  const status = video?.status
  const failed = status === 'failed'
  const steps = [
    {
      name: 'Upload',
      state: uploading ? 'active' : video ? 'done' : 'todo',
      detail: uploading ? `${uploadPct}%` : '',
    },
    { name: 'Queued', state: status === 'queued' ? 'active' : status ? 'done' : 'todo', detail: '' },
    {
      name: 'Analysing',
      state: status === 'processing' ? 'active' : status === 'completed' ? 'done' : failed ? 'failed' : 'todo',
      detail: status === 'processing' ? `${video.progress}%` : '',
    },
    { name: 'Results', state: status === 'completed' ? 'done' : 'todo', detail: '' },
  ]
  return (
    <ol className="steps" aria-label="Progress">
      {steps.map((step) => (
        <li key={step.name} className={`step step-${step.state}`} aria-current={step.state === 'active' ? 'step' : undefined}>
          {step.state === 'done' && <CheckCircle2 size={18} aria-hidden="true" />}
          {step.state === 'active' && <Loader2 size={18} className="spin" aria-hidden="true" />}
          {step.state === 'failed' && <XCircle size={18} aria-hidden="true" />}
          {step.state === 'todo' && <Circle size={18} aria-hidden="true" />}
          <span>{step.name}</span>
          {step.detail && <span className="muted">{step.detail}</span>}
        </li>
      ))}
    </ol>
  )
}

export default function VideoReview() {
  const options = useOptions()
  const [params] = useSearchParams()
  const maxMb = options.limits.max_video_mb

  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [complaintId, setComplaintId] = useState(params.get('complaint') || '')
  const [uploading, setUploading] = useState(false)
  const [uploadPct, setUploadPct] = useState(0)
  const [uploadError, setUploadError] = useState('')
  const [video, setVideo] = useState(null)
  const [activeId, setActiveId] = useState(params.get('video') ? Number(params.get('video')) : null)
  const [pollError, setPollError] = useState('')
  const input = useRef(null)

  const complaints = useAsync(() => listComplaints({ limit: 200 }), [])
  const history = useAsync(() => listVideos(), [])

  // Poll the server until the analysis has finished (or failed).
  useEffect(() => {
    if (!activeId) return undefined
    let cancelled = false
    let timer
    let failures = 0
    const tick = async () => {
      try {
        const latest = await getVideo(activeId)
        if (cancelled) return
        failures = 0
        setPollError('')
        setVideo(latest)
        if (latest.status === 'queued' || latest.status === 'processing') {
          timer = setTimeout(tick, 1000)
        } else {
          history.reload()
        }
      } catch (error) {
        if (cancelled) return
        failures += 1
        setPollError(error.message)
        if (failures < 5) timer = setTimeout(tick, 2000)
      }
    }
    tick()
    return () => {
      cancelled = true
      clearTimeout(timer)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId])

  const pick = (event) => {
    const chosen = event.target.files[0] || null
    const problem = checkFile(chosen, VIDEO_EXTENSIONS, maxMb, 'video')
    setFileError(problem)
    setFile(problem ? null : chosen)
    setUploadError('')
    if (problem) event.target.value = ''
  }

  async function start(event) {
    event.preventDefault()
    if (!file) {
      setFileError('Choose a video file first.')
      return
    }
    setUploading(true)
    setUploadPct(0)
    setUploadError('')
    setVideo(null)
    setActiveId(null)
    try {
      const created = await uploadVideo(file, complaintId, setUploadPct)
      setVideo(created)
      setActiveId(created.id)
      setFile(null)
      if (input.current) input.current.value = ''
      history.reload()
    } catch (error) {
      setUploadError(error.message)
    } finally {
      setUploading(false)
    }
  }

  const busy = uploading || video?.status === 'queued' || video?.status === 'processing'
  const linked = video?.complaint_id
    ? complaints.data?.items.find((c) => c.id === video.complaint_id)
    : null

  return (
    <>
      <PageHeader
        title="Video review"
        intro="Upload incident footage. CivicFlow measures motion and looks for people in the video, then shows exactly what it found."
      />

      <div className="grid-video">
        <section className="panel" aria-labelledby="upload-title">
          <h2 id="upload-title">Upload a video</h2>
          <form onSubmit={start} noValidate>
            <div className={`field ${fileError ? 'has-error' : ''}`}>
              <label htmlFor="video-file">Video file</label>
              <p className="field-hint" id="video-file-hint">
                {VIDEO_EXTENSIONS.join(', ')} · up to {maxMb} MB
              </p>
              <input
                id="video-file"
                type="file"
                ref={input}
                accept={VIDEO_EXTENSIONS.join(',')}
                onChange={pick}
                disabled={busy}
                aria-describedby={fileError ? 'video-file-hint video-file-error' : 'video-file-hint'}
                aria-invalid={!!fileError}
              />
              {fileError && (
                <p className="field-error" id="video-file-error">
                  {fileError}
                </p>
              )}
              {file && (
                <p className="muted">
                  Selected: {file.name} ({formatBytes(file.size)})
                </p>
              )}
            </div>

            <div className="field">
              <label htmlFor="video-complaint">Link to a complaint (optional)</label>
              <select
                id="video-complaint"
                value={complaintId}
                onChange={(event) => setComplaintId(event.target.value)}
                disabled={busy}
              >
                <option value="">Not linked</option>
                {complaints.data?.items.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.reference} · {c.title}
                  </option>
                ))}
              </select>
              {complaints.error && <p className="field-error">Complaints could not be loaded: {complaints.error.message}</p>}
            </div>

            <button type="submit" className="btn btn-primary" disabled={busy || !file}>
              <Upload size={18} aria-hidden="true" />
              {uploading ? 'Uploading…' : 'Upload and analyse'}
            </button>
          </form>

          {uploading && (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={uploadPct} aria-label="Upload progress">
              <span style={{ width: `${uploadPct}%` }} />
            </div>
          )}
          {uploadError && (
            <Alert kind="error" title="The video was not uploaded">
              {uploadError}
            </Alert>
          )}
        </section>

        <section className="panel" aria-labelledby="past-title">
          <h2 id="past-title">Previous analyses</h2>
          {history.loading && !history.data ? (
            <p className="muted">Loading…</p>
          ) : history.error ? (
            <Alert kind="error" title="History unavailable">
              {history.error.message}
            </Alert>
          ) : history.data.length === 0 ? (
            <p className="muted">No videos have been analysed yet.</p>
          ) : (
            <ul className="video-history">
              {history.data.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    className={`history-item ${item.id === video?.id ? 'selected' : ''}`}
                    onClick={() => {
                      setVideo(item)
                      setActiveId(item.id)
                    }}
                  >
                    <span className="history-name">{item.original_filename}</span>
                    <span className="muted">
                      {formatDate(item.created_at, true)} · {formatBytes(item.size_bytes)}
                    </span>
                    <VideoStatusBadge status={item.status} />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {(uploading || video) && (
        <section className="panel" aria-labelledby="result-title" aria-live="polite">
          <div className="panel-head">
            <h2 id="result-title">{video ? video.original_filename : 'Uploading…'}</h2>
            {video && <VideoStatusBadge status={video.status} />}
          </div>
          <Steps uploading={uploading} uploadPct={uploadPct} video={video} />

          {video?.status === 'processing' && (
            <div className="progress" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={video.progress} aria-label="Analysis progress">
              <span style={{ width: `${video.progress}%` }} />
            </div>
          )}
          {pollError && (
            <Alert kind="warning" title="Cannot check the analysis status">
              {pollError}
            </Alert>
          )}
          {video?.status === 'failed' && (
            <Alert kind="error" title="The video could not be analysed">
              {video.error}
            </Alert>
          )}
          {linked && (
            <p>
              Linked to{' '}
              <Link to={`/complaints/${linked.id}`} className="row-link">
                {linked.reference} · {linked.title}
              </Link>
            </p>
          )}
          {!linked && video?.complaint_id && (
            <p>
              Linked to{' '}
              <Link to={`/complaints/${video.complaint_id}`} className="row-link">
                complaint {video.complaint_id}
              </Link>
            </p>
          )}
          {video?.status === 'completed' && video.result && <VideoResult result={video.result} />}
        </section>
      )}

      {!uploading && !video && history.data && history.data.length === 0 && (
        <EmptyState title="Nothing to review yet">Choose a video above to see its analysis here.</EmptyState>
      )}
    </>
  )
}
