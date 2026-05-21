import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

type ContactFixture = {
  id: string
  operator_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  preferred_locale: string | null
  preferred_timezone: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  gdpr_erased_at: string | null
  gdpr_erased_by_user_id: string | null
  gdpr_erasure_note: string | null
}

const { mock } = vi.hoisted(() => {
  const state = {
    contact: null as ContactFixture | null,
    fetchError: null as { message: string } | null,
    updateError: null as { message: string } | null,
    updatePatch: null as Record<string, unknown> | null,
    // landr-7o2a — bookings fixture for the Customer 360 "Bookings" tab.
    // The fetcher chains .from('bookings').select().eq().is().order().limit()
    // and then awaits the builder directly (no .single()), so the builder
    // is made thenable below.
    bookings: [] as unknown[],
    bookingsError: null as { message: string } | null,
  }

  const contactsBuilder = () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      single: vi.fn(async () => ({
        data: state.contact,
        error: state.fetchError,
      })),
      // Used by the patchContact helper — .update().eq()
      update: vi.fn((patch: Record<string, unknown>) => {
        state.updatePatch = patch
        return {
          eq: vi.fn(async () => ({
            data: state.contact,
            error: state.updateError,
          })),
        }
      }),
    })
    return builder
  }

  // Thenable PostgREST builder for the bookings list query. await on the
  // chain resolves to `{ data, error }` like the real client.
  const bookingsBuilder = () => {
    const builder: Record<string, unknown> = {}
    const resolveAwait = (
      onFulfilled?: (v: { data: unknown[]; error: unknown }) => unknown,
    ) =>
      Promise.resolve({
        data: state.bookings,
        error: state.bookingsError,
      }).then(onFulfilled)
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: resolveAwait,
    })
    return builder
  }

  const supabase = {
    from: vi.fn((table: string) =>
      table === 'bookings' ? bookingsBuilder() : contactsBuilder(),
    ),
  }
  return { mock: { state, supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// landr-ne58 — sheet now records each open in the user-scoped
// "Recently viewed" trail via useAuth(); stub the auth module so the
// test render does not need an AuthProvider wrapper.
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'test-user', email: 'test@example.com' },
    loading: false,
    signOut: async () => {},
  }),
}))

// landr-7o2a — Bookings tab + nested BookingDetailSheet pull
// useOperatorCalendarPrefs (date display) and useOperator (current
// operator id). Stub both so the test renders without an
// OperatorProvider wrapper.
vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: 'op-1',
    currentOperator: null,
    operators: [],
    loading: false,
    switchOperator: () => {},
    refreshOperators: async () => {},
  }),
  useOperatorCalendarPrefs: () => ({
    workHoursStart: '08:00',
    workHoursEnd: '20:00',
    hour12: false,
    firstDayOfWeek: 1,
  }),
  useOperatorAllowedProductKinds: () => ['service'],
}))

import { CustomerDetailSheet } from './CustomerDetailSheet'

