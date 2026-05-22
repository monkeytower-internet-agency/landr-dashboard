// landr-ajb4 — Open / Past section split for the Customer 360
// "Bookings" tab. The CustomerDetailSheet test already covers the
// happy-path render through fetchBookingsForContact; here we focus on
// the split logic and the per-section UX:
//
//   - partitionBookingsByLifecycle() classifies rows by (terminal stage AND past date)
//   - rendered output has two <section>s with their own headers
//   - each section's summary reflects only its slice
//   - empty sections render an EmptyState (compact) instead of the table
//   - Open is sorted ascending, Past descending

import { render as rtlRender, screen, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest'

import type { BookingRow } from '@/lib/bookings'

// CustomerBookings reads useOperatorCalendarPrefs() via @/lib/operator.
vi.mock('@/lib/operator', () => ({
  useOperatorCalendarPrefs: () => ({
    workHoursStart: '08:00',
    workHoursEnd: '20:00',
    hour12: false,
    firstDayOfWeek: 1,
  }),
}))

// The component fetches via fetchBookingsForContact. Stub the whole
// bookings module's fetcher so the test never touches supabase. We
// import * and partially replace so partitionBookingsByLifecycle / earliestServiceDate
// / etc. stay real (the helpers are pure).
vi.mock('@/lib/bookings', async () => {
  const actual = await vi.importActual<typeof import('@/lib/bookings')>(
    '@/lib/bookings',
  )
  return {
    ...actual,
    fetchBookingsForContact: vi.fn(),
  }
})

import {
  fetchBookingsForContact,
  partitionBookingsByLifecycle,
} from '@/lib/bookings'
import { CustomerBookings } from './CustomerBookings'

const fetchMock = vi.mocked(fetchBookingsForContact)

// 2026-05-22 — mirrors the project's "current date" so the split tests are
// deterministic across the operator's machine. We override Date via the
// systemTime hook (NOT vi.useFakeTimers, which would also stall the
// react-query promise scheduler used to resolve fetchBookingsForContact).
const FROZEN_NOW = new Date('2026-05-22T12:00:00.000Z')

function makeBooking(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'b-default',
    created_at: '2026-04-01T09:00:00.000Z',
    current_semantic_state: 'confirmed',
    current_stage: { code: 'awaiting_payment' },
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Carol',
      last_name: 'Chen',
      email: 'carol@example.com',
      phone: null,
    },
    items: [
      {
        id: 'i-1',
        date_range_start: '2026-06-10',
        date_range_end: '2026-06-12',
        selected_days: null,
        products: {
          id: 'p-1',
          name: 'Tandem Flight',
          product_kind: 'service',
          service_time_shape: 'days_range',
        },
      },
    ],
    participants: [],
    ...overrides,
  } as unknown as BookingRow
}

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

