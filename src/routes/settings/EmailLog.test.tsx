// landr-qg4q — EmailLog route smoke + status filter coverage.
// landr-0xo6 — truthful badges + edit-and-resend dialog.
// landr-rw7q — type (template_kind) filter chips + Type column badge.

import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type {
  OutboundEmailRow,
  OutboundEmailStatus,
} from '@/lib/outbound-emails'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/operator', async () => {
  const mod = await vi.importActual<typeof import('@/lib/operator')>(
    '@/lib/operator',
  )
  return {
    ...mod,
    useOperator: () => ({
      operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      loading: false,
      switchOperator: () => {},
    }),
    OperatorProvider: ({ children }: { children: ReactNode }) => children,
    useOperatorCalendarPrefs: () => ({
      hour12: false,
      firstDayOfWeek: 1,
      workHoursStart: '08:00',
      workHoursEnd: '20:00',
    }),
  }
})

const { fetchOutboundEmailsMock, resendEmailMock } = vi.hoisted(() => ({
  fetchOutboundEmailsMock: vi.fn(),
  resendEmailMock: vi.fn(),
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn(),
    error: vi.fn(),
  },
  Toaster: () => null,
}))

vi.mock('@/lib/outbound-emails', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/outbound-emails')>()
  return {
    ...actual,
    fetchOutboundEmails: (...args: unknown[]) =>
      fetchOutboundEmailsMock(...args),
    resendEmail: (...args: unknown[]) => resendEmailMock(...args),
  }
})

import { toast } from 'sonner'
import { EmailLog } from './EmailLog'

// ---------------------------------------------------------------------------
// Helpers + fixtures
// ---------------------------------------------------------------------------

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

function makeRow(overrides: Partial<OutboundEmailRow> = {}): OutboundEmailRow {
  return {
    id: 'oe-1',
    operator_id: 'op-1',
    template_kind: 'booking_confirmation',
    locale: 'de',
    to_address: 'guest@example.com',
    subject: 'Your booking is confirmed',
    body_html: '<p>Hello.</p>',
    body_text: 'Hello.',
    related_booking_id: 'bk-1',
    status: 'sent' as OutboundEmailStatus,
    retries: 0,
    last_error: null,
    created_at: '2026-05-21T08:00:00Z',
    sent_at: '2026-05-21T08:00:05Z',
    sent_via: 'gmail',
    resent_from_id: null,
    ...overrides,
  }
}

beforeEach(() => {
  fetchOutboundEmailsMock.mockReset()
  resendEmailMock.mockReset()
  vi.mocked(toast.success).mockReset()
  vi.mocked(toast.error).mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('EmailLog (landr-qg4q)', () => {
  it('renders rows with subject, recipient and a status badge', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ id: 'oe-1', subject: 'Confirmation ABC', status: 'sent', sent_via: 'gmail' }),
      makeRow({
        id: 'oe-2',
        subject: 'Receipt XYZ',
        to_address: 'second@example.com',
        status: 'failed',
        last_error: 'gmail token expired',
        sent_at: null,
        sent_via: null,
      }),
    ])

    render(<EmailLog />)

    expect(await screen.findByText('Confirmation ABC')).toBeInTheDocument()
    expect(screen.getByText('Receipt XYZ')).toBeInTheDocument()
    expect(screen.getByText('second@example.com')).toBeInTheDocument()
    expect(screen.getByTestId('email-log-status-sent')).toBeInTheDocument()
    expect(screen.getByTestId('email-log-status-failed')).toBeInTheDocument()
  })

  it('shows the empty-state when no rows match', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([])
    render(<EmailLog />)
    expect(
      await screen.findByText(/no outbound emails match/i),
    ).toBeInTheDocument()
  })

  it('passes selected status filter to the fetcher (landr-qg4q)', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ status: 'failed' }),
    ])

    const user = userEvent.setup()
    render(<EmailLog />)

    // Wait for initial fetch (all-statuses) so toggling drives a new fetch.
    await waitFor(() => expect(fetchOutboundEmailsMock).toHaveBeenCalled())
    fetchOutboundEmailsMock.mockClear()

    // Click the Failed chip — the chip count is 1 from the seed row so it
    // is enabled.
    await user.click(screen.getByTestId('email-log-filter-failed'))

    await waitFor(() => {
      const last = fetchOutboundEmailsMock.mock.calls.at(-1)
      expect(last?.[0]).toBe('op-1')
      expect(last?.[1]).toMatchObject({ statuses: ['failed'] })
    })
  })

  it('opens the drawer with the full body + last_error on row click', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({
        id: 'oe-1',
        subject: 'Receipt XYZ',
        status: 'failed',
        last_error: 'gmail token expired',
        body_text: 'Hello plain.',
        sent_via: null,
      }),
    ])

    const user = userEvent.setup()
    render(<EmailLog />)

    const row = await screen.findByRole('button', {
      name: /open email log entry: receipt xyz/i,
    })
    await user.click(row)

    // SheetTitle renders the subject. There are two now (row + drawer).
    expect(await screen.findAllByText('Receipt XYZ')).not.toHaveLength(0)
    expect(screen.getByText(/last sender error/i)).toBeInTheDocument()
    expect(screen.getByText('gmail token expired')).toBeInTheDocument()
    expect(screen.getByText('Hello plain.')).toBeInTheDocument()
  })
})

