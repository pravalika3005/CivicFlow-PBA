// All communication with the FastAPI backend lives here.
// Failed requests always throw an ApiError with a readable message: nothing is swallowed.

// By default the website calls the backend through its own address (/api/...), and the
// Vite dev server forwards those calls to the backend. That avoids browser cross-site
// rules and localhost-vs-127.0.0.1 problems. Set VITE_API_URL only to point elsewhere.
export const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/$/, '')

const UNREACHABLE =
  'Cannot reach the CivicFlow backend. Make sure the backend window is still open and shows "Application startup complete", then try again.'

export class ApiError extends Error {
  constructor(message, status = 0, detail = null) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

const FIELD_NAMES = {
  title: 'Title',
  description: 'Description',
  category: 'Category',
  location: 'Location',
  location_type: 'Location type',
  severity: 'Severity',
  people_affected: 'People affected',
  previous_complaints: 'Previous complaints',
  traffic_level: 'Traffic level',
  status: 'Status',
  note: 'Note',
}

/** Turn the backend's error detail (string, list of strings, or validation list) into text. */
export function formatDetail(detail) {
  if (!detail) return 'Something went wrong. Please try again.'
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (typeof item === 'string') return item
        const field = (item.loc || []).filter((part) => part !== 'body').pop()
        const name = FIELD_NAMES[field] || field
        return name ? `${name}: ${item.msg}` : item.msg
      })
      .join('\n')
  }
  return 'Something went wrong. Please try again.'
}

/** Map backend validation errors to { fieldName: message } for inline form errors. */
export function fieldErrors(detail) {
  const result = {}
  if (Array.isArray(detail)) {
    for (const item of detail) {
      if (item && typeof item === 'object' && Array.isArray(item.loc)) {
        const field = item.loc.filter((part) => part !== 'body').pop()
        if (field && !result[field]) result[field] = item.msg
      }
    }
  }
  return result
}

async function parseError(response) {
  let detail = null
  let text = ''
  try {
    text = await response.text()
    detail = JSON.parse(text).detail ?? null
  } catch {
    /* body was empty or not JSON */
  }
  // The dev-server proxy answers with an empty 5xx when the backend is not running.
  if (!detail && !text.trim() && response.status >= 500) return new ApiError(UNREACHABLE, 0)
  if (!detail && response.status >= 500) {
    return new ApiError(`The server had an unexpected problem (HTTP ${response.status}).`, response.status)
  }
  return new ApiError(formatDetail(detail) || `Request failed (${response.status}).`, response.status, detail)
}

async function request(path, options = {}) {
  let response
  try {
    response = await fetch(`${API_BASE}${path}`, options)
  } catch {
    throw new ApiError(UNREACHABLE)
  }
  if (!response.ok) throw await parseError(response)
  return response.json()
}

function json(method, body) {
  return { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
}

function query(params) {
  const search = new URLSearchParams()
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== '') search.set(key, value)
  })
  const text = search.toString()
  return text ? `?${text}` : ''
}

export const getOptions = () => request('/api/meta/options')
export const getDashboard = () => request('/api/dashboard')
export const listComplaints = (params = {}) => request(`/api/complaints${query(params)}`)
export const getComplaint = (id) => request(`/api/complaints/${id}`)
export const createComplaint = (payload) => request('/api/complaints', json('POST', payload))
export const previewPriority = (payload) => request('/api/priority/preview', json('POST', payload))
export const updateStatus = (id, status, note) =>
  request(`/api/complaints/${id}/status`, json('PATCH', { status, note: note || null }))

export function uploadAttachment(id, file) {
  const form = new FormData()
  form.append('file', file)
  return request(`/api/complaints/${id}/attachment`, { method: 'POST', body: form })
}
export const attachmentUrl = (id) => `${API_BASE}/api/complaints/${id}/attachment`

export const listVideos = (params = {}) => request(`/api/videos${query(params)}`)
export const getVideo = (id) => request(`/api/videos/${id}`)

/** Upload a video with real byte-level progress (fetch cannot report upload progress). */
export function uploadVideo(file, complaintId, onProgress) {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('POST', `${API_BASE}/api/videos`)
    xhr.responseType = 'json'
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable && onProgress) onProgress(Math.round((100 * event.loaded) / event.total))
    }
    xhr.onerror = () => reject(new ApiError(UNREACHABLE))
    xhr.onload = () => {
      const body = xhr.response
      if (xhr.status >= 200 && xhr.status < 300) resolve(body)
      else if (xhr.status >= 500 && !body) reject(new ApiError(UNREACHABLE))
      else reject(new ApiError(formatDetail(body && body.detail), xhr.status, body && body.detail))
    }
    const form = new FormData()
    form.append('file', file)
    if (complaintId) form.append('complaint_id', String(complaintId))
    xhr.send(form)
  })
}
