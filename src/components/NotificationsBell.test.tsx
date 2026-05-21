// landr-8whx — NotificationsBell pins three contracts:
//   1. Badge dot appears iff pendingApprovals > 0 (recent-bookings do
//      NOT inflate the badge — they're informational only).
//   2. Dropdown lists pending approvals + recent bookings (last 24h),
//      with section labels, when there is at least one of either.
//   3. Empty state copy renders when both queries return zero items.
//
// We bypass Supabase entirely by mocking fetchPendingGeneralApprovals
// and fetchBookings — the bell only reads the SAME query keys those
// helpers feed, so we don't need to exercise the network path again.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BookingRow } from '@/lib/bookings'

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
}))

const fetchPendingGeneralApprovalsMock = vi.fn<() => Promise<BookingRow[]>>()
const fetchBookingsMock = vi.fn<() => Promise<BookingRow[]>>()

vi.mock('@/lib/bookings', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/bookings')>('@/lib/bookings')
  return {
    ...actual,
    fetchPendingGeneralApprovals: (...args: unknown[]) =>
      fetchPendingGeneralApprovalsMock(...(args as [])),
    fetchBookings: (...args: unknown[]) =>
      fetchBookingsMock(...(args as [])),
  }
})

import { NotificationsBell } from './NotificationsBell'

function makeRow(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'b-' + Math.random().toString(36).slice(2, 10),
    created_at: new Date().toISOString(),
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: '120.00',
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Ada',
      last_name: 'Lovelace',
      email: null,
      phone: null,
    },
    items: [],
    participants: [],
    ...overrides,
  }
}

function renderBell() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <NotificationsBell />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  fetchPendingGeneralApprovalsMock.mockReset()
  fetchBookingsMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('NotificationsBell (landr-8whx)', () => {
  it('renders the bell trigger and no badge when both queries are empty', async () => {
    fetchPendingGeneralApprovalsMock.mockResolvedValue([])
    fetchBookingsMock.mockResolvedValue([])

    renderBell()

    const trigger = await screen.findByTestId('notifications-bell-trigger')
    expect(trigger).toBeInTheDocument()

    await waitFor(() => {
      expect(fetchPendingGeneralApprovalsMock).toHaveBeenCalled()
      expect(fetchBookingsMock).toHaveBeenCalled()
    })

    expect(
      screen.queryByTestId('notifications-bell-badge'),
    ).not.toBeInTheDocument()
  })

  it('shows the red badge when there is at least one pending approval', async () => {
    fetchPendingGeneralApprovalsMock.mockResolvedValue([
      makeRow({ id: 'b-pending-1' }),
    ])
    fetchBookingsMock.mockResolvedValue([])

    renderBell()

    await waitFor(() => {
      expect(
        screen.getByTestId('notifications-bell-badge'),
      ).toBeInTheDocument()
    })

    // The aria-label flips from "Open notifications" to the unread-count
    // copy so screen-reader users get the same signal as sighted users.
    const trigger = screen.getByTestId('notifications-bell-trigger')
    expect(trigger).toHaveAttribute('aria-label', '1 unread notifications')
  })

  it('does NOT inflate the badge when only recent bookings exist', async () => {
    // Pin the contract: business-as-usual bookings are informational and
    // must not light up the bell. Only blocked-on-operator items count.
    fetchPendingGeneralApprovalsMock.mockResolvedValue([])
    fetchBookingsMock.mockResolvedValue([
      makeRow({ id: 'b-recent-1', created_at: new Date().toISOString() }),
    ])

    renderBell()

    await waitFor(() => {
      expect(fetchBookingsMock).toHaveBeenCalled()
    })

    expect(
      screen.queryByTestId('notifications-bell-badge'),
    ).not.toBeInTheDocument()
  })

  it('lists pending approvals and recent bookings inside the dropdown', async () => {
    const pendingRow = makeRow({
      id: 'b-pending-1',
      customer: {
        id: 'c-1',
        first_name: 'Pending',
        last_name: 'Person',
        email: null,
        phone: null,
      },
    })
    const recentRow = makeRow({
      id: 'b-recent-1',
      customer: {
        id: 'c-2',
        first_name: 'Recent',
        last_name: 'Rachel',
        email: null,
        phone: null,
      },
      created_at: new Date().toISOString(),
    })
    fetchPendingGeneralApprovalsMock.mockResolvedValue([pendingRow])
    fetchBookingsMock.mockResolvedValue([recentRow])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(
        screen.getByTestId('notifications-bell-pending-b-pending-1'),
      ).toBeInTheDocument()
      expect(
        screen.getByTestId('notifications-bell-recent-b-recent-1'),
      ).toBeInTheDocument()
    })

    expect(screen.getByText('Pending approvals')).toBeInTheDocument()
    expect(screen.getByText('New bookings (last 24h)')).toBeInTheDocument()
  })

  it('filters out bookings older than 24h from the recent section', async () => {
    // Pin the 24h window: a 2-day-old booking should be excluded from the
    // "recent" list, even though it's the only booking returned.
    const stale = makeRow({
      id: 'b-stale-1',
      created_at: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
    })
    fetchPendingGeneralApprovalsMock.mockResolvedValue([])
    fetchBookingsMock.mockResolvedValue([stale])

    renderBell()

    const user = userEvent.setup()
    const trigger = await screen.findByTestId('notifications-bell-trigger')
    await user.click(trigger)

    await waitFor(() => {
      expect(screen.getByTestId('notifications-bell-empty')).toBeInTheDocument()
    })
    expect(
      screen.queryByTestId('notifications-bell-recent-b-stale-1'),
    ).not.toBeInTheDocument()
  })
})