function makeContact(overrides: Partial<ContactFixture> = {}): ContactFixture {
  return {
    id: 'c-1',
    operator_id: 'op-1',
    first_name: 'Carol',
    last_name: 'Chen',
    email: 'carol@example.com',
    phone: '+34600111222',
    preferred_locale: 'en',
    preferred_timezone: null,
    created_at: '2026-05-10T09:00:00.000Z',
    updated_at: '2026-05-10T09:00:00.000Z',
    deleted_at: null,
    gdpr_erased_at: null,
    gdpr_erased_by_user_id: null,
    gdpr_erasure_note: null,
    ...overrides,
  }
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
  mock.state.contact = makeContact()
  mock.state.fetchError = null
  mock.state.updateError = null
  mock.state.updatePatch = null
  mock.state.bookings = []
  mock.state.bookingsError = null
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('CustomerDetailSheet', () => {
  it('renders nothing when contactId is null', () => {
    render(<CustomerDetailSheet contactId={null} onOpenChange={() => {}} />)
    expect(screen.queryByLabelText(/first name/i)).not.toBeInTheDocument()
  })

  it('fetches the contact and seeds the form with its values', async () => {
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    expect(
      await screen.findByLabelText(/first name/i),
    ).toHaveValue('Carol')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Chen')
    expect(screen.getByLabelText(/^email$/i)).toHaveValue('carol@example.com')
    expect(screen.getByLabelText(/phone/i)).toHaveValue('+34600111222')
  })

  it('widens the SheetContent to ~60vw on desktop (landr-li8e)', () => {
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)
    const content = document.querySelector('[data-slot="sheet-content"]')
    expect(content).not.toBeNull()
    // Stays as a Sheet (not modal) so the contacts list behind it remains
    // visible for quick triage. 60vw gives the contact form room.
    expect(content?.className).toMatch(/sm:max-w-\[60vw\]/)
  })

  it('disables Save until something changes, then PATCHes the contact', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={onOpenChange} />)

    const phoneInput = await screen.findByLabelText(/phone/i)
    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    expect(saveBtn).toBeDisabled()

    await user.clear(phoneInput)
    await user.type(phoneInput, '+34699000111')

    await waitFor(() => expect(saveBtn).toBeEnabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(mock.state.updatePatch).toMatchObject({ phone: '+34699000111' })
    })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('blocks Save and shows a field error for an invalid email', async () => {
    const user = userEvent.setup()
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    const emailInput = await screen.findByLabelText(/^email$/i)
    await user.clear(emailInput)
    await user.type(emailInput, 'not-an-email')

    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    await waitFor(() => expect(saveBtn).toBeDisabled())
    expect(await screen.findByText(/valid email/i)).toBeInTheDocument()
  })

  it('shows a discard-changes confirm dialog when closing dirty', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={onOpenChange} />)

    const firstName = await screen.findByLabelText(/first name/i)
    await user.clear(firstName)
    await user.type(firstName, 'Caroline')

    await user.click(screen.getByRole('button', { name: /^cancel$/i }))

    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByRole('heading', { name: /discard unsaved changes/i }),
    ).toBeInTheDocument()
    expect(onOpenChange).not.toHaveBeenCalled()

    await user.click(within(dialog).getByRole('button', { name: /^discard$/i }))
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('persists the preferred_locale change in the PATCH payload', async () => {
    const user = userEvent.setup()
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    const localeSelect = await screen.findByLabelText(/preferred language/i)
    await user.selectOptions(localeSelect, 'de')

    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    await waitFor(() => expect(saveBtn).toBeEnabled())
    await user.click(saveBtn)

    await waitFor(() => {
      expect(mock.state.updatePatch).toMatchObject({ preferred_locale: 'de' })
    })
  })

  it('preserves an unknown preferred_locale by including it as an option', async () => {
    mock.state.contact = makeContact({ preferred_locale: 'pt' })
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    const select = (await screen.findByLabelText(
      /preferred language/i,
    )) as HTMLSelectElement
    expect(select.value).toBe('pt')
    expect(
      within(select).getByRole('option', { name: 'pt' }),
    ).toBeInTheDocument()
  })

  it('surfaces fetch errors in an alert', async () => {
    mock.state.contact = null
    mock.state.fetchError = { message: 'no row' }
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    expect(await screen.findByRole('alert')).toHaveTextContent(/no row/i)
  })

  // ----- landr-7o2a — Customer 360 "Bookings" tab ------------------------

  describe('Bookings tab (landr-7o2a)', () => {
    function makeBooking(overrides: Partial<Record<string, unknown>> = {}) {
      return {
        id: 'b-1',
        created_at: '2026-04-01T09:00:00.000Z',
        current_semantic_state: 'confirmed',
        current_stage: { code: 'awaiting_payment' },
        gross_total: 250,
        currency: 'EUR',
        customer: {
          id: 'c-1',
          first_name: 'Carol',
          last_name: 'Chen',
          email: 'carol@example.com',
          phone: '+34600111222',
        },
        items: [
          {
            id: 'i-1',
            date_range_start: '2026-04-10',
            date_range_end: '2026-04-12',
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
      }
    }

    it('shows the Details and Bookings tabs once the contact has loaded', async () => {
      render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

      // Wait for the contact to land so the tablist is mounted.
      await screen.findByLabelText(/first name/i)
      expect(
        screen.getByTestId('customer-tab-details'),
      ).toHaveAttribute('aria-selected', 'true')
      expect(
        screen.getByTestId('customer-tab-bookings'),
      ).toHaveAttribute('aria-selected', 'false')
    })

    it('renders the bookings list with summary + rows when the tab is clicked', async () => {
      mock.state.bookings = [
        makeBooking({ id: 'b-1', gross_total: 250 }),
        makeBooking({
          id: 'b-2',
          gross_total: 100,
          created_at: '2026-03-15T09:00:00.000Z',
          current_semantic_state: 'finalised',
          items: [
            {
              id: 'i-2',
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
        }),
      ]
      const user = userEvent.setup()
      render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

      await user.click(await screen.findByTestId('customer-tab-bookings'))

      // Summary: "2 bookings, €350.00 total" (€350 = 250 + 100, en-IE locale).
      const summary = await screen.findByTestId('customer-bookings-summary')
      expect(summary.textContent).toMatch(/2 bookings/i)
      expect(summary.textContent).toMatch(/350/)

      // Both rows render and are clickable.
      expect(screen.getByTestId('customer-booking-row-b-1')).toBeInTheDocument()
      expect(screen.getByTestId('customer-booking-row-b-2')).toBeInTheDocument()
    })

    it('shows the empty state when the contact has no bookings', async () => {
      mock.state.bookings = []
      const user = userEvent.setup()
      render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

      await user.click(await screen.findByTestId('customer-tab-bookings'))
      expect(
        await screen.findByTestId('customer-bookings-empty'),
      ).toBeInTheDocument()
    })

    it('opens the nested BookingDetailSheet when a booking row is clicked', async () => {
      mock.state.bookings = [makeBooking({ id: 'b-99' })]
      const user = userEvent.setup()
      render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

      await user.click(await screen.findByTestId('customer-tab-bookings'))
      const row = await screen.findByTestId('customer-booking-row-b-99')
      await user.click(row)

      // Nested BookingDetailSheet exposes the details tab (per landr-5f8q
      // inline tablist) once it mounts. We rely on the testid added by that
      // sheet rather than a fragile string match.
      expect(
        await screen.findByTestId('booking-tab-details'),
      ).toBeInTheDocument()
    })
  })

  // landr-a8fg — copy-link button in the sheet header. Same clipboard stub
  // pattern as the BookingDetailSheet test (landr-7tyo): defineProperty
  // before render + raw .click() so userEvent.setup() doesn't wrap the spy.
  it('copies the deep-link URL (origin + /contacts?open=<id>) when the copy-link button is clicked', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<CustomerDetailSheet contactId="c-1" onOpenChange={() => {}} />)

    const btn = await screen.findByTestId('contact-copy-link')
    btn.click()

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/contacts?open=c-1`,
      )
    })
  })
})
