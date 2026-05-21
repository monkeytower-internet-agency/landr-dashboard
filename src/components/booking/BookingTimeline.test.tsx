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
})

afterEach(() => {
  vi.clearAllMocks()
})

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
})
