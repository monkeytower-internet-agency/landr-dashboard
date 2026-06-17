import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
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

const { mock } = vi.hoisted(() => {
  const state = {
    contactUpdate: null as unknown,
  }
  const builder: Record<string, unknown> = {}
  Object.assign(builder, {
    update: vi.fn((patch: unknown) => {
      state.contactUpdate = patch
      return builder
    }),
    eq: vi.fn(async () => ({ data: [{}], error: null })),
  })

  const supabase = {
    from: vi.fn(() => builder),
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  }

  return { mock: { state, supabase, builder } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

// landr-ne58 — the sheet now records each open in the user-scoped
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

// landr-84n1 — the Checklist tab reads currentOperatorId via useOperator
// to scope its localStorage. Stub here so tests don't need an
// OperatorProvider wrapper.
vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [],
    currentOperator: null,
    currentOperatorId: 'op-test',
    loading: false,
    switchOperator: () => {},
    refreshOperators: () => {},
  }),
}))

// landr-iz58 — the Tags card opens a TagPicker that fires fetchTags() on
// mount. Stub the lib so the tests' fetchSpy doesn't accidentally observe
// the tag call and miscount the booking_product patches.
// landr-r87i — BookingChecklist now fetches the operator's server-side
// template via useChecklistTemplate. The smoke test below only cares
// about the localStorage v2 contract + add/remove flow; mock the fetcher
// to return the same four hardcoded defaults landr-84n1 shipped so the
// test stays focused on those behaviours.
vi.mock('@/lib/checklistTemplate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/checklistTemplate')>()
  return {
    ...actual,
    fetchChecklistTemplate: vi.fn().mockResolvedValue({
      items: [
        { key: 'default-called-customer', label: 'Called customer', order: 0 },
        { key: 'default-payment-received', label: 'Payment received', order: 1 },
        { key: 'default-equipment-ready', label: 'Equipment ready', order: 2 },
        { key: 'default-emailed-pickup', label: 'Emailed pickup details', order: 3 },
      ],
    }),
    putChecklistTemplate: vi.fn(),
  }
})

// landr-z4lj — the Participants tab fires fetchBookingParticipants on
// mount. Default to an empty list so the existing tab tests don't hit
// the supabase stub through this code path; individual tests below override.
vi.mock('@/lib/booking-participants', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/booking-participants')
  >('@/lib/booking-participants')
  return {
    ...actual,
    fetchBookingParticipants: vi.fn().mockResolvedValue([]),
  }
})

// landr-6629 pattern — the Notes-tab "has notes" dot fires a useQuery on every
// render (bookingNotesQueryKey). Mock listBookingNotes so it resolves to [] in
// memory instead of going through raw fetch, which would otherwise consume a
// fetchSpy.mockResolvedValueOnce and break the action tests' call assertions.
vi.mock('@/lib/booking-notes', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/booking-notes')>()
  return {
    ...actual,
    listBookingNotes: vi.fn().mockResolvedValue([]),
  }
})

vi.mock('@/lib/tags', () => ({
  fetchTags: vi.fn().mockResolvedValue([]),
  createTag: vi.fn(),
  patchTag: vi.fn(),
  deleteTag: vi.fn(),
  setBookingTags: vi.fn().mockResolvedValue({ tag_ids: [] }),
  setContactTags: vi.fn().mockResolvedValue({ tag_ids: [] }),
  TAG_PALETTE: ['#3b82f6'],
  defaultColorFor: () => '#3b82f6',
  readableTextOn: () => '#ffffff',
  fetchBookingTagIds: vi.fn().mockResolvedValue([]),
  fetchContactTagIds: vi.fn().mockResolvedValue([]),
}))

// landr-xfcy — feature gating for invoice download + print buttons.
// Default: all features enabled (permissive), individual tests override
// isEnabledSpy.mockImplementation to simulate disabled features.
const isEnabledSpy = vi.fn((_key: string) => true)
vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: isEnabledSpy,
    isLandrStaff: false,
    effectiveIsStaff: false,
    isLoading: false,
  }),
}))

const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

// landr-6629 — mock the confirmation-status / resend functions so the
// useQuery that fires on every render does NOT go through raw fetch (which
// would break existing tests' toHaveBeenCalledOnce assertions). Individual
// tests that specifically test the resend flow call resendConfirmationSpy
// directly or override the mock.
const confirmationStatusSpy = vi.fn().mockResolvedValue({
  last_sent_at: null,
  has_material_changes: false,
  // landr-tf39: default to "a prior confirmation exists" so the
  // Resend-Confirmation button renders in the resend-flow tests.
  has_prior_confirmation: true,
})
const resendConfirmationSpy = vi.fn().mockResolvedValue({
  changes_detected: false,
  changes: [],
})
// landr-uvfg.6 — send-confirmation spy. Default resolves successfully.
const sendConfirmationSpy = vi.fn().mockResolvedValue({
  sent: true,
  email_id: 'email-abc',
})

// landr-uvfg.8 (T8) — spies for the free-form set-stage hooks. Default to an
// empty stages list so existing tests' supabase-from-spy count is unaffected;
// individual set-stage tests override fetchBookingStagesSpy.mockResolvedValue.
const fetchBookingStagesSpy = vi.fn().mockResolvedValue([])
const setBookingStageSpy = vi.fn()

vi.mock('@/lib/bookings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/bookings')>()
  return {
    ...actual,
    getConfirmationStatus: (...args: unknown[]) => confirmationStatusSpy(...args),
    resendConfirmation: (...args: unknown[]) => resendConfirmationSpy(...args),
    sendConfirmation: (...args: unknown[]) => sendConfirmationSpy(...args),
    fetchBookingStages: (...args: unknown[]) => fetchBookingStagesSpy(...args),
    setBookingStage: (...args: unknown[]) => setBookingStageSpy(...args),
  }
})

