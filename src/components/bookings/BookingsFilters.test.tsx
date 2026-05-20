// landr-1lj — verifies the filter bar renders all 5 dimensions, derives
// options from the dataset, applies a selection, and Clear filters
// resets every dimension.
// landr-knz3 — extended with count badge + disable-when-zero coverage on
// the per-option chips inside each dimension popover.

import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const authState = { userId: 'user-1' as string | null }

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: authState.userId ? { id: authState.userId } : null,
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}))

import type { BookingRow } from '@/lib/bookings'
import { useBookingsFilters } from '@/lib/bookings-filters'
import { BookingsFilters } from './BookingsFilters'
import { renderHook } from '@testing-library/react'

function booking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'b-1',
    created_at: '2026-05-12T10:00:00.000Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'A',
      last_name: 'B',
      email: 'a@b.com',
      phone: null,
    },
    items: [
      {
        id: 'i-1',
        date_range_start: null,
        date_range_end: null,
        selected_days: null,
        products: {
          id: 'p-1',
          name: 'Tandem',
          product_kind: 'service',
          service_time_shape: 'time_slot',
        },
      },
    ],
    participants: [
      { id: 'pt-1', pickup_location: { id: 'loc-1', name: 'Hotel Alpha' } },
    ],
    ...overrides,
  }
}

const sample: BookingRow[] = [
  booking({ id: 'b-1' }),
  booking({
    id: 'b-2',
    current_stage: { code: 'confirmed_paid' },
    items: [
      {
        id: 'i-2',
        date_range_start: null,
        date_range_end: null,
        selected_days: null,
        products: {
          id: 'p-2',
          name: 'Solo Course',
          product_kind: 'service',
          service_time_shape: 'fixed_window',
        },
      },
    ],
    participants: [
      { id: 'pt-2', pickup_location: { id: 'loc-2', name: 'Hotel Beta' } },
    ],
  }),
]

function Harness({ bookings }: { bookings: BookingRow[] }) {
  const api = useBookingsFilters()
  return (
    <BookingsFilters
      bookings={bookings}
      filtersApi={api}
      testIdPrefix="harness"
    />
  )
}

beforeEach(() => {
  window.localStorage.clear()
  authState.userId = 'user-1'
})

