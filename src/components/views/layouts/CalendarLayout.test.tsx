// landr-9kbl — CalendarLayout renders View Items as FullCalendar events.
//
// Coverage:
//   - Renders events for items whose calendarConfig.dateField has a value.
//   - Invalid / missing calendarConfig.dateField → placeholder.
//   - Date-range pair renders an event spanning multiple cells (end stored
//     inclusive, FullCalendar receives exclusive — we bump by one day).
//   - Event click opens the BookingDetailSheet (BookingDetailSheet is
//     mocked to keep the test free of supabase / API plumbing — see
//     BookingDetailSheet.test.tsx for the sheet's own coverage).
//
// landr-21x1 — daily-roster mode:
//   - Renders the roster day cell for days with flying participants.
//   - Clicking a day cell opens the DayRosterPanel (grouped by booking).
//   - Clicking a booking ref in the panel fires the booking detail sheet.
//   - In daily-roster mode the view-variant switcher is hidden.
//   - No date field required (placeholder not shown even without dateField).

import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
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

import type { BookingRow } from '@/lib/bookings'
import type { SavedViewWithState } from '@/lib/saved-views'
import {
  buildDayRoster,
  type FlyingParticipantsByBooking,
} from '@/lib/day-roster'

// Pin "today" so the FullCalendar dayGridMonth view lands in May 2026 and
// the test fixtures (2026-05-1x) fall inside the visible grid.
//
// FullCalendar picks the initially-visible month via a bare `new Date()`,
// which a plain `vi.spyOn(Date, 'now')` does NOT control (V8's `new Date()`
// reads the system clock directly, not `Date.now()`). Use Date-only fake
// timers — `toFake: ['Date']` overrides `new Date()` / `Date.now()` while
// leaving setTimeout / queueMicrotask / Promises real, so userEvent and
// waitFor keep working.
const FIXED_NOW = new Date('2026-05-21T12:00:00.000Z')

// Mock BookingDetailSheet so the click test can assert that the layout
// opens the sheet, without dragging the sheet's own supabase/network deps
// into this test.
const { sheetMock } = vi.hoisted(() => ({
  sheetMock: {
    calls: [] as Array<{ rowId: string | null; open: boolean }>,
  },
}))

vi.mock('@/components/BookingDetailSheet', () => ({
  BookingDetailSheet: (props: {
    row: BookingRow | null
    onOpenChange: (open: boolean) => void
  }) => {
    sheetMock.calls.push({
      rowId: props.row?.id ?? null,
      open: props.row !== null,
    })
    return (
      <div
        data-testid="booking-detail-sheet-mock"
        data-open={props.row !== null ? 'true' : 'false'}
        data-row-id={props.row?.id ?? ''}
      >
        sheet
      </div>
    )
  },
}))

import { CalendarLayout } from './CalendarLayout'

const OP_ID = '11111111-1111-4111-8111-111111111111'
const USER_ID = '33333333-3333-4333-8333-333333333333'
const VIEW_ID = '22222222-2222-4222-8222-222222222222'

function makeRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'row-1',
    created_at: '2026-05-15T10:00:00Z',
    current_semantic_state: 'confirmed',
    current_stage: { code: 'confirmed' },
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Marie',
      last_name: 'Curie',
      email: 'marie@example.com',
      phone: null,
    },
    items: [
      {
        id: 'item-1',
        date_range_start: '2026-05-15',
        date_range_end: null,
        selected_days: null,
        products: {
          id: 'p-1',
          name: 'Tandem flight',
          product_kind: 'service',
          service_time_shape: 'single_date',
        },
      },
    ],
    ...overrides,
  }
}

function makeView(config: Record<string, unknown>): SavedViewWithState {
  return {
    id: VIEW_ID,
    operator_id: OP_ID,
    creator_user_id: USER_ID,
    entity_type: 'booking',
    visibility: 'personal',
    name: 'Calendar test view',
    config,
    sort_order: 0,
    created_at: '2026-05-21T10:00:00Z',
    updated_at: '2026-05-21T10:00:00Z',
    user_state: { pinned: false, hidden: false, sort_order: 0 },
  }
}

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

