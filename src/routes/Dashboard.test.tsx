// landr-p600 — Dashboard home revamp tests.

import {
  render as rtlRender,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

type ChannelHandle = {
  on: ReturnType<typeof vi.fn>
  subscribe: ReturnType<typeof vi.fn>
}

// We dispatch by table name so the same supabase mock can serve
// bookings, contacts_with_types, and (filtered) general-approvals.
const { mock } = vi.hoisted(() => {
  type Row = Record<string, unknown>
  const state = {
    bookings: [] as Row[],
    contacts: [] as Row[],
    bookingsError: null as { message: string } | null,
    contactsError: null as { message: string } | null,
    // Last filter applied via .filter(col, op, value) — used to decide
    // whether the call is the general-approvals path vs the all-bookings
    // path. fetchPendingGeneralApprovals adds
    // .filter('current_stage.code', 'eq', 'awaiting_general_approval')
    lastBookingFilter: null as string | null,
  }

  const channel: ChannelHandle = {
    on: vi.fn(),
    subscribe: vi.fn(),
  }
  channel.on.mockImplementation(() => channel)

  const supabase = {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {}
      let filterValue: string | null = null

      Object.assign(builder, {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        is: vi.fn(() => builder),
        overlaps: vi.fn(() => builder),
        order: vi.fn(() => builder),
        filter: vi.fn((_col: string, _op: string, value: string) => {
          filterValue = value
          state.lastBookingFilter = value
          return builder
        }),
        limit: vi.fn(async () => {
          if (table === 'contacts_with_types') {
            return {
              data: state.contacts,
              error: state.contactsError,
            }
          }
          if (table === 'bookings') {
            if (filterValue === 'awaiting_general_approval') {
              return {
                data: state.bookings.filter(
                  (r) =>
                    (r.current_stage as { code?: string } | null)?.code ===
                    'awaiting_general_approval',
                ),
                error: state.bookingsError,
              }
            }
            return {
              data: state.bookings,
              error: state.bookingsError,
            }
          }
          return { data: [], error: null }
        }),
        // fetchPendingGeneralApprovals omits .limit() and awaits .order().
        // We make .order() awaitable as well so both code paths resolve.
        then: undefined,
      })

      // Make .order() awaitable for fetchPendingGeneralApprovals
      // (it does `await query.order(...)` instead of `.limit(...)`).
      const origOrder = builder.order as unknown as (
        ...args: unknown[]
      ) => Record<string, unknown>
      builder.order = vi.fn((...args: unknown[]) => {
        const out = origOrder(...args)
        // Attach a `then` so awaiting the order() result returns rows.
        ;(out as { then?: (resolve: (v: unknown) => void) => void }).then = (
          resolve,
        ) => {
          if (table === 'bookings') {
            if (filterValue === 'awaiting_general_approval') {
              resolve({
                data: state.bookings.filter(
                  (r) =>
                    (r.current_stage as { code?: string } | null)?.code ===
                    'awaiting_general_approval',
                ),
                error: state.bookingsError,
              })
            } else {
              resolve({
                data: state.bookings,
                error: state.bookingsError,
              })
            }
          } else if (table === 'contacts_with_types') {
            resolve({ data: state.contacts, error: state.contactsError })
          } else {
            resolve({ data: [], error: null })
          }
        }
        return out
      })

      return builder
    }),
    channel: vi.fn(() => channel),
    removeChannel: vi.fn(),
  }

  return { mock: { state, supabase, channel } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

// landr-ne58 — BookingDetailSheet (rendered when a today-row is clicked)
// records each open in the user-scoped "Recently viewed" trail via useAuth().
// Stub the auth module so the Dashboard test render doesn't need an
// AuthProvider wrapper. Mirrors the stub used in BookingDetailSheet.test.tsx.
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'test-user', email: 'test@example.com' },
    loading: false,
    signOut: async () => {},
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  useOperatorCalendarPrefs: () => ({
    hour12: false,
    timeFormat24h: true,
    weekStartsOn: 1,
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

// Stub ResizeObserver — recharts measures parent dimensions and JSDOM
// doesn't ship it. Identical to the Reporting test setup.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
;(globalThis as { ResizeObserver?: unknown }).ResizeObserver =
  ResizeObserverStub

import { Dashboard } from './Dashboard'

function render(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
    ...options,
  })
}

// ---------------------------------------------------------------------------
// Fixtures. "Today" floats — we always anchor a booking to localDateOnly(new Date())
// so the test is stable regardless of the calendar day it runs on.
// ---------------------------------------------------------------------------

function todayLocalIso(): string {
  const d = new Date()
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

function makeBooking(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'b-x',
    created_at: new Date().toISOString(),
    current_semantic_state: 'confirmed',
    current_stage: null,
    gross_total: 100,
    currency: 'EUR',
    approval_trace: null,
    customer: {
      id: 'c-x',
      first_name: 'Alex',
      last_name: 'River',
      email: 'alex@example.com',
      phone: null,
    },
    items: [],
    participants: [],
    ...over,
  }
}

function makeContact(over: Record<string, unknown>): Record<string, unknown> {
  return {
    id: 'cc-x',
    operator_id: 'op-1',
    first_name: 'Sam',
    last_name: 'Lee',
    email: 'sam@example.com',
    phone: null,
    preferred_locale: null,
    preferred_timezone: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    deleted_at: null,
    gdpr_erased_at: null,
    gdpr_erased_by_user_id: null,
    gdpr_erasure_note: null,
    types: [],
    ...over,
  }
}

beforeEach(() => {
  mock.state.bookings = []
  mock.state.contacts = []
  mock.state.bookingsError = null
  mock.state.contactsError = null
  mock.state.lastBookingFilter = null
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Dashboard route', () => {
  it('renders the today list with bookings starting today', async () => {
    const today = todayLocalIso()
    mock.state.bookings = [
      makeBooking({
        id: 'b-today',
        items: [
          {
            id: 'i-today',
            date_range_start: today,
            date_range_end: today,
            selected_days: null,
            products: {
              id: 'p',
              name: 'Tandem Flight',
              product_kind: 'service',
              service_time_shape: 'single_date',
            },
          },
        ],
      }),
      makeBooking({
        id: 'b-other',
        items: [
          {
            id: 'i-other',
            date_range_start: '2099-01-01',
            date_range_end: '2099-01-01',
            selected_days: null,
            products: null,
          },
        ],
      }),
    ]
    render(<Dashboard />)
    const list = await screen.findByTestId('dashboard-today-list')
    expect(within(list).getByText('Tandem Flight')).toBeInTheDocument()
    expect(
      screen.queryByTestId('dashboard-today-row-b-other'),
    ).not.toBeInTheDocument()
  })

  it('shows the empty state when no bookings start today', async () => {
    mock.state.bookings = []
    render(<Dashboard />)
    expect(
      await screen.findByText(/no bookings scheduled for today/i),
    ).toBeInTheDocument()
  })

  it('renders the four summary cards (revenue/bookings/contacts/pending)', async () => {
    mock.state.bookings = [
      makeBooking({ id: 'b-1', gross_total: 200 }),
      makeBooking({ id: 'b-2', gross_total: 50 }),
    ]
    mock.state.contacts = [makeContact({ id: 'cc-1' })]
    render(<Dashboard />)

    // Wait for the bookings query to land — once the bookings-week card
    // shows '2' we know the data has been wired through.
    const bookings = await screen.findByTestId('dashboard-week-bookings')
    expect(await within(bookings).findByText('2')).toBeInTheDocument()

    const revenue = screen.getByTestId('dashboard-week-revenue')
    expect(within(revenue).getByText(/250/)).toBeInTheDocument()

    const contacts = screen.getByTestId('dashboard-week-contacts')
    expect(within(contacts).getByText('1')).toBeInTheDocument()

    // No approvals yet -> "All caught up."
    const pending = screen.getByTestId('dashboard-pending-approvals')
    expect(within(pending).getByText(/all caught up/i)).toBeInTheDocument()
  })

  it('shows a pending-approvals badge + CTA link when any bookings await approval', async () => {
    mock.state.bookings = [
      makeBooking({
        id: 'b-approval',
        current_stage: { code: 'awaiting_general_approval' },
      }),
    ]
    render(<Dashboard />)

    const badge = await screen.findByTestId('dashboard-pending-approvals-badge')
    expect(badge).toHaveTextContent(/1 awaiting/i)
    const cta = screen.getByTestId('dashboard-pending-approvals-cta')
    expect(cta).toHaveAttribute('href', '/approvals/general')
  })

  it('merges activity from bookings + contacts + approvals (sorted newest first)', async () => {
    mock.state.bookings = [
      makeBooking({
        id: 'b-new',
        created_at: '2099-12-31T23:59:59.000Z',
        customer: {
          id: 'c-1',
          first_name: 'Newest',
          last_name: 'Booking',
          email: null,
          phone: null,
        },
      }),
      makeBooking({
        id: 'b-pending',
        created_at: '2099-12-30T12:00:00.000Z',
        current_stage: { code: 'awaiting_general_approval' },
      }),
    ]
    mock.state.contacts = [
      makeContact({
        id: 'cc-new',
        created_at: '2099-12-29T08:00:00.000Z',
      }),
    ]
    render(<Dashboard />)

    const list = await screen.findByTestId('dashboard-activity-list')
    const items = within(list).getAllByRole('listitem')
    // Top item is the newest booking creation.
    expect(items[0]).toHaveAttribute(
      'data-testid',
      'dashboard-activity-booking:b-new',
    )
  })

  it('opens the booking detail sheet on row click', async () => {
    const today = todayLocalIso()
    mock.state.bookings = [
      makeBooking({
        id: 'b-clickable',
        items: [
          {
            id: 'i-1',
            date_range_start: today,
            date_range_end: today,
            selected_days: null,
            products: {
              id: 'p',
              name: 'Tandem Flight',
              product_kind: 'service',
              service_time_shape: 'single_date',
            },
          },
        ],
      }),
    ]
    const user = userEvent.setup()
    render(<Dashboard />)

    const row = await screen.findByTestId(
      'dashboard-today-row-b-clickable',
    )
    await user.click(row)
    // BookingDetailSheet uses radix Sheet — content lands in a dialog role.
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it('surfaces an error card when a fetcher fails', async () => {
    mock.state.bookingsError = { message: 'Boom' }
    render(<Dashboard />)
    expect(
      await screen.findByText(/failed to load dashboard data/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/boom/i)).toBeInTheDocument()
  })
})