describe('BookingsFilters', () => {
  it('renders triggers for all 5 dimensions', () => {
    render(<Harness bookings={sample} />)
    expect(screen.getByTestId('harness-lifecycle-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('harness-product-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('harness-pickup-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('harness-kind-trigger')).toBeInTheDocument()
    expect(screen.getByTestId('harness-shape-trigger')).toBeInTheDocument()
  })

  it('derives lifecycle / product / pickup options from the dataset', async () => {
    const user = userEvent.setup()
    render(<Harness bookings={sample} />)

    await user.click(screen.getByTestId('harness-lifecycle-trigger'))
    const lifecycleContent = await screen.findByTestId('harness-lifecycle-content')
    // 'awaiting_general_approval' has a friendly label in the dashboard
    // strings → 'Awaiting approval'. Each option now carries its
    // booking-count badge (landr-knz3) so we match via regex.
    expect(
      within(lifecycleContent).getByText(/awaiting approval \(\d+\)/i),
    ).toBeInTheDocument()
    // 'confirmed_paid' has no friendly label yet → humanised fallback.
    expect(
      within(lifecycleContent).getByText(/Confirmed paid \(\d+\)/i),
    ).toBeInTheDocument()
    // Close and open another popover.
    await user.keyboard('{Escape}')

    await user.click(screen.getByTestId('harness-product-trigger'))
    const productContent = await screen.findByTestId('harness-product-content')
    expect(within(productContent).getByText(/Tandem \(\d+\)/)).toBeInTheDocument()
    expect(
      within(productContent).getByText(/Solo Course \(\d+\)/),
    ).toBeInTheDocument()
    await user.keyboard('{Escape}')

    await user.click(screen.getByTestId('harness-pickup-trigger'))
    const pickupContent = await screen.findByTestId('harness-pickup-content')
    expect(
      within(pickupContent).getByText(/Hotel Alpha \(\d+\)/),
    ).toBeInTheDocument()
    expect(
      within(pickupContent).getByText(/Hotel Beta \(\d+\)/),
    ).toBeInTheDocument()
  })

  it('toggling a chip surfaces the active count in the trigger and a Clear filters button', async () => {
    const user = userEvent.setup()
    render(<Harness bookings={sample} />)

    await user.click(screen.getByTestId('harness-kind-trigger'))
    const content = await screen.findByTestId('harness-kind-content')
    await user.click(within(content).getByTestId('harness-kind-option-service'))

    // Trigger label includes the active count.
    expect(screen.getByTestId('harness-kind-trigger')).toHaveTextContent('(1)')

    // Bar-level Clear filters button appears.
    expect(screen.getByTestId('harness-clear-all')).toBeInTheDocument()

    await user.click(screen.getByTestId('harness-clear-all'))
    expect(screen.queryByTestId('harness-clear-all')).not.toBeInTheDocument()
    expect(screen.getByTestId('harness-kind-trigger')).not.toHaveTextContent(
      '(1)',
    )
  })

  it('persists the toggled state under the user storage key', async () => {
    const user = userEvent.setup()
    render(<Harness bookings={sample} />)

    await user.click(screen.getByTestId('harness-shape-trigger'))
    const content = await screen.findByTestId('harness-shape-content')
    await user.click(
      within(content).getByTestId('harness-shape-option-time_slot'),
    )

    const stored = window.localStorage.getItem(
      'landr.dashboard.bookingsFilters.user-1',
    )
    expect(stored).not.toBeNull()
    expect(JSON.parse(stored!).serviceTimeShapes).toEqual(['time_slot'])
  })

  it('useBookingsFilters hook is independent of the component (sanity)', () => {
    // Belt-and-braces — make sure the hook spins up without the component.
    const { result } = renderHook(() => useBookingsFilters())
    expect(result.current.filters.lifecycleStates).toEqual([])
  })

  // landr-knz3 — per-option chips inside each dimension popover surface
  // a count badge derived from the unfiltered base dataset. For derived
  // dimensions (product/pickup/lifecycle) the chip wouldn't appear at
  // all unless count >= 1; the static enum dimensions (product_kind /
  // service_time_shape) always render the full enum, with empty values
  // shown as disabled chips so operators can see the gap.
  it('shows accurate count badges and disables empty enum chips', async () => {
    const user = userEvent.setup()
    render(<Harness bookings={sample} />)

    // Sample has both bookings on product_kind=service; the other 3 kinds
    // (digital_good / physical_good / gift_card) should render disabled.
    await user.click(screen.getByTestId('harness-kind-trigger'))
    const kindContent = await screen.findByTestId('harness-kind-content')

    const serviceChip = within(kindContent).getByTestId(
      'harness-kind-option-service',
    )
    expect(serviceChip).toHaveTextContent('Service (2)')
    expect(serviceChip).not.toBeDisabled()

    const giftCardChip = within(kindContent).getByTestId(
      'harness-kind-option-gift_card',
    )
    expect(giftCardChip).toHaveTextContent('Gift card (0)')
    expect(giftCardChip).toBeDisabled()
    expect(giftCardChip).toHaveAttribute(
      'title',
      expect.stringMatching(/gift card/i),
    )
  })

  it('clicking a zero-count enum chip does not toggle the filter', async () => {
    // Opt out of the pointer-events check at session-setup time so the
    // disabled chip can receive a dispatched click and we can verify
    // React still skips onClick (per the `disabled` attribute).
    const user = userEvent.setup({ pointerEventsCheck: 0 })
    render(<Harness bookings={sample} />)

    await user.click(screen.getByTestId('harness-shape-trigger'))
    const shapeContent = await screen.findByTestId('harness-shape-content')

    // 'single_date' is absent from the sample (count=0) → disabled.
    const singleDateChip = within(shapeContent).getByTestId(
      'harness-shape-option-single_date',
    )
    expect(singleDateChip).toBeDisabled()
    await user.click(singleDateChip)

    // Filter state stayed empty — no trigger label update, no clear-all.
    expect(screen.getByTestId('harness-shape-trigger')).not.toHaveTextContent(
      '(1)',
    )
    expect(screen.queryByTestId('harness-clear-all')).not.toBeInTheDocument()
  })
})
