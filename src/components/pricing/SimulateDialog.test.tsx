import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { ProductRow } from '@/lib/products'
import type { SimulateEstimateResponse } from '@/lib/pricing-simulator'

// ---- Mocks ---------------------------------------------------------------
// We mock the product fetcher and the simulator wrapper so the test runs
// without a Supabase or FastAPI dependency. The dialog's job is to wire
// inputs → simulator call → result render, and that's all we exercise here.

const { productsMock, simulatorMock } = vi.hoisted(() => ({
  productsMock: {
    fetchProducts: vi.fn(),
  },
  simulatorMock: {
    simulateEstimate: vi.fn(),
  },
}))

vi.mock('@/lib/products', async () => {
  const actual = await vi.importActual<typeof import('@/lib/products')>(
    '@/lib/products',
  )
  return {
    ...actual,
    fetchProducts: (...args: unknown[]) => productsMock.fetchProducts(...args),
  }
})

vi.mock('@/lib/pricing-simulator', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/pricing-simulator')
  >('@/lib/pricing-simulator')
  return {
    ...actual,
    simulateEstimate: (...args: unknown[]) =>
      simulatorMock.simulateEstimate(...args),
  }
})

import { SimulateDialog } from './SimulateDialog'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p-1',
    operator_id: 'op-1',
    product_group_id: null,
    slug: 'tandem-flight',
    name: 'Tandem flight',
    short_description: null,
    description: null,
    product_kind: 'service',
    service_time_shape: 'single_date',
    is_contiguous: false,
    duration_minutes: null,
    fixed_start_date: null,
    fixed_end_date: null,
    default_pricing_scheme_id: 'sch-1',
    needs_provider: false,
    needs_pickup: false,
    revenue_flows_through_operator: true,
    is_publicly_listed: true,
    active: true,
    sort_order: 10,
    hotel_location_id: null,
    hotel_offering: 'none',
    is_addon_only: false,
    capacity_per_unit: null,
    deleted_at: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    pricing_scheme: { id: 'sch-1', name: 'Std', currency: 'EUR' },
    product_group: null,
    hotel_location: null,
    ...overrides,
  }
}

const baseProps = {
  open: true,
  onOpenChange: () => {},
  schemeId: 'sch-1',
  operatorId: 'op-1',
  operatorSlug: 'para42',
  schemeName: 'Standard paragliding',
}

