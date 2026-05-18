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
  const state = { rows: [] as Row[], error: null as { message: string } | null }

  const channel: ChannelHandle = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation(() => channel)

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

// Stub ResizeObserver — recharts measures parent dimensions and JSDOM
// doesn't ship it. ChartContainer's ResponsiveContainer falls back to
// initialDimension when measurement returns 0x0, so we don't need real
// numbers; we just need the constructor to exist.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  ResizeObserverStub

import { Reporting } from './Reporting'

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
  mock.state.rows = []
  mock.state.error = null
})

afterEach(() => {
  vi.clearAllMocks()
})

const sampleRows = [
  {
    id: 'b-1',
    created_at: '2026-05-01T10:00:00.000Z',
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
        date_range_start: '2026-05-04',
        date_range_end: '2026-05-04',
        selected_days: null,
        products: { id: 'p-1', name: 'Tandem Flight' },
      },
    ],
  },
  {
    id: 'b-2',
    created_at: '2026-05-02T10:00:00.000Z',
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
        date_range_start: '2026-05-11',
        date_range_end: '2026-05-11',
        selected_days: null,
        products: { id: 'p-2', name: 'Solo Course' },
      },
    ],
  },
  {
    id: 'b-3',
    created_at: '2026-05-03T10:00:00.000Z',
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

describe('Reporting route', () => {
  it('renders KPI cards computed from supabase rows', async () => {
    mock.state.rows = sampleRows
    render(<Reporting />)

    // Bookings count includes cancelled.
    const bookings = await screen.findByTestId('kpi-bookings')
    expect(within(bookings).getByText('3')).toBeInTheDocument()

    // Revenue excludes the 500 cancelled booking -> 400.00 EUR.
    const revenue = screen.getByTestId('kpi-revenue')
    expect(within(revenue).getByText(/400\.00/)).toBeInTheDocument()

    // Average ticket = 400 / 2 = 200.00 EUR.
    const avg = screen.getByTestId('kpi-avg-ticket')
    expect(within(avg).getByText(/200\.00/)).toBeInTheDocument()
  })

  it('shows the cancelled-excluded footnote when cancelled bookings exist', async () => {
    mock.state.rows = sampleRows
    render(<Reporting />)

    await screen.findByTestId('kpi-bookings')
    expect(screen.getByText(/1 cancelled booking/i)).toBeInTheDocument()
  })

  it('triggers a CSV download with the operator bookings', async () => {
    mock.state.rows = sampleRows

    // Spy on URL.createObjectURL + anchor click to confirm we exported.
    const createUrl = vi.fn((_blob: Blob) => 'blob:stub')
    const revokeUrl = vi.fn((_url: string) => {})
    // jsdom provides URL but not createObjectURL.
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createUrl,
    })
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeUrl,
    })

    const user = userEvent.setup()
    render(<Reporting />)

    const exportBtn = await screen.findByRole('button', {
      name: /export csv/i,
    })
    await user.click(exportBtn)

    expect(createUrl).toHaveBeenCalledTimes(1)
    const blobArg = createUrl.mock.calls[0]?.[0]
    expect(blobArg).toBeInstanceOf(Blob)
    expect(blobArg?.type).toContain('text/csv')
  })

  it('disables the export button when there are no rows in range', async () => {
    mock.state.rows = []
    render(<Reporting />)

    const exportBtn = await screen.findByRole('button', {
      name: /export csv/i,
    })
    expect(exportBtn).toBeDisabled()
  })

  it('renders chart panels (verifying ChartContainer mounts)', async () => {
    mock.state.rows = sampleRows
    render(<Reporting />)

    await screen.findByTestId('kpi-bookings')
    expect(
      screen.getByText(/revenue over time/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/bookings per week/i)).toBeInTheDocument()
  })

  it('renders the Holded sync deferred notice', async () => {
    mock.state.rows = sampleRows
    render(<Reporting />)

    await screen.findByTestId('kpi-bookings')
    expect(
      screen.getByText(/Holded sync runs automatically/i),
    ).toBeInTheDocument()
  })
})
