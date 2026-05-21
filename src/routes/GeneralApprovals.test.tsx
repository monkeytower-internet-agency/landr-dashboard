import {
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock() picks them up before module evaluation
// ---------------------------------------------------------------------------

const { mock } = vi.hoisted(() => {
  type ApprovalRow = {
    id: string
    created_at: string
    current_semantic_state: string
    current_stage: { code: string } | null
    gross_total: number
    currency: string
    customer: {
      id: string
      first_name: string | null
      last_name: string | null
      email: string | null
    } | null
    items: Array<{
      id: string
      date_range_start: string | null
      date_range_end: string | null
      selected_days: string[] | null
      products: { id: string; name: string } | null
    }>
  }

  const state = {
    rows: [] as ApprovalRow[],
    error: null as { message: string } | null,
    fetchResult: null as Response | null,
  }

  const fromBuilder = () => {
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn(() => builder),
      filter: vi.fn(() => builder),
      is: vi.fn(() => builder),
      order: vi.fn(async () => ({ data: state.rows, error: state.error })),
    })
    return builder
  }

  const supabase = {
    from: vi.fn(() => fromBuilder()),
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  }

  return { mock: { state, supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  // landr-f1s — GeneralApprovals now reads calendar prefs.
  useOperatorCalendarPrefs: () => ({
    workHoursStart: '08:00',
    workHoursEnd: '20:00',
    hour12: false,
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

// landr-aqn4 — the new ApprovalsFilters chip bar persists state per-user
// via useAuth(); stub it so the queue can mount without a real provider.
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: { id: 'user-1' },
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}))

// landr-8eks — capture sonner toast calls so we can assert the bulk
// approve/reject path no longer surfaces the no-op Undo affordance.
const { toastCalls } = vi.hoisted(() => ({
  toastCalls: {
    success: [] as Array<{ message: unknown; options?: unknown }>,
    warning: [] as Array<{ message: unknown; options?: unknown }>,
    error: [] as Array<{ message: unknown; options?: unknown }>,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((message: unknown, options?: unknown) => {
      toastCalls.success.push({ message, options })
    }),
    warning: vi.fn((message: unknown, options?: unknown) => {
      toastCalls.warning.push({ message, options })
    }),
    error: vi.fn((message: unknown, options?: unknown) => {
      toastCalls.error.push({ message, options })
    }),
  },
  Toaster: () => null,
}))

// Stub window.fetch used by postGeneralApprovalDecision
const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

import { GeneralApprovals } from './GeneralApprovals'

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

const sampleRow = {
  id: 'b-abc123',
  created_at: '2026-05-17T10:00:00.000Z',
  current_semantic_state: 'pending',
  current_stage: { code: 'awaiting_general_approval' },
  gross_total: 300,
  currency: 'EUR',
  // landr-aqn4 — approval_trace is now selected on the row; the reason
  // chip filter buckets off `applied_rules[].rule_kind`.
  approval_trace: {
    outcome: 'requires_general_approval',
    applied_rules: [{ rule_kind: 'capacity_threshold', detail: {} }],
  },
  customer: {
    id: 'c-1',
    first_name: 'Carol',
    last_name: 'Chen',
    email: 'carol@example.com',
  },
  items: [
    {
      id: 'i-1',
      date_range_start: '2026-05-25',
      date_range_end: '2026-05-25',
      selected_days: ['2026-05-25'],
      products: { id: 'p-1', name: 'Tandem Flight' },
    },
  ],
}

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
  fetchSpy.mockReset()
  toastCalls.success.length = 0
  toastCalls.warning.length = 0
  toastCalls.error.length = 0
  // landr-aqn4 — ApprovalsFilters persists state under
  // `landr.dashboard.approvalsFilters.<userId>`; tests share the mocked
  // user-1 so clear between specs to avoid filter leakage.
  window.localStorage.clear()
})

afterEach(() => {
  vi.clearAllMocks()
})

