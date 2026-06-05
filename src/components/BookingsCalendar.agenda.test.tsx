// landr-3qkr.5 — BookingsCalendar agenda list mode tests.
//
// Covers:
//   - Agenda toggle renders Grid/List buttons.
//   - Switching to List mode renders the agenda list, not FullCalendar.
//   - Events are grouped by day; rows render customer name + product.
//   - Tapping a row fires onEventClick with the correct BookingRow.
//   - Empty state renders when there are no events.
//   - Dialog sizing smoke: DialogContent carries max-h-[90dvh] class.
//   - AlertDialogContent carries max-h-[90dvh] class.

import { render as rtlRender, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'
import type { ReactElement } from 'react'

import type { BookingRow } from '@/lib/bookings'
import type { AvailabilityRow } from '@/lib/availability'

// Availability mock — agenda tests don't need capacity data.
vi.mock('@/lib/availability', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/availability')>()
  return {
    ...actual,
    fetchAvailability: vi.fn(async () => [] as AvailabilityRow[]),
  }
})

// useIsMobile mock — controls which mode defaults on first render.
let _isMobile = false
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => _isMobile,
  MOBILE_BREAKPOINT: 768,
}))

import { BookingsCalendar } from './BookingsCalendar'

const FIXED_NOW = new Date('2026-05-21T12:00:00.000Z')

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

function makeRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'booking-1',
    created_at: '2026-05-21T10:00:00Z',
    current_semantic_state: 'confirmed',
    current_stage: null,
    gross_total: '100',
    currency: 'EUR',
    customer: {
      id: 'contact-1',
      first_name: 'Alice',
      last_name: 'Anderson',
      email: 'alice@example.com',
      phone: null,
    },
    items: [
      {
        id: 'bp-1',
        date_range_start: '2026-05-25',
        date_range_end: null,
        selected_days: null,
        products: {
          id: 'prod-1',
          name: 'Surf lesson',
          product_kind: 'service',
          service_time_shape: 'time_slot',
        },
      },
    ],
    ...overrides,
  }
}

// ---------------------------------------------------------------------------

describe('BookingsCalendar — agenda mode (landr-3qkr.5)', () => {
  it('renders Grid and List toggle buttons', () => {
    render(<BookingsCalendar rows={[]} />)
    expect(screen.getByTestId('calendar-grid-toggle')).toBeInTheDocument()
    expect(screen.getByTestId('calendar-agenda-toggle')).toBeInTheDocument()
  })

  it('defaults to grid mode on desktop (isMobile=false)', () => {
    _isMobile = false
    render(<BookingsCalendar rows={[]} />)
    // Grid toggle should be "pressed" (active).
    expect(screen.getByTestId('calendar-grid-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // FullCalendar renders; agenda list does NOT.
    expect(screen.queryByTestId('calendar-agenda-list')).toBeNull()
    expect(screen.queryByTestId('calendar-agenda-empty')).toBeNull()
  })

  it('defaults to agenda list on mobile (isMobile=true)', () => {
    _isMobile = true
    render(<BookingsCalendar rows={[]} />)
    expect(screen.getByTestId('calendar-agenda-toggle')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // Empty state renders because rows=[].
    expect(screen.getByTestId('calendar-agenda-empty')).toBeInTheDocument()
    // FullCalendar is NOT rendered in agenda mode.
    expect(document.querySelector('.fc')).toBeNull()
  })

  it('switches to list mode when the List button is clicked', async () => {
    const user = userEvent.setup()
    render(<BookingsCalendar rows={[]} />)
    await user.click(screen.getByTestId('calendar-agenda-toggle'))
    expect(screen.getByTestId('calendar-agenda-empty')).toBeInTheDocument()
  })

  it('renders events grouped by date in agenda mode', async () => {
    const user = userEvent.setup()
    const row1 = makeRow({ id: 'b-1' })
    const row2 = makeRow({
      id: 'b-2',
      items: [
        {
          id: 'bp-2',
          date_range_start: '2026-05-26',
          date_range_end: null,
          selected_days: null,
          products: {
            id: 'prod-2',
            name: 'Kayak tour',
            product_kind: 'service',
            service_time_shape: 'time_slot',
          },
        },
      ],
    })

    render(<BookingsCalendar rows={[row1, row2]} />)
    // Switch to agenda mode.
    await user.click(screen.getByTestId('calendar-agenda-toggle'))

    // Both day groups should appear.
    expect(screen.getByTestId('agenda-day-2026-05-25')).toBeInTheDocument()
    expect(screen.getByTestId('agenda-day-2026-05-26')).toBeInTheDocument()

    // Row 1: Alice Anderson (or combined title) + Surf lesson visible.
    const day25 = screen.getByTestId('agenda-day-2026-05-25')
    expect(within(day25).getAllByText(/alice anderson/i).length).toBeGreaterThan(0)
    expect(within(day25).getAllByText(/surf lesson/i).length).toBeGreaterThan(0)

    // Row 2: Kayak tour visible.
    const day26 = screen.getByTestId('agenda-day-2026-05-26')
    expect(within(day26).getAllByText(/kayak tour/i).length).toBeGreaterThan(0)
  })

  it('fires onEventClick with the booking row when an agenda row is tapped', async () => {
    const user = userEvent.setup()
    const onEventClick = vi.fn()
    const row = makeRow()

    render(<BookingsCalendar rows={[row]} onEventClick={onEventClick} />)
    await user.click(screen.getByTestId('calendar-agenda-toggle'))

    const agendaRow = screen.getByTestId('agenda-row')
    await user.click(agendaRow)

    expect(onEventClick).toHaveBeenCalledOnce()
    expect(onEventClick).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'booking-1' }),
    )
  })

  it('renders the empty state when there are no bookings in agenda mode', async () => {
    const user = userEvent.setup()
    render(<BookingsCalendar rows={[]} />)
    await user.click(screen.getByTestId('calendar-agenda-toggle'))
    expect(screen.getByTestId('calendar-agenda-empty')).toBeInTheDocument()
  })
})

// ---------------------------------------------------------------------------
// Dialog / AlertDialog sizing smoke — ensures the phone-safe max-h classes
// are present on the primitives' content elements.

describe('Dialog sizing smoke (landr-3qkr.5)', () => {
  it('DialogContent carries max-h-[90dvh] class', async () => {
    const { DialogContent, Dialog } = await import('@/components/ui/dialog')
    render(
      <Dialog open>
        <DialogContent data-testid="dialog-content">body</DialogContent>
      </Dialog>,
    )
    const el = screen.getByTestId('dialog-content')
    // The class is in the cn() string — check for the key substring.
    expect(el.className).toContain('max-h-')
    expect(el.className).toContain('overflow-y-auto')
  })

  it('AlertDialogContent carries max-h-[90dvh] class', async () => {
    const {
      AlertDialog,
      AlertDialogContent,
    } = await import('@/components/ui/alert-dialog')
    render(
      <AlertDialog open>
        <AlertDialogContent data-testid="alert-content">body</AlertDialogContent>
      </AlertDialog>,
    )
    const el = screen.getByTestId('alert-content')
    expect(el.className).toContain('max-h-')
    expect(el.className).toContain('overflow-y-auto')
  })
})
