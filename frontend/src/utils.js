export const VIDEO_EXTENSIONS = ['.mp4', '.mov', '.avi', '.mkv', '.webm']
export const IMAGE_EXTENSIONS = ['.jpg', '.jpeg', '.png', '.webp']

export function extensionOf(name = '') {
  const dot = name.lastIndexOf('.')
  return dot === -1 ? '' : name.slice(dot).toLowerCase()
}

/** Returns an error message for a file the server would reject, or '' when it looks fine. */
export function checkFile(file, allowed, maxMb, kind) {
  if (!file) return ''
  if (!allowed.includes(extensionOf(file.name))) {
    return `This ${kind} type is not supported. Use ${allowed.join(', ')}.`
  }
  if (file.size === 0) return `This ${kind} file is empty.`
  if (file.size > maxMb * 1024 * 1024) {
    return `This ${kind} is ${formatBytes(file.size)}. The limit is ${maxMb} MB.`
  }
  return ''
}

export function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function formatDate(iso, withTime = false) {
  if (!iso) return ''
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    ...(withTime ? { hour: '2-digit', minute: '2-digit' } : {}),
  })
}

export function formatDuration(seconds) {
  const total = Math.round(seconds || 0)
  const minutes = Math.floor(total / 60)
  const rest = total % 60
  return minutes ? `${minutes}m ${rest}s` : `${rest}s`
}

export function labelFor(list, value) {
  const found = (list || []).find((item) => String(item.value) === String(value))
  return found ? found.label : value
}

export const PRIORITY_ZONES = [
  { level: 'low', from: 0, to: 25 },
  { level: 'medium', from: 25, to: 50 },
  { level: 'high', from: 50, to: 75 },
  { level: 'critical', from: 75, to: 100 },
]

export function percent(part, whole) {
  return whole ? Math.round((100 * part) / whole) : 0
}
