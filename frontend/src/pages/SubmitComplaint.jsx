import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Loader2, Send } from 'lucide-react'
import { ApiError, createComplaint, fieldErrors, previewPriority, uploadAttachment } from '../api'
import { useDebounced } from '../hooks'
import { useOptions } from '../components/OptionsContext'
import { Alert, PageHeader, PriorityBadge, PriorityBreakdown, PriorityMeter } from '../components/ui'
import { IMAGE_EXTENSIONS, checkFile, formatBytes } from '../utils'
import { EMPTY_COMPLAINT, buildPayload, validateComplaint } from '../validation'

function Field({ id, label, error, hint, children, required }) {
  return (
    <div className={`field ${error ? 'has-error' : ''}`}>
      <label htmlFor={id}>
        {label}
        {required && <span className="req"> (required)</span>}
      </label>
      {hint && (
        <p className="field-hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p className="field-error" id={`${id}-error`}>
          {error}
        </p>
      )}
    </div>
  )
}

const describedBy = (id, error, hint) => [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined

function PriorityPreview({ values }) {
  const [state, setState] = useState({ status: 'idle', result: null, error: '' })
  const inputs = useDebounced(
    JSON.stringify({
      severity: Number(values.severity),
      people_affected: values.people_affected === '' ? 0 : Number(values.people_affected),
      previous_complaints: values.previous_complaints === '' ? 0 : Number(values.previous_complaints),
      near_school: values.near_school,
      near_hospital: values.near_hospital,
      traffic_level: values.traffic_level,
      location_type: values.location_type,
    }),
  )

  useEffect(() => {
    const payload = JSON.parse(inputs)
    const valid =
      payload.severity >= 1 &&
      Number.isInteger(payload.people_affected) &&
      payload.people_affected >= 0 &&
      Number.isInteger(payload.previous_complaints) &&
      payload.previous_complaints >= 0
    if (!valid) {
      setState({ status: 'idle', result: null, error: '' })
      return undefined
    }
    let cancelled = false
    setState((previous) => ({ ...previous, status: 'loading' }))
    previewPriority(payload)
      .then((result) => !cancelled && setState({ status: 'ready', result, error: '' }))
      .catch((error) => !cancelled && setState({ status: 'error', result: null, error: error.message }))
    return () => {
      cancelled = true
    }
  }, [inputs])

  return (
    <aside className="panel preview" aria-labelledby="preview-title" aria-live="polite">
      <h2 id="preview-title">Priority preview</h2>
      {state.status === 'idle' && (
        <p className="muted">Choose a severity and enter how many people are affected to see the priority score.</p>
      )}
      {state.status === 'error' && <Alert kind="error" title="Preview unavailable">{state.error}</Alert>}
      {state.result && (
        <>
          <div className="preview-score">
            <span className="score-big">{state.result.score.toFixed(1)}</span>
            <span className="muted">out of 100</span>
            <PriorityBadge level={state.result.level} />
          </div>
          <PriorityMeter score={state.result.score} level={state.result.level} />
          <details>
            <summary>See how this score is calculated</summary>
            <PriorityBreakdown breakdown={state.result.breakdown} score={state.result.score} />
          </details>
        </>
      )}
    </aside>
  )
}

export default function SubmitComplaint() {
  const options = useOptions()
  const [values, setValues] = useState(EMPTY_COMPLAINT)
  const [errors, setErrors] = useState({})
  const [file, setFile] = useState(null)
  const [fileError, setFileError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [formError, setFormError] = useState('')
  const [created, setCreated] = useState(null)
  const fileInput = useRef(null)
  const errorSummary = useRef(null)

  const set = (name) => (event) => {
    const value = event.target.type === 'checkbox' ? event.target.checked : event.target.value
    setValues((previous) => ({ ...previous, [name]: value }))
    if (errors[name]) setErrors((previous) => ({ ...previous, [name]: undefined }))
  }

  const pickFile = (event) => {
    const chosen = event.target.files[0] || null
    const problem = checkFile(chosen, IMAGE_EXTENSIONS, options.limits.max_image_mb, 'image')
    setFileError(problem)
    setFile(problem ? null : chosen)
    if (problem) event.target.value = ''
  }

  const reset = () => {
    setValues(EMPTY_COMPLAINT)
    setErrors({})
    setFile(null)
    setFileError('')
    setFormError('')
    setCreated(null)
  }

  async function onSubmit(event) {
    event.preventDefault()
    setFormError('')
    const found = validateComplaint(values)
    if (Object.keys(found).length) {
      setErrors(found)
      setTimeout(() => errorSummary.current?.focus(), 0)
      return
    }
    setSubmitting(true)
    let complaint
    try {
      complaint = await createComplaint(buildPayload(values))
    } catch (error) {
      if (error instanceof ApiError && error.status === 422) {
        const mapped = fieldErrors(error.detail)
        if (Object.keys(mapped).length) setErrors(mapped)
      }
      setFormError(error.message)
      setSubmitting(false)
      setTimeout(() => errorSummary.current?.focus(), 0)
      return
    }
    let attachmentProblem = ''
    if (file) {
      try {
        complaint = await uploadAttachment(complaint.id, file)
      } catch (error) {
        attachmentProblem = error.message
      }
    }
    setCreated({ complaint, attachmentProblem })
    setSubmitting(false)
    window.scrollTo({ top: 0 })
  }

  if (created) {
    const { complaint, attachmentProblem } = created
    return (
      <>
        <PageHeader title="Complaint submitted" />
        <Alert kind="success" title={`${complaint.reference} has been saved`}>
          It is now pending review.
        </Alert>
        {attachmentProblem && (
          <Alert kind="warning" title="The image could not be attached">
            {`${attachmentProblem}\nThe complaint itself was saved. You can open it and try again later.`}
          </Alert>
        )}
        <section className="panel result-panel">
          <h2>{complaint.title}</h2>
          <div className="preview-score">
            <span className="score-big">{complaint.priority_score.toFixed(1)}</span>
            <span className="muted">out of 100</span>
            <PriorityBadge level={complaint.priority_level} />
          </div>
          <PriorityMeter score={complaint.priority_score} level={complaint.priority_level} />
          <div className="button-row">
            <Link className="btn btn-primary" to={`/complaints/${complaint.id}`}>
              Open complaint
            </Link>
            <Link className="btn btn-secondary" to={`/video-review?complaint=${complaint.id}`}>
              Add a video
            </Link>
            <button type="button" className="btn btn-secondary" onClick={reset}>
              Submit another
            </button>
          </div>
        </section>
      </>
    )
  }

  const errorList = Object.entries(errors).filter(([, message]) => message)

  return (
    <>
      <PageHeader
        title="Submit a complaint"
        intro="Describe the problem. CivicFlow scores how urgent it is as you fill in the details."
      />

      <div className="form-layout">
        <form onSubmit={onSubmit} noValidate aria-describedby={formError || errorList.length ? 'form-errors' : undefined}>
          {(formError || errorList.length > 0) && (
            <div id="form-errors" ref={errorSummary} tabIndex={-1} className="alert alert-error" role="alert">
              <div>
                <strong>The complaint was not submitted</strong>
                {formError && <div className="preline">{formError}</div>}
                {!formError && <div>Fix the highlighted fields and try again.</div>}
              </div>
            </div>
          )}

          <fieldset className="panel">
            <legend>What is the problem?</legend>
            <Field id="title" label="Title" error={errors.title} required>
              <input
                id="title"
                value={values.title}
                onChange={set('title')}
                maxLength={120}
                autoComplete="off"
                aria-invalid={!!errors.title}
                aria-describedby={describedBy('title', errors.title)}
              />
            </Field>
            <Field id="description" label="Description" error={errors.description} required>
              <textarea
                id="description"
                rows={4}
                value={values.description}
                onChange={set('description')}
                maxLength={2000}
                aria-invalid={!!errors.description}
                aria-describedby={describedBy('description', errors.description)}
              />
            </Field>
            <Field id="category" label="Category" error={errors.category} required>
              <select
                id="category"
                value={values.category}
                onChange={set('category')}
                aria-invalid={!!errors.category}
                aria-describedby={describedBy('category', errors.category)}
              >
                <option value="">Choose a category</option>
                {options.categories.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </Field>
          </fieldset>

          <fieldset className="panel">
            <legend>Where is it?</legend>
            <Field id="location" label="Location" error={errors.location} hint="A street, area or landmark." required>
              <input
                id="location"
                value={values.location}
                onChange={set('location')}
                maxLength={200}
                autoComplete="off"
                aria-invalid={!!errors.location}
                aria-describedby={describedBy('location', errors.location, true)}
              />
            </Field>
            <div className="field-row">
              <Field id="location_type" label="Type of area">
                <select id="location_type" value={values.location_type} onChange={set('location_type')}>
                  {options.location_types.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
              <Field id="traffic_level" label="Traffic level">
                <select id="traffic_level" value={values.traffic_level} onChange={set('traffic_level')}>
                  {options.traffic_levels.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </Field>
            </div>
            <div className="checks">
              <label className="check">
                <input type="checkbox" checked={values.near_school} onChange={set('near_school')} />
                Near a school
              </label>
              <label className="check">
                <input type="checkbox" checked={values.near_hospital} onChange={set('near_hospital')} />
                Near a hospital
              </label>
            </div>
          </fieldset>

          <fieldset className="panel">
            <legend>How serious is it?</legend>
            <div className={`field ${errors.severity ? 'has-error' : ''}`}>
              <div role="radiogroup" aria-label="Severity" className="severity-scale" aria-describedby={errors.severity ? 'severity-error' : undefined}>
                {options.severities.map((o) => (
                  <label key={o.value} className={`severity-option ${String(values.severity) === String(o.value) ? 'selected' : ''}`}>
                    <input
                      type="radio"
                      name="severity"
                      value={o.value}
                      checked={String(values.severity) === String(o.value)}
                      onChange={set('severity')}
                    />
                    <span className="severity-num">{o.value}</span>
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
              {errors.severity && (
                <p className="field-error" id="severity-error">
                  {errors.severity}
                </p>
              )}
            </div>
            <div className="field-row">
              <Field
                id="people_affected"
                label="People affected"
                error={errors.people_affected}
                hint="Your best estimate. Use 0 if nobody is directly affected."
                required
              >
                <input
                  id="people_affected"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="1000000"
                  value={values.people_affected}
                  onChange={set('people_affected')}
                  aria-invalid={!!errors.people_affected}
                  aria-describedby={describedBy('people_affected', errors.people_affected, true)}
                />
              </Field>
              <Field
                id="previous_complaints"
                label="Previous complaints"
                error={errors.previous_complaints}
                hint="How many times this was reported before."
              >
                <input
                  id="previous_complaints"
                  type="number"
                  inputMode="numeric"
                  min="0"
                  max="1000"
                  value={values.previous_complaints}
                  onChange={set('previous_complaints')}
                  aria-invalid={!!errors.previous_complaints}
                  aria-describedby={describedBy('previous_complaints', errors.previous_complaints, true)}
                />
              </Field>
            </div>
          </fieldset>

          <fieldset className="panel">
            <legend>Photo (optional)</legend>
            <Field
              id="attachment"
              label="Attach an image"
              error={fileError}
              hint={`JPG, PNG or WebP, up to ${options.limits.max_image_mb} MB.`}
            >
              <input
                id="attachment"
                type="file"
                ref={fileInput}
                accept={IMAGE_EXTENSIONS.join(',')}
                onChange={pickFile}
                aria-describedby={describedBy('attachment', fileError, true)}
              />
            </Field>
            {file && <p className="muted">Selected: {file.name} ({formatBytes(file.size)})</p>}
          </fieldset>

          <div className="button-row">
            <button type="submit" className="btn btn-primary" disabled={submitting}>
              {submitting ? <Loader2 size={18} className="spin" aria-hidden="true" /> : <Send size={18} aria-hidden="true" />}
              {submitting ? 'Submitting…' : 'Submit complaint'}
            </button>
            <button type="button" className="btn btn-ghost" onClick={reset} disabled={submitting}>
              Clear form
            </button>
          </div>
        </form>

        <PriorityPreview values={values} />
      </div>
    </>
  )
}