describe('EmailLog badge mapping (landr-0xo6)', () => {
  it('renders green Sent badge when sent_via=gmail', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ status: 'sent', sent_via: 'gmail' }),
    ])
    render(<EmailLog />)
    await waitFor(() =>
      expect(screen.getByTestId('email-log-status-sent')).toBeInTheDocument(),
    )
    expect(
      screen.queryByTestId('email-log-status-dev_fallback'),
    ).not.toBeInTheDocument()
  })

  it('renders amber Captured (dev) badge when sent_via=dev_fallback', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ status: 'sent', sent_via: 'dev_fallback' }),
    ])
    render(<EmailLog />)
    await waitFor(() =>
      expect(
        screen.getByTestId('email-log-status-dev_fallback'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByTestId('email-log-status-sent'),
    ).not.toBeInTheDocument()
  })

  it('renders failed badge when status=failed regardless of sent_via', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ status: 'failed', sent_via: null }),
    ])
    render(<EmailLog />)
    await waitFor(() =>
      expect(
        screen.getByTestId('email-log-status-failed'),
      ).toBeInTheDocument(),
    )
  })
})

describe('EmailLog drawer conditional rendering (landr-0xo6)', () => {
  it('does NOT render last_error section when last_error is null', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ status: 'sent', last_error: null }),
    ])
    const user = userEvent.setup()
    render(<EmailLog />)

    const row = await screen.findByRole('button', {
      name: /open email log entry/i,
    })
    await user.click(row)

    await waitFor(() =>
      expect(screen.queryByText(/last sender error/i)).not.toBeInTheDocument(),
    )
  })

  it('shows dev_fallback explanation note in drawer when sent_via=dev_fallback', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ status: 'sent', sent_via: 'dev_fallback' }),
    ])
    const user = userEvent.setup()
    render(<EmailLog />)

    const row = await screen.findByRole('button', {
      name: /open email log entry/i,
    })
    await user.click(row)

    await waitFor(() =>
      expect(
        screen.getByText(/captured locally/i),
      ).toBeInTheDocument(),
    )
    expect(screen.getByText(/connect gmail/i)).toBeInTheDocument()
  })

  it('shows resent_from_id note when resent_from_id is set', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ status: 'sent', resent_from_id: 'oe-original-99' }),
    ])
    const user = userEvent.setup()
    render(<EmailLog />)

    const row = await screen.findByRole('button', {
      name: /open email log entry/i,
    })
    await user.click(row)

    await waitFor(() =>
      expect(screen.getByText(/oe-original-99/i)).toBeInTheDocument(),
    )
  })
})

describe('EmailLog resend dialog (landr-0xo6)', () => {
  it('opens resend dialog prefilled with row values on terminal rows', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({
        status: 'sent',
        to_address: 'guest@example.com',
        subject: 'Booking confirmed',
        body_html: '<p>Hello there.</p>',
        body_text: 'Hello there.',
      }),
    ])
    const user = userEvent.setup()
    render(<EmailLog />)

    const row = await screen.findByRole('button', {
      name: /open email log entry/i,
    })
    await user.click(row)

    const resendBtn = await screen.findByTestId('email-log-resend-button')
    await user.click(resendBtn)

    expect(await screen.findByTestId('resend-to-address')).toHaveValue(
      'guest@example.com',
    )
    expect(screen.getByTestId('resend-subject')).toHaveValue('Booking confirmed')
    // landr-ri8a — the body now loads into the TipTap WYSIWYG editor, not a
    // plain textarea; assert the rich-text surface shows the loaded content.
    const editor = await screen.findByTestId('rte-editor')
    expect(within(editor).getByText('Hello there.')).toBeInTheDocument()
  })

  it('POSTs only changed fields', async () => {
    resendEmailMock.mockResolvedValue({ id: 'oe-new', status: 'queued', sent_via: null })
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({
        status: 'sent',
        to_address: 'guest@example.com',
        subject: 'Booking confirmed',
        body_text: 'Hello.',
        body_html: '<p>Hello.</p>',
      }),
    ])
    const user = userEvent.setup()
    render(<EmailLog />)

    // Open drawer
    const row = await screen.findByRole('button', { name: /open email log entry/i })
    await user.click(row)

    // Open resend dialog
    const resendBtn = await screen.findByTestId('email-log-resend-button')
    await user.click(resendBtn)

    // Edit only the subject
    const subjectInput = await screen.findByTestId('resend-subject')
    await user.clear(subjectInput)
    await user.type(subjectInput, 'Updated subject')

    // Submit
    await user.click(screen.getByTestId('resend-submit'))

    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())

    const [calledOperatorId, calledEmailId, calledPayload] =
      resendEmailMock.mock.calls[0] as [string, string, Record<string, unknown>]
    expect(calledOperatorId).toBe('op-1')
    expect(calledEmailId).toBe('oe-1')
    // Only the changed field should be in the payload.
    expect(calledPayload).toHaveProperty('subject', 'Updated subject')
    expect(calledPayload).not.toHaveProperty('to_address')
    expect(calledPayload).not.toHaveProperty('body_text')
    expect(calledPayload).not.toHaveProperty('body_html')
  })

  it('shows error toast when resend fails — never silent', async () => {
    resendEmailMock.mockRejectedValue(new Error('upstream smtp error'))
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ status: 'failed' }),
    ])
    const user = userEvent.setup()
    render(<EmailLog />)

    const row = await screen.findByRole('button', { name: /open email log entry/i })
    await user.click(row)

    const resendBtn = await screen.findByTestId('email-log-resend-button')
    await user.click(resendBtn)

    await user.click(await screen.findByTestId('resend-submit'))

    await waitFor(() =>
      expect(vi.mocked(toast.error)).toHaveBeenCalled(),
    )

    const [msg, opts] = vi.mocked(toast.error).mock.calls[0] as [
      string,
      { description?: string } | undefined,
    ]
    expect(msg).toMatch(/resend failed/i)
    // The server error detail must be surfaced (never silent).
    expect(opts?.description).toMatch(/upstream smtp error/i)
  })
})