// landr-aqn4 — second sample row used for sort/filter tests. Different
// reason bucket (first_time_customer), different product/customer/price
// so each filter dimension has at least one differentiating value.
const newCustomerRow = {
  id: 'b-xyz789',
  created_at: '2026-05-19T10:00:00.000Z',
  current_semantic_state: 'pending',
  current_stage: { code: 'awaiting_general_approval' },
  gross_total: 90,
  currency: 'EUR',
  approval_trace: {
    outcome: 'requires_general_approval',
    applied_rules: [{ rule_kind: 'first_time_customer', detail: {} }],
  },
  customer: {
    id: 'c-2',
    first_name: 'Adam',
    last_name: 'Adams',
    email: 'adam@example.com',
  },
  items: [
    {
      id: 'i-2',
      date_range_start: '2026-06-15',
      date_range_end: '2026-06-15',
      selected_days: ['2026-06-15'],
      products: { id: 'p-2', name: 'Solo Course' },
    },
  ],
}

describe('GeneralApprovals route', () => {
  it('renders approval queue rows from Supabase', async () => {
    mock.state.rows = [sampleRow]
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    expect(screen.getByText('Tandem Flight')).toBeInTheDocument()
    // Both action buttons per row
    expect(
      screen.getByRole('button', { name: /approve booking b-abc123/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /reject booking b-abc123/i }),
    ).toBeInTheDocument()
  })

  it('approve flow: opens dialog, submits decision, invalidates query', async () => {
    mock.state.rows = [sampleRow]
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ booking_id: 'b-abc123' }), { status: 200 }),
    )
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    // Wait for data
    await screen.findByText('Carol Chen')

    // Click Approve
    await user.click(
      screen.getByRole('button', { name: /approve booking b-abc123/i }),
    )

    // Confirm dialog is open
    expect(
      await screen.findByRole('alertdialog'),
    ).toBeInTheDocument()
    expect(screen.getByText(/approve booking/i)).toBeInTheDocument()

    // Click the confirm Approve button inside the dialog
    const confirmBtn = screen.getByRole('button', { name: /^approve$/i })
    await user.click(confirmBtn)

    // Verify fetch was called with correct params
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/b-abc123/approval')
    const body = JSON.parse(opts.body as string)
    expect(body).toMatchObject({ branch: 'general', decision: 'approve' })
    expect(opts.headers).toMatchObject({
      Authorization: 'Bearer test-token',
    })
  })

  it('reject flow: opens dialog, submits decision with note', async () => {
    mock.state.rows = [sampleRow]
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ booking_id: 'b-abc123' }), { status: 200 }),
    )
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')

    // Click Reject
    await user.click(
      screen.getByRole('button', { name: /reject booking b-abc123/i }),
    )

    // Dialog shows
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(screen.getByText(/reject booking/i)).toBeInTheDocument()

    // Type a note
    const noteField = screen.getByRole('textbox', { name: /note/i })
    await user.type(noteField, 'High risk customer')

    // Submit
    const confirmBtn = screen.getByRole('button', { name: /^reject$/i })
    await user.click(confirmBtn)

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledOnce())
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain('/api/staff/bookings/b-abc123/approval')
    const body = JSON.parse(opts.body as string)
    expect(body).toMatchObject({
      branch: 'general',
      decision: 'reject',
      notes: 'High risk customer',
    })
  })

  // ---- landr-aqn4 ------------------------------------------------------

  it('shows a friendly empty state when there are no pending approvals', async () => {
    mock.state.rows = []
    render(<GeneralApprovals />)

    await waitFor(() =>
      expect(screen.getByTestId('approvals-empty-state')).toBeInTheDocument(),
    )
    expect(screen.getByText(/all caught up/i)).toBeInTheDocument()
    // No count badge when count is zero.
    expect(
      screen.queryByTestId('approvals-count-badge'),
    ).not.toBeInTheDocument()
  })

  it('shows the pending count badge in the header', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    render(<GeneralApprovals />)

    const badge = await screen.findByTestId('approvals-count-badge')
    expect(badge).toHaveTextContent('2 pending')
  })

  it('renders the new Activity-date column', async () => {
    mock.state.rows = [sampleRow]
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    // The Activity-date column header is sortable; matched via test id.
    expect(
      screen.getByTestId('approvals-sort-activity_date'),
    ).toBeInTheDocument()
    // The cell renders firstActivityDate formatted as 'Mon 25 May'.
    expect(screen.getByText(/25 May/)).toBeInTheDocument()
  })

  it('clicking a row opens the BookingDetailSheet', async () => {
    mock.state.rows = [sampleRow]
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    // Click the row body (not an Approve/Reject button, which stop
    // propagation so they don't open the sheet).
    await user.click(screen.getByTestId('approvals-row-b-abc123'))

    // BookingDetailSheet renders a region named 'Booking' once open.
    expect(await screen.findByText(/Booking/)).toBeInTheDocument()
  })

  it('sorts by customer name asc/desc when the column header is clicked', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')

    // First click → ascending: Adam first.
    await user.click(screen.getByTestId('approvals-sort-customer'))
    const rowsAsc = screen.getAllByTestId(/approvals-row-/)
    expect(rowsAsc[0]).toHaveAttribute(
      'data-testid',
      'approvals-row-b-xyz789',
    )
    expect(rowsAsc[1]).toHaveAttribute(
      'data-testid',
      'approvals-row-b-abc123',
    )

    // Second click → descending: Carol first.
    await user.click(screen.getByTestId('approvals-sort-customer'))
    const rowsDesc = screen.getAllByTestId(/approvals-row-/)
    expect(rowsDesc[0]).toHaveAttribute(
      'data-testid',
      'approvals-row-b-abc123',
    )
  })

  it('reason filter narrows the table to matching bookings only', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    expect(screen.getByText('Adam Adams')).toBeInTheDocument()

    // Open the reason dropdown and select 'New customer'.
    await user.click(
      screen.getByTestId('approvals-filters-reason-trigger'),
    )
    await user.click(
      await screen.findByTestId(
        'approvals-filters-reason-option-new_customer',
      ),
    )

    // Carol (capacity reason) is hidden; Adam (new_customer) remains.
    await waitFor(() =>
      expect(screen.queryByText('Carol Chen')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Adam Adams')).toBeInTheDocument()
  })

  it('customer-status filter (new vs returning) filters correctly', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')

    await user.click(
      screen.getByTestId('approvals-filters-customer-status-trigger'),
    )
    await user.click(
      await screen.findByTestId(
        'approvals-filters-customer-status-option-new',
      ),
    )

    // Carol has no first_time_customer rule → returning → hidden.
    await waitFor(() =>
      expect(screen.queryByText('Carol Chen')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Adam Adams')).toBeInTheDocument()
  })

  it('price filter buckets gross_total correctly', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')

    await user.click(screen.getByTestId('approvals-filters-price-trigger'))
    // Adam = 90€ → 'low' bucket.
    await user.click(
      await screen.findByTestId('approvals-filters-price-option-low'),
    )

    await waitFor(() =>
      expect(screen.queryByText('Carol Chen')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Adam Adams')).toBeInTheDocument()
  })

  // ---- landr-qmdo ------------------------------------------------------

  it('renders a color-coded stage chip on each row', async () => {
    // sampleRow is awaiting_general_approval → "Operator review" (blue).
    // hotelRow is awaiting_hotel_approval → "Hotel review" (amber).
    const hotelRow = {
      ...newCustomerRow,
      id: 'b-hot999',
      current_stage: { code: 'awaiting_hotel_approval' },
      customer: {
        id: 'c-3',
        first_name: 'Hilda',
        last_name: 'Hotel',
        email: 'hilda@example.com',
      },
    }
    mock.state.rows = [sampleRow, hotelRow]
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')

    // Two chips render — one per row.
    expect(screen.getByText('Operator review')).toBeInTheDocument()
    expect(screen.getByText('Hilda Hotel')).toBeInTheDocument()
    expect(screen.getByText('Hotel review')).toBeInTheDocument()

    // The Stage column header is sortable.
    expect(screen.getByTestId('approvals-sort-stage')).toBeInTheDocument()
  })

  // ---- landr-lbbj ------------------------------------------------------

  it('bulk toolbar is hidden until a row is selected', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    expect(
      screen.queryByTestId('approvals-bulk-toolbar'),
    ).not.toBeInTheDocument()
  })

  it('selecting a row reveals the bulk toolbar with correct count', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    await user.click(screen.getByTestId('approvals-select-b-abc123'))

    expect(screen.getByTestId('approvals-bulk-toolbar')).toBeInTheDocument()
    expect(screen.getByText('1 selected')).toBeInTheDocument()

    await user.click(screen.getByTestId('approvals-select-b-xyz789'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()
  })

  it('select-all checkbox toggles every visible row', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    await user.click(screen.getByTestId('approvals-select-all'))
    expect(screen.getByText('2 selected')).toBeInTheDocument()

    // Un-tick to clear.
    await user.click(screen.getByTestId('approvals-select-all'))
    expect(
      screen.queryByTestId('approvals-bulk-toolbar'),
    ).not.toBeInTheDocument()
  })

  it('bulk-approve fires Promise.all of approval decisions', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    // landr-8eks — each Response can only be consumed once; the bulk path
    // fires two parallel POSTs so give each its own Response instance.
    fetchSpy.mockImplementation(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    )
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    await user.click(screen.getByTestId('approvals-select-all'))
    await user.click(screen.getByTestId('approvals-bulk-toolbar-approve'))

    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    const calledUrls = fetchSpy.mock.calls.map(
      (c) => (c as [string, RequestInit])[0],
    )
    expect(calledUrls).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/api/staff/bookings/b-abc123/approval'),
        expect.stringContaining('/api/staff/bookings/b-xyz789/approval'),
      ]),
    )
    // Both bodies carry decision=approve / branch=general.
    for (const [, opts] of fetchSpy.mock.calls as Array<[string, RequestInit]>) {
      const body = JSON.parse(opts.body as string)
      expect(body).toMatchObject({ decision: 'approve', branch: 'general' })
    }

    // landr-8eks — bulk approve is non-reversible (emails fire, audit_log
    // captures the transition). The success toast must NOT advertise an
    // Undo affordance, and the toast message itself must not contain the
    // word "Undo".
    await waitFor(() => expect(toastCalls.success).toHaveLength(1))
    const [{ message, options }] = toastCalls.success
    expect(options).toBeUndefined()
    expect(String(message)).not.toMatch(/undo/i)
  })

  it('bulk-reject opens a confirm dialog before firing', async () => {
    mock.state.rows = [sampleRow, newCustomerRow]
    // landr-8eks — each Response can only be consumed once; the bulk path
    // fires two parallel POSTs so give each its own Response instance.
    fetchSpy.mockImplementation(
      async () => new Response(JSON.stringify({}), { status: 200 }),
    )
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    await user.click(screen.getByTestId('approvals-select-all'))
    await user.click(screen.getByTestId('approvals-bulk-toolbar-reject'))

    // Dialog appears, no fetch yet.
    expect(await screen.findByRole('alertdialog')).toBeInTheDocument()
    expect(fetchSpy).not.toHaveBeenCalled()

    await user.click(
      screen.getByTestId('approvals-bulk-toolbar-reject-confirm'),
    )
    await waitFor(() => expect(fetchSpy).toHaveBeenCalledTimes(2))
    for (const [, opts] of fetchSpy.mock.calls as Array<[string, RequestInit]>) {
      const body = JSON.parse(opts.body as string)
      expect(body).toMatchObject({ decision: 'reject', branch: 'general' })
    }

    // landr-8eks — bulk reject is non-reversible (voucher used_count
    // decrements via transition_booking_approval RPC, audit_log entry
    // written). The success toast must NOT advertise an Undo affordance.
    // The confirm dialog already warns 'You cannot undo this from here.'
    await waitFor(() => expect(toastCalls.success).toHaveLength(1))
    const [{ message, options }] = toastCalls.success
    expect(options).toBeUndefined()
    expect(String(message)).not.toMatch(/undo/i)
  })

  it('Awaiting filter narrows the table to the selected stage(s)', async () => {
    const hotelRow = {
      ...newCustomerRow,
      id: 'b-hot999',
      current_stage: { code: 'awaiting_hotel_approval' },
      customer: {
        id: 'c-3',
        first_name: 'Hilda',
        last_name: 'Hotel',
        email: 'hilda@example.com',
      },
    }
    mock.state.rows = [sampleRow, hotelRow]
    const user = userEvent.setup()
    render(<GeneralApprovals />)

    await screen.findByText('Carol Chen')
    expect(screen.getByText('Hilda Hotel')).toBeInTheDocument()

    // Open the stage dropdown and select "Hotel review".
    await user.click(screen.getByTestId('approvals-filters-stage-trigger'))
    await user.click(
      await screen.findByTestId('approvals-filters-stage-option-hotel'),
    )

    // Carol (general) is hidden; Hilda (hotel) remains.
    await waitFor(() =>
      expect(screen.queryByText('Carol Chen')).not.toBeInTheDocument(),
    )
    expect(screen.getByText('Hilda Hotel')).toBeInTheDocument()
  })
})
