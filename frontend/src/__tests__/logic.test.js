import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApiError, fieldErrors, formatDetail, getDashboard, listComplaints } from '../api'
import { checkFile, extensionOf, formatBytes, percent, VIDEO_EXTENSIONS } from '../utils'
import { EMPTY_COMPLAINT, buildPayload, validateComplaint } from '../validation'

const valid = {
  ...EMPTY_COMPLAINT,
  title: 'Broken water main',
  description: 'Water is flooding the street near the market.',
  category: 'water_supply',
  location: 'Market Road',
  severity: '4',
  people_affected: '120',
}

describe('validateComplaint', () => {
  it('accepts a complete complaint', () => {
    expect(validateComplaint(valid)).toEqual({})
  })

  it('reports every missing required field with a clear message', () => {
    const errors = validateComplaint(EMPTY_COMPLAINT)
    expect(Object.keys(errors).sort()).toEqual(
      ['category', 'description', 'location', 'people_affected', 'severity', 'title'].sort(),
    )
    expect(errors.title).toMatch(/at least 3/)
  })

  it('rejects negative, fractional and out-of-range numbers', () => {
    expect(validateComplaint({ ...valid, people_affected: '-3' }).people_affected).toBeTruthy()
    expect(validateComplaint({ ...valid, people_affected: '2.5' }).people_affected).toBeTruthy()
    expect(validateComplaint({ ...valid, previous_complaints: '5000' }).previous_complaints).toBeTruthy()
    expect(validateComplaint({ ...valid, people_affected: '0' }).people_affected).toBeUndefined()
  })

  it('builds a payload with numbers and trimmed text', () => {
    const payload = buildPayload({ ...valid, title: '  Broken water main  ', previous_complaints: '' })
    expect(payload.title).toBe('Broken water main')
    expect(payload.severity).toBe(4)
    expect(payload.people_affected).toBe(120)
    expect(payload.previous_complaints).toBe(0)
  })
})

describe('file checks', () => {
  const file = (name, size) => ({ name, size })
  it('accepts supported videos and rejects the rest', () => {
    expect(checkFile(file('clip.MP4', 1000), VIDEO_EXTENSIONS, 100, 'video')).toBe('')
    expect(checkFile(file('notes.txt', 1000), VIDEO_EXTENSIONS, 100, 'video')).toMatch(/not supported/)
    expect(checkFile(file('clip.mp4', 0), VIDEO_EXTENSIONS, 100, 'video')).toMatch(/empty/)
    expect(checkFile(file('clip.mp4', 101 * 1024 * 1024), VIDEO_EXTENSIONS, 100, 'video')).toMatch(/limit is 100 MB/)
  })
  it('has small helpers that behave', () => {
    expect(extensionOf('a.b.WebM')).toBe('.webm')
    expect(extensionOf('noext')).toBe('')
    expect(formatBytes(1536)).toBe('1.5 KB')
    expect(percent(1, 4)).toBe(25)
    expect(percent(1, 0)).toBe(0)
  })
})

describe('api error handling', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('formats string, list and validation errors', () => {
    expect(formatDetail('Plain message')).toBe('Plain message')
    expect(formatDetail(['one', 'two'])).toBe('one\ntwo')
    const detail = [{ loc: ['body', 'severity'], msg: 'Input should be less than or equal to 5' }]
    expect(formatDetail(detail)).toBe('Severity: Input should be less than or equal to 5')
    expect(fieldErrors(detail)).toEqual({ severity: 'Input should be less than or equal to 5' })
    expect(formatDetail(null)).toMatch(/Something went wrong/)
  })

  it('throws a readable error when the server cannot be reached', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new TypeError('Failed to fetch')))
    await expect(getDashboard()).rejects.toThrow(/Cannot reach the CivicFlow backend/)
  })

  it('says the backend is not running when the dev-server proxy returns an empty 500', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => '' }))
    const error = await getDashboard().catch((e) => e)
    expect(error.message).toMatch(/Cannot reach the CivicFlow backend/)
    expect(error.message).toMatch(/Application startup complete/)
  })

  it('does not blame the connection for a real server error with a body', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 500, text: async () => 'Internal Server Error' }))
    const error = await getDashboard().catch((e) => e)
    expect(error.message).toMatch(/unexpected problem \(HTTP 500\)/)
  })

  it('uses same-origin /api paths by default', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({}) })
    vi.stubGlobal('fetch', fetchMock)
    await getDashboard()
    expect(fetchMock.mock.calls[0][0]).toBe('/api/dashboard')
  })

  it('throws the backend message for failed responses', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: false, status: 404, text: async () => JSON.stringify({ detail: 'Complaint 9 was not found.' }) }),
    )
    const error = await listComplaints().catch((e) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error.status).toBe(404)
    expect(error.message).toBe('Complaint 9 was not found.')
  })

  it('builds query strings without empty values', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ items: [], total: 0 }) })
    vi.stubGlobal('fetch', fetchMock)
    await listComplaints({ search: 'pothole', status: '', limit: 15, offset: 0 })
    expect(fetchMock.mock.calls[0][0]).toMatch(/\/api\/complaints\?search=pothole&limit=15&offset=0$/)
  })
})
