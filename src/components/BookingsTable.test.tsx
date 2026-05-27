// landr-sj2z — skeleton vs real-rows vs empty-state behaviour on
// BookingsTable. The full route-level test in src/routes/Bookings.test.tsx
// already covers the happy path through the live data fetch; here we
// focus on the three-state matrix the table itself owns:
//
//   isLoading=true               → SkeletonTableRows visible, no EmptyState
//   isLoading=false, rows>0      → real rows visible
//   isLoading=false, rows.length=0 → EmptyState visible

import { render as rtlRender, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, expect, it, vi } from 'vitest'

// BookingsTable reads useOperatorCalendarPrefs() + useOperator() (landr-n2j2
// added the second so the inline-edit hook can scope its query keys). Stub
// both so render() works outside an OperatorProvider.
vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: 'op-test',
    loading: false,
    switchOperator: () => {},
  }),
  useOperatorCalendarPrefs: () => ({
    workHoursStart: '08:00',
    workHoursEnd: '20:00',
    hour12: false,
  }),
}))

import { BookingsTable } from './BookingsTable'
import type { BookingRow } from '@/lib/bookings'

// landr-n2j2 — BookingsTable now mounts useInlineEditBooking which calls
// useQueryClient(). Provide a fresh client per render so the table can
// initialise without an ancestor QueryClientProvider.
function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

function makeRow(overrides: Partial<BookingRow> = {}): BookingRow {
  // Minimal shape — the table reads from these fields plus a handful of
  // optional getters in lib/bookings (customerDisplay, productDisplay,
  // earliestServiceDate, stageCode). Cast through unknown to keep the
  // fixture compact; the production code is defensive about missing
  // optional joins.
  return {
    id: 'b-1',
    created_at: '2026-05-12T10:30:00.000Z',
    current_semantic_state: 'confirmed',
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Alice',
      last_name: 'Anderson',
      email: 'alice@example.com',
    },
    items: [{ id: 'i-1', products: { id: 'p-1', name: 'Tandem Flight' } }],
    ...overrides,
  } as unknown as BookingRow
}

describe('BookingsTable — loading / empty / loaded states (landr-sj2z)', () => {
  it('renders the skeleton placeholder while isLoading is true', () => {
    render(
      <BookingsTable rows={[]} onRowClick={() => {}} isLoading />,
    )
    expect(screen.getByTestId('bookings-skeleton-row-0')).toBeInTheDocument()
    expect(
      screen.queryByTestId('bookings-empty-state'),
    ).not.toBeInTheDocument()
  })

  it('renders real rows when isLoading is false and rows have arrived', () => {
    render(
      <BookingsTable
        rows={[makeRow({ id: 'b-1', items: [{ id: 'i-1', products: { id: 'p-1', name: 'Tandem Flight' } }] as unknown as BookingRow['items'] })]}
        onRowClick={() => {}}
      />,
    )
    expect(screen.getByText(/tandem flight/i)).toBeInTheDocument()
    expect(
      screen.queryByTestId('bookings-skeleton-row-0'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('bookings-empty-state'),
    ).not.toBeInTheDocument()
  })

  it('renders the EmptyState card when rows.length is 0 and isLoading is false', () => {
    render(<BookingsTable rows={[]} onRowClick={() => {}} />)
    expect(screen.getByTestId('bookings-empty-state')).toBeInTheDocument()
    expect(
      screen.queryByTestId('bookings-skeleton-row-0'),
    ).not.toBeInTheDocument()
  })
})
