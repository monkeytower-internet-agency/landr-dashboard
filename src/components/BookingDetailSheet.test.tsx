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

const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

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

beforeEach(() => {
  fetchSpy.mockReset()
  ;(mock.builder.update as ReturnType<typeof vi.fn>).mockClear()
  ;(mock.builder.eq as ReturnType<typeof vi.fn>).mockClear()
  mock.state.contactUpdate = null
})

afterEach(() => {
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
    const raw = window.localStorage.getItem(
      'landr.dashboard.booking-checklist.op-test.b-12345678-aaaa-bbbb-cccc-dddddddddddd',
    )
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    const calledItem = parsed.items.find(
      (i: { id: string; done: boolean }) => i.id === 'default-called-customer',
    )
    expect(calledItem.done).toBe(true)

    // Custom items add + remove.
    const addInput = screen.getByTestId('booking-checklist-add-input')
    await user.type(addInput, 'Sign waiver')
    await user.click(screen.getByTestId('booking-checklist-add-submit'))
    const waiverCheckbox = screen.getByRole('checkbox', {
      name: /toggle "sign waiver"/i,
    })
    expect(waiverCheckbox).toBeInTheDocument()
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
})