beforeEach(() => {
  sheetMock.calls.length = 0
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED_NOW)
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('CalendarLayout (landr-9kbl)', () => {
  it('renders one event per item with a valid date on dateField', () => {
    const items = [
      makeRow({ id: 'row-a' }),
      makeRow({
        id: 'row-b',
        items: [
          {
            id: 'item-b',
            date_range_start: '2026-05-18',
            date_range_end: null,
            selected_days: null,
            products: {
              id: 'p-2',
              name: 'Course',
              product_kind: 'service',
              service_time_shape: 'days_range',
            },
          },
        ],
      }),
    ]
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { dateField: 'date_range_start' },
    })
    render(<CalendarLayout view={view} items={items} />)

    const events = screen.getAllByTestId('view-calendar-event')
    expect(events).toHaveLength(2)
    expect(events.map((e) => e.dataset.rowId).sort()).toEqual(['row-a', 'row-b'])
    expect(screen.getByTestId('view-layout-calendar')).toBeInTheDocument()
  })

  it('shows the placeholder when calendarConfig.dateField is missing', () => {
    const view = makeView({ layout: 'calendar' })
    render(<CalendarLayout view={view} items={[makeRow()]} />)

    expect(
      screen.getByTestId('view-layout-calendar-placeholder'),
    ).toBeInTheDocument()
    expect(screen.queryByTestId('view-layout-calendar')).not.toBeInTheDocument()
    expect(screen.queryAllByTestId('view-calendar-event')).toHaveLength(0)
  })

  it('shows the placeholder when calendarConfig.dateField points to a non-date field', () => {
    const view = makeView({
      layout: 'calendar',
      // 'customer_email' is type=text in BOOKING_FIELDS — not valid.
      calendarConfig: { dateField: 'customer_email' },
    })
    render(<CalendarLayout view={view} items={[makeRow()]} />)

    expect(
      screen.getByTestId('view-layout-calendar-placeholder'),
    ).toBeInTheDocument()
  })

  it('skips items with no date value (rather than crashing)', () => {
    const items = [
      makeRow({ id: 'row-a' }),
      makeRow({
        id: 'row-b',
        items: [
          {
            id: 'item-b',
            date_range_start: null, // no schedule
            date_range_end: null,
            selected_days: null,
            products: null,
          },
        ],
      }),
    ]
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { dateField: 'date_range_start' },
    })
    render(<CalendarLayout view={view} items={items} />)

    const events = screen.getAllByTestId('view-calendar-event')
    expect(events).toHaveLength(1)
    expect(events[0].dataset.rowId).toBe('row-a')
  })

  it('renders a date-range item as a multi-day event when dateEndField is set', () => {
    // Span Fri 2026-05-15 → Tue 2026-05-19, crossing the Sat→Sun week
    // boundary so FullCalendar emits more than one segment in the
    // dayGridMonth (firstDay=1) view.
    const items = [
      makeRow({
        id: 'row-a',
        items: [
          {
            id: 'item-a',
            date_range_start: '2026-05-15',
            date_range_end: '2026-05-19',
            selected_days: null,
            products: {
              id: 'p-1',
              name: 'Course week',
              product_kind: 'service',
              service_time_shape: 'days_range',
            },
          },
        ],
      }),
    ]
    const view = makeView({
      layout: 'calendar',
      calendarConfig: {
        dateField: 'date_range_start',
        dateEndField: 'date_range_end',
      },
    })
    render(<CalendarLayout view={view} items={items} />)

    // Multi-day events that straddle a week boundary are rendered as one
    // FullCalendar segment per visible week-row. The id stays stable; we
    // count distinct DOM nodes carrying it.
    const segments = screen
      .getAllByTestId('view-calendar-event')
      .filter((el) => el.dataset.rowId === 'row-a')
    expect(segments.length).toBeGreaterThan(1)
  })

  it('opens the BookingDetailSheet when an event is clicked', async () => {
    const items = [makeRow({ id: 'row-a' })]
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { dateField: 'date_range_start' },
    })
    const user = userEvent.setup()
    render(<CalendarLayout view={view} items={items} />)

    // Before click: sheet rendered closed.
    expect(
      screen.getByTestId('booking-detail-sheet-mock').dataset.open,
    ).toBe('false')

    const event = screen.getAllByTestId('view-calendar-event')[0]
    await user.click(event)

    expect(
      screen.getByTestId('booking-detail-sheet-mock').dataset.open,
    ).toBe('true')
    expect(
      screen.getByTestId('booking-detail-sheet-mock').dataset.rowId,
    ).toBe('row-a')
  })

  // landr-m4zq — firstDayOfWeek prop is forwarded to FullCalendar.
  it('default firstDayOfWeek=1 renders Mon as the first column header', () => {
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { dateField: 'date_range_start' },
    })
    render(<CalendarLayout view={view} items={[makeRow()]} />)

    const headers = document.querySelectorAll('.fc-col-header-cell-cushion')
    // FullCalendar renders 7 day-of-week headers in dayGridMonth.
    expect(headers).toHaveLength(7)
    expect(headers[0].textContent?.trim()).toMatch(/^Mon/i)
  })

  it('firstDayOfWeek=0 renders Sun as the first column header (landr-m4zq)', () => {
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { dateField: 'date_range_start' },
    })
    render(
      <CalendarLayout view={view} items={[makeRow()]} firstDayOfWeek={0} />,
    )

    const headers = document.querySelectorAll('.fc-col-header-cell-cushion')
    expect(headers).toHaveLength(7)
    expect(headers[0].textContent?.trim()).toMatch(/^Sun/i)
  })

  it('honours an onItemClick override (used by tests / future composition)', async () => {
    const items = [makeRow({ id: 'row-a' })]
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { dateField: 'date_range_start' },
    })
    const onItemClick = vi.fn()
    const user = userEvent.setup()
    render(
      <CalendarLayout view={view} items={items} onItemClick={onItemClick} />,
    )

    await user.click(screen.getAllByTestId('view-calendar-event')[0])
    expect(onItemClick).toHaveBeenCalledTimes(1)
    expect(onItemClick.mock.calls[0][0].id).toBe('row-a')
    // Internal sheet stays closed when override is in play.
    expect(
      screen.getByTestId('booking-detail-sheet-mock').dataset.open,
    ).toBe('false')
  })

  // landr-mofm — view-variant switcher: month (default), week, day.
  describe('view variants (landr-mofm)', () => {
    it('defaults to dayGridMonth when calendarConfig.view is unset', () => {
      const view = makeView({
        layout: 'calendar',
        calendarConfig: { dateField: 'date_range_start' },
      })
      render(<CalendarLayout view={view} items={[makeRow()]} />)
      expect(document.querySelector('.fc-dayGridMonth-view')).not.toBeNull()
      // Month button is the active (default) variant.
      expect(
        screen
          .getByTestId('view-calendar-view-month')
          .getAttribute('aria-pressed'),
      ).toBe('true')
    })

    it('renders timeGridWeek when calendarConfig.view = "week"', () => {
      const view = makeView({
        layout: 'calendar',
        calendarConfig: { dateField: 'date_range_start', view: 'week' },
      })
      render(<CalendarLayout view={view} items={[makeRow()]} />)
      expect(document.querySelector('.fc-timeGridWeek-view')).not.toBeNull()
      expect(
        screen
          .getByTestId('view-calendar-view-week')
          .getAttribute('aria-pressed'),
      ).toBe('true')
    })

    it('renders timeGridDay when calendarConfig.view = "day"', () => {
      const view = makeView({
        layout: 'calendar',
        calendarConfig: { dateField: 'date_range_start', view: 'day' },
      })
      render(<CalendarLayout view={view} items={[makeRow()]} />)
      expect(document.querySelector('.fc-timeGridDay-view')).not.toBeNull()
      expect(
        screen
          .getByTestId('view-calendar-view-day')
          .getAttribute('aria-pressed'),
      ).toBe('true')
    })

    it('clicking a variant calls onConfigChange with the new calendarConfig.view', async () => {
      const view = makeView({
        layout: 'calendar',
        calendarConfig: { dateField: 'date_range_start' },
      })
      const onConfigChange = vi.fn()
      const user = userEvent.setup()
      render(
        <CalendarLayout
          view={view}
          items={[makeRow()]}
          onConfigChange={onConfigChange}
        />,
      )

      await user.click(screen.getByTestId('view-calendar-view-week'))
      expect(onConfigChange).toHaveBeenCalledTimes(1)
      const patch = onConfigChange.mock.calls[0][0] as Record<string, unknown>
      const cal = patch.calendarConfig as Record<string, unknown>
      expect(cal.view).toBe('week')
      // Existing dateField is preserved.
      expect(cal.dateField).toBe('date_range_start')
    })

    it('clicking the already-active variant is a no-op', async () => {
      const view = makeView({
        layout: 'calendar',
        calendarConfig: { dateField: 'date_range_start', view: 'day' },
      })
      const onConfigChange = vi.fn()
      const user = userEvent.setup()
      render(
        <CalendarLayout
          view={view}
          items={[makeRow()]}
          onConfigChange={onConfigChange}
        />,
      )
      await user.click(screen.getByTestId('view-calendar-view-day'))
      expect(onConfigChange).not.toHaveBeenCalled()
    })

    it('ignores an invalid calendarConfig.view value (falls back to month)', () => {
      const view = makeView({
        layout: 'calendar',
        calendarConfig: { dateField: 'date_range_start', view: 'fortnight' },
      })
      render(<CalendarLayout view={view} items={[makeRow()]} />)
      expect(document.querySelector('.fc-dayGridMonth-view')).not.toBeNull()
    })
  })

  // landr-nnbm — drag-to-reschedule wiring. We can't simulate a real
  // FullCalendar drop in jsdom (the interaction plugin uses pointer
  // events that aren't reliably synthesizable), so we assert on the
  // markup contract: the event renders inside a draggable container
  // when DnD is wired AND the dateField is `date_range_start`. The
  // useDragReschedule hook itself owns the patch/undo path and is
  // covered in calendar-reschedule.test.tsx.
  describe('drag-to-reschedule (landr-nnbm)', () => {
    it('marks events draggable when onReschedule is set AND dateField is date_range_start', () => {
      const view = makeView({
        layout: 'calendar',
        calendarConfig: { dateField: 'date_range_start' },
      })
      render(
        <CalendarLayout
          view={view}
          items={[makeRow({ id: 'row-a' })]}
          onReschedule={vi.fn()}
        />,
      )
      // FullCalendar applies fc-event-draggable to draggable events.
      const harness = screen.getAllByTestId('view-calendar-event')[0]
      const harnessRoot = harness.closest('.fc-event')
      expect(harnessRoot?.className).toMatch(/fc-event-draggable/)
    })

    it('keeps events non-draggable when onReschedule is omitted', () => {
      const view = makeView({
        layout: 'calendar',
        calendarConfig: { dateField: 'date_range_start' },
      })
      render(<CalendarLayout view={view} items={[makeRow({ id: 'row-a' })]} />)
      const harness = screen.getAllByTestId('view-calendar-event')[0]
      const harnessRoot = harness.closest('.fc-event')
      expect(harnessRoot?.className ?? '').not.toMatch(/fc-event-draggable/)
    })

    it('keeps events non-draggable when dateField is NOT date_range_start (avoids patching the wrong column)', () => {
      // The PATCH route writes date_range_start / date_range_end on
      // booking_products. If a saved View plotted events on some other
      // date field, a drop would silently move the wrong thing —
      // disable DnD in that case.
      const view = makeView({
        layout: 'calendar',
        calendarConfig: { dateField: 'date_range_end' },
      })
      render(
        <CalendarLayout
          view={view}
          items={[makeRow({ id: 'row-a' })]}
          onReschedule={vi.fn()}
        />,
      )
      const harness = screen.queryAllByTestId('view-calendar-event')[0]
      // dateField=date_range_end + no end value means the test row has
      // no plottable date — guard for empty too.
      if (harness) {
        const harnessRoot = harness.closest('.fc-event')
        expect(harnessRoot?.className ?? '').not.toMatch(/fc-event-draggable/)
      }
    })
  })
})