beforeEach(() => {
  productsMock.fetchProducts.mockReset()
  simulatorMock.simulateEstimate.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SimulateDialog', () => {
  it('filters products to those using this scheme + publicly listed + active', async () => {
    productsMock.fetchProducts.mockResolvedValue([
      makeProduct({ id: 'p-eligible', name: 'Eligible' }),
      makeProduct({
        id: 'p-wrong-scheme',
        name: 'Wrong scheme',
        default_pricing_scheme_id: 'sch-other',
      }),
      makeProduct({
        id: 'p-not-public',
        name: 'Not public',
        is_publicly_listed: false,
      }),
      makeProduct({ id: 'p-inactive', name: 'Inactive', active: false }),
    ])

    render(<SimulateDialog {...baseProps} />)

    // Wait until the eligible product appears (otherwise we'd assert
    // against the "— no eligible product —" placeholder rendered while
    // the products query is pending).
    await screen.findByRole('option', { name: 'Eligible' })
    const select = screen.getByLabelText('Product')
    const options = within(select as HTMLSelectElement).getAllByRole('option')
    const labels = options.map((o) => o.textContent)
    expect(labels).toEqual(['Eligible'])
  })

  it('hints when no product is eligible', async () => {
    productsMock.fetchProducts.mockResolvedValue([
      makeProduct({
        id: 'p-not-public',
        is_publicly_listed: false,
      }),
    ])

    render(<SimulateDialog {...baseProps} />)

    await screen.findByText(/no publicly-listed product uses this scheme/i)
    // Submit button is disabled in this state.
    const btn = screen.getByRole('button', { name: /^simulate$/i })
    expect(btn).toBeDisabled()
  })

  it('fires simulateEstimate with selected_days expanded from start+days', async () => {
    productsMock.fetchProducts.mockResolvedValue([
      makeProduct({ id: 'p-eligible', name: 'Eligible' }),
    ])
    const result: SimulateEstimateResponse = {
      line_items: [
        {
          product_id: 'p-eligible',
          label: 'Eligible',
          qty: 1,
          units: 3,
          unit_price: '100.00',
          line_total: '300.00',
          paid_to: 'operator',
        },
      ],
      operator_total: '300.00',
      hotel_total: '0.00',
      grand_total: '300.00',
      currency: 'EUR',
      applied_rules: [
        {
          rule_id: 'r-1',
          kind: 'per_day_base',
          before: 0,
          after: 300,
          detail: {},
        },
        {
          rule_id: 'r-2',
          kind: 'percentage_discount',
          before: 300,
          after: 270,
          detail: { percentage: 10 },
        },
      ],
    }
    simulatorMock.simulateEstimate.mockResolvedValue(result)

    const user = userEvent.setup()
    render(<SimulateDialog {...baseProps} />)

    // Wait for the product to load and auto-select.
    await screen.findByRole('option', { name: 'Eligible' })

    // Set start date (overwriting today's default) and counts.
    // We use fireEvent.change for the number inputs because
    // user.type/clear interacts badly with React-controlled numeric
    // inputs in jsdom — type 'X' onto value=1 produced '1X' rather
    // than clearing first. fireEvent.change models the single
    // canonical change event the component actually listens for.
    const startInput = screen.getByLabelText('Start date')
    fireEvent.change(startInput, { target: { value: '2026-06-10' } })

    const daysInput = screen.getByLabelText('Days')
    fireEvent.change(daysInput, { target: { value: '3' } })

    const participantsInput = screen.getByLabelText('Participants')
    fireEvent.change(participantsInput, { target: { value: '2' } })

    await user.click(screen.getByRole('button', { name: /^simulate$/i }))

    await waitFor(() =>
      expect(simulatorMock.simulateEstimate).toHaveBeenCalledTimes(1),
    )
    expect(simulatorMock.simulateEstimate).toHaveBeenCalledWith(
      'para42',
      'p-eligible',
      {
        selected_days: ['2026-06-10', '2026-06-11', '2026-06-12'],
        participants_count: 2,
      },
    )

    // Result renders: grand total + each fired rule label.
    await screen.findByText(/Computed price/i)
    // Currency-formatted: en-IE / EUR → "€300.00". The same amount
    // appears twice (line-item line_total + grand total), so assert
    // by count rather than uniqueness.
    expect(screen.getAllByText(/€300\.00/).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText('Base price / day')).toBeInTheDocument()
    expect(screen.getByText('Percentage discount')).toBeInTheDocument()
  })

  it('shows the API error message when simulateEstimate rejects', async () => {
    productsMock.fetchProducts.mockResolvedValue([
      makeProduct({ id: 'p-eligible', name: 'Eligible' }),
    ])
    simulatorMock.simulateEstimate.mockRejectedValue(
      new Error('product not found or not publicly available'),
    )

    const user = userEvent.setup()
    render(<SimulateDialog {...baseProps} />)

    await screen.findByRole('option', { name: 'Eligible' })
    await user.click(screen.getByRole('button', { name: /^simulate$/i }))

    await screen.findByText(/product not found or not publicly available/i)
  })

  it('renders nothing inside the dialog when open=false', () => {
    productsMock.fetchProducts.mockResolvedValue([])
    render(<SimulateDialog {...baseProps} open={false} />)
    // Body is only mounted when open — fetchProducts should never run.
    expect(productsMock.fetchProducts).not.toHaveBeenCalled()
  })
})
