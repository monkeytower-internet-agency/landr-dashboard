import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

const { mock } = vi.hoisted(() => {
  // Per-table override map so each test can shape the supabase response.
  const overrides = new Map<
    string,
    (q: { filters: Array<{ col: string; val: unknown }> }) => {
      data: unknown[] | null
      error: { message: string } | null
    }
  >()

  function makeBuilder(table: string) {
    const filters: Array<{ col: string; val: unknown }> = []
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn(() => builder),
      eq: vi.fn((col: string, val: unknown) => {
        filters.push({ col, val })
        return builder
      }),
      order: vi.fn(() => builder),
      limit: vi.fn(() => {
        const handler = overrides.get(table)
        const res = handler
          ? handler({ filters })
          : { data: [], error: null }
        return Promise.resolve(res)
      }),
    })
    return builder
  }

  const supabase = {
    from: vi.fn((table: string) => makeBuilder(table)),
  }

  return { mock: { supabase, overrides } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

// useOperator drives the operator-scoped resend endpoint. Stub it so the
// timeline renders outside an <OperatorProvider> (landr-33r3).
vi.mock('@/lib/operator', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operator')>()
  return {
    ...actual,
    useOperator: () => ({
      currentOperatorId: 'op-1',
    }),
  }
})

// resendEmail (landr-2js5 endpoint) — assert the timeline POSTs correctly.
const { resendEmailMock } = vi.hoisted(() => ({ resendEmailMock: vi.fn() }))
vi.mock('@/lib/outbound-emails', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/outbound-emails')>()
  return {
    ...actual,
    resendEmail: (...args: unknown[]) => resendEmailMock(...args),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import userEvent from '@testing-library/user-event'
import { toast } from 'sonner'
import { BookingTimeline } from './BookingTimeline'
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
    id: 'b-1',
    created_at: '2026-05-17T10:00:00.000Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: 200,
    currency: 'EUR',
    approval_trace: { outcome: 'manual_review' },
    customer: {
      id: 'c-1',
      first_name: 'A',
      last_name: 'B',
      email: 'a@b.test',
      phone: null,
    },
    items: [],
    ...overrides,
  }
}

beforeEach(() => {
  mock.overrides.clear()
  resendEmailMock.mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// A full outbound_emails row carrying the body/subject the preview needs.
function emailRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'e-1',
    operator_id: 'op-1',
    template_kind: 'booking_confirmation',
    locale: 'en',
    status: 'sent',
    created_at: '2026-05-17T10:00:00.000Z',
    sent_at: '2026-05-17T10:05:00.000Z',
    to_address: 'a@b.test',
    subject: 'Your booking is confirmed',
    // landr-ri8a — html and text are kept consistent (text = the html's text
    // content) because the WYSIWYG editor now derives body_text from the rich
    // body via getText(); a real outbound email's text mirrors its html.
    body_html: '<p>HTML body here</p>',
    body_text: 'HTML body here',
    resent_from_id: null,
    ...overrides,
  }
}

