// landr-qg4q — EmailLog route smoke + status filter coverage.

import {
  render as rtlRender,
  screen,
  waitFor,
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

const { fetchOutboundEmailsMock } = vi.hoisted(() => ({
  fetchOutboundEmailsMock: vi.fn(),
}))

vi.mock('@/lib/outbound-emails', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/outbound-emails')>()
  return {
    ...actual,
    fetchOutboundEmails: (...args: unknown[]) =>
      fetchOutboundEmailsMock(...args),
  }
})

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
    ...overrides,
  }
}

beforeEach(() => {
  fetchOutboundEmailsMock.mockReset()
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
      makeRow({ id: 'oe-1', subject: 'Confirmation ABC', status: 'sent' }),
      makeRow({
        id: 'oe-2',
        subject: 'Receipt XYZ',
        to_address: 'second@example.com',
        status: 'failed',
        last_error: 'gmail token expired',
        sent_at: null,
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
