// landr-f18d (UI) + landr-eaqr (Save wire-up) — tests for the quick-capture
// FAB + dialog.
//
// The fab itself is a stateless wrapper around the dialog; the meaningful
// behaviour lives in QuickCaptureBody, so the bulk of these tests open the
// dialog and exercise the form. We mock useOperator so we don't need the
// full provider tree, mock fetchProducts so the product dropdown is
// deterministic without a Supabase connection, and mock quickCreateBooking
// so the Save handler exercises the wire-up without hitting FastAPI.

import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { ProductRow } from '@/lib/products'
import type {
  QuickCreateBookingPayload,
  QuickCreateBookingResult,
} from '@/lib/booking-create'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    fetchProducts: vi.fn<(operatorId: string) => Promise<ProductRow[]>>(),
    useOperator: vi.fn<
      () => {
        currentOperatorId: string | null
      }
    >(),
    quickCreateBooking: vi.fn<
      (
        operatorId: string,
        payload: QuickCreateBookingPayload,
      ) => Promise<QuickCreateBookingResult>
    >(),
  },
}))

vi.mock('@/lib/products', async () => {
  const actual = await vi.importActual<typeof import('@/lib/products')>(
    '@/lib/products',
  )
  return {
    ...actual,
    fetchProducts: (operatorId: string) => mocks.fetchProducts(operatorId),
  }
})

vi.mock('@/lib/operator', async () => {
  const actual = await vi.importActual<typeof import('@/lib/operator')>(
    '@/lib/operator',
  )
  return {
    ...actual,
    useOperator: () => mocks.useOperator(),
  }
})

vi.mock('@/lib/booking-create', () => ({
  quickCreateBooking: (operatorId: string, payload: QuickCreateBookingPayload) =>
    mocks.quickCreateBooking(operatorId, payload),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
    info: vi.fn(),
  },
}))

import { toast } from 'sonner'
import { QuickCaptureFab } from './QuickCaptureFab'

const OP_ID = 'op-1'

function makeProduct(overrides: Partial<ProductRow> = {}): ProductRow {
  return {
    id: 'p-1',
    operator_id: OP_ID,
    product_group_id: null,
    slug: 'tandem-flight',
    name: 'Tandem flight',
    name_localized: null,
    short_description: null,
    short_description_localized: null,
    description: null,
    product_kind: 'service',
    service_time_shape: 'single_date',
    is_contiguous: false,
    duration_minutes: null,
    fixed_start_date: null,
    fixed_end_date: null,
    default_pricing_scheme_id: null,
    needs_provider: false,
    needs_pickup: false,
    revenue_flows_through_operator: true,
    is_publicly_listed: true,
    active: true,
    sort_order: 0,
    hotel_location_id: null,
    hotel_offering: 'none',
    is_addon_only: false,
    capacity_per_unit: null,
    deleted_at: null,
    created_at: '2026-05-01T00:00:00Z',
    updated_at: '2026-05-01T00:00:00Z',
    pricing_scheme: null,
    product_group: null,
    hotel_location: null,
    ...overrides,
  }
}

// `?open=<id>` redirect probe — exposes the current `location.search` so
// tests can assert the navigation happened (mirrors how CommandPalette's
// tests use a LocationProbe to verify routing side-effects without
// rendering the full app router).
function LocationProbe() {
  const location = useLocation()
  return <div data-testid="location-search">{location.search}</div>
}

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/']}>
          {children}
          <Routes>
            <Route path="*" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  mocks.fetchProducts.mockReset()
  mocks.useOperator.mockReset()
  mocks.useOperator.mockReturnValue({ currentOperatorId: OP_ID })
  mocks.quickCreateBooking.mockReset()
  vi.mocked(toast.info).mockReset()
  vi.mocked(toast.error).mockReset()
})