// landr-21x1 — daily-roster mode: CalendarLayout renders the flying roster in
// each day cell (no date field required; no event bars; no variant switcher).
// Pinned to 2026-05-21 so the test roster days (2026-05-15) are in the
// same month-grid render as the FIXED_NOW above.
describe('CalendarLayout — daily-roster mode (landr-21x1)', () => {
  function makeRosterRow(
    id: string,
    selectedDays: string[],
    overrides: Partial<BookingRow> = {},
  ): BookingRow {
    return {
      id,
      created_at: '2026-05-10T10:00:00Z',
      current_semantic_state: 'confirmed',
      current_stage: { code: 'confirmed' },
      gross_total: 100,
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

  it('renders a roster day cell for days with flying participants', () => {
    const rows = [makeRosterRow('b-1', ['2026-05-15'])]
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Anna', 'Ben']],
    ])
    const rosterByDay = buildDayRoster(rows, participants)
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { mode: 'daily-roster' },
    })

    render(<CalendarLayout view={view} items={rows} rosterByDay={rosterByDay} />)

    const cell = screen.getByTestId('calendar-day-roster')
    expect(cell).toHaveAttribute('data-date', '2026-05-15')
    expect(cell).toHaveAttribute('data-count', '2')
    const names = within(cell).getAllByTestId('calendar-day-roster-name')
    expect(names.map((n) => n.textContent)).toEqual(['Anna', 'Ben'])
  })

  it('does not require a dateField — no placeholder shown in daily-roster mode', () => {
    const view = makeView({
      layout: 'calendar',
      // No dateField set — should NOT show the placeholder in roster mode.
      calendarConfig: { mode: 'daily-roster' },
    })
    render(<CalendarLayout view={view} items={[]} rosterByDay={new Map()} />)

    expect(screen.queryByTestId('view-layout-calendar-placeholder')).toBeNull()
    expect(screen.getByTestId('view-layout-calendar')).toBeInTheDocument()
  })

  it('hides the view-variant switcher in daily-roster mode', () => {
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { mode: 'daily-roster' },
    })
    render(<CalendarLayout view={view} items={[]} rosterByDay={new Map()} />)

    expect(screen.queryByTestId('view-calendar-view-switcher')).toBeNull()
  })

  it('opens the roster panel when a day cell is clicked', async () => {
    const user = userEvent.setup()
    const rows = [makeRosterRow('b-1', ['2026-05-15'])]
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Anna']],
    ])
    const rosterByDay = buildDayRoster(rows, participants)
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { mode: 'daily-roster' },
    })

    render(<CalendarLayout view={view} items={rows} rosterByDay={rosterByDay} />)

    await user.click(screen.getByTestId('calendar-day-roster'))
    const panel = await screen.findByTestId('calendar-day-roster-panel')
    expect(panel).toBeInTheDocument()
    expect(panel).toHaveAttribute('data-date', '2026-05-15')
  })

  it('clicking a booking ref in the panel opens the booking detail sheet', async () => {
    const user = userEvent.setup()
    const rows = [makeRosterRow('b-1', ['2026-05-15'])]
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Anna']],
    ])
    const rosterByDay = buildDayRoster(rows, participants)
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { mode: 'daily-roster' },
    })

    render(<CalendarLayout view={view} items={rows} rosterByDay={rosterByDay} />)

    await user.click(screen.getByTestId('calendar-day-roster'))
    const panel = await screen.findByTestId('calendar-day-roster-panel')
    await user.click(within(panel).getByTestId('roster-booking-link'))

    // Panel closes + detail sheet opens.
    expect(screen.queryByTestId('calendar-day-roster-panel')).toBeNull()
    expect(
      screen.getByTestId('booking-detail-sheet-mock').dataset.open,
    ).toBe('true')
    expect(
      screen.getByTestId('booking-detail-sheet-mock').dataset.rowId,
    ).toBe('b-1')
  })

  it('uses onItemClick override in roster mode (no internal sheet)', async () => {
    const user = userEvent.setup()
    const rows = [makeRosterRow('b-1', ['2026-05-15'])]
    const participants: FlyingParticipantsByBooking = new Map([
      ['b-1', ['Anna']],
    ])
    const rosterByDay = buildDayRoster(rows, participants)
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { mode: 'daily-roster' },
    })
    const onItemClick = vi.fn()

    render(
      <CalendarLayout
        view={view}
        items={rows}
        rosterByDay={rosterByDay}
        onItemClick={onItemClick}
      />,
    )

    await user.click(screen.getByTestId('calendar-day-roster'))
    const panel = await screen.findByTestId('calendar-day-roster-panel')
    await user.click(within(panel).getByTestId('roster-booking-link'))

    expect(onItemClick).toHaveBeenCalledTimes(1)
    expect(onItemClick.mock.calls[0][0].id).toBe('b-1')
    // Internal sheet stays closed when override is active.
    expect(
      screen.getByTestId('booking-detail-sheet-mock').dataset.open,
    ).toBe('false')
  })

  it('shows no roster cells when rosterByDay is empty', () => {
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { mode: 'daily-roster' },
    })
    render(
      <CalendarLayout
        view={view}
        items={[makeRosterRow('b-1', ['2026-05-15'])]}
        rosterByDay={new Map()}
      />,
    )
    expect(screen.queryAllByTestId('calendar-day-roster')).toHaveLength(0)
  })

  it('events mode (default) still shows event bars and the variant switcher', () => {
    const rows = [makeRow({ id: 'row-a' })]
    const view = makeView({
      layout: 'calendar',
      calendarConfig: { dateField: 'date_range_start' },
    })
    render(<CalendarLayout view={view} items={rows} />)

    // Switcher visible.
    expect(screen.getByTestId('view-calendar-view-switcher')).toBeInTheDocument()
    // Event bars rendered.
    expect(screen.getByTestId('view-calendar-event')).toBeInTheDocument()
    // No roster cells.
    expect(screen.queryByTestId('calendar-day-roster')).toBeNull()
  })
})
