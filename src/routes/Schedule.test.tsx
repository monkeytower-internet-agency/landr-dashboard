import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

type AvailabilityFixture = {
  id: string
  operator_id: string
  product_id: string
  date: string
  start_time: string | null
  end_time: string | null
  capacity: number
  capacity_reserved: number
  status: 'open' | 'closed' | 'fully_booked'
  source: 'template' | 'manual'
  source_template_id: string | null
  notes: string | null
  created_at: string
  updated_at: string
}

type ProductFixture = {
  id: string
  name: string
  duration_kind: 'single_day' | 'date_range' | 'time_slot'
}

const { mock } = vi.hoisted(() => {
  const state = {
    products: [] as ProductFixture[],
    rows: [] as AvailabilityFixture[],
    bulkCalls: [] as Array<{
      operatorId: string
      productId: string
      payload: Record<string, unknown>
    }>,
    patchCalls: [] as Array<{ id: string; payload: Record<string, unknown> }>,
    deleteCalls: [] as string[],
    createCalls: [] as Array<Record<string, unknown>>,
  }
  return { mock: { state } }
})

vi.mock('@/lib/availability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/availability')>()
  return {
    ...actual,
    fetchSchedulableProducts: vi.fn(async () => mock.state.products),
    fetchAvailability: vi.fn(async () => mock.state.rows),
    bulkCreateAvailability: vi.fn(
      async (
        operatorId: string,
        productId: string,
        payload: Record<string, unknown>,
      ) => {
        mock.state.bulkCalls.push({ operatorId, productId, payload })
        return { inserted: 5, rows: [] }
      },
    ),
    patchAvailability: vi.fn(
      async (id: string, payload: Record<string, unknown>) => {
        mock.state.patchCalls.push({ id, payload })
        return {
          ...(mock.state.rows.find((r) => r.id === id) ?? mock.state.rows[0]),
          ...payload,
        }
      },
    ),
    deleteAvailability: vi.fn(async (id: string) => {
      mock.state.deleteCalls.push(id)
    }),
    createAvailability: vi.fn(async (_op, _prod, payload) => {
      mock.state.createCalls.push(payload)
      return {
        id: 'avail-new',
        operator_id: 'op-1',
        product_id: 'prod-1',
        date: payload.date,
        start_time: null,
        end_time: null,
        capacity: payload.capacity,
        capacity_reserved: 0,
        status: payload.capacity === 0 ? 'closed' : 'open',
        source: 'manual',
        source_template_id: null,
        notes: null,
        created_at: '2026-05-19T12:00:00.000Z',
        updated_at: '2026-05-19T12:00:00.000Z',
      }
    }),
  }
})

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactNode }) => children,
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'user-1', email: 'staff@operator.example' },
    loading: false,
    signOut: async () => {},
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

const { toastCalls } = vi.hoisted(() => ({
  toastCalls: { success: [] as string[], error: [] as string[] },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((msg: string) => {
      toastCalls.success.push(msg)
    }),
    error: vi.fn((msg: string) => {
      toastCalls.error.push(msg)
    }),
  },
  Toaster: () => null,
}))

// FullCalendar is heavy DOM; stub it out so we test the route's wiring.
vi.mock('@/components/schedule/AvailabilityCalendar', () => ({
  AvailabilityCalendar: ({
    rows,
    onDayClick,
    onRangeSelect,
  }: {
    rows: AvailabilityFixture[]
    onDayClick?: (
      summary: { date: string; capacity: number } | null,
      date: string,
    ) => void
    onRangeSelect?: (fromDate: string, toDate: string) => void
  }) => (
    <div data-testid="availability-calendar">
      <span data-testid="row-count">{rows.length}</span>
      <button
        type="button"
        data-testid="trigger-day-click"
        onClick={() =>
          onDayClick?.(
            rows[0]
              ? { date: rows[0].date, capacity: rows[0].capacity }
              : null,
            rows[0]?.date ?? '2026-06-15',
          )
        }
      >
        day-click
      </button>
      <button
        type="button"
        data-testid="trigger-range-select"
        onClick={() => onRangeSelect?.('2026-06-01', '2026-06-07')}
      >
        range
      </button>
    </div>
  ),
}))

import { Schedule } from './Schedule'

function makeProduct(overrides: Partial<ProductFixture> = {}): ProductFixture {
  return {
    id: 'prod-1',
    name: 'Hotel package',
    duration_kind: 'date_range',
    ...overrides,
  }
}