describe('QuickCaptureFab', () => {
  it('hides the fab when no operator is selected', () => {
    mocks.useOperator.mockReturnValue({ currentOperatorId: null })
    render(<QuickCaptureFab />)
    expect(screen.queryByTestId('quick-capture-fab')).not.toBeInTheDocument()
  })

  it('renders the fab when an operator is selected', () => {
    mocks.fetchProducts.mockResolvedValue([makeProduct()])
    render(<QuickCaptureFab />)
    expect(screen.getByTestId('quick-capture-fab')).toBeInTheDocument()
  })

  it('opens the dialog with three fields + a product picker', async () => {
    const user = userEvent.setup()
    mocks.fetchProducts.mockResolvedValue([
      makeProduct({ id: 'p-1', name: 'Tandem flight' }),
      makeProduct({ id: 'p-2', name: 'Solo course' }),
    ])
    render(<QuickCaptureFab />)

    await user.click(screen.getByTestId('quick-capture-fab'))

    expect(
      screen.getByRole('heading', { name: /quick capture booking/i }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/customer name/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/customer email/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^product$/i)).toBeInTheDocument()
    expect(screen.getByLabelText(/^date$/i)).toBeInTheDocument()

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Tandem flight' }),
      ).toBeInTheDocument()
    })
    expect(
      screen.getByRole('option', { name: 'Solo course' }),
    ).toBeInTheDocument()
  })

  it('filters out inactive, unlisted, or addon-only products', async () => {
    const user = userEvent.setup()
    mocks.fetchProducts.mockResolvedValue([
      makeProduct({ id: 'p-ok', name: 'Bookable' }),
      makeProduct({ id: 'p-inactive', name: 'Archived', active: false }),
      makeProduct({
        id: 'p-unlisted',
        name: 'Hidden',
        is_publicly_listed: false,
      }),
      makeProduct({ id: 'p-addon', name: 'Insurance', is_addon_only: true }),
    ])
    render(<QuickCaptureFab />)

    await user.click(screen.getByTestId('quick-capture-fab'))

    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Bookable' }),
      ).toBeInTheDocument()
    })
    expect(screen.queryByRole('option', { name: 'Archived' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Hidden' })).not.toBeInTheDocument()
    expect(screen.queryByRole('option', { name: 'Insurance' })).not.toBeInTheDocument()
  })

  it('keeps Save disabled until name + valid email + product + date are present', async () => {
    const user = userEvent.setup()
    mocks.fetchProducts.mockResolvedValue([makeProduct()])
    render(<QuickCaptureFab />)

    await user.click(screen.getByTestId('quick-capture-fab'))
    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Tandem flight' }),
      ).toBeInTheDocument()
    })

    const saveButton = screen.getByRole('button', { name: /^save$/i })
    expect(saveButton).toBeDisabled()

    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe')
    expect(saveButton).toBeDisabled()

    // Partial / invalid email should keep Save disabled and surface the
    // inline validation hint.
    await user.type(screen.getByLabelText(/customer email/i), 'jane')
    expect(saveButton).toBeDisabled()
    expect(screen.getByText(/valid email/i)).toBeInTheDocument()

    // Complete the email — Save unlocks (product auto-selects to the first
    // eligible row, date defaults to today).
    await user.type(screen.getByLabelText(/customer email/i), '@example.com')
    await waitFor(() => {
      expect(saveButton).toBeEnabled()
    })
  })

  it('posts the form fields to quick-create and deep-links into the new booking', async () => {
    const user = userEvent.setup()
    mocks.fetchProducts.mockResolvedValue([makeProduct({ id: 'p-1' })])
    mocks.quickCreateBooking.mockResolvedValue({
      booking_id: 'b-new-42',
      contact_id: 'c-new-7',
    })
    render(<QuickCaptureFab />)

    await user.click(screen.getByTestId('quick-capture-fab'))
    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Tandem flight' }),
      ).toBeInTheDocument()
    })

    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe')
    await user.type(
      screen.getByLabelText(/customer email/i),
      'jane@example.com',
    )

    // Pin the date so the call payload is deterministic; the input is
    // already populated with today by default, but driving the value
    // here removes any "today-changes-overnight" flake.
    const dateInput = screen.getByLabelText(/^date$/i) as HTMLInputElement
    await user.clear(dateInput)
    await user.type(dateInput, '2026-06-15')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mocks.quickCreateBooking).toHaveBeenCalledTimes(1)
    })
    expect(mocks.quickCreateBooking).toHaveBeenCalledWith(OP_ID, {
      customer_name: 'Jane Doe',
      customer_email: 'jane@example.com',
      product_id: 'p-1',
      date: '2026-06-15',
    })

    // Dialog closes once the mutation resolves.
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /quick capture booking/i }),
      ).not.toBeInTheDocument()
    })

    // And the location reflects the ?open= deep-link Bookings.tsx
    // (landr-ne58 effect) listens for.
    await waitFor(() => {
      expect(screen.getByTestId('location-search')).toHaveTextContent(
        '?open=b-new-42',
      )
    })
  })

  it('shows a Saving… label and re-disables Cancel while the mutation is in flight', async () => {
    const user = userEvent.setup()
    mocks.fetchProducts.mockResolvedValue([makeProduct()])
    // Block resolution so we can assert the in-flight UI.
    let resolveCreate: (r: QuickCreateBookingResult) => void = () => {}
    mocks.quickCreateBooking.mockImplementation(
      () =>
        new Promise<QuickCreateBookingResult>((resolve) => {
          resolveCreate = resolve
        }),
    )
    render(<QuickCaptureFab />)

    await user.click(screen.getByTestId('quick-capture-fab'))
    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Tandem flight' }),
      ).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe')
    await user.type(
      screen.getByLabelText(/customer email/i),
      'jane@example.com',
    )

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    // While the mutation is in flight the Save button shows "Saving…"
    // and Cancel is disabled to prevent racing the in-flight POST.
    await waitFor(() => {
      expect(
        screen.getByRole('button', { name: /saving…/i }),
      ).toBeDisabled()
    })
    expect(screen.getByRole('button', { name: /cancel/i })).toBeDisabled()

    // Resolve so the test cleanup doesn't leak an unresolved promise.
    resolveCreate({ booking_id: 'b-1', contact_id: 'c-1' })
    await waitFor(() => {
      expect(
        screen.queryByRole('heading', { name: /quick capture booking/i }),
      ).not.toBeInTheDocument()
    })
  })

  it('surfaces the server error code on a failed Save and keeps the dialog open', async () => {
    const user = userEvent.setup()
    mocks.fetchProducts.mockResolvedValue([makeProduct()])
    // api() unwraps detail.error into the thrown Error.message.
    mocks.quickCreateBooking.mockRejectedValue(new Error('product_not_found'))
    render(<QuickCaptureFab />)

    await user.click(screen.getByTestId('quick-capture-fab'))
    await waitFor(() => {
      expect(
        screen.getByRole('option', { name: 'Tandem flight' }),
      ).toBeInTheDocument()
    })
    await user.type(screen.getByLabelText(/customer name/i), 'Jane Doe')
    await user.type(
      screen.getByLabelText(/customer email/i),
      'jane@example.com',
    )

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledTimes(1)
    })
    const message = vi.mocked(toast.error).mock.calls[0][0] as string
    expect(message).toMatch(/product_not_found/)

    // Dialog stays open so the operator can correct + retry.
    expect(
      screen.getByRole('heading', { name: /quick capture booking/i }),
    ).toBeInTheDocument()
    // No navigation happened — the deep-link is empty.
    expect(screen.getByTestId('location-search')).toHaveTextContent('')
  })

  it('surfaces a hint when the operator has no bookable products', async () => {
    const user = userEvent.setup()
    mocks.fetchProducts.mockResolvedValue([
      makeProduct({ id: 'p-inactive', name: 'Archived', active: false }),
    ])
    render(<QuickCaptureFab />)

    await user.click(screen.getByTestId('quick-capture-fab'))
    await waitFor(() => {
      expect(screen.getByText(/no bookable product/i)).toBeInTheDocument()
    })
    expect(
      screen.getByText(/Settings → Products to enable quick capture/i),
    ).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^save$/i })).toBeDisabled()
  })
})
