// landr-wwhn.11 — tests for the TicketBoard route.
//
// Covers:
//   - skeleton columns render while loading
//   - 5 columns render once data lands
//   - tickets grouped into correct columns
//   - error state renders error card
//   - blocked badge renders on blocked tickets
//   - read-mostly columns show "auto" label
//
// resolveTicketDrop (the pure DnD resolver) is unit-tested separately in
// src/lib/tickets-board.test.ts.

import {
  render as rtlRender,
  screen,
  waitFor,
  type RenderOptions,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { TicketRow } from '@/lib/tickets'

// ---- Supabase mock ----------------------------------------------------------

const { mock } = vi.hoisted(() => {
  type ChannelHandle = {
    on: ReturnType<typeof vi.fn>
    subscribe: ReturnType<typeof vi.fn>
  }

  const state = {
    rows: [] as TicketRow[],
    error: null as { message: string } | null,
  }
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
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({
        data: state.rows,
        error: state.error,
      })),
    })
    return builder
  }

  const supabase = {
    from: vi.fn(() => fromBuilder()),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
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

vi.mock('@/lib/operator', () => ({
  useOperator: vi.fn(() => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: vi.fn(),
    staffOperators: [],
    staffOperatorsLoading: false,
    viewAsActive: false,
    viewAsOperator: null,
    enterViewAs: vi.fn(),
    exitViewAs: vi.fn(),
    refreshOperators: vi.fn(),
  })),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: vi.fn(() => ({
    isEnabled: () => true,
    isLandrStaff: false,
    effectiveIsStaff: false,
    isLoading: false,
  })),
  EntitlementsProvider: ({ children }: { children: ReactElement }) => children,
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    warning: vi.fn(),
  },
  Toaster: () => null,
}))

import { TicketBoard } from './TicketBoard'
import { useOperator } from '@/lib/operator'
import { useEntitlements } from '@/lib/entitlements'

// ---- helpers ----------------------------------------------------------------

function render(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
    ...options,
  })
}

function makeTicket(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: `ticket-${Math.random().toString(36).slice(2)}`,
    context: 'operations',
    type: 'bug',
    title: 'Test ticket',
    body: null,
    status: 'backlog',
    priority: 'p2',
    perceived_impact: 'annoying',
    reporter_id: 'user-1',
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    moscow: null,
    origin_tier: null,
    origin_operator_label: null,
    created_at: '2026-05-24T10:00:00Z',
    updated_at: '2026-05-24T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---- board rendering --------------------------------------------------------

describe('TicketBoard rendering', () => {
  it('renders 5 skeleton columns while loading', () => {
    render(<TicketBoard />)
    const cols = [
      'backlog',
      'ready',
      'in_progress',
      'in_review',
      'done',
    ]
    for (const col of cols) {
      expect(
        screen.getByTestId(`ticket-board-column-skeleton-${col}`),
      ).toBeInTheDocument()
    }
  })

  it('renders 5 columns once data loads', async () => {
    mock.state.rows = [makeTicket({ status: 'backlog' })]
    render(<TicketBoard />)
    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-board-column-backlog'),
      ).toBeInTheDocument()
    })
    const cols = ['backlog', 'ready', 'in_progress', 'in_review', 'done']
    for (const col of cols) {
      expect(
        screen.getByTestId(`ticket-board-column-${col}`),
      ).toBeInTheDocument()
    }
  })

  it('places tickets in the correct column', async () => {
    const t1 = makeTicket({ id: 'tk-1', status: 'backlog' })
    const t2 = makeTicket({ id: 'tk-2', status: 'in_progress' })
    mock.state.rows = [t1, t2]
    render(<TicketBoard />)
    await waitFor(() => {
      expect(screen.getByTestId('ticket-card-tk-1')).toBeInTheDocument()
    })
    // tk-1 inside backlog column
    const backlogCol = screen.getByTestId('ticket-board-column-backlog')
    expect(backlogCol).toContainElement(screen.getByTestId('ticket-card-tk-1'))
    // tk-2 inside in_progress column
    const inProgressCol = screen.getByTestId(
      'ticket-board-column-in_progress',
    )
    expect(inProgressCol).toContainElement(screen.getByTestId('ticket-card-tk-2'))
  })

  it('renders an error card on fetch failure', async () => {
    mock.state.error = { message: 'DB gone' }
    render(<TicketBoard />)
    await waitFor(() => {
      expect(screen.getByText('Failed to load tickets')).toBeInTheDocument()
    })
    expect(screen.getByText('DB gone')).toBeInTheDocument()
  })

  it('renders blocked indicator on blocked tickets', async () => {
    const blocked = makeTicket({ id: 'tk-blocked', blocked: true })
    mock.state.rows = [blocked]
    render(<TicketBoard />)
    await waitFor(() => {
      // landr-7dya.3: blocked now renders as an icon in the status-icons row
      expect(
        screen.getByTestId('ticket-card-status-icons-tk-blocked'),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByTestId('card-status-blocked'),
    ).toBeInTheDocument()
  })

  it('does NOT render blocked indicator on non-blocked tickets', async () => {
    const ticket = makeTicket({ id: 'tk-ok', blocked: false })
    mock.state.rows = [ticket]
    render(<TicketBoard />)
    await waitFor(() => {
      expect(screen.getByTestId('ticket-card-tk-ok')).toBeInTheDocument()
    })
    // landr-7dya.3: non-blocked tickets have no blocked icon in status row
    expect(
      screen.queryByTestId('card-status-blocked'),
    ).not.toBeInTheDocument()
  })

  it('shows "auto" label on bd-authoritative columns', async () => {
    mock.state.rows = []
    render(<TicketBoard />)
    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-board-column-in_progress'),
      ).toBeInTheDocument()
    })
    // The "auto" label only appears on read-mostly columns
    const inProgressCol = screen.getByTestId(
      'ticket-board-column-in_progress',
    )
    expect(inProgressCol).toHaveTextContent('auto')
  })

  it('does NOT show "auto" label on human-owned columns', async () => {
    mock.state.rows = []
    render(<TicketBoard />)
    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-board-column-backlog'),
      ).toBeInTheDocument()
    })
    const backlogCol = screen.getByTestId('ticket-board-column-backlog')
    expect(backlogCol).not.toHaveTextContent('auto')
  })

  it('shows empty column message when column has no tickets', async () => {
    mock.state.rows = []
    render(<TicketBoard />)
    await waitFor(() => {
      expect(
        screen.getByTestId('ticket-board-column-empty-backlog'),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByTestId('ticket-board-column-empty-backlog'),
    ).toHaveTextContent('No tickets')
  })
})

