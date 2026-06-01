// landr-3uai — capacity pills surface in the BookingsCalendar dayGrid view
// only when an `operatorId` + `activeProductId` pair is supplied (i.e. the
// parent has narrowed the bookings filter to a single product). Clicking a
// pill navigates to /schedule with the date + product preselected, and
// stopPropagation keeps the click from bubbling to the day-cell.

import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'
import type { ReactElement } from 'react'

import type { AvailabilityRow } from '@/lib/availability'

const { mock } = vi.hoisted(() => ({
  mock: {
    rows: [] as AvailabilityRow[],
    fetchCalls: [] as Array<{
      operatorId: string
      productId: string
      from: string
      to: string
    }>,
  },
}))

vi.mock('@/lib/availability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/availability')>()
  return {
    ...actual,
    fetchAvailability: vi.fn(
      async (
        operatorId: string,
        productId: string,
        from: string,
        to: string,
      ) => {
        mock.fetchCalls.push({ operatorId, productId, from, to })
        return mock.rows
      },
    ),
  }
})

import { BookingsCalendar } from './BookingsCalendar'

function LocationProbe() {
  const loc = useLocation()
  return (
    <div data-testid="location">
      {loc.pathname}
      {loc.search}
    </div>
  )
}

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={['/calendar']}>
          <Routes>
            <Route
              path="/calendar"
              element={
                <>
                  {children}
                  <LocationProbe />
                </>
              }
            />
            <Route path="/schedule" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

function makeAvailability(
  overrides: Partial<AvailabilityRow> = {},
): AvailabilityRow {
  return {
    id: 'avail-1',
    operator_id: 'op-1',
    product_id: 'prod-1',
    date: '2026-05-15',
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

// Pin "today" so the FullCalendar dayGridMonth view always lands in
// May 2026 and the test fixtures (2026-05-15) fall inside the visible grid.
//
// FullCalendar picks the visible month — and the component's default
// availability window (BookingsCalendar.tsx, `const today = new Date()`) —
// via a bare `new Date()`, which a plain `vi.spyOn(Date, 'now')` does NOT
// control. Use Date-only fake timers (`toFake: ['Date']`) so `new Date()` /
// `Date.now()` are pinned while setTimeout / Promises stay real, keeping
// userEvent + waitFor + react-query's scheduler working.
const FIXED_NOW = new Date('2026-05-21T12:00:00.000Z')

beforeEach(() => {
  mock.rows = []
  mock.fetchCalls = []
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('BookingsCalendar — capacity pills (landr-3uai)', () => {
  it('renders no capacity pills when activeProductId is null', async () => {
    render(<BookingsCalendar rows={[]} operatorId="op-1" activeProductId={null} />)

    // No pills, no availability fetch.
    expect(
      screen.queryAllByTestId('calendar-capacity-pill'),
    ).toHaveLength(0)
    // Allow the query effect to settle just in case.
    await Promise.resolve()
    expect(mock.fetchCalls).toHaveLength(0)
  })

  it('renders no capacity pills when operatorId is null', async () => {
    render(
      <BookingsCalendar
        rows={[]}
        operatorId={null}
        activeProductId="prod-1"
      />,
    )

    expect(
      screen.queryAllByTestId('calendar-capacity-pill'),
    ).toHaveLength(0)
    expect(mock.fetchCalls).toHaveLength(0)
  })

  it('renders an "X/N" pill for the day that has availability when the filter is active', async () => {
    mock.rows = [makeAvailability({ date: '2026-05-15', capacity_reserved: 2, capacity: 6 })]
    render(
      <BookingsCalendar
        rows={[]}
        operatorId="op-1"
        activeProductId="prod-1"
      />,
    )

    const pill = await screen.findByTestId('calendar-capacity-pill')
    expect(pill).toHaveAttribute('data-date', '2026-05-15')
    expect(pill).toHaveAttribute('data-state', 'open')
    expect(pill).toHaveTextContent('2/6')
    expect(mock.fetchCalls.length).toBeGreaterThan(0)
    expect(mock.fetchCalls[0]).toMatchObject({
      operatorId: 'op-1',
      productId: 'prod-1',
    })
  })

  it('colors the pill amber when reserved equals capacity (full)', async () => {
    mock.rows = [
      makeAvailability({ date: '2026-05-15', capacity_reserved: 4, capacity: 4 }),
    ]
    render(
      <BookingsCalendar
        rows={[]}
        operatorId="op-1"
        activeProductId="prod-1"
      />,
    )

    const pill = await screen.findByTestId('calendar-capacity-pill')
    expect(pill).toHaveAttribute('data-state', 'full')
  })

  it('colors the pill red when reserved exceeds capacity (overbooked)', async () => {
    mock.rows = [
      makeAvailability({ date: '2026-05-15', capacity_reserved: 5, capacity: 4 }),
    ]
    render(
      <BookingsCalendar
        rows={[]}
        operatorId="op-1"
        activeProductId="prod-1"
      />,
    )

    const pill = await screen.findByTestId('calendar-capacity-pill')
    expect(pill).toHaveAttribute('data-state', 'overbooked')
  })

  it('navigates to /schedule with date + product params when the pill is clicked', async () => {
    mock.rows = [makeAvailability({ date: '2026-05-15' })]
    const user = userEvent.setup()
    render(
      <BookingsCalendar
        rows={[]}
        operatorId="op-1"
        activeProductId="prod-1"
      />,
    )

    const pill = await screen.findByTestId('calendar-capacity-pill')
    await user.click(pill)

    await waitFor(() => {
      const probe = screen.getByTestId('location')
      expect(probe.textContent).toContain('/schedule')
      expect(probe.textContent).toContain('date=2026-05-15')
      expect(probe.textContent).toContain('product=prod-1')
    })
  })

  it('stops the pill click from bubbling to the day cell', async () => {
    mock.rows = [makeAvailability({ date: '2026-05-15' })]
    const user = userEvent.setup()
    render(
      <BookingsCalendar
        rows={[]}
        operatorId="op-1"
        activeProductId="prod-1"
      />,
    )

    const pill = await screen.findByTestId('calendar-capacity-pill')
    let bubbled = false
    pill.closest('.fc-daygrid-day')?.addEventListener('click', () => {
      bubbled = true
    })

    await user.click(pill)
    expect(bubbled).toBe(false)
  })
})