import { BookingDetailSheet } from './BookingDetailSheet'
import type { BookingRow } from '@/lib/bookings'

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

// landr-parv — return the spy so individual tests can assert on which
// query-key prefixes were invalidated after a mutation runs. The Views
// layer (lib/views-bookings-data.ts) keys under ['views-bookings'] which
// is NOT matched by the ['bookings'] prefix, so we need an explicit
// guard here to prevent regressions.
function renderWithInvalidationSpy(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const spy = vi.spyOn(client, 'invalidateQueries')
  const result = rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
  return { ...result, invalidateSpy: spy }
}

function makeRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'b-12345678-aaaa-bbbb-cccc-dddddddddddd',
    created_at: '2026-05-17T10:00:00.000Z',
    current_semantic_state: 'confirmed',
    current_stage: { code: 'confirmed' },
    gross_total: 300,
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
        date_range_start: '2026-06-01',
        date_range_end: '2026-06-03',
        selected_days: ['2026-06-01', '2026-06-02'],
        products: {
          id: 'p-1',
          name: 'Tandem Flight',
          product_kind: 'service',
          service_time_shape: 'time_slot',
        },
      },
    ],
    ...overrides,
  }
}

// Pin "today" to 2026-05-21 so date-relative UI (e.g. the Mark-as-no-show
// eligibility, which gates on `item.date_range_start <= today`) is
// deterministic regardless of the real wall clock. The default fixture's
// date_range_start is 2026-06-01 (genuinely in the future relative to this
// pin), so the no-show button stays hidden as the test expects.
//
// `canMarkAsNoShow` (and other helpers) read the current instant via a bare
// `new Date()`, which a plain `vi.spyOn(Date, 'now')` would NOT control. Use
// Date-only fake timers (`toFake: ['Date']`) so `new Date()` / `Date.now()`
// are pinned while setTimeout / Promises stay real — userEvent, waitFor and
// react-query's scheduler keep working untouched.
const FIXED_NOW = new Date('2026-05-21T12:00:00.000Z')

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(FIXED_NOW)
  fetchSpy.mockReset()
  ;(mock.builder.update as ReturnType<typeof vi.fn>).mockClear()
  ;(mock.builder.eq as ReturnType<typeof vi.fn>).mockClear()
  mock.state.contactUpdate = null
  // landr-xfcy: reset feature-gate spy to permissive (all features enabled)
  isEnabledSpy.mockImplementation((_key: string) => true)
  // landr-6629: reset confirmation-status + resend spies to their defaults.
  confirmationStatusSpy.mockResolvedValue({
    last_sent_at: null,
    has_material_changes: false,
    has_prior_confirmation: true,
  })
  resendConfirmationSpy.mockResolvedValue({ changes_detected: false, changes: [] })
  // landr-uvfg.8: reset set-stage spies to their defaults.
  fetchBookingStagesSpy.mockResolvedValue([])
  setBookingStageSpy.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
  vi.clearAllMocks()
})