describe('EmailLog type filter (landr-rw7q)', () => {
  it('renders the Type column with the friendly label for a known kind', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ template_kind: 'booking_confirmation' }),
    ])
    render(<EmailLog />)
    // Column header
    expect(await screen.findByText('Type')).toBeInTheDocument()
    // Badge in the row
    expect(screen.getByTestId('email-log-type-booking_confirmation')).toHaveTextContent(
      'Confirmation',
    )
  })

  it('renders a humanized fallback label for an unknown kind', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ template_kind: 'payment_receipt' }),
    ])
    render(<EmailLog />)
    await waitFor(() =>
      expect(screen.getByTestId('email-log-type-payment_receipt')).toHaveTextContent(
        'Payment Receipt',
      ),
    )
  })

  it('passes selected type kind to the fetcher', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ template_kind: 'group_inquiry' }),
    ])
    const user = userEvent.setup()
    render(<EmailLog />)

    // Wait for initial fetch so toggling drives a new call.
    await waitFor(() => expect(fetchOutboundEmailsMock).toHaveBeenCalled())
    fetchOutboundEmailsMock.mockClear()

    await user.click(screen.getByTestId('email-log-filter-kind-group_inquiry'))

    await waitFor(() => {
      const last = fetchOutboundEmailsMock.mock.calls.at(-1)
      expect(last?.[0]).toBe('op-1')
      expect(last?.[1]).toMatchObject({ templateKinds: ['group_inquiry'] })
    })
  })

  it('combines a type filter and a status filter — both passed to the fetcher', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ template_kind: 'booking_confirmation', status: 'failed' }),
    ])
    const user = userEvent.setup()
    render(<EmailLog />)

    await waitFor(() => expect(fetchOutboundEmailsMock).toHaveBeenCalled())
    fetchOutboundEmailsMock.mockClear()

    // Toggle a kind chip (count = 1 so enabled)
    await user.click(screen.getByTestId('email-log-filter-kind-booking_confirmation'))
    // Toggle a status chip
    await user.click(screen.getByTestId('email-log-filter-failed'))

    await waitFor(() => {
      const last = fetchOutboundEmailsMock.mock.calls.at(-1)
      expect(last?.[1]).toMatchObject({
        templateKinds: ['booking_confirmation'],
        statuses: ['failed'],
      })
    })
  })

  it('clears both kind and status filters when Clear filters is clicked', async () => {
    fetchOutboundEmailsMock.mockResolvedValue([
      makeRow({ template_kind: 'booking_received', status: 'sent' }),
    ])
    const user = userEvent.setup()
    render(<EmailLog />)

    await waitFor(() => expect(fetchOutboundEmailsMock).toHaveBeenCalled())

    // Activate a kind chip
    await user.click(screen.getByTestId('email-log-filter-kind-booking_received'))

    // Clear filters button should now be visible
    const clearBtn = await screen.findByRole('button', { name: /clear filters/i })
    await user.click(clearBtn)

    await waitFor(() => {
      const last = fetchOutboundEmailsMock.mock.calls.at(-1)
      expect(last?.[1]).toMatchObject({ templateKinds: [], statuses: [] })
    })
  })
})
