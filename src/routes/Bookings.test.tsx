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
  }
  return { mock: { state, supabase, channel, realtimeHandlers } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

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
    expect(screen.getByText('Bob Brown')).toBeInTheDocument()
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

  it('shows an error card when the query fails', async () => {
    mock.state.error = { message: 'boom' }
    render(<Bookings />)

    await screen.findByText(/failed to load bookings/i)
    expect(screen.getByText(/boom/i)).toBeInTheDocument()
  })
})
