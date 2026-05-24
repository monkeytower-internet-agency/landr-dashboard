// landr-wwhn.23 — tests for the TicketPlanning route.
//
// Covers:
//   - Skeleton renders while loading
//   - 5 MoSCoW buckets render once data lands
//   - Tickets grouped into correct buckets
//   - Feature filter shows only feature tickets (default)
//   - Staff sees picker; operator sees read-only badge
//   - Read-only banner shown to operators
//   - Empty all-tickets state

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
    ticketRows: [] as TicketRow[],
    ticketsError: null as { message: string } | null,
    publicUser: null as { id: string; email: string | null; is_landr_staff: boolean } | null,
  }

  const channel: ChannelHandle = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation((_type, _filter, _cb) => channel)

  // fromBuilder returns different data depending on the table name.
  const makeBuilder = (table: string) => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      order: vi.fn(() => builder),
      maybeSingle: vi.fn(async () => {
        if (table === 'users') {
          return { data: state.publicUser, error: null }
        }
        return { data: null, error: null }
      }),
      limit: vi.fn(async () => {
        if (table === 'users') {
          return {
            data: state.publicUser ? [state.publicUser] : [],
            error: null,
          }
        }
        return { data: state.ticketRows, error: state.ticketsError }
      }),
    })
    return builder
  }

  const supabase = {
    from: vi.fn((table: string) => makeBuilder(table)),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  }

  return { mock: { state, supabase, channel } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ user: { id: 'auth-uid-1' } })),
  AuthProvider: ({ children }: { children: ReactElement }) => children,
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'test', name: 'Test Operator' }],
    currentOperator: { id: 'op-1', slug: 'test', name: 'Test Operator' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
  Toaster: () => null,
}))

// ---- Helpers ----------------------------------------------------------------

function makeTicket(
  overrides: Partial<TicketRow> & Pick<TicketRow, 'id' | 'title'>,
): TicketRow {
  return {
    context: 'operations',
    type: 'feature',
    body: null,
    status: 'backlog',
    priority: 'p2',
    perceived_impact: 'idea',
    reporter_id: null,
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    moscow: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  }
}

function render(ui: ReactElement, options?: RenderOptions) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={qc}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
    ...options,
  })
}

// ---- Tests ------------------------------------------------------------------

describe('TicketPlanning', () => {
  beforeEach(() => {
    mock.state.ticketRows = []
    mock.state.ticketsError = null
    mock.state.publicUser = null
    mock.supabase.from.mockClear()
  })

  afterEach(() => {
    vi.clearAllMocks()
  })

  it('renders skeleton while loading', async () => {
    const { default: TicketPlanning } = await import('./TicketPlanning')
    render(<TicketPlanning />)
    expect(screen.getByTestId('planning-skeleton-0')).toBeInTheDocument()
  })

  it('renders 5 MoSCoW buckets once data lands', async () => {
    mock.state.ticketRows = [
      makeTicket({ id: 't1', title: 'Must ticket', moscow: 'must' }),
      makeTicket({ id: 't2', title: 'Unplanned ticket', moscow: null }),
    ]
    const { default: TicketPlanning } = await import('./TicketPlanning')
    render(<TicketPlanning />)
    await waitFor(() => {
      expect(screen.getByTestId('planning-section-must')).toBeInTheDocument()
      expect(screen.getByTestId('planning-section-should')).toBeInTheDocument()
      expect(screen.getByTestId('planning-section-could')).toBeInTheDocument()
      expect(screen.getByTestId('planning-section-wont')).toBeInTheDocument()
      expect(screen.getByTestId('planning-section-unplanned')).toBeInTheDocument()
    })
  })

  it('groups tickets into correct buckets', async () => {
    mock.state.ticketRows = [
      makeTicket({ id: 't1', title: 'Must feature', moscow: 'must' }),
      makeTicket({ id: 't2', title: 'Could feature', moscow: 'could' }),
      makeTicket({ id: 't3', title: 'Unplanned feature', moscow: null }),
    ]
    const { default: TicketPlanning } = await import('./TicketPlanning')
    render(<TicketPlanning />)
    await waitFor(() => {
      const mustSection = screen.getByTestId('planning-section-must')
      expect(mustSection).toHaveTextContent('Must feature')
      const couldSection = screen.getByTestId('planning-section-could')
      expect(couldSection).toHaveTextContent('Could feature')
      const unplannedSection = screen.getByTestId('planning-section-unplanned')
      expect(unplannedSection).toHaveTextContent('Unplanned feature')
    })
  })

  it('shows read-only banner for non-staff operators', async () => {
    mock.state.ticketRows = [makeTicket({ id: 't1', title: 'Feature A' })]
    mock.state.publicUser = { id: 'u1', email: 'op@test.com', is_landr_staff: false }
    const { default: TicketPlanning } = await import('./TicketPlanning')
    render(<TicketPlanning />)
    await waitFor(() => {
      expect(screen.getByTestId('planning-readonly-banner')).toBeInTheDocument()
    })
  })

  it('shows picker for staff user', async () => {
    mock.state.ticketRows = [makeTicket({ id: 't1', title: 'Feature A' })]
    mock.state.publicUser = { id: 'u1', email: 'olaf@landr.de', is_landr_staff: true }
    const { default: TicketPlanning } = await import('./TicketPlanning')
    render(<TicketPlanning />)
    await waitFor(() => {
      expect(screen.getByTestId('planning-row-picker-t1')).toBeInTheDocument()
    })
  })

  it('renders empty state when no tickets exist', async () => {
    mock.state.ticketRows = []
    const { default: TicketPlanning } = await import('./TicketPlanning')
    render(<TicketPlanning />)
    await waitFor(() => {
      expect(screen.getByTestId('planning-empty-all')).toBeInTheDocument()
    })
  })

  it('filters to feature tickets only by default', async () => {
    mock.state.ticketRows = [
      makeTicket({ id: 't1', title: 'Feature ticket', type: 'feature', moscow: null }),
      makeTicket({ id: 't2', title: 'Bug ticket', type: 'bug', moscow: null }),
    ]
    const { default: TicketPlanning } = await import('./TicketPlanning')
    render(<TicketPlanning />)
    await waitFor(() => {
      expect(screen.getByTestId('planning-buckets')).toBeInTheDocument()
    })
    // Bug ticket should not appear when filter is 'feature' (default)
    expect(screen.queryByTestId('planning-row-t2')).not.toBeInTheDocument()
    // Feature ticket should appear in unplanned
    expect(screen.getByTestId('planning-row-t1')).toBeInTheDocument()
  })
})
