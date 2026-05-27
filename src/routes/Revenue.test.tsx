// landr-sbhz.8 — /revenue route tests.
//
// Covers the staff gate (non-staff redirect), the per-operator year breakdown
// (rate / realized / projected / totals), the roll-up cards, and the empty +
// error states. The data layer (fetchRevenueOverview) and the staff flag
// (useEntitlements) are mocked so this is a pure component test.
import {
  render as rtlRender,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import type { RevenueOverview } from '@/lib/revenue'

const { mock } = vi.hoisted(() => {
  const state = {
    data: null as RevenueOverview | null,
    error: null as Error | null,
    isLandrStaff: true,
    entLoading: false,
  }
  return { mock: { state } }
})

vi.mock('@/lib/revenue', async () => {
  const actual = await vi.importActual<typeof import('@/lib/revenue')>(
    '@/lib/revenue',
  )
  return {
    ...actual,
    fetchRevenueOverview: vi.fn(async () => {
      if (mock.state.error) throw mock.state.error
      return mock.state.data as RevenueOverview
    }),
  }
})

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: () => true,
    isLandrStaff: mock.state.isLandrStaff,
    // landr-2soj — Revenue now gates on effectiveIsStaff. In these tests no
    // view-as is active, so effectiveIsStaff tracks the raw staff flag.
    effectiveIsStaff: mock.state.isLandrStaff,
    isLoading: mock.state.entLoading,
  }),
}))

import { Revenue } from './Revenue'

function render(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/revenue']}>
          <Routes>
            <Route path="/revenue" element={children} />
            <Route path="/" element={<div data-testid="home">home</div>} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
    ...options,
  })
}

function sampleOverview(): RevenueOverview {
  return {
    currency: 'EUR',
    operators: [
      {
        operator_id: 'op-1',
        operator_name: 'Para42',
        operator_slug: 'para42',
        currency: 'EUR',
        has_platform_scheme: true,
        years: [
          {
            year: 2026,
            effective_rate: 0.05,
            realized: 50,
            projected: 100,
            total: 150,
            realized_net_base: 1000,
            projected_net_base: 2000,
            booking_count: 2,
          },
          {
            year: 2027,
            effective_rate: 0.04,
            realized: 20,
            projected: 0,
            total: 20,
            realized_net_base: 500,
            projected_net_base: 0,
            booking_count: 1,
          },
        ],
        realized_total: 70,
        projected_total: 100,
        total: 170,
      },
    ],
    realized_total: 70,
    projected_total: 100,
    grand_total: 170,
    generated_at: '2026-05-25T12:00:00.000Z',
  }
}

beforeEach(() => {
  mock.state.data = sampleOverview()
  mock.state.error = null
  mock.state.isLandrStaff = true
  mock.state.entLoading = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Revenue route', () => {
  it('redirects non-staff to home', () => {
    mock.state.isLandrStaff = false
    render(<Revenue />)
    expect(screen.getByTestId('home')).toBeInTheDocument()
    expect(screen.queryByText('Para42')).not.toBeInTheDocument()
  })

  it('shows a loading placeholder while the staff flag resolves', () => {
    mock.state.entLoading = true
    render(<Revenue />)
    expect(screen.getByText(/loading revenue/i)).toBeInTheDocument()
  })

  it('renders the per-year breakdown with rates and totals for staff', async () => {
    render(<Revenue />)

    // Both year rows present.
    const rows = await screen.findAllByTestId('revenue-year-row')
    expect(rows).toHaveLength(2)

    const y2026 = rows[0]
    expect(within(y2026).getByText('2026')).toBeInTheDocument()
    expect(within(y2026).getByText('5%')).toBeInTheDocument()

    const y2027 = rows[1]
    expect(within(y2027).getByText('2027')).toBeInTheDocument()
    expect(within(y2027).getByText('4%')).toBeInTheDocument()

    // Operator card present.
    expect(screen.getByText('Para42')).toBeInTheDocument()
  })

  it('shows the empty state when no operators are returned', async () => {
    mock.state.data = {
      currency: 'EUR',
      operators: [],
      realized_total: 0,
      projected_total: 0,
      grand_total: 0,
      generated_at: '2026-05-25T12:00:00.000Z',
    }
    render(<Revenue />)
    expect(
      await screen.findByText(/no operators with platform commission/i),
    ).toBeInTheDocument()
  })

  it('shows the error state when the fetch fails', async () => {
    mock.state.error = new Error('boom')
    render(<Revenue />)
    expect(await screen.findByText(/failed to load revenue/i)).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})