describe('BookingDetailSheet', () => {
  it('renders editable customer fields seeded from the row', () => {
    const row = makeRow()
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)
    expect(screen.getByLabelText(/first name/i)).toHaveValue('Carol')
    expect(screen.getByLabelText(/last name/i)).toHaveValue('Chen')
    expect(screen.getByLabelText(/email/i)).toHaveValue('carol@example.com')
    expect(screen.getByLabelText(/phone/i)).toHaveValue('+34600111222')
  })

  it('widens the SheetContent to ~60vw on desktop (landr-li8e)', () => {
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    const content = document.querySelector('[data-slot="sheet-content"]')
    expect(content).not.toBeNull()
    // Operators review 2-3 bookings in a row; 60vw keeps the underlying
    // list visible while giving line items + customer fields room to breathe.
    expect(content?.className).toMatch(/sm:max-w-\[60vw\]/)
  })

  it('disables Save until something changes, then persists customer patch', async () => {
    const user = userEvent.setup()
    const onOpenChange = vi.fn()
    render(<BookingDetailSheet row={makeRow()} onOpenChange={onOpenChange} />)

    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    expect(saveBtn).toBeDisabled()

    const phoneInput = screen.getByLabelText(/phone/i)
    await user.clear(phoneInput)
    await user.type(phoneInput, '+34699000111')

    expect(saveBtn).toBeEnabled()
    await user.click(saveBtn)

    await waitFor(() => {
      expect(mock.builder.update).toHaveBeenCalled()
    })
    expect(mock.state.contactUpdate).toMatchObject({ phone: '+34699000111' })
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('hides the hotel-unblock button unless stage is awaiting_hotel_approval', () => {
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(
      screen.queryByRole('button', { name: /hotel confirmed/i }),
    ).not.toBeInTheDocument()
  })

  it('shows hotel-unblock button at awaiting_hotel_approval stage and POSTs branch=secondary on confirm', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ booking_id: 'b' }), { status: 200 }),
    )
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_hotel_approval' },
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)

    const unblockBtn = screen.getByRole('button', { name: /hotel confirmed/i })
    await user.click(unblockBtn)

    const dialog = await screen.findByRole('alertdialog')
    const confirmBtn = within(dialog).getByRole('button', {
      name: /unblock booking/i,
    })
    await user.click(confirmBtn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/')
    expect(url).toContain('/approval')
    const body = JSON.parse(opts.body as string)
    expect(body).toMatchObject({ branch: 'secondary', decision: 'approve' })
  })

  it('cancel flow requires a reason of >=3 chars before confirming', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ status: 'cancelled' }), { status: 200 }),
    )
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: /^cancel booking$/i }))

    const dialog = await screen.findByRole('alertdialog')
    const confirmBtn = within(dialog).getByRole('button', {
      name: /^cancel booking$/i,
    })
    expect(confirmBtn).toBeDisabled()

    const reason = within(dialog).getByLabelText(/reason/i)
    await user.type(reason, 'no')
    expect(confirmBtn).toBeDisabled()

    await user.type(reason, ' show')
    expect(confirmBtn).toBeEnabled()

    await user.click(confirmBtn)
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/')
    expect(opts.method).toBe('DELETE')
    expect(JSON.parse(opts.body as string)).toMatchObject({
      reason: 'no show',
    })
  })

  it('toggling a day chip in edit mode PATCHes the booking_product with the new selected_days', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'i-1' }), { status: 200 }),
    )
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    // Both chips are buttons in edit mode; click June 2nd to remove it
    const chip = screen.getByRole('button', { name: /remove 2026-06-02/i })
    await user.click(chip)

    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    expect(saveBtn).toBeEnabled()
    await user.click(saveBtn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/')
    expect(url).toContain('/products/i-1')
    expect(opts.method).toBe('PATCH')
    const body = JSON.parse(opts.body as string)
    expect(body).toMatchObject({
      selected_days: ['2026-06-01'],
    })
    // Removing 06-02 collapses the derived end bound to the only remaining day.
    expect(body.date_range_end).toBe('2026-06-01')
  })

  it('renders the MultiDayPicker in the Dates section with picker help text', () => {
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(screen.getByTestId('multi-day-picker')).toBeInTheDocument()
    expect(
      screen.getByText(/Hold Shift \(or Cmd\/Ctrl\) to toggle/i),
    ).toBeInTheDocument()
  })

  it('picking days in the calendar updates selection and PATCHes new bounds', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'i-1' }), { status: 200 }),
    )
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    const picker = screen.getByTestId('multi-day-picker')

    // Click a fresh day (June 5th) — establishes anchor and triggers a fill
    // from the existing selection's first day on the next click.
    const june5 = picker.querySelector(
      'button[data-day="2026-06-05"]',
    ) as HTMLButtonElement
    await user.click(june5)

    // Now click June 7th — should fill 5,6,7 alongside the original 1,2.
    const june7 = picker.querySelector(
      'button[data-day="2026-06-07"]',
    ) as HTMLButtonElement
    await user.click(june7)

    const saveBtn = screen.getByRole('button', { name: /save changes/i })
    await user.click(saveBtn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/products/i-1')
    const body = JSON.parse(opts.body as string)
    expect(body.selected_days).toEqual(
      expect.arrayContaining([
        '2026-06-01',
        '2026-06-02',
        '2026-06-05',
        '2026-06-06',
        '2026-06-07',
      ]),
    )
    // Start was already 06-01 so it's unchanged; only end gets PATCHed.
    expect(body.date_range_end).toBe('2026-06-07')
  })

  // landr-84n1 — Checklist tab wires the BookingChecklist component into
  // the existing inline tablist. Smoke test only — the storage/hook
  // contract is covered exhaustively in lib/booking-checklist.test.ts.
  it('exposes a Checklist tab that toggles a default item and persists per (operator, booking)', async () => {
    const user = userEvent.setup()
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await user.click(
      screen.getByRole('tab', { name: /^checklist$/i }),
    )

    // Default item shows up.
    const calledCheckbox = screen.getByRole('checkbox', {
      name: /toggle "called customer"/i,
    })
    expect(calledCheckbox).not.toBeChecked()
    await user.click(calledCheckbox)
    expect(calledCheckbox).toBeChecked()

    // Persisted under the (operator, booking) key.
    // landr-r87i — v2 storage shape: {v:2, done:{<id>:true}, custom:[]}.
    const raw = window.localStorage.getItem(
      'landr.dashboard.booking-checklist.op-test.b-12345678-aaaa-bbbb-cccc-dddddddddddd',
    )
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(parsed.v).toBe(2)
    expect(parsed.done['default-called-customer']).toBe(true)

    // Custom items add + remove.
    const addInput = screen.getByTestId('booking-checklist-add-input')
    await user.type(addInput, 'Sign waiver')
    await user.click(screen.getByTestId('booking-checklist-add-submit'))
    const waiverCheckbox = screen.getByRole('checkbox', {
      name: /toggle "sign waiver"/i,
    })
    expect(waiverCheckbox).toBeInTheDocument()
  })

  // landr-z4lj — Participants tab wires the BookingParticipants component
  // into the existing inline tablist. Smoke test only — the fetcher
  // contract is covered exhaustively in lib/booking-participants.test.ts
  // and the component shape in components/booking/BookingParticipants.test.tsx.
  it('exposes a Participants tab that lists rows and forwards onCustomerClick (landr-z4lj)', async () => {
    const user = userEvent.setup()
    const bookingParticipants = await import('@/lib/booking-participants')
    const fetchSpy = vi.mocked(bookingParticipants.fetchBookingParticipants)
    fetchSpy.mockResolvedValueOnce([
      {
        id: 'p-1',
        booking_id: 'b-12345678-aaaa-bbbb-cccc-dddddddddddd',
        notes: null,
        contact: {
          id: 'c-99',
          first_name: 'Pat',
          last_name: 'Pilot',
          email: 'pat@example.com',
          phone: '+34611112222',
          do_not_contact: false,
        },
        service_role: { id: 'sr-1', code: 'pilot', label: 'Pilot' },
        // landr-wv0m: guiding participant — is_guiding=true, no companion_kind.
        is_guiding: true,
        companion_kind: null,
      },
    ])

    const onCustomerClick = vi.fn()
    render(
      <BookingDetailSheet
        row={makeRow()}
        onOpenChange={() => {}}
        onCustomerClick={onCustomerClick}
      />,
    )

    await user.click(screen.getByRole('tab', { name: /^participants$/i }))

    await waitFor(() => expect(screen.getByText('Pat Pilot')).toBeInTheDocument())
    expect(screen.getByText('Pilot')).toBeInTheDocument()

    // Click-name → parent's onCustomerClick (stacked ContactDetailSheet).
    await user.click(screen.getByText('Pat Pilot'))
    expect(onCustomerClick).toHaveBeenCalledWith('c-99')
  })

  it('invalidates both [bookings] and [views-bookings] on save (landr-parv)', async () => {
    // Regression guard: BookingDetailSheet.invalidateAll used to invalidate
    // only the ['bookings'] prefix, which left the Views layer's
    // ['views-bookings', operatorId] cache stale until manual refresh.
    const user = userEvent.setup()
    const { invalidateSpy } = renderWithInvalidationSpy(
      <BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />,
    )

    const phoneInput = screen.getByLabelText(/phone/i)
    await user.clear(phoneInput)
    await user.type(phoneInput, '+34699000111')

    await user.click(screen.getByRole('button', { name: /save changes/i }))

    await waitFor(() => {
      expect(mock.builder.update).toHaveBeenCalled()
    })

    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    )
    expect(invalidatedKeys).toContainEqual(['bookings'])
    expect(invalidatedKeys).toContainEqual(['views-bookings'])
  })

  // landr-pztv — print stylesheet wiring. The @media print CSS in
  // src/index.css can't be exercised in jsdom (no print preview), so
  // these tests verify the two wiring points: (1) SheetContent exposes
  // data-print-target="booking-detail" so the stylesheet's "show only
  // this subtree" rules match, and (2) the explicit Print button in the
  // footer calls window.print() — Ctrl+P also works thanks to the
  // stylesheet, the button surfaces the affordance for discoverability.
  it('exposes data-print-target="booking-detail" on the sheet content (landr-pztv)', () => {
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    const content = document.querySelector('[data-slot="sheet-content"]')
    expect(content).not.toBeNull()
    expect(content?.getAttribute('data-print-target')).toBe('booking-detail')
  })

  it('Print button in the footer calls window.print() (landr-pztv)', async () => {
    const user = userEvent.setup()
    const printSpy = vi.fn()
    const original = window.print
    window.print = printSpy
    try {
      render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
      const btn = screen.getByTestId('booking-print-btn')
      await user.click(btn)
      expect(printSpy).toHaveBeenCalledOnce()
    } finally {
      window.print = original
    }
  })

  // landr-a8fg — copy-link button in the sheet header. Mirrors the
  // EmailTemplatePreview clipboard pattern (landr-7tyo): install the
  // navigator.clipboard stub via Object.defineProperty BEFORE rendering and
  // dispatch a raw .click() so userEvent.setup's internal clipboard wrapping
  // can't intercept the writeText spy.
  it('copies the deep-link URL (origin + /bookings?open=<id>) when the copy-link button is clicked', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    const btn = await screen.findByTestId('booking-copy-link')
    btn.click()

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        `${window.location.origin}/bookings?open=b-12345678-aaaa-bbbb-cccc-dddddddddddd`,
      )
    })
  })

  // -----------------------------------------------------------------------
  // landr-ng3m — Mark-as-no-show workflow.
  // -----------------------------------------------------------------------

  it('hides the Mark-as-no-show button for a future-only booking', () => {
    // Default fixture date_range_start = 2026-06-01 which is after the
    // test env's "today" (2026-05-21). No event has happened yet, so the
    // button should not be offered.
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(
      screen.queryByRole('button', { name: /mark as no-show/i }),
    ).not.toBeInTheDocument()
  })

  it('hides the Mark-as-no-show button when stage is already no_show', () => {
    const row = makeRow({
      current_semantic_state: 'no_show',
      current_stage: { code: 'no_show' },
      items: [
        {
          id: 'i-1',
          date_range_start: '2026-05-01',
          date_range_end: '2026-05-01',
          selected_days: ['2026-05-01'],
          products: {
            id: 'p-1',
            name: 'Tandem Flight',
            product_kind: 'service',
            service_time_shape: 'time_slot',
          },
        },
      ],
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)
    expect(
      screen.queryByRole('button', { name: /mark as no-show/i }),
    ).not.toBeInTheDocument()
  })

  it('shows Mark-as-no-show when an item has already started, POSTs with charge_cancellation_fee=false by default', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          booking_id: 'b',
          previous_stage_code: 'confirmed',
          new_stage_code: 'no_show',
          new_semantic_state: 'no_show',
        }),
        { status: 200 },
      ),
    )
    const row = makeRow({
      items: [
        {
          id: 'i-1',
          // before "today" (2026-05-21) per the env fixture date.
          date_range_start: '2026-05-01',
          date_range_end: '2026-05-02',
          selected_days: ['2026-05-01', '2026-05-02'],
          products: {
            id: 'p-1',
            name: 'Tandem Flight',
            product_kind: 'service',
            service_time_shape: 'time_slot',
          },
        },
      ],
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)

    const btn = screen.getByRole('button', { name: /mark as no-show/i })
    await user.click(btn)

    const dialog = await screen.findByRole('alertdialog')
    // Confirm without flipping the cancellation-fee checkbox; the call
    // should default the flag to false.
    const confirmBtn = within(dialog).getByRole('button', {
      name: /mark as no-show/i,
    })
    await user.click(confirmBtn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/operators/op-test/bookings/')
    expect(url).toContain('/no-show')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({
      charge_cancellation_fee: false,
    })
  })

  it('checking the cancellation-fee checkbox sends charge_cancellation_fee=true', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          booking_id: 'b',
          previous_stage_code: 'confirmed',
          new_stage_code: 'no_show',
          new_semantic_state: 'no_show',
        }),
        { status: 200 },
      ),
    )
    const row = makeRow({
      items: [
        {
          id: 'i-1',
          date_range_start: '2026-05-01',
          date_range_end: '2026-05-01',
          selected_days: ['2026-05-01'],
          products: {
            id: 'p-1',
            name: 'Tandem Flight',
            product_kind: 'service',
            service_time_shape: 'time_slot',
          },
        },
      ],
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: /mark as no-show/i }))
    const dialog = await screen.findByRole('alertdialog')

    const checkbox = within(dialog).getByTestId('no-show-charge-fee')
    await user.click(checkbox)

    await user.click(
      within(dialog).getByRole('button', { name: /mark as no-show/i }),
    )

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string)).toEqual({
      charge_cancellation_fee: true,
    })
  })

  it('Mark-as-no-show invalidates [bookings] and [views-bookings] on success', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          booking_id: 'b',
          previous_stage_code: 'confirmed',
          new_stage_code: 'no_show',
          new_semantic_state: 'no_show',
        }),
        { status: 200 },
      ),
    )
    const row = makeRow({
      items: [
        {
          id: 'i-1',
          date_range_start: '2026-05-01',
          date_range_end: '2026-05-01',
          selected_days: ['2026-05-01'],
          products: {
            id: 'p-1',
            name: 'Tandem Flight',
            product_kind: 'service',
            service_time_shape: 'time_slot',
          },
        },
      ],
    })
    const { invalidateSpy } = renderWithInvalidationSpy(
      <BookingDetailSheet row={row} onOpenChange={() => {}} />,
    )

    await user.click(screen.getByRole('button', { name: /mark as no-show/i }))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(
      within(dialog).getByRole('button', { name: /mark as no-show/i }),
    )

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    )
    expect(invalidatedKeys).toContainEqual(['bookings'])
    expect(invalidatedKeys).toContainEqual(['views-bookings'])
  })

  // landr-irds — Download invoice button. Verifies the button renders +
  // GETs the auth-protected operator-scoped invoice endpoint on click. The
  // download-trigger side-effect (createObjectURL + synthetic anchor) is
  // covered exhaustively in src/lib/invoice-download.test.ts.
  it('renders a Download invoice button in the footer (landr-irds)', () => {
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(screen.getByTestId('booking-invoice-btn')).toBeInTheDocument()
  })

  it('Download invoice button GETs the operator-scoped invoice.pdf endpoint (landr-irds)', async () => {
    const user = userEvent.setup()
    // Stub createObjectURL/revokeObjectURL so the synthetic-anchor download
    // path doesn't blow up in jsdom (which doesn't implement them).
    const createObjectURL = vi.fn(() => 'blob:fake')
    const revokeObjectURL = vi.fn()
    Object.defineProperty(window.URL, 'createObjectURL', {
      configurable: true,
      value: createObjectURL,
    })
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      configurable: true,
      value: revokeObjectURL,
    })
    fetchSpy.mockResolvedValueOnce(
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    )
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await user.click(screen.getByTestId('booking-invoice-btn'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/operators/op-test/bookings/')
    expect(url).toContain('/invoice.pdf')
    expect(opts.method).toBe('GET')
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token',
    )
    await waitFor(() => expect(createObjectURL).toHaveBeenCalledOnce())
  })

  // -----------------------------------------------------------------------
  // landr-okxm — Mark-as-paid workflow.
  // -----------------------------------------------------------------------

  it('hides the Mark-as-paid button when stage is not awaiting_payment', () => {
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(screen.queryByTestId('booking-mark-paid-btn')).not.toBeInTheDocument()
  })

  it('hides the Mark-as-paid button when balance_due is zero', () => {
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_payment' },
      balance_due: 0,
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)
    expect(screen.queryByTestId('booking-mark-paid-btn')).not.toBeInTheDocument()
  })

  it('shows Mark-as-paid when stage=awaiting_payment, prefills amount with balance_due, POSTs to mark-paid', async () => {
    const user = userEvent.setup()
    fetchSpy.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          booking_id: 'b',
          payment_id: 'pay-1',
          amount: '300.00',
          currency: 'EUR',
          method: 'cash',
          provider: 'manual_cash',
          previous_stage_code: 'awaiting_payment',
          new_stage_code: 'paid_pending_cutoff',
          new_semantic_state: 'confirmed',
          advanced_to_confirmed: true,
        }),
        { status: 200 },
      ),
    )
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_payment' },
      balance_due: '300.00',
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)

    const btn = screen.getByTestId('booking-mark-paid-btn')
    await user.click(btn)

    const dialog = await screen.findByRole('alertdialog')
    const amount = within(dialog).getByTestId('mark-paid-amount') as HTMLInputElement
    // Defaulted to balance_due rendered to 2 decimal places.
    expect(amount.value).toBe('300.00')

    const confirmBtn = within(dialog).getByTestId('mark-paid-confirm')
    await user.click(confirmBtn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/operators/op-test/bookings/')
    expect(url).toContain('/mark-paid')
    expect(opts.method).toBe('POST')
    expect(JSON.parse(opts.body as string)).toEqual({
      method: 'cash',
      amount: '300.00',
    })
  })

  it('switching method to bank_transfer + lowering the amount records a partial payment', async () => {
    const user = userEvent.setup()
    fetchSpy.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          booking_id: 'b',
          payment_id: 'pay-1',
          amount: '100.00',
          currency: 'EUR',
          method: 'bank_transfer',
          provider: 'manual_transfer',
          previous_stage_code: 'awaiting_payment',
          new_stage_code: 'awaiting_payment',
          new_semantic_state: 'pending',
          advanced_to_confirmed: false,
        }),
        { status: 200 },
      ),
    )
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_payment' },
      balance_due: '300.00',
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)

    await user.click(screen.getByTestId('booking-mark-paid-btn'))
    const dialog = await screen.findByRole('alertdialog')

    const method = within(dialog).getByTestId('mark-paid-method') as HTMLSelectElement
    await user.selectOptions(method, 'bank_transfer')

    const amount = within(dialog).getByTestId('mark-paid-amount') as HTMLInputElement
    await user.clear(amount)
    await user.type(amount, '100')

    const note = within(dialog).getByTestId('mark-paid-note') as HTMLTextAreaElement
    await user.type(note, 'Wire ref 12345')

    await user.click(within(dialog).getByTestId('mark-paid-confirm'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string)).toEqual({
      method: 'bank_transfer',
      amount: '100',
      note: 'Wire ref 12345',
    })
  })

  it('Mark-as-paid invalidates [bookings] and [views-bookings] on success', async () => {
    const user = userEvent.setup()
    fetchSpy.mockImplementation(async () =>
      new Response(
        JSON.stringify({
          booking_id: 'b',
          payment_id: 'pay-1',
          amount: '300.00',
          currency: 'EUR',
          method: 'cash',
          provider: 'manual_cash',
          previous_stage_code: 'awaiting_payment',
          new_stage_code: 'paid_pending_cutoff',
          new_semantic_state: 'confirmed',
          advanced_to_confirmed: true,
        }),
        { status: 200 },
      ),
    )
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_payment' },
      balance_due: '300.00',
    })
    const { invalidateSpy } = renderWithInvalidationSpy(
      <BookingDetailSheet row={row} onOpenChange={() => {}} />,
    )

    await user.click(screen.getByTestId('booking-mark-paid-btn'))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByTestId('mark-paid-confirm'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    )
    expect(invalidatedKeys).toContainEqual(['bookings'])
    expect(invalidatedKeys).toContainEqual(['views-bookings'])
  })

  // -----------------------------------------------------------------------
  // landr-xfcy — feature gating for invoice download + print buttons.
  // -----------------------------------------------------------------------

  it('hides invoice button when booking_invoice_download feature is disabled', () => {
    isEnabledSpy.mockImplementation((key: string) => key !== 'booking_invoice_download')
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(
      screen.queryByTestId('booking-invoice-btn'),
    ).not.toBeInTheDocument()
  })

  it('shows invoice button when booking_invoice_download feature is enabled', () => {
    // Default spy already returns true for all keys.
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(screen.getByTestId('booking-invoice-btn')).toBeInTheDocument()
  })

  it('hides print button when booking_print feature is disabled', () => {
    isEnabledSpy.mockImplementation((key: string) => key !== 'booking_print')
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(
      screen.queryByTestId('booking-print-btn'),
    ).not.toBeInTheDocument()
  })

  it('shows print button when booking_print feature is enabled', () => {
    // Default spy already returns true for all keys.
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(screen.getByTestId('booking-print-btn')).toBeInTheDocument()
  })

  // -----------------------------------------------------------------------
  // landr-6629 — Resend confirmation email with old→new diff.
  // -----------------------------------------------------------------------

  it('renders the Resend confirmation button when a prior confirmation exists', async () => {
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    // landr-tf39: the button only appears once confirmation-status resolves
    // with has_prior_confirmation=true (the default mock).
    expect(
      await screen.findByTestId('booking-resend-confirmation-btn'),
    ).toBeInTheDocument()
  })

  it('hides the Resend confirmation button when no prior confirmation exists (landr-tf39)', async () => {
    confirmationStatusSpy.mockResolvedValue({
      last_sent_at: null,
      has_material_changes: false,
      has_prior_confirmation: false,
    })
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await waitFor(() => expect(confirmationStatusSpy).toHaveBeenCalled())
    expect(
      screen.queryByTestId('booking-resend-confirmation-btn'),
    ).not.toBeInTheDocument()
  })

  it('Resend confirmation calls resendConfirmation() with the operator + booking ID', async () => {
    const user = userEvent.setup()
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await user.click(
      await screen.findByTestId('booking-resend-confirmation-btn'),
    )

    await waitFor(() => {
      expect(resendConfirmationSpy).toHaveBeenCalledWith(
        'op-test',
        'b-12345678-aaaa-bbbb-cccc-dddddddddddd',
      )
    })
  })

  it('shows the dot badge when confirmation-status has_material_changes=true', async () => {
    confirmationStatusSpy.mockResolvedValue({
      last_sent_at: '2026-06-01T10:00:00Z',
      has_material_changes: true,
      has_prior_confirmation: true,
    })
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await waitFor(() => {
      expect(screen.queryByTestId('booking-resend-confirmation-dot')).toBeInTheDocument()
    })
  })

  it('hides the dot badge when confirmation-status has_material_changes=false', async () => {
    // Default spy returns false — no override needed.
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    // Wait for the query to resolve before asserting absence.
    await waitFor(() => {
      expect(confirmationStatusSpy).toHaveBeenCalled()
    })
    expect(screen.queryByTestId('booking-resend-confirmation-dot')).not.toBeInTheDocument()
  })

  it('shows success toast with change count when resend returns changes', async () => {
    const user = userEvent.setup()
    const { toast: sonnerToast } = await import('sonner')
    resendConfirmationSpy.mockResolvedValue({
      changes_detected: true,
      changes: [
        { label: 'Booking date (start)', old: '2026-07-01', new: '2026-08-01' },
      ],
    })
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await user.click(
      await screen.findByTestId('booking-resend-confirmation-btn'),
    )

    await waitFor(() => {
      expect(sonnerToast.success).toHaveBeenCalledWith(
        expect.stringContaining('1 change'),
      )
    })
  })

  // -----------------------------------------------------------------------
  // landr-uvfg.6 — Send confirmation (first send for never-confirmed bookings)
  // -----------------------------------------------------------------------

  it('shows Send confirmation button when no prior confirmation exists', async () => {
    confirmationStatusSpy.mockResolvedValue({
      last_sent_at: null,
      has_material_changes: false,
      has_prior_confirmation: false,
    })
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await waitFor(() => expect(confirmationStatusSpy).toHaveBeenCalled())
    expect(
      await screen.findByTestId('booking-send-confirmation-btn'),
    ).toBeInTheDocument()
    // Resend button must NOT appear alongside it.
    expect(
      screen.queryByTestId('booking-resend-confirmation-btn'),
    ).not.toBeInTheDocument()
  })

  it('hides Send confirmation button when a prior confirmation exists', async () => {
    // Default mock has has_prior_confirmation: true — resend button renders instead.
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    // Wait for the resend button to appear (query resolved → hasPriorConfirmation=true).
    await screen.findByTestId('booking-resend-confirmation-btn')
    // Once the query has resolved and the resend button is visible, the send
    // button must have been replaced.
    await waitFor(() => {
      expect(
        screen.queryByTestId('booking-send-confirmation-btn'),
      ).not.toBeInTheDocument()
    })
  })

  it('Send confirmation calls sendConfirmation() with operator + booking ID', async () => {
    const user = userEvent.setup()
    confirmationStatusSpy.mockResolvedValue({
      last_sent_at: null,
      has_material_changes: false,
      has_prior_confirmation: false,
    })
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await user.click(
      await screen.findByTestId('booking-send-confirmation-btn'),
    )

    await waitFor(() => {
      expect(sendConfirmationSpy).toHaveBeenCalledWith(
        'op-test',
        'b-12345678-aaaa-bbbb-cccc-dddddddddddd',
      )
    })
  })

  it('shows success toast with customer name after send confirmation', async () => {
    const user = userEvent.setup()
    const { toast: sonnerToast } = await import('sonner')
    confirmationStatusSpy.mockResolvedValue({
      last_sent_at: null,
      has_material_changes: false,
      has_prior_confirmation: false,
    })
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await user.click(
      await screen.findByTestId('booking-send-confirmation-btn'),
    )

    await waitFor(() => {
      expect(sonnerToast.success).toHaveBeenCalledWith(
        expect.stringContaining('Confirmation sent to'),
      )
    })
  })

  // -----------------------------------------------------------------------
  // landr-hgd4 — General approve / reject from the booking detail sheet.
  // -----------------------------------------------------------------------

  it('hides Approve/Reject buttons when stage is not awaiting_general_approval', () => {
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)
    expect(
      screen.queryByTestId('booking-general-approve-btn'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('booking-general-reject-btn'),
    ).not.toBeInTheDocument()
  })

  it('shows Approve and Reject buttons when stage is awaiting_general_approval', () => {
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_general_approval' },
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)
    expect(screen.getByTestId('booking-general-approve-btn')).toBeInTheDocument()
    expect(screen.getByTestId('booking-general-reject-btn')).toBeInTheDocument()
  })

  it('Approve opens a dialog and POSTs branch=general decision=approve on confirm', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ booking_id: 'b' }), { status: 200 }),
    )
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_general_approval' },
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)

    await user.click(screen.getByTestId('booking-general-approve-btn'))

    const dialog = await screen.findByRole('alertdialog')
    const confirmBtn = within(dialog).getByTestId('general-approve-confirm')
    await user.click(confirmBtn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/')
    expect(url).toContain('/approval')
    const body = JSON.parse(opts.body as string)
    expect(body).toMatchObject({ branch: 'general', decision: 'approve' })
  })

  it('Approve sends optional note when the operator types one', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ booking_id: 'b' }), { status: 200 }),
    )
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_general_approval' },
    })
    render(<BookingDetailSheet row={row} onOpenChange={() => {}} />)

    await user.click(screen.getByTestId('booking-general-approve-btn'))
    const dialog = await screen.findByRole('alertdialog')

    const noteInput = within(dialog).getByTestId('general-approve-note')
    await user.type(noteInput, 'Looks good')

    await user.click(within(dialog).getByTestId('general-approve-confirm'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(JSON.parse(opts.body as string)).toMatchObject({
      branch: 'general',
      decision: 'approve',
      notes: 'Looks good',
    })
  })

  it('Reject opens a dialog and POSTs branch=general decision=reject on confirm', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ booking_id: 'b' }), { status: 200 }),
    )
    const onOpenChange = vi.fn()
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_general_approval' },
    })
    render(<BookingDetailSheet row={row} onOpenChange={onOpenChange} />)

    await user.click(screen.getByTestId('booking-general-reject-btn'))

    const dialog = await screen.findByRole('alertdialog')
    const confirmBtn = within(dialog).getByTestId('general-reject-confirm')
    await user.click(confirmBtn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/')
    expect(url).toContain('/approval')
    const body = JSON.parse(opts.body as string)
    expect(body).toMatchObject({ branch: 'general', decision: 'reject' })
    // Reject closes the sheet on success.
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false))
  })

  it('General approve invalidates [bookings] and [views-bookings] on success', async () => {
    const user = userEvent.setup()
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ booking_id: 'b' }), { status: 200 }),
    )
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_general_approval' },
    })
    const { invalidateSpy } = renderWithInvalidationSpy(
      <BookingDetailSheet row={row} onOpenChange={() => {}} />,
    )

    await user.click(screen.getByTestId('booking-general-approve-btn'))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByTestId('general-approve-confirm'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    )
    expect(invalidatedKeys).toContainEqual(['bookings'])
    expect(invalidatedKeys).toContainEqual(['views-bookings'])
  })

  // -----------------------------------------------------------------------
  // landr-v9e4.11 — error-branch tests.
  // -----------------------------------------------------------------------

  it('mark-paid POST rejection → shows error toast, dialog stays open, no invalidation', async () => {
    const user = userEvent.setup()
    const { toast: sonnerToast } = await import('sonner')
    // Reject with a 422 carrying a server detail string.
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: 'Booking already paid' }),
        { status: 422 },
      ),
    )
    const row = makeRow({
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_payment' },
      balance_due: '300.00',
    })
    const { invalidateSpy } = renderWithInvalidationSpy(
      <BookingDetailSheet row={row} onOpenChange={() => {}} />,
    )

    await user.click(screen.getByTestId('booking-mark-paid-btn'))
    const dialog = await screen.findByRole('alertdialog')
    await user.click(within(dialog).getByTestId('mark-paid-confirm'))

    // Error toast must fire with the server's detail string.
    await waitFor(() => {
      expect(sonnerToast.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ description: 'Booking already paid' }),
      )
    })

    // The dialog must remain open (button still present).
    expect(screen.queryByTestId('mark-paid-confirm')).toBeInTheDocument()

    // No cache invalidation on error.
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('cancel-with-reason rejection → shows error toast, reason preserved for retry', async () => {
    const user = userEvent.setup()
    const { toast: sonnerToast } = await import('sonner')
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: 'Cannot cancel at this stage' }),
        { status: 409 },
      ),
    )
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    await user.click(screen.getByRole('button', { name: /^cancel booking$/i }))
    const dialog = await screen.findByRole('alertdialog')

    const reason = within(dialog).getByLabelText(/reason/i)
    await user.type(reason, 'weather abort')

    const confirmBtn = within(dialog).getByRole('button', { name: /^cancel booking$/i })
    await user.click(confirmBtn)

    // Error toast with the server message.
    await waitFor(() => {
      expect(sonnerToast.error).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({ description: 'Cannot cancel at this stage' }),
      )
    })

    // Dialog still open — reason input still shows the typed text so the
    // operator can retry without re-typing the reason.
    const reasonAfter = within(dialog).getByLabelText(/reason/i) as HTMLTextAreaElement
    expect(reasonAfter.value).toBe('weather abort')
  })

  // -----------------------------------------------------------------------
  // landr-uvfg.8 (T8) — free-form set-stage Select + non-canonical confirm.
  // -----------------------------------------------------------------------

  it('renders the stage Select when operator stages are loaded', async () => {
    fetchBookingStagesSpy.mockResolvedValue([
      { id: 's1', code: 'draft', label: 'Draft', semantic_state: 'pending', sort_order: 1 },
      { id: 's2', code: 'awaiting_payment', label: 'Awaiting payment', semantic_state: 'pending', sort_order: 2 },
    ])
    render(<BookingDetailSheet row={makeRow()} onOpenChange={() => {}} />)

    const select = await screen.findByTestId('booking-stage-select')
    expect(select).toBeInTheDocument()
  })

  it('non-canonical target: requires_confirmation true shows warning dialog, confirm fires force call', async () => {
    const user = userEvent.setup()
    const { toast: sonnerToast } = await import('sonner')

    fetchBookingStagesSpy.mockResolvedValue([
      { id: 's1', code: 'draft', label: 'Draft', semantic_state: 'pending', sort_order: 1 },
      { id: 's2', code: 'awaiting_payment', label: 'Awaiting payment', semantic_state: 'pending', sort_order: 2 },
      { id: 's3', code: 'finalised', label: 'Finalised', semantic_state: 'finalised', sort_order: 3 },
    ])

    // First call (force:false) returns requires_confirmation.
    setBookingStageSpy.mockResolvedValueOnce({
      ok: true,
      applied: false,
      requires_confirmation: true,
      warning: "Setting 'draft' to 'finalised' skips stages in the normal flow.",
      side_effects_skipped: ['customer confirmation email'],
      current_stage_code: 'draft',
      semantic_state: 'pending',
    })

    // Second call (force:true) succeeds.
    setBookingStageSpy.mockResolvedValueOnce({
      ok: true,
      applied: true,
      requires_confirmation: false,
      warning: null,
      side_effects_skipped: [],
      current_stage_code: 'finalised',
      semantic_state: 'finalised',
    })

    render(
      <BookingDetailSheet
        row={makeRow({ current_stage: { code: 'draft' } })}
        onOpenChange={() => {}}
      />,
    )

    const select = await screen.findByTestId('booking-stage-select')
    await user.selectOptions(select, 'finalised')

    // Warning dialog must appear.
    const dialog = await screen.findByRole('alertdialog')
    expect(
      within(dialog).getByText(/skips stages in the normal flow/i),
    ).toBeInTheDocument()
    expect(
      within(dialog).getByText(/customer confirmation email/i),
    ).toBeInTheDocument()

    // Confirm the forced transition.
    const confirmBtn = within(dialog).getByRole('button', { name: /move anyway/i })
    await user.click(confirmBtn)

    // The second (force:true) call must be the last one made.
    await waitFor(() => {
      expect(setBookingStageSpy).toHaveBeenCalledTimes(2)
      expect(setBookingStageSpy).toHaveBeenLastCalledWith(
        'op-test',
        'b-12345678-aaaa-bbbb-cccc-dddddddddddd',
        expect.objectContaining({ target_stage_code: 'finalised', force: true }),
      )
    })

    // Success toast fires with the stage label.
    await waitFor(() => {
      expect(sonnerToast.success).toHaveBeenCalledWith(
        expect.stringContaining('Finalised'),
      )
    })
  })
})
