// landr-sj2z — skeleton vs real-rows vs empty-state behaviour on
// BookingsTable. The full route-level test in src/routes/Bookings.test.tsx
// already covers the happy path through the live data fetch; here we
// focus on the three-state matrix the table itself owns:
//
//   isLoading=true               → SkeletonTableRows visible, no EmptyState
//   isLoading=false, rows>0      → real rows visible
//   isLoading=false, rows.length=0 → EmptyState visible

import {
  act,
  render as rtlRender,
  screen,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

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

// landr-3qkr.2 — behaviour coverage the thin original test file lacked:
// selection, sort toggling and pagination on the desktop layout, plus the
// new mobile card-list mode. These exercise the shared DataTable shell as
// wired through BookingsTable.
describe('BookingsTable — selection (landr-3qkr.2)', () => {
  it('toggles a single row via its checkbox', async () => {
    const user = userEvent.setup()
    render(
      <BookingsTable
        rows={[makeRow({ id: 'b-1' })]}
        onRowClick={() => {}}
      />,
    )
    const box = screen.getByTestId('bookings-select-b-1') as HTMLInputElement
    expect(box.checked).toBe(false)
    await user.click(box)
    expect(box.checked).toBe(true)
  })

  it('select-all header checks every visible row', async () => {
    const user = userEvent.setup()
    render(
      <BookingsTable
        rows={[
          makeRow({ id: 'b-1' }),
          makeRow({ id: 'b-2' }),
          makeRow({ id: 'b-3' }),
        ]}
        onRowClick={() => {}}
      />,
    )
    await user.click(screen.getByTestId('bookings-select-all'))
    expect(
      (screen.getByTestId('bookings-select-b-1') as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (screen.getByTestId('bookings-select-b-2') as HTMLInputElement).checked,
    ).toBe(true)
    expect(
      (screen.getByTestId('bookings-select-b-3') as HTMLInputElement).checked,
    ).toBe(true)
  })

  it('clicking a row checkbox does not trigger the row onRowClick', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    render(
      <BookingsTable
        rows={[makeRow({ id: 'b-1' })]}
        onRowClick={onRowClick}
      />,
    )
    await user.click(screen.getByTestId('bookings-select-b-1'))
    expect(onRowClick).not.toHaveBeenCalled()
  })
})

describe('BookingsTable — sort toggling (landr-3qkr.2)', () => {
  function customerCellOrder(): string[] {
    return screen
      .getAllByTestId(/^bookings-row-/)
      .map((row) => within(row).getByText(/anderson|baker|carter/i).textContent ?? '')
  }

  it('sorts by Customer ascending then descending on repeated header clicks', async () => {
    const user = userEvent.setup()
    render(
      <BookingsTable
        rows={[
          makeRow({
            id: 'b-1',
            customer: { id: 'c-1', first_name: 'Carter', last_name: '', email: null, phone: null },
          }),
          makeRow({
            id: 'b-2',
            customer: { id: 'c-2', first_name: 'Anderson', last_name: '', email: null, phone: null },
          }),
          makeRow({
            id: 'b-3',
            customer: { id: 'c-3', first_name: 'Baker', last_name: '', email: null, phone: null },
          }),
        ]}
        onRowClick={() => {}}
      />,
    )
    // The Customer header is a sort button.
    const header = screen.getByRole('button', { name: /customer/i })
    await user.click(header)
    expect(customerCellOrder()).toEqual(['Anderson', 'Baker', 'Carter'])
    await user.click(header)
    expect(customerCellOrder()).toEqual(['Carter', 'Baker', 'Anderson'])
  })
})

describe('BookingsTable — pagination (landr-3qkr.2)', () => {
  it('paginates at pageSize 25 and Next advances to the second page', async () => {
    const user = userEvent.setup()
    const rows = Array.from({ length: 30 }, (_unused, i) =>
      makeRow({
        id: `b-${i}`,
        customer: {
          id: `c-${i}`,
          first_name: `Person${String(i).padStart(2, '0')}`,
          last_name: '',
          email: null,
          phone: null,
        },
      }),
    )
    render(<BookingsTable rows={rows} onRowClick={() => {}} />)
    // Page 1 shows 25 rows.
    expect(screen.getAllByTestId(/^bookings-row-/)).toHaveLength(25)
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /next/i }))
    // Page 2 shows the remaining 5 rows.
    expect(screen.getAllByTestId(/^bookings-row-/)).toHaveLength(5)
    expect(screen.getByText('2 / 2')).toBeInTheDocument()
  })
})

describe('BookingsTable — mobile card-list mode (landr-3qkr.2)', () => {
  const originalWidth = window.innerWidth

  afterEach(() => {
    act(() => {
      window.innerWidth = originalWidth
      window.dispatchEvent(new Event('resize'))
    })
  })

  function renderMobile(ui: ReactElement) {
    // useIsMobile() reads window.innerWidth < 768 on mount. Set a phone
    // width BEFORE render so the first paint takes the card branch.
    act(() => {
      window.innerWidth = 390
    })
    return render(ui)
  }

  it('renders a stacked card list (no data table) below the md breakpoint', () => {
    renderMobile(
      <BookingsTable
        rows={[
          makeRow({
            id: 'b-1',
            customer: { id: 'c-1', first_name: 'Alice', last_name: 'Anderson', email: null, phone: null },
            items: [
              { id: 'i-1', products: { id: 'p-1', name: 'Tandem Flight' } },
            ] as unknown as BookingRow['items'],
          }),
        ]}
        onRowClick={() => {}}
      />,
    )
    expect(screen.getByTestId('datatable-card-list')).toBeInTheDocument()
    expect(screen.getByTestId('bookings-card-b-1')).toBeInTheDocument()
    // Key fields are present on the card.
    expect(screen.getByText(/alice anderson/i)).toBeInTheDocument()
    expect(screen.getByText(/tandem flight/i)).toBeInTheDocument()
    // No horizontal data table is rendered in card mode.
    expect(screen.queryByRole('table')).not.toBeInTheDocument()
  })

  it('keeps selection working on the card checkbox', async () => {
    const user = userEvent.setup()
    renderMobile(
      <BookingsTable rows={[makeRow({ id: 'b-1' })]} onRowClick={() => {}} />,
    )
    const box = screen.getByTestId(
      'bookings-card-select-b-1',
    ) as HTMLInputElement
    expect(box.checked).toBe(false)
    await user.click(box)
    expect(box.checked).toBe(true)
  })

  it('tapping the card body fires onRowClick (the primary action)', async () => {
    const user = userEvent.setup()
    const onRowClick = vi.fn()
    renderMobile(
      <BookingsTable rows={[makeRow({ id: 'b-1' })]} onRowClick={onRowClick} />,
    )
    await user.click(screen.getByTestId('bookings-card-b-1'))
    expect(onRowClick).toHaveBeenCalledTimes(1)
  })

  it('reuses the search input + pagination footer in card mode', () => {
    const rows = Array.from({ length: 30 }, (_unused, i) =>
      makeRow({ id: `b-${i}` }),
    )
    renderMobile(<BookingsTable rows={rows} onRowClick={() => {}} />)
    // Search input from the shared shell.
    expect(
      screen.getByPlaceholderText(/search bookings/i),
    ).toBeInTheDocument()
    // Pagination footer still present (30 rows → 2 pages).
    expect(screen.getByText('1 / 2')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /next/i })).toBeInTheDocument()
  })
})