// NOTE: resolveTicketDrop is a pure function exported from @/lib/tickets and
// is unit-tested in src/lib/tickets-board.test.ts (it was moved there out of
// the .tsx route to satisfy react-refresh/only-export-components).

// ---- operator filter (landr-wwhn.31) ----------------------------------------

const STAFF_OPS = [
  { id: 'op-alpha', slug: 'alpha', name: 'Alpha Travels' },
  { id: 'op-beta', slug: 'beta', name: 'Beta Outdoors' },
]

function asStaff() {
  vi.mocked(useOperator).mockReturnValue({
    operators: [
      { id: 'op-alpha', slug: 'alpha', name: 'Alpha Travels', onboarded_at: null },
    ],
    currentOperator: {
      id: 'op-alpha',
      slug: 'alpha',
      name: 'Alpha Travels',
      onboarded_at: null,
    },
    currentOperatorId: 'op-alpha',
    loading: false,
    switchOperator: vi.fn(),
    staffOperators: STAFF_OPS,
    staffOperatorsLoading: false,
    viewAsActive: false,
    viewAsOperator: null,
    enterViewAs: vi.fn(),
    exitViewAs: vi.fn(),
    refreshOperators: vi.fn(),
  })
  vi.mocked(useEntitlements).mockReturnValue({
    isEnabled: () => true,
    isLandrStaff: true,
    effectiveIsStaff: true,
    isLoading: false,
  })
}

describe('TicketBoard — operator filter (landr-wwhn.31)', () => {
  it('does NOT render operator filter bar for non-staff', async () => {
    mock.state.rows = []
    render(<TicketBoard />)
    await waitFor(() => {
      expect(screen.getByTestId('ticket-board-column-backlog')).toBeInTheDocument()
    })
    expect(
      screen.queryByTestId('ticket-board-operator-filter'),
    ).not.toBeInTheDocument()
  })

  it('renders operator filter bar for staff with staffOperators', async () => {
    asStaff()
    mock.state.rows = []
    render(<TicketBoard />)
    await waitFor(() => {
      expect(screen.getByTestId('ticket-board-column-backlog')).toBeInTheDocument()
    })
    expect(
      screen.getByTestId('ticket-board-operator-filter'),
    ).toBeInTheDocument()
    for (const op of STAFF_OPS) {
      expect(
        screen.getByTestId(`ticket-operator-filter-${op.id}`),
      ).toBeInTheDocument()
    }
  })

  it('does NOT show Clear button when no operator is selected', async () => {
    asStaff()
    mock.state.rows = []
    render(<TicketBoard />)
    await waitFor(() => {
      expect(screen.getByTestId('ticket-board-column-backlog')).toBeInTheDocument()
    })
    expect(
      screen.queryByTestId('ticket-operator-filter-clear'),
    ).not.toBeInTheDocument()
  })
})
