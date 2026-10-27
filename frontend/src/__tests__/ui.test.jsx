import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PriorityBadge, PriorityBreakdown, PriorityMeter, StatusBadge } from '../components/ui'
import App from '../App'

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
})

const OPTIONS = {
  categories: [{ value: 'road_damage', label: 'Road damage / potholes' }],
  location_types: [{ value: 'other', label: 'Other / unknown' }],
  traffic_levels: [{ value: 'low', label: 'Low' }],
  statuses: [
    { value: 'pending', label: 'Pending' },
    { value: 'in_progress', label: 'In progress' },
    { value: 'resolved', label: 'Resolved' },
  ],
  priority_levels: [
    { value: 'low', label: 'Low' },
    { value: 'medium', label: 'Medium' },
    { value: 'high', label: 'High' },
    { value: 'critical', label: 'Critical' },
  ],
  severities: [1, 2, 3, 4, 5].map((value) => ({ value, label: `Level ${value}` })),
  limits: { max_video_mb: 100, max_image_mb: 5 },
}

const complaint = (id, overrides = {}) => ({
  id,
  reference: `CF-000${id}`,
  title: `Complaint number ${id}`,
  location: 'MG Road',
  category: 'road_damage',
  priority_score: 62.5,
  priority_level: 'high',
  status: 'pending',
  created_at: '2026-10-20T10:00:00Z',
  ...overrides,
})

