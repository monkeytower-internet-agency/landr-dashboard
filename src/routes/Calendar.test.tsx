import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

type ChannelHandle = {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

type Row = {
  id: string
  created_at: string
  current_semantic_state: string
  gross_total: number
  currency: string
  customer: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
  } | null
  items: Array<{
    id: string
    date_range_start: string | null
    date_range_end: string | null
    selected_days: string[] | null
    products: { id: string; name: string } | null
  }>
}

const { mock } = vi.hoisted(() => {
  const state = {
    rows: [] as Row[],
    error: null as { message: string } | null,
    updateError: null as { message: string } | null,
    lastUpdate: null as {
      table: string
      values: Record<string, unknown>
      eqColumn: string
      eqValue: string
    } | null,
  }

  const channel: ChannelHandle = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation(() => channel)

  // Build a thenable-or-chainable result for a write path. The
  // .eq() in the update chain (`.update(values).eq('id', x)`) should
  // resolve to {data,error}; for reads it must stay chainable.
  const fromBuilder = (table: string) => {
    type Mode = 'read' | 'update'
    let mode: Mode = 'read'
    let updateValues: Record<string, unknown> | null = null

    const builder: Record<string, unknown> = { __table: table }

    const readResult = () => ({ data: state.rows, error: state.error })

    const eqFn = (col: string, value: string) => {
      if (mode === 'update') {
        state.lastUpdate = {
          table,
          values: updateValues ?? {},
          eqColumn: col,
          eqValue: value,
        }
        const result = { data: null, error: state.updateError }
        // Reset for safety on subsequent calls
        mode = 'read'
        updateValues = null
        // Return a thenable so `await supabase.from().update().eq()` works
        return {
          then: (onFulfilled: (v: typeof result) => unknown) =>
            Promise.resolve(result).then(onFulfilled),
        }
      }
      return builder
    }

    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(eqFn),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => readResult()),
      update: vi.fn((values: Record<string, unknown>) => {
        mode = 'update'
        updateValues = values
        return builder
      }),
    })
    return builder
  }

  const supabase = {
    from: vi.fn((table: string) => fromBuilder(table)),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  }
  return { mock: { state, supabase, channel } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

// landr-1lj — Calendar now reads useAuth() inside useBookingsFilters().
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-test' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  // landr-f1s — Calendar.tsx now also calls useOperatorCalendarPrefs().
  useOperatorCalendarPrefs: () => ({
    workHoursStart: '08:00',
    workHoursEnd: '20:00',
    hour12: false,
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

import { Calendar } from './Calendar'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

const today = new Date()
const isoDay = (offsetDays: number) => {
  const d = new Date(today)
  d.setDate(d.getDate() + offsetDays)
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

const sampleRows: Row[] = [
  {
    id: 'b-1111111111',
    created_at: `${isoDay(0)}T10:30:00.000Z`,
    current_semantic_state: 'confirmed',
    gross_total: 150,
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Alice',
      last_name: 'Anderson',
      email: 'alice@example.com',
    },
    items: [
      {
        id: 'i-1',
        date_range_start: isoDay(2),
        date_range_end: isoDay(2),
        selected_days: null,
        products: { id: 'p-1', name: 'Tandem Flight' },
      },
    ],
  },
  {
    id: 'b-2222222222',
    created_at: `${isoDay(1)}T09:00:00.000Z`,
    current_semantic_state: 'pending',
    gross_total: 250,
    currency: 'EUR',
    customer: {
      id: 'c-2',
      first_name: 'Bob',
      last_name: 'Brown',
      email: 'bob@example.com',
    },
    items: [
      {
        id: 'i-2',
        date_range_start: isoDay(5),
        date_range_end: isoDay(5),
        selected_days: null,
        products: { id: 'p-2', name: 'Solo Course' },
      },
    ],
  },
]

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
  mock.state.updateError = null
  mock.state.lastUpdate = null
  // landr-39nw — default view is `timeGridWeek` (landr-1lj), which clips
  // sample bookings that fall outside the current week. Force month view
  // before each test so the fixtures (isoDay(2) + isoDay(5)) always land
  // inside the rendered range regardless of what weekday "today" is.
  window.localStorage.setItem(
    'landr.dashboard.calendarView.op-1',
    'dayGridMonth',
  )
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Calendar route', () => {
  it('renders calendar events from supabase rows', async () => {
    mock.state.rows = sampleRows
    render(<Calendar />)

    await waitFor(() => {
      const events = screen.getAllByTestId('booking-event')
      expect(events.length).toBeGreaterThanOrEqual(2)
    })

    const events = screen.getAllByTestId('booking-event')
    const titles = events.map((el) => el.textContent ?? '')
    expect(titles.some((t) => t.includes('Alice Anderson'))).toBe(true)
    expect(titles.some((t) => t.includes('Bob Brown'))).toBe(true)
    expect(titles.some((t) => t.includes('Tandem Flight'))).toBe(true)
    expect(titles.some((t) => t.includes('Solo Course'))).toBe(true)
  })

  it('color-codes events by booking semantic state', async () => {
    mock.state.rows = sampleRows
    render(<Calendar />)

    await waitFor(() => {
      const events = screen.getAllByTestId('booking-event')
      expect(events.length).toBeGreaterThanOrEqual(2)
    })

    const events = screen.getAllByTestId('booking-event')
    const states = new Set(events.map((el) => el.getAttribute('data-state')))
    expect(states.has('confirmed')).toBe(true)
    expect(states.has('pending')).toBe(true)
  })

  it('switches between month/week/day views via toolbar', async () => {
    mock.state.rows = sampleRows
    const user = userEvent.setup()
    render(<Calendar />)

    await waitFor(() => {
      expect(screen.getAllByTestId('booking-event').length).toBeGreaterThan(0)
    })

    const tablist = screen.getByRole('tablist')
    const week = within(tablist).getByRole('tab', { name: 'Week' })
    await user.click(week)
    expect(week).toHaveAttribute('aria-selected', 'true')

    const day = within(tablist).getByRole('tab', { name: 'Day' })
    await user.click(day)
    expect(day).toHaveAttribute('aria-selected', 'true')

    const month = within(tablist).getByRole('tab', { name: 'Month' })
    await user.click(month)
    expect(month).toHaveAttribute('aria-selected', 'true')
  })

  it('opens booking detail sheet on event click', async () => {
    mock.state.rows = sampleRows
    const user = userEvent.setup()
    render(<Calendar />)

    await waitFor(() => {
      expect(screen.getAllByTestId('booking-event').length).toBeGreaterThan(0)
    })

    const alice = screen
      .getAllByTestId('booking-event')
      .find((el) => (el.textContent ?? '').includes('Alice Anderson'))!
    await user.click(alice)

    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByLabelText(/first name/i)).toHaveValue('Alice')
    expect(within(dialog).getByLabelText(/last name/i)).toHaveValue('Anderson')
    expect(within(dialog).getByText(/Tandem Flight/i)).toBeInTheDocument()
  })

  it('shows an error card when the bookings query fails', async () => {
    mock.state.error = { message: 'boom' }
    render(<Calendar />)

    await screen.findByText(/failed to load calendar/i)
    expect(screen.getByText(/boom/i)).toBeInTheDocument()
  })

  // landr-s1mr — friendly empty-state card when the operator has no bookings.
  it('renders the shared EmptyState card when there are zero bookings', async () => {
    mock.state.rows = []
    render(<Calendar />)

    const empty = await screen.findByTestId('calendar-empty-state')
    expect(empty).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /no bookings to show/i }),
    ).toBeInTheDocument()
    // Calendar grid suppressed when the empty state shows.
    expect(screen.queryAllByTestId('booking-event').length).toBe(0)
  })

  it('subscribes to realtime updates on both bookings and booking_products', async () => {
    mock.state.rows = sampleRows
    render(<Calendar />)

    await waitFor(() => {
      expect(mock.supabase.channel).toHaveBeenCalled()
    })
    const tables = mock.channel.on.mock.calls.map(
      (call) => (call[1] as { table: string }).table,
    )
    expect(tables).toContain('bookings')
    expect(tables).toContain('booking_products')
  })
})

