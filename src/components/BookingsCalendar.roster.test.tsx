// landr-sr69 — BookingsCalendar day-roster tests.
//
// Covers:
//   - Month-grid day cell renders the flying roster (names + '+N more'),
//     truncating to the first 3 distinct names at a high-pax day.
//   - Clicking a day-cell roster opens the roster panel, names grouped by
//     booking, ordered.
//   - Clicking a booking ref in the panel fires onEventClick with that row.
//   - Agenda (mobile) lists the flying participant names under each booking.

import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'

import type { BookingRow } from '@/lib/bookings'
import type { AvailabilityRow } from '@/lib/availability'
import { buildDayRoster, type FlyingParticipantsByBooking } from '@/lib/day-roster'

vi.mock('@/lib/availability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/availability')>()
  return {
    ...actual,
    fetchAvailability: vi.fn(async () => [] as AvailabilityRow[]),
  }
})

let _isMobile = false
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => _isMobile,
  MOBILE_BREAKPOINT: 768,
}))

import { BookingsCalendar } from './BookingsCalendar'

// The calendar starts on the month containing "today" — pin it onto the
// roster days so the cells are visible without paging the calendar.
const FIXED_NOW = new Date('2026-06-10T12:00:00.000Z')

beforeEach(() => {
  _isMobile = false
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

function render(ui: ReactElement) {
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

function makeRow(
  id: string,
  selectedDays: string[],
  overrides: Partial<BookingRow> = {},
): BookingRow {
  return {
    id,
    created_at: '2026-06-01T10:00:00Z',
    current_semantic_state: 'confirmed',
    current_stage: null,
    gross_total: '100',
    currency: 'EUR',
    customer: {
      id: `c-${id}`,
      first_name: 'Booker',
      last_name: id,
      email: `${id}@example.com`,
      phone: null,
    },
    items: [
      {
        id: `bp-${id}`,
        date_range_start: selectedDays[0] ?? null,
        date_range_end: selectedDays[selectedDays.length - 1] ?? null,
        selected_days: selectedDays,
        products: {
          id: 'prod',
          name: 'Tandem flight',
          product_kind: 'service',
          service_time_shape: 'days_range',
        },
      },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('BookingsCalendar — day roster (landr-sr69)', () => {
  it('renders a compact roster in the day cell with +N more truncation', () => {
    // 5 pilots flying on the 10th → cell shows first 3 + "+2 more".
    const rows = [makeRow('b-1', ['2026-06-10'])]
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Anna', 'Ben', 'Cara', 'Dan', 'Eve']],
    ])
    const rosterByDay = buildDayRoster(rows, participants)

    render(<BookingsCalendar rows={rows} rosterByDay={rosterByDay} />)

    const cell = screen.getByTestId('calendar-day-roster')
    expect(cell).toHaveAttribute('data-date', '2026-06-10')
    expect(cell).toHaveAttribute('data-count', '5')

    const names = within(cell).getAllByTestId('calendar-day-roster-name')
    expect(names.map((n) => n.textContent)).toEqual(['Anna', 'Ben', 'Cara'])
    expect(
      within(cell).getByTestId('calendar-day-roster-more'),
    ).toHaveTextContent('+2 more')
  })

  it('de-dupes the same pilot across bookings in the cell summary', () => {
    // Anna flies two bookings the same day → counted once in the cell.
    const rows = [
      makeRow('b-1', ['2026-06-10']),
      makeRow('b-2', ['2026-06-10']),
    ]
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Anna']],
      ['b-2', ['Anna', 'Ben']],
    ])
    const rosterByDay = buildDayRoster(rows, participants)
    render(<BookingsCalendar rows={rows} rosterByDay={rosterByDay} />)

    const cell = screen.getByTestId('calendar-day-roster')
    expect(cell).toHaveAttribute('data-count', '2')
    const names = within(cell)
      .getAllByTestId('calendar-day-roster-name')
      .map((n) => n.textContent)
    expect(names).toEqual(['Anna', 'Ben'])
  })

  it('opens the roster panel grouped by booking when a day is clicked', async () => {
    const user = userEvent.setup()
    const rows = [
      makeRow('b-1', ['2026-06-10']),
      makeRow('b-2', ['2026-06-10']),
    ]
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Anna', 'Ben']],
      ['b-2', ['Cara']],
    ])
    const rosterByDay = buildDayRoster(rows, participants)
    render(<BookingsCalendar rows={rows} rosterByDay={rosterByDay} />)

    await user.click(screen.getByTestId('calendar-day-roster'))

    const panel = await screen.findByTestId('calendar-day-roster-panel')
    const groups = within(panel).getAllByTestId('roster-booking-group')
    expect(groups).toHaveLength(2)
    expect(groups[0]).toHaveAttribute('data-booking-id', 'b-1')
    expect(
      within(groups[0]).getAllByTestId('roster-participant-name').map((n) => n.textContent),
    ).toEqual(['Anna', 'Ben'])
    expect(groups[1]).toHaveAttribute('data-booking-id', 'b-2')
    expect(
      within(groups[1]).getAllByTestId('roster-participant-name').map((n) => n.textContent),
    ).toEqual(['Cara'])
  })

  it('fires onEventClick with the row when a booking ref in the panel is clicked', async () => {
    const user = userEvent.setup()
    const rows = [makeRow('b-1', ['2026-06-10'])]
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Anna']],
    ])
    const rosterByDay = buildDayRoster(rows, participants)
    const onEventClick = vi.fn()
    render(
      <BookingsCalendar
        rows={rows}
        rosterByDay={rosterByDay}
        onEventClick={onEventClick}
      />,
    )

    await user.click(screen.getByTestId('calendar-day-roster'))
    const panel = await screen.findByTestId('calendar-day-roster-panel')
    await user.click(within(panel).getByTestId('roster-booking-link'))

    expect(onEventClick).toHaveBeenCalledTimes(1)
    expect(onEventClick).toHaveBeenCalledWith(rows[0])
  })

  it('lists flying participant names under each booking in agenda (mobile)', () => {
    _isMobile = true
    const rows = [makeRow('b-1', ['2026-06-10'])]
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Anna', 'Ben']],
    ])
    const rosterByDay = buildDayRoster(rows, participants)
    render(<BookingsCalendar rows={rows} rosterByDay={rosterByDay} />)

    const roster = screen.getByTestId('agenda-roster')
    expect(
      within(roster).getAllByTestId('agenda-roster-name').map((n) => n.textContent),
    ).toEqual(['Anna', 'Ben'])
  })

  it('renders the plain calendar (no roster cell) when rosterByDay is empty', () => {
    const rows = [makeRow('b-1', ['2026-06-10'])]
    render(<BookingsCalendar rows={rows} rosterByDay={new Map()} />)
    expect(screen.queryByTestId('calendar-day-roster')).toBeNull()
  })
})