function mockApi(routes) {
  const fetchMock = vi.fn(async (url, init) => {
    const path = String(url)
    for (const [prefix, body] of Object.entries(routes)) {
      if (path.startsWith(prefix)) {
        return typeof body === 'function' ? body(path, init) : { ok: true, status: 200, json: async () => body }
      }
    }
    return { ok: false, status: 404, text: async () => JSON.stringify({ detail: `no mock for ${path}` }) }
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

const renderApp = (path = '/') =>
  render(
    <MemoryRouter initialEntries={[path]}>
      <App />
    </MemoryRouter>,
  )

describe('shared components', () => {
  it('describes the priority score for screen readers', () => {
    render(<PriorityMeter score={62.5} level="high" />)
    expect(screen.getByRole('img')).toHaveAccessibleName('Priority score 62.5 out of 100, High')
  })

  it('clamps out-of-range scores instead of drawing outside the ruler', () => {
    const { container } = render(<PriorityMeter score={250} level="critical" />)
    expect(container.querySelector('.meter-marker').style.left).toBe('100%')
  })

  it('shows badges with text, not colour alone', () => {
    render(
      <>
        <StatusBadge status="in_progress" />
        <PriorityBadge level="critical" />
      </>,
    )
    expect(screen.getByText('In progress')).toBeInTheDocument()
    expect(screen.getByText('Critical')).toBeInTheDocument()
  })

  it('lists each factor with its points and the total', () => {
    render(
      <PriorityBreakdown
        score={30}
        breakdown={[
          { factor: 'severity', label: 'Severity', input_value: '5 of 5', points: 30, max_points: 30, note: '30 x severity / 5', defaulted: false },
          { factor: 'people_affected', label: 'People affected', input_value: '0', points: 0, max_points: 20, note: 'log scale', defaulted: true },
        ]}
      />,
    )
    expect(screen.getByText('Severity')).toBeInTheDocument()
    expect(screen.getByText(/not provided, default used/)).toBeInTheDocument()
    expect(screen.getByText('30.0', { selector: 'strong' })).toBeInTheDocument()
  })
})

describe('pages with a mocked backend', () => {
  it('dashboard shows the numbers the API returned', async () => {
    mockApi({
      '/api/meta/options': OPTIONS,
      '/api/dashboard': {
        total: 7,
        pending: 3,
        in_progress: 2,
        resolved: 2,
        priority_distribution: { low: 1, medium: 2, high: 3, critical: 1 },
        category_distribution: { road_damage: 7 },
        recent: [complaint(7, { title: 'Open manhole near school' })],
      },
    })
    renderApp('/')
    expect(await screen.findByText('Open manhole near school')).toBeInTheDocument()
    expect(screen.getByText('Total complaints').previousSibling).toHaveTextContent('7')
    expect(screen.getByText('In progress', { selector: '.stat-label' }).previousSibling).toHaveTextContent('2')
    expect(screen.getByText('Road damage / potholes')).toBeInTheDocument()
  })

  it('dashboard shows an empty state when there are no complaints', async () => {
    mockApi({
      '/api/meta/options': OPTIONS,
      '/api/dashboard': {
        total: 0, pending: 0, in_progress: 0, resolved: 0,
        priority_distribution: { low: 0, medium: 0, high: 0, critical: 0 },
        category_distribution: {}, recent: [],
      },
    })
    renderApp('/')
    expect(await screen.findByText('No complaints yet')).toBeInTheDocument()
  })

  it('shows a clear error and recovers on retry when the backend is down', async () => {
    let healthy = false
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        if (!healthy) throw new TypeError('Failed to fetch')
        return { ok: true, status: 200, json: async () => OPTIONS }
      }),
    )
    renderApp('/complaints')
    expect(await screen.findByText(/Cannot reach the CivicFlow backend/)).toBeInTheDocument()
    expect(screen.getByRole('alert')).toBeInTheDocument()
    healthy = true
    vi.stubGlobal('fetch', vi.fn(async (url) => ({
      ok: true, status: 200,
      json: async () => (String(url).includes('/meta/options') ? OPTIONS : { items: [], total: 0, limit: 15, offset: 0 }),
    })))
    fireEvent.click(screen.getByRole('button', { name: /try again/i }))
    expect(await screen.findByText('No complaints yet')).toBeInTheDocument()
  })

  it('complaints table lists rows and sends the search term to the API', async () => {
    const fetchMock = mockApi({
      '/api/meta/options': OPTIONS,
      '/api/complaints': {
        items: [complaint(1), complaint(2, { status: 'resolved', priority_level: 'low', priority_score: 12 })],
        total: 2, limit: 15, offset: 0,
      },
    })
    renderApp('/complaints')
    expect(await screen.findByText('Complaint number 2')).toBeInTheDocument()
    expect(screen.getByText('CF-0001')).toBeInTheDocument()
    expect(within(screen.getByRole('table')).getByText('Resolved')).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Search'), { target: { value: 'pothole' } })
    await waitFor(() => {
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('search=pothole'))).toBe(true)
    })
  })

  it('complaint form blocks an empty submit and shows what to fix', async () => {
    const fetchMock = mockApi({ '/api/meta/options': OPTIONS })
    renderApp('/submit')
    fireEvent.click(await screen.findByRole('button', { name: /submit complaint/i }))
    expect(await screen.findByText('The complaint was not submitted')).toBeInTheDocument()
    expect(screen.getByText(/Enter a title of at least 3 characters/)).toBeInTheDocument()
    expect(screen.getByText('Choose how severe the problem is.')).toBeInTheDocument()
    const posted = fetchMock.mock.calls.filter(([, options]) => options?.method === 'POST')
    expect(posted).toHaveLength(0)
  })

  it('keeps the "saved" confirmation visible after a status change', async () => {
    const base = {
      ...complaint(5, { title: 'Streetlight out on Park Lane' }),
      description: 'The streetlight has been dark for a week.',
      location_type: 'other', traffic_level: 'low', severity: 3, people_affected: 40,
      previous_complaints: 0, near_school: false, near_hospital: false, has_attachment: false,
      attachment_name: null, updated_at: '2026-10-20T10:00:00Z', videos: [],
      priority_breakdown: [],
      status_history: [{ id: 1, old_status: null, new_status: 'pending', note: 'Complaint submitted', created_at: '2026-10-20T10:00:00Z' }],
    }
    const resolved = {
      ...base, status: 'resolved',
      status_history: [...base.status_history, { id: 2, old_status: 'pending', new_status: 'resolved', note: 'Bulb replaced', created_at: '2026-10-21T09:00:00Z' }],
    }
    mockApi({
      '/api/meta/options': OPTIONS,
      '/api/complaints/5/status': (_path, init) => {
        expect(init.method).toBe('PATCH')
        expect(JSON.parse(init.body)).toEqual({ status: 'resolved', note: 'Bulb replaced' })
        return { ok: true, status: 200, json: async () => resolved }
      },
      '/api/complaints/5': base,
    })
    renderApp('/complaints/5')
    await screen.findByText('Streetlight out on Park Lane')
    fireEvent.change(screen.getByLabelText('Status'), { target: { value: 'resolved' } })
    fireEvent.change(screen.getByLabelText(/Note/), { target: { value: 'Bulb replaced' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save status' }))
    expect(await screen.findByText('Status changed to Resolved.')).toBeInTheDocument()
    expect(screen.getByText('Bulb replaced')).toBeInTheDocument() // new history entry
  })

  it('shows a not-found message for a missing complaint', async () => {
    mockApi({
      '/api/meta/options': OPTIONS,
      '/api/complaints/99': () => ({ ok: false, status: 404, text: async () => JSON.stringify({ detail: 'Complaint 99 was not found.' }) }),
    })
    renderApp('/complaints/99')
    expect(await screen.findByText('Complaint not found')).toBeInTheDocument()
    expect(screen.getByText('Complaint 99 was not found.')).toBeInTheDocument()
  })

  it('video page rejects an unsupported file before uploading', async () => {
    const fetchMock = mockApi({
      '/api/meta/options': OPTIONS,
      '/api/complaints': { items: [], total: 0, limit: 200, offset: 0 },
      '/api/videos': [],
    })
    renderApp('/video-review')
    const input = await screen.findByLabelText('Video file')
    fireEvent.change(input, { target: { files: [new File(['hello'], 'notes.txt', { type: 'text/plain' })] } })
    expect(await screen.findByText(/video type is not supported/i)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /upload and analyse/i })).toBeDisabled()
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'POST')).toBe(false)
  })
})