beforeEach(() => {
  // toFake omits queueMicrotask / setTimeout etc. so react-query's promise
  // scheduler keeps running on real timers; only Date and Date.now are
  // frozen — which is all CustomerBookings needs for its today anchor.
  vi.useFakeTimers({
    now: FROZEN_NOW,
    toFake: ['Date'],
  })
  fetchMock.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('partitionBookingsByLifecycle (landr-ajb4)', () => {
  const TODAY = '2026-05-22'

  it('classifies a confirmed booking (non-terminal) as open even when its service date is past', () => {
    const row = makeBooking({
      id: 'b-confirmed-past',
      current_semantic_state: 'confirmed',
      items: [
        {
          id: 'i-x',
          date_range_start: '2026-04-01',
          date_range_end: '2026-04-01',
          selected_days: null,
          products: null,
        },
      ],
    } as unknown as Partial<BookingRow>)
    const { open, past } = partitionBookingsByLifecycle([row], TODAY)
    expect(open).toHaveLength(1)
    expect(past).toHaveLength(0)
  })

  it('classifies a finalised booking with a past service date as past', () => {
    const row = makeBooking({
      id: 'b-finalised-past',
      current_semantic_state: 'finalised',
      items: [
        {
          id: 'i-x',
          date_range_start: '2026-04-01',
          date_range_end: '2026-04-01',
          selected_days: null,
          products: null,
        },
      ],
    } as unknown as Partial<BookingRow>)
    const { open, past } = partitionBookingsByLifecycle([row], TODAY)
    expect(past).toHaveLength(1)
    expect(open).toHaveLength(0)
  })

  it('keeps a cancelled booking with no service date in the open section', () => {
    // Undated bookings stay visible by default — mirrors isPastBooking in
    // lib/bookings.ts which also refuses to "disappear" rows that have
    // never been scheduled. They show in Open so the operator can spot
    // and resolve them.
    const row = makeBooking({
      id: 'b-cancelled-undated',
      current_semantic_state: 'cancelled',
      items: [],
    } as unknown as Partial<BookingRow>)
    const { open, past } = partitionBookingsByLifecycle([row], TODAY)
    expect(open).toHaveLength(1)
    expect(past).toHaveLength(0)
  })

  it('classifies a no_show booking with a past service date as past', () => {
    const row = makeBooking({
      id: 'b-noshow',
      current_semantic_state: 'no_show',
      items: [
        {
          id: 'i-x',
          date_range_start: '2026-04-15',
          date_range_end: '2026-04-15',
          selected_days: null,
          products: null,
        },
      ],
    } as unknown as Partial<BookingRow>)
    const { past } = partitionBookingsByLifecycle([row], TODAY)
    expect(past).toHaveLength(1)
  })

  it('keeps a finalised booking with a future service date in open (edge case — pre-finalised)', () => {
    // A finalised booking with a future date can occur if an operator
    // marks-as-paid a booking before the service runs. Rule says past
    // requires BOTH terminal AND past date, so this stays Open.
    const row = makeBooking({
      id: 'b-finalised-future',
      current_semantic_state: 'finalised',
      items: [
        {
          id: 'i-x',
          date_range_start: '2026-07-01',
          date_range_end: '2026-07-01',
          selected_days: null,
          products: null,
        },
      ],
    } as unknown as Partial<BookingRow>)
    const { open, past } = partitionBookingsByLifecycle([row], TODAY)
    expect(open).toHaveLength(1)
    expect(past).toHaveLength(0)
  })
})

describe('<CustomerBookings /> — Open / Past sections (landr-ajb4)', () => {
  it('shows the fully-empty fallback when the contact has zero bookings', async () => {
    fetchMock.mockResolvedValue([])
    render(<CustomerBookings contactId="c-1" onBookingClick={() => {}} />)

    expect(
      await screen.findByTestId('customer-bookings-empty'),
    ).toBeInTheDocument()
    // The section scaffolding does NOT render in the zero-rows case — that
    // would be two empty-state cards stacked on a "no bookings yet" tab,
    // which is noisy. The single italic "No bookings yet." copy wins.
    expect(
      screen.queryByTestId('customer-bookings-open-section'),
    ).not.toBeInTheDocument()
  })

  it('renders both section scaffolds with their own labels when at least one booking exists', async () => {
    fetchMock.mockResolvedValue([
      makeBooking({
        id: 'b-open',
        current_semantic_state: 'confirmed',
        gross_total: 250,
      }),
    ])
    render(<CustomerBookings contactId="c-1" onBookingClick={() => {}} />)

    // Both <section>s mount even when one side is empty — the operator
    // should always see the Open / Past frame so the structure is
    // predictable.
    const open = await screen.findByTestId('customer-bookings-open-section')
    const past = await screen.findByTestId('customer-bookings-past-section')
    // The section heading is the first <h3> inside the <section>; the
    // EmptyState card also renders an <h3>, so we use level + name match
    // to anchor on the section banner specifically.
    expect(within(open).getByRole('heading', { name: 'Open' })).toBeInTheDocument()
    expect(within(past).getByRole('heading', { name: 'Past' })).toBeInTheDocument()

    // The visual divider sits between the two sections.
    expect(
      screen.getByTestId('customer-bookings-section-divider'),
    ).toBeInTheDocument()
  })

  it('renders the Open booking + an empty-state card in the Past section', async () => {
    fetchMock.mockResolvedValue([
      makeBooking({
        id: 'b-open',
        current_semantic_state: 'confirmed',
        gross_total: 250,
      }),
    ])
    render(<CustomerBookings contactId="c-1" onBookingClick={() => {}} />)

    expect(
      await screen.findByTestId('customer-booking-row-b-open'),
    ).toBeInTheDocument()
    // Past section, when empty, swaps the table for the compact
    // EmptyState card with the "No past bookings" copy.
    const pastEmpty = screen.getByTestId('customer-bookings-past-empty')
    expect(pastEmpty).toBeInTheDocument()
    expect(pastEmpty.textContent).toMatch(/no past bookings/i)
  })

  it('summarises each section independently (open total ignores past rows)', async () => {
    fetchMock.mockResolvedValue([
      makeBooking({
        id: 'b-open',
        current_semantic_state: 'confirmed',
        gross_total: 250,
      }),
      makeBooking({
        id: 'b-past',
        current_semantic_state: 'finalised',
        gross_total: 100,
        items: [
          {
            id: 'i-past',
            date_range_start: '2026-03-20',
            date_range_end: '2026-03-20',
            selected_days: null,
            products: {
              id: 'p-2',
              name: 'SIV Course',
              product_kind: 'service',
              service_time_shape: 'single_date',
            },
          },
        ],
      } as unknown as Partial<BookingRow>),
    ])
    render(<CustomerBookings contactId="c-1" onBookingClick={() => {}} />)

    const openSummary = await screen.findByTestId(
      'customer-bookings-open-summary',
    )
    expect(openSummary.textContent).toMatch(/1 booking/i)
    expect(openSummary.textContent).toMatch(/250/)
    expect(openSummary.textContent).not.toMatch(/350/)

    const pastSummary = screen.getByTestId('customer-bookings-past-summary')
    expect(pastSummary.textContent).toMatch(/1 booking/i)
    expect(pastSummary.textContent).toMatch(/100/)
  })

  it('sorts Open ascending (nearest-upcoming first) and Past descending (most-recent first)', async () => {
    fetchMock.mockResolvedValue([
      // Two Open rows — confirmed (non-terminal). Earlier date should
      // surface first.
      makeBooking({
        id: 'b-open-later',
        current_semantic_state: 'confirmed',
        items: [
          {
            id: 'i-later',
            date_range_start: '2026-08-01',
            date_range_end: '2026-08-01',
            selected_days: null,
            products: null,
          },
        ],
      } as unknown as Partial<BookingRow>),
      makeBooking({
        id: 'b-open-sooner',
        current_semantic_state: 'confirmed',
        items: [
          {
            id: 'i-sooner',
            date_range_start: '2026-06-01',
            date_range_end: '2026-06-01',
            selected_days: null,
            products: null,
          },
        ],
      } as unknown as Partial<BookingRow>),
      // Two Past rows — finalised + service dates before today. Most
      // recent should surface first.
      makeBooking({
        id: 'b-past-older',
        current_semantic_state: 'finalised',
        items: [
          {
            id: 'i-older',
            date_range_start: '2026-01-15',
            date_range_end: '2026-01-15',
            selected_days: null,
            products: null,
          },
        ],
      } as unknown as Partial<BookingRow>),
      makeBooking({
        id: 'b-past-newer',
        current_semantic_state: 'finalised',
        items: [
          {
            id: 'i-newer',
            date_range_start: '2026-04-15',
            date_range_end: '2026-04-15',
            selected_days: null,
            products: null,
          },
        ],
      } as unknown as Partial<BookingRow>),
    ])
    render(<CustomerBookings contactId="c-1" onBookingClick={() => {}} />)

    const openSection = await screen.findByTestId(
      'customer-bookings-open-section',
    )
    const openRowIds = within(openSection)
      .getAllByRole('button')
      .map((el) => el.getAttribute('data-testid'))
    expect(openRowIds).toEqual([
      'customer-booking-row-b-open-sooner',
      'customer-booking-row-b-open-later',
    ])

    const pastSection = screen.getByTestId('customer-bookings-past-section')
    const pastRowIds = within(pastSection)
      .getAllByRole('button')
      .map((el) => el.getAttribute('data-testid'))
    expect(pastRowIds).toEqual([
      'customer-booking-row-b-past-newer',
      'customer-booking-row-b-past-older',
    ])
  })
})