describe('BookingTimeline', () => {
  it('renders the empty fallback (created event) when no audit/email/payment rows exist', async () => {
    // All four table queries (audit_log, payments, outbound_emails,
    // booking_lifecycle_stages) default to empty — the helper falls back
    // to a synthesised "Booking created" event from the BookingRow itself.
    render(<BookingTimeline booking={makeRow()} />)

    const list = await screen.findByTestId('booking-timeline')
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(1)
    expect(items[0]).toHaveAttribute('data-event-kind', 'created')
    expect(within(items[0]).getByText('Booking created')).toBeInTheDocument()
    // The fallback surfaces the approval trace outcome as the detail line.
    expect(
      within(items[0]).getByText(/Approval outcome: manual_review/),
    ).toBeInTheDocument()
  })

  it('renders an email_sent event from outbound_emails rows', async () => {
    mock.overrides.set('outbound_emails', () => ({
      data: [
        {
          id: 'e-1',
          template_kind: 'booking_confirmation',
          status: 'sent',
          created_at: '2026-05-17T10:00:00.000Z',
          sent_at: '2026-05-17T10:05:00.000Z',
          to_address: 'a@b.test',
        },
      ],
      error: null,
    }))

    render(<BookingTimeline booking={makeRow()} />)
    const list = await screen.findByTestId('booking-timeline')
    const items = within(list).getAllByRole('listitem')

    // Expect 2: the fallback "created" event + the email_sent.
    expect(items).toHaveLength(2)
    expect(items[1]).toHaveAttribute('data-event-kind', 'email_sent')
    expect(
      within(items[1]).getByText(/Confirmation email sent/),
    ).toBeInTheDocument()
  })

  it('renders a paid event when payments has a succeeded row', async () => {
    mock.overrides.set('payments', () => ({
      data: [
        {
          id: 'p-1',
          status: 'succeeded',
          paid_at: '2026-05-18T09:00:00.000Z',
          created_at: '2026-05-18T08:55:00.000Z',
        },
        // failed row must not surface
        {
          id: 'p-2',
          status: 'failed',
          paid_at: null,
          created_at: '2026-05-17T11:00:00.000Z',
        },
      ],
      error: null,
    }))

    render(<BookingTimeline booking={makeRow()} />)
    const list = await screen.findByTestId('booking-timeline')
    const items = within(list).getAllByRole('listitem')

    const paidRow = items.find(
      (li) => li.getAttribute('data-event-kind') === 'paid',
    )
    expect(paidRow).toBeDefined()
    expect(within(paidRow!).getByText('Payment received')).toBeInTheDocument()
  })

  it('renders an "Approved" event for an audit_log stage transition out of awaiting_general_approval', async () => {
    mock.overrides.set('booking_lifecycle_stages', () => ({
      data: [
        { id: 'stage-gen', code: 'awaiting_general_approval', label: null },
        { id: 'stage-pay', code: 'awaiting_payment', label: null },
      ],
      error: null,
    }))
    mock.overrides.set('audit_log', () => ({
      data: [
        {
          id: 'a-1',
          occurred_at: '2026-05-17T10:00:00.000Z',
          operation: 'INSERT',
          actor_kind: 'system',
          actor_subkind: null,
          user_id: null,
          old_row: null,
          new_row: { current_stage_id: 'stage-gen' },
        },
        {
          id: 'a-2',
          occurred_at: '2026-05-17T12:00:00.000Z',
          operation: 'UPDATE',
          actor_kind: 'user',
          actor_subkind: 'operator',
          user_id: 'u-1',
          old_row: { current_stage_id: 'stage-gen' },
          new_row: { current_stage_id: 'stage-pay' },
        },
      ],
      error: null,
    }))

    render(<BookingTimeline booking={makeRow()} />)
    const list = await screen.findByTestId('booking-timeline')
    const items = within(list).getAllByRole('listitem')

    expect(items.map((li) => li.getAttribute('data-event-kind'))).toEqual([
      'created',
      'approved',
    ])
    expect(within(items[1]).getByText('Approved')).toBeInTheDocument()
  })

  it('shows an error state when the audit fetch fails and there is also no fallback row', async () => {
    mock.overrides.set('audit_log', () => ({
      data: null,
      error: { message: 'boom' },
    }))

    // The helper still resolves (it tolerates per-source errors) so the
    // component should fall back to the synthesised "created" event from
    // the BookingRow — not the error panel. This guards against the
    // helper accidentally throwing when one of the three reads errors.
    render(<BookingTimeline booking={makeRow()} />)
    await waitFor(() =>
      expect(screen.queryByTestId('booking-timeline-loading')).toBeNull(),
    )
    expect(screen.getByTestId('booking-timeline')).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // landr-33r3 — per-email actions: preview, send-exact, modify & send
  // -------------------------------------------------------------------------

  it('expands an email event into a preview with subject + sandboxed iframe + text fallback', async () => {
    mock.overrides.set('outbound_emails', () => ({
      data: [emailRow()],
      error: null,
    }))
    const user = userEvent.setup()
    render(<BookingTimeline booking={makeRow()} />)

    const toggle = await screen.findByTestId('timeline-email-preview-toggle')
    expect(screen.queryByTestId('timeline-email-preview')).toBeNull()

    await user.click(toggle)

    const preview = await screen.findByTestId('timeline-email-preview')
    expect(
      within(preview).getByText('Your booking is confirmed'),
    ).toBeInTheDocument()
    const iframe = within(preview).getByTestId('timeline-email-iframe')
    expect(iframe).toHaveAttribute('sandbox', '')
    // landr-ri8a — the body is wrapped via buildPreviewSrcDoc so the
    // light-themed email renders on a forced white surface (readable in dark
    // theme), and the iframe surface itself is bg-white (not bg-background).
    const srcdoc = iframe.getAttribute('srcdoc') ?? ''
    expect(srcdoc).toContain('<p>HTML body here</p>')
    expect(srcdoc).toContain('color-scheme: light')
    expect(srcdoc).toContain('background: #ffffff')
    expect(iframe).toHaveClass('bg-white')
    expect(iframe).not.toHaveClass('bg-background')
    // The plain-text fallback section renders body_text (now consistent with
    // the html's text content).
    expect(within(preview).getByText('HTML body here')).toBeInTheDocument()
  })

  it('"Send exactly this email" posts an empty body after confirming', async () => {
    resendEmailMock.mockResolvedValue({
      id: 'e-new',
      status: 'queued',
      sent_via: null,
    })
    mock.overrides.set('outbound_emails', () => ({
      data: [emailRow()],
      error: null,
    }))
    const user = userEvent.setup()
    render(<BookingTimeline booking={makeRow()} />)

    await user.click(await screen.findByTestId('timeline-email-preview-toggle'))
    await user.click(await screen.findByTestId('timeline-email-send-exact'))

    // Confirm dialog summarises to/subject before firing.
    const confirm = await screen.findByTestId('timeline-email-confirm')
    expect(within(confirm).getByText('a@b.test')).toBeInTheDocument()
    expect(
      within(confirm).getByText('Your booking is confirmed'),
    ).toBeInTheDocument()

    await user.click(screen.getByTestId('timeline-email-confirm-send'))

    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())
    const [opId, emailId, payload] = resendEmailMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(opId).toBe('op-1')
    expect(emailId).toBe('e-1')
    // Verbatim copy → empty payload.
    expect(payload).toEqual({})
  })

  it('"Modify & send" posts only the changed fields', async () => {
    resendEmailMock.mockResolvedValue({
      id: 'e-new',
      status: 'queued',
      sent_via: null,
    })
    mock.overrides.set('outbound_emails', () => ({
      data: [emailRow()],
      error: null,
    }))
    const user = userEvent.setup()
    render(<BookingTimeline booking={makeRow()} />)

    await user.click(await screen.findByTestId('timeline-email-preview-toggle'))
    await user.click(await screen.findByTestId('timeline-email-modify'))

    const subject = await screen.findByTestId('resend-subject')
    expect(subject).toHaveValue('Your booking is confirmed')
    await user.clear(subject)
    await user.type(subject, 'Edited subject')

    await user.click(screen.getByTestId('resend-submit'))

    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())
    const [, , payload] = resendEmailMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(payload).toHaveProperty('subject', 'Edited subject')
    expect(payload).not.toHaveProperty('to_address')
    expect(payload).not.toHaveProperty('body_html')
    expect(payload).not.toHaveProperty('body_text')
  })

  it('shows a "resent" provenance note when resent_from_id is set', async () => {
    mock.overrides.set('outbound_emails', () => ({
      data: [emailRow({ resent_from_id: 'src-123' })],
      error: null,
    }))
    render(<BookingTimeline booking={makeRow()} />)

    const note = await screen.findByTestId('timeline-email-resent-note')
    expect(note).toHaveTextContent(/src-123/)
  })

  it('refreshes the timeline after an exact resend (new email event appears)', async () => {
    resendEmailMock.mockResolvedValue({
      id: 'e-new',
      status: 'queued',
      sent_via: null,
    })
    // First fetch returns one email; after the resend the refetch returns two.
    let calls = 0
    mock.overrides.set('outbound_emails', () => {
      calls += 1
      const rows =
        calls === 1
          ? [emailRow()]
          : [emailRow(), emailRow({ id: 'e-2', resent_from_id: 'e-1' })]
      return { data: rows, error: null }
    })
    const user = userEvent.setup()
    render(<BookingTimeline booking={makeRow()} />)

    await user.click(await screen.findByTestId('timeline-email-preview-toggle'))
    await user.click(await screen.findByTestId('timeline-email-send-exact'))
    await user.click(await screen.findByTestId('timeline-email-confirm-send'))

    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())
    // The timeline query was invalidated → a second email event shows up.
    await waitFor(() =>
      expect(
        screen.getByTestId('booking-timeline').querySelectorAll(
          '[data-event-kind="email_sent"]',
        ).length,
      ).toBe(2),
    )
  })
})
