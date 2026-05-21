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

const { mock } = vi.hoisted(() => {
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
    items: Array<{ id: string; products: { id: string; name: string } | null }>
  }
  const state = { rows: [] as Row[], error: null as { message: string } | null }
  const realtimeHandlers: Array<(payload: Record<string, unknown>) => void> = []

  const channel: ChannelHandle = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation((_type, _filter, cb) => {
    realtimeHandlers.push(cb)
    return channel
  })

  const fromBuilder = () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: state.rows, error: state.error })),
    })
    return builder
  }

  const supabase = {
    from: vi.fn(() => fromBuilder()),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    // landr-vaob — api-client.getBearerToken() reads the session before
    // every fetch; provide a stable test token so the bulk-reminder path
    // can mount without an AuthProvider.
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  }
  return { mock: { state, supabase, channel, realtimeHandlers } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

// landr-vaob — capture sonner toast calls so we can assert the bulk
// reminder toast distinguishes success / partial / total failure.
const { toastCalls } = vi.hoisted(() => ({
  toastCalls: {
    success: [] as Array<{ message: unknown; options?: unknown }>,
    warning: [] as Array<{ message: unknown; options?: unknown }>,
    error: [] as Array<{ message: unknown; options?: unknown }>,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((message: unknown, options?: unknown) => {
      toastCalls.success.push({ message, options })
    }),
    warning: vi.fn((message: unknown, options?: unknown) => {
      toastCalls.warning.push({ message, options })
    }),
    error: vi.fn((message: unknown, options?: unknown) => {
      toastCalls.error.push({ message, options })
    }),
  },
  Toaster: () => null,
}))

// Stub window.fetch — bulkSendReminder posts to the FastAPI bulk-reminder
// endpoint via the centralised api() wrapper.
const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

// landr-1lj — Bookings now reads useAuth() inside useBookingsFilters().
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
  // landr-f1s — BookingsTable now reads calendar prefs.
  useOperatorCalendarPrefs: () => ({
    workHoursStart: '08:00',
    workHoursEnd: '20:00',
    hour12: false,
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

import { Bookings } from './Bookings'

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

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
  mock.realtimeHandlers.length = 0
  fetchSpy.mockReset()
  toastCalls.success.length = 0
  toastCalls.warning.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

const sampleRows = [
  {
    id: 'b-1111111111',
    created_at: '2026-05-12T10:30:00.000Z',
    current_semantic_state: 'confirmed',
    gross_total: 150,
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Alice',
      last_name: 'Anderson',
      email: 'alice@example.com',
    },
    items: [{ id: 'i-1', products: { id: 'p-1', name: 'Tandem Flight' } }],
  },
  {
    id: 'b-2222222222',
    created_at: '2026-05-13T09:00:00.000Z',
    current_semantic_state: 'pending',
    gross_total: 250,
    currency: 'EUR',
    customer: {
      id: 'c-2',
      first_name: 'Bob',
      last_name: 'Brown',
      email: 'bob@example.com',
    },
    items: [{ id: 'i-2', products: { id: 'p-2', name: 'Solo Course' } }],
  },
]

describe('Bookings route', () => {
  it('renders rows fetched from supabase', async () => {
    mock.state.rows = sampleRows
    render(<Bookings />)

    await screen.findByText('Alice Anderson')
    expect(screen.getByText('Bob Brown')).toBeInTheDocument()
    expect(screen.getByText('Tandem Flight')).toBeInTheDocument()
    expect(screen.getByText('Solo Course')).toBeInTheDocument()
  })

  it('filters rows via the global search input', async () => {
    mock.state.rows = sampleRows
    const user = userEvent.setup()
    render(<Bookings />)

    await screen.findByText('Alice Anderson')
    await user.type(screen.getByLabelText(/search bookings/i), 'Bob')

    await waitFor(() =>
      expect(screen.queryByText('Alice Anderson')).not.toBeInTheDocument(),
    )
    // landr-11d5 — the matching substring is wrapped in a yellow <mark>,
    // so 'Bob Brown' is split across nodes. Assert via the <mark>.
    const bobMark = Array.from(document.querySelectorAll('mark')).find(
      (m) => m.textContent === 'Bob',
    )
    expect(bobMark).toBeDefined()
    expect(bobMark?.className).toContain('bg-yellow-200/40')
    expect(bobMark?.parentElement?.textContent).toBe('Bob Brown')
  })

  it('opens the booking detail sheet when a row is clicked', async () => {
    mock.state.rows = sampleRows
    const user = userEvent.setup()
    render(<Bookings />)

    // Clicking the customer name itself opens the customer overlay (m05.27)
    // instead of the booking sheet, so click the product cell to open the row.
    const cell = await screen.findByText('Tandem Flight')
    await user.click(cell)

    const dialog = await screen.findByRole('dialog')
    // Product appears as the line-item heading inside the dialog
    expect(
      within(dialog).getAllByText(/Tandem Flight/i).length,
    ).toBeGreaterThan(0)
    // Customer first/last name appear as editable input values
    expect(within(dialog).getByLabelText(/first name/i)).toHaveValue('Alice')
    expect(within(dialog).getByLabelText(/last name/i)).toHaveValue('Anderson')
  })

  it('subscribes to realtime updates on the bookings table', async () => {
    mock.state.rows = sampleRows
    render(<Bookings />)

    await screen.findByText('Alice Anderson')
    expect(mock.supabase.channel).toHaveBeenCalled()
    expect(mock.channel.on).toHaveBeenCalledWith(
      'postgres_changes',
      expect.objectContaining({
        table: 'bookings',
        filter: 'operator_id=eq.op-1',
      }),
      expect.any(Function),
    )
  })

  // ---- landr-lbbj ------------------------------------------------------

  it('bulk toolbar is hidden until a row is selected', async () => {
    mock.state.rows = sampleRows
    render(<Bookings />)

    await screen.findByText('Alice Anderson')
    expect(
      screen.queryByTestId('bookings-bulk-toolbar'),
    ).not.toBeInTheDocument()
  })

  it('selecting a row reveals the bulk toolbar with the correct count', async () => {
    mock.state.rows = sampleRows
    const user = userEvent.setup()
    render(<Bookings />)

    await screen.findByText('Alice Anderson')
    await user.click(screen.getByTestId('bookings-select-b-1111111111'))

    expect(screen.getByTestId('bookings-bulk-toolbar')).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()
    // Bookings page exposes export-csv + send-reminder only.
    expect(
      screen.getByTestId('bookings-bulk-toolbar-export-csv'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('bookings-bulk-toolbar-send-reminder'),
    ).toBeInTheDocument()
    expect(
      screen.queryByTestId('bookings-bulk-toolbar-approve'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('bookings-bulk-toolbar-reject'),
    ).not.toBeInTheDocument()
  })

  it('select-all toggles every visible row', async () => {
    mock.state.rows = sampleRows
    const user = userEvent.setup()
    render(<Bookings />)

    await screen.findByText('Alice Anderson')
    await user.click(screen.getByTestId('bookings-select-all'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  // ---- landr-vaob (bulk-reminder wiring) ------------------------------

  it('bulk-send-reminder POSTs to the bulk-reminder endpoint and surfaces a success toast', async () => {
    mock.state.rows = sampleRows
    fetchSpy.mockImplementation(
      async () =>
        new Response(JSON.stringify({ sent: 2, failed: [] }), { status: 200 }),
    )
    const user = userEvent.setup()
    render(<Bookings />)

    await screen.findByText('Alice Anderson')
    await user.click(screen.getByTestId('bookings-select-all'))
    await user.click(screen.getByTestId('bookings-bulk-toolbar-send-reminder'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/operators/op-1/bookings/bulk-reminder')
    expect(opts.method).toBe('POST')
    const body = JSON.parse(opts.body as string) as { booking_ids: string[] }
    expect(body.booking_ids).toEqual(
      expect.arrayContaining(['b-1111111111', 'b-2222222222']),
    )

    await waitFor(() => expect(toastCalls.success).toHaveLength(1))
    expect(String(toastCalls.success[0].message)).toBe('2 reminders sent')
  })

  it('bulk-send-reminder surfaces a partial-failure toast when failed[] is non-empty', async () => {
    mock.state.rows = sampleRows
    fetchSpy.mockImplementation(
      async () =>
        new Response(
          JSON.stringify({ sent: 1, failed: ['b-2222222222'] }),
          { status: 200 },
        ),
    )
    const user = userEvent.setup()
    render(<Bookings />)

    await screen.findByText('Alice Anderson')
    await user.click(screen.getByTestId('bookings-select-all'))
    await user.click(screen.getByTestId('bookings-bulk-toolbar-send-reminder'))

    await waitFor(() => expect(toastCalls.warning).toHaveLength(1))
    expect(String(toastCalls.warning[0].message)).toBe('1 sent, 1 failed')
    expect(toastCalls.success).toHaveLength(0)
  })

  it('shows an error card when the query fails', async () => {
    mock.state.error = { message: 'boom' }
    render(<Bookings />)

    await screen.findByText(/failed to load bookings/i)
    expect(screen.getByText(/boom/i)).toBeInTheDocument()
  })

  // landr-s1mr — friendly empty-state card surfaces when there are zero
  // bookings (the filter chrome + empty table is suppressed).
  it('renders the shared EmptyState card when the operator has zero bookings', async () => {
    mock.state.rows = []
    render(<Bookings />)

    const empty = await screen.findByTestId('bookings-empty-state')
    expect(empty).toBeInTheDocument()
    expect(
      screen.getByRole('heading', { name: /no bookings yet/i }),
    ).toBeInTheDocument()
    // The filter search input should be hidden (no rows to filter).
    expect(screen.queryByLabelText(/search bookings/i)).not.toBeInTheDocument()
  })
})
