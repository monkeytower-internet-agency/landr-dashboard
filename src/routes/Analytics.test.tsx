import {
  render as rtlRender,
  screen,
  within,
  type RenderOptions,
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
    items: Array<{
      id: string
      date_range_start: string | null
      date_range_end: string | null
      selected_days: string[] | null
      products: { id: string; name: string } | null
    }>
  }
  // landr-ce45 — providers + booking_day_provider_assignments are queried
  // by the Analytics route for the "Revenue per staff" card. We route the
  // mock by table so each fetcher gets the right shape.
  // landr-1jgr — vouchers is queried for the "Voucher performance" card;
  // voucher redemptions reuse the bookings table with a .not(...) filter
  // so the bookings projection covers both reads.
  const state = {
    rows: [] as Row[],
    providers: [] as Array<{
      id: string
      operator_id: string
      display_name: string
      active: boolean
      sort_order: number
    }>,
    assignments: [] as Array<{
      id: string
      operator_id: string
      booking_id: string
      provider_id: string
      assignment_date: string
    }>,
    vouchers: [] as Array<{
      id: string
      operator_id: string
      code: string
      kind: 'percent' | 'flat'
      amount: number
      currency: string
      used_count: number
      max_uses: number | null
      active: boolean
    }>,
    error: null as { message: string } | null,
  }

  const channel: ChannelHandle = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation(() => channel)

  const fromBuilder = (table: string) => {
    const dataFor = () => {
      if (table === 'providers') return state.providers
      if (table === 'booking_day_provider_assignments') return state.assignments
      if (table === 'vouchers') return state.vouchers
      return state.rows
    }
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      not: vi.fn(() => builder),
      gte: vi.fn(() => builder),
      lte: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(async () => ({ data: dataFor(), error: state.error })),
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

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

// Stub ResizeObserver — recharts measures parent dimensions; JSDOM doesn't.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub

import { Analytics } from './Analytics'

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

beforeEach(() => {
  // Sample rows pinned to "today" so the default last-30 window includes them.
  const today = new Date()
  const iso = (offsetDays: number) => {
    const d = new Date(today.getTime() - offsetDays * 86_400_000)
    return d.toISOString()
  }
  mock.state.rows = [
    {
      id: 'b-1',
      created_at: iso(2),
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
          date_range_start: iso(0).slice(0, 10),
          date_range_end: iso(0).slice(0, 10),
          selected_days: null,
          products: { id: 'p-1', name: 'Tandem Flight' },
        },
      ],
    },
    {
      id: 'b-2',
      created_at: iso(5),
      current_semantic_state: 'finalised',
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
          date_range_start: iso(3).slice(0, 10),
          date_range_end: iso(3).slice(0, 10),
          selected_days: null,
          products: { id: 'p-2', name: 'Solo Course' },
        },
      ],
    },
    {
      id: 'b-3',
      created_at: iso(7),
      current_semantic_state: 'cancelled',
      gross_total: 500,
      currency: 'EUR',
      customer: {
        id: 'c-3',
        first_name: 'Carol',
        last_name: 'Cancelled',
        email: 'carol@example.com',
      },
      items: [],
    },
  ]
  mock.state.providers = []
  mock.state.assignments = []
  mock.state.vouchers = []
  mock.state.error = null
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Analytics route', () => {
  it('renders KPI cards computed from supabase rows', async () => {
    render(<Analytics />)

    // 3 total bookings including cancelled.
    const bookings = await screen.findByTestId('analytics-kpi-bookings')
    expect(within(bookings).getByText('3')).toBeInTheDocument()

    // Revenue excludes the 500 cancelled booking → 400.00 EUR.
    const revenue = screen.getByTestId('analytics-kpi-revenue')
    expect(within(revenue).getByText(/400\.00/)).toBeInTheDocument()

    // Average ticket = 400 / 2 = 200.00 EUR.
    const avg = screen.getByTestId('analytics-kpi-avg-ticket')
    expect(within(avg).getByText(/200\.00/)).toBeInTheDocument()
  })

  it('renders each chart panel and the funnel stages', async () => {
    render(<Analytics />)
    await screen.findByTestId('analytics-kpi-bookings')

    expect(screen.getByText(/revenue over time/i)).toBeInTheDocument()
    expect(screen.getByText(/bookings per product/i)).toBeInTheDocument()
    expect(screen.getByText(/conversion funnel/i)).toBeInTheDocument()
    expect(screen.getByText(/top customers/i)).toBeInTheDocument()
    expect(screen.getByText(/revenue per staff/i)).toBeInTheDocument()
    expect(screen.getByText(/voucher performance/i)).toBeInTheDocument()
    expect(screen.getByText(/occupancy heatmap/i)).toBeInTheDocument()

    // Funnel stages render their labels.
    expect(screen.getByTestId('funnel-stage-initiated')).toBeInTheDocument()
    expect(screen.getByTestId('funnel-stage-confirmed')).toBeInTheDocument()
    expect(screen.getByTestId('funnel-stage-completed')).toBeInTheDocument()
  })

  it('renders the top customers table with the highest spender first', async () => {
    render(<Analytics />)
    await screen.findByTestId('analytics-kpi-bookings')

    const table = screen.getByTestId('top-customers-table')
    // Bob has 250 revenue → first row.
    const rows = within(table).getAllByRole('row')
    expect(within(rows[1]).getByText(/Bob Brown/)).toBeInTheDocument()
    expect(within(rows[2]).getByText(/Alice Anderson/)).toBeInTheDocument()
  })

  it('switches range presets via the radio buttons', async () => {
    const user = userEvent.setup()
    render(<Analytics />)
    await screen.findByTestId('analytics-kpi-bookings')

    const last90 = screen.getByRole('radio', { name: /last 90 days/i })
    await user.click(last90)
    expect(last90).toHaveAttribute('aria-checked', 'true')

    // KPI cards stay rendered after the toggle.
    expect(screen.getByTestId('analytics-kpi-bookings')).toBeInTheDocument()
  })
})