// landr-nnbm — rescheduleBookingItem now routes through FastAPI's
// PATCH /api/staff/bookings/{id}/products/{lineId} (pricing re-runs server
// side, per the write-routing convention). The helper used to write
// booking_products directly via supabase; that path is dead — these tests
// guard the new path by stubbing fetch and asserting URL + body.
describe('rescheduleBookingItem helper', () => {
  beforeEach(() => {
    // Supabase auth is reached by the api-client when minting the bearer.
    // Provide a session so the helper doesn't bail with AuthExpiredError.
    ;(mock.supabase as unknown as {
      auth?: { getSession: () => Promise<unknown> }
    }).auth = {
      getSession: async () => ({
        data: { session: { access_token: 'test-token' } },
      }),
    }
  })

  it('PATCHes /bookings/{id}/products/{lineId} with date_range_start/date_range_end', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({}), { status: 200 }),
    )
    vi.stubGlobal('fetch', fetchSpy)
    const { rescheduleBookingItem } = await import('@/lib/bookings')
    await rescheduleBookingItem({
      bookingId: 'b-1',
      itemId: 'i-1',
      startDate: '2026-06-01',
      endDate: '2026-06-03',
    })
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, opts] = fetchSpy.mock.calls[0] as unknown as [
      string,
      RequestInit,
    ]
    expect(url).toContain('/api/staff/bookings/b-1/products/i-1')
    expect(opts.method).toBe('PATCH')
    const body = JSON.parse(opts.body as string)
    expect(body).toEqual({
      date_range_start: '2026-06-01',
      date_range_end: '2026-06-03',
    })
    vi.unstubAllGlobals()
  })

  it('propagates server errors', async () => {
    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ detail: 'permission denied' }), {
        status: 403,
      }),
    )
    vi.stubGlobal('fetch', fetchSpy)
    const { rescheduleBookingItem } = await import('@/lib/bookings')
    await expect(
      rescheduleBookingItem({
        bookingId: 'b-1',
        itemId: 'i-1',
        startDate: '2026-06-01',
        endDate: null,
      }),
    ).rejects.toThrow(/permission denied/i)
    vi.unstubAllGlobals()
  })
})
