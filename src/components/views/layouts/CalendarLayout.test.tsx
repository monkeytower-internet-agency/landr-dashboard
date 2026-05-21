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

import { render as rtlRender, screen } from '@testing-library/react'
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

// Pin "today" — see vitest-react-query-fake-timers-deadlock memory.
// FullCalendar reads `Date.now()` (via `new Date()`) when picking the
// initially visible month; pinning it keeps the events inside the grid.
const FIXED_NOW = new Date('2026-05-21T12:00:00.000Z')
let dateNowSpy: ReturnType<typeof vi.spyOn> | null = null

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
    user_state: { starred: false, hidden: false },
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
  dateNowSpy = vi.spyOn(Date, 'now').mockReturnValue(FIXED_NOW.getTime())
})

afterEach(() => {
  dateNowSpy?.mockRestore()
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
      expect(
        document.querySelector('.fc-dayGridMonth-view'),
      ).not.toBeNull()
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
      expect(
        document.querySelector('.fc-timeGridWeek-view'),
      ).not.toBeNull()
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
      expect(
        document.querySelector('.fc-timeGridDay-view'),
      ).not.toBeNull()
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
      expect(
        document.querySelector('.fc-dayGridMonth-view'),
      ).not.toBeNull()
    })
  })
})
