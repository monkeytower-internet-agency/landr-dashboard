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
        products: { id: 'p-1', name: 'Tandem Flight' },
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
    expect(JSON.parse(opts.body as string)).toMatchObject({
      selected_days: ['2026-06-01'],
    })
  })
})