function makeAvailability(
  overrides: Partial<AvailabilityFixture> = {},
): AvailabilityFixture {
  return {
    id: 'avail-1',
    operator_id: 'op-1',
    product_id: 'prod-1',
    date: '2026-06-15',
    start_time: null,
    end_time: null,
    capacity: 6,
    capacity_reserved: 2,
    status: 'open',
    source: 'template',
    source_template_id: null,
    notes: null,
    created_at: '2026-05-19T12:00:00.000Z',
    updated_at: '2026-05-19T12:00:00.000Z',
    ...overrides,
  }
}

function render(ui: React.ReactElement) {
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
  mock.state.products = []
  mock.state.rows = []
  mock.state.bulkCalls = []
  mock.state.patchCalls = []
  mock.state.deleteCalls = []
  mock.state.createCalls = []
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Schedule route', () => {
  it('shows the empty-products message when no products exist', async () => {
    mock.state.products = []
    render(<Schedule />)
    await screen.findByText(/no products yet/i)
  })

  it('lists products in the selector and renders the calendar', async () => {
    mock.state.products = [makeProduct(), makeProduct({ id: 'prod-2', name: 'Tandem' })]
    mock.state.rows = [makeAvailability()]
    render(<Schedule />)

    await screen.findByText('Hotel package')
    expect(screen.getByText('Tandem')).toBeInTheDocument()
    await waitFor(() => {
      expect(screen.getByTestId('row-count')).toHaveTextContent('1')
    })
  })

  it('opens the bulk-add sheet on Add availability and submits a bulk payload', async () => {
    mock.state.products = [makeProduct()]
    const user = userEvent.setup()
    render(<Schedule />)

    await screen.findByText('Hotel package')
    await user.click(screen.getByRole('button', { name: /add availability/i }))

    // Form sheet is now open — fill capacity and submit.
    const fromInput = await screen.findByLabelText(/^from$/i)
    const toInput = screen.getByLabelText(/^to/i)
    const capInput = screen.getByLabelText(/^capacity$/i)

    await user.clear(fromInput)
    await user.type(fromInput, '2026-07-01')
    await user.clear(toInput)
    await user.type(toInput, '2026-07-05')
    await user.clear(capInput)
    await user.type(capInput, '4')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mock.state.bulkCalls.length).toBe(1)
    })
    expect(mock.state.bulkCalls[0]).toMatchObject({
      operatorId: 'op-1',
      productId: 'prod-1',
      payload: expect.objectContaining({
        from: '2026-07-01',
        to: '2026-07-05',
        capacity: 4,
      }),
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('pre-fills the form from a drag-selected range', async () => {
    mock.state.products = [makeProduct()]
    mock.state.rows = [makeAvailability()]
    const user = userEvent.setup()
    render(<Schedule />)

    await screen.findByText('Hotel package')
    await screen.findByTestId('trigger-range-select')
    await user.click(screen.getByTestId('trigger-range-select'))

    const fromInput = await screen.findByLabelText(/^from$/i)
    expect(fromInput).toHaveValue('2026-06-01')
    const toInput = screen.getByLabelText(/^to/i)
    expect(toInput).toHaveValue('2026-06-07')
  })

  it('opens the day editor on day click and blocks the day with capacity=0', async () => {
    mock.state.products = [makeProduct()]
    mock.state.rows = [makeAvailability()]
    const user = userEvent.setup()
    render(<Schedule />)

    await waitFor(() => {
      expect(screen.getByTestId('row-count')).toHaveTextContent('1')
    })

    await user.click(screen.getByTestId('trigger-day-click'))
    await screen.findByText(/edit day/i)

    await user.click(screen.getByRole('button', { name: /block \(capacity 0\)/i }))

    await waitFor(() => {
      expect(mock.state.patchCalls.length).toBe(1)
    })
    expect(mock.state.patchCalls[0]).toMatchObject({
      id: 'avail-1',
      payload: { capacity: 0 },
    })
  })

  it('shows time-slot fields when product is time_slot', async () => {
    mock.state.products = [makeProduct({ duration_kind: 'time_slot' })]
    const user = userEvent.setup()
    render(<Schedule />)

    await screen.findByText('Hotel package')
    await user.click(screen.getByRole('button', { name: /add availability/i }))

    await screen.findByText(/time slots/i)
    expect(screen.getAllByLabelText(/^start$/i)[0]).toBeInTheDocument()
  })
})
