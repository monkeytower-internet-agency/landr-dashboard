// landr-a4pl.2 — /invoicing route tests.
//
// Covers: bucket tabs render from the summary counts, the table rows for the
// active bucket, the Sync button (posts → toasts → refetches), per-row retry,
// the holded_not_connected disabled state, and the booking-ref link.
//
// The data layer (src/lib/holded-invoicing) is mocked so this is a pure
// component test — no real fetch / Supabase needed.

import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import type {
  HoldedInvoicesResponse,
  HoldedSyncResult,
} from '@/lib/holded-invoicing'

const { mock } = vi.hoisted(() => {
  const state = {
    invoices: null as HoldedInvoicesResponse | null,
    syncResult: null as HoldedSyncResult | null,
    syncError: null as Error | null,
    fetchCalls: 0,
    syncCalls: 0,
  }
  return { mock: { state } }
})

vi.mock('@/lib/holded-invoicing', async () => {
  const actual = await vi.importActual<typeof import('@/lib/holded-invoicing')>(
    '@/lib/holded-invoicing',
  )
  return {
    ...actual,
    fetchHoldedInvoices: vi.fn(async () => {
      mock.state.fetchCalls += 1
      return mock.state.invoices as HoldedInvoicesResponse
    }),
    syncHoldedInvoices: vi.fn(async () => {
      mock.state.syncCalls += 1
      if (mock.state.syncError) throw mock.state.syncError
      return mock.state.syncResult as HoldedSyncResult
    }),
  }
})

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
}))

// PageTitle reads a context provided by AppShell; render a no-op so the route
// mounts standalone.
vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

const { toastCalls } = vi.hoisted(() => ({
  toastCalls: {
    success: [] as Array<{ message: unknown; options?: unknown }>,
    error: [] as Array<{ message: unknown; options?: unknown }>,
  },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((message: unknown, options?: unknown) => {
      toastCalls.success.push({ message, options })
    }),
    error: vi.fn((message: unknown, options?: unknown) => {
      toastCalls.error.push({ message, options })
    }),
  },
  Toaster: () => null,
}))

import { Invoicing } from './Invoicing'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/invoicing']}>{ui}</MemoryRouter>
    </QueryClientProvider>,
  )
}

function sampleInvoices(): HoldedInvoicesResponse {
  return {
    summary: { transferred: 2, pending: 3, failed: 1, blocked: 1, total: 7 },
    rows: [
      {
        sync_log_id: 'log-pending-1',
        booking_id: 'bk-1',
        booking_ref: 'B-0001',
        customer_name: 'Alice Ant',
        finalised_at: '2026-06-01T10:00:00.000Z',
        amount: '120,00 €',
        status: 'pending',
        bucket: 'pending',
        external_reference: null,
        failure_reason: null,
        attempt_count: 0,
        max_attempts: 5,
        next_retry_at: null,
        succeeded_at: null,
        age_days: 5, // > 2 ⇒ overdue
      },
      {
        sync_log_id: 'log-pending-2',
        booking_id: 'bk-2',
        booking_ref: 'B-0002',
        customer_name: 'Bob Bee',
        finalised_at: '2026-06-06T10:00:00.000Z',
        amount: '80,00 €',
        status: 'pending',
        bucket: 'pending',
        external_reference: null,
        failure_reason: null,
        attempt_count: 0,
        max_attempts: 5,
        next_retry_at: null,
        succeeded_at: null,
        age_days: 1, // ≤ 2 ⇒ due soon
      },
      {
        sync_log_id: 'log-transferred-1',
        booking_id: 'bk-3',
        booking_ref: 'B-0003',
        customer_name: 'Carol Cat',
        finalised_at: '2026-05-20T10:00:00.000Z',
        amount: '200,00 €',
        status: 'succeeded',
        bucket: 'transferred',
        external_reference: 'HOLDED-555',
        failure_reason: null,
        attempt_count: 1,
        max_attempts: 5,
        next_retry_at: null,
        succeeded_at: '2026-05-21T10:00:00.000Z',
        age_days: 18,
      },
      {
        sync_log_id: 'log-failed-1',
        booking_id: 'bk-4',
        booking_ref: 'B-0004',
        customer_name: 'Dave Dog',
        finalised_at: '2026-05-30T10:00:00.000Z',
        amount: '60,00 €',
        status: 'failed',
        bucket: 'failed',
        external_reference: null,
        failure_reason: 'Holded API 422: missing tax id',
        attempt_count: 3,
        max_attempts: 5,
        next_retry_at: '2026-06-08T10:00:00.000Z',
        succeeded_at: null,
        age_days: 9,
      },
    ],
  }
}

beforeEach(() => {
  mock.state.invoices = sampleInvoices()
  mock.state.syncResult = {
    attempted: 3,
    succeeded: 3,
    failed: 1,
    retried: 0,
    blocked: 0,
    remaining_pending: 2,
  }
  mock.state.syncError = null
  mock.state.fetchCalls = 0
  mock.state.syncCalls = 0
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('Invoicing route', () => {
  it('renders the four bucket tabs with summary counts as badges', async () => {
    render(<Invoicing />)
    await screen.findByTestId('invoicing-bucket-tabs')

    for (const b of ['transferred', 'pending', 'failed', 'blocked']) {
      expect(screen.getByTestId(`invoicing-tab-${b}`)).toBeInTheDocument()
    }
    // Badges read 0 until the summary lands; wait for the fetched counts.
    await waitFor(() =>
      expect(screen.getByTestId('invoicing-badge-transferred').textContent).toBe(
        '2',
      ),
    )
    expect(screen.getByTestId('invoicing-badge-pending').textContent).toBe('3')
    expect(screen.getByTestId('invoicing-badge-failed').textContent).toBe('1')
    expect(screen.getByTestId('invoicing-badge-blocked').textContent).toBe('1')
  })

  it('renders rows for the active (pending) bucket', async () => {
    render(<Invoicing />)
    // Default bucket is pending → both pending rows show, transferred does not.
    expect(await screen.findByTestId('invoicing-row-log-pending-1')).toBeInTheDocument()
    expect(screen.getByTestId('invoicing-row-log-pending-2')).toBeInTheDocument()
    expect(screen.queryByTestId('invoicing-row-log-transferred-1')).not.toBeInTheDocument()
    // Overdue vs due-soon sub-flags on the pending rows.
    const overdue = within(
      screen.getByTestId('invoicing-row-log-pending-1'),
    ).getByText(/overdue/i)
    expect(overdue).toBeInTheDocument()
    const dueSoon = within(
      screen.getByTestId('invoicing-row-log-pending-2'),
    ).getByText(/due soon/i)
    expect(dueSoon).toBeInTheDocument()
  })

  it('switching to the Transferred tab shows the Holded ref and hides pending rows', async () => {
    const user = userEvent.setup()
    render(<Invoicing />)
    await screen.findByTestId('invoicing-tab-transferred')
    await user.click(screen.getByTestId('invoicing-tab-transferred'))

    expect(
      await screen.findByTestId('invoicing-row-log-transferred-1'),
    ).toBeInTheDocument()
    expect(screen.getByTestId('invoicing-holded-ref-log-transferred-1').textContent).toBe(
      'HOLDED-555',
    )
    expect(screen.queryByTestId('invoicing-row-log-pending-1')).not.toBeInTheDocument()
  })

  it('Failed tab surfaces the last error + a per-row Retry button', async () => {
    const user = userEvent.setup()
    render(<Invoicing />)
    await screen.findByTestId('invoicing-tab-failed')
    await user.click(screen.getByTestId('invoicing-tab-failed'))

    expect(await screen.findByTestId('invoicing-row-log-failed-1')).toBeInTheDocument()
    expect(screen.getByTestId('invoicing-error-log-failed-1').textContent).toMatch(
      /missing tax id/i,
    )
    expect(screen.getByTestId('invoicing-retry-log-failed-1')).toBeInTheDocument()
  })

  it('Sync button posts, toasts the result, and refetches the list', async () => {
    const user = userEvent.setup()
    render(<Invoicing />)
    await screen.findByTestId('invoicing-sync-button')
    expect(mock.state.fetchCalls).toBe(1)

    await user.click(screen.getByTestId('invoicing-sync-button'))

    await waitFor(() => expect(mock.state.syncCalls).toBe(1))
    // Result toast: "3 transferred, 1 failed, 2 still pending".
    await waitFor(() => expect(toastCalls.success.length).toBe(1))
    expect(toastCalls.success[0].message).toMatch(
      /3 transferred, 1 failed, 2 still pending/i,
    )
    // Refetch fired after the sync.
    await waitFor(() => expect(mock.state.fetchCalls).toBe(2))
  })

  it('per-row Retry triggers a sync pass and toasts', async () => {
    const user = userEvent.setup()
    render(<Invoicing />)
    await screen.findByTestId('invoicing-tab-failed')
    await user.click(screen.getByTestId('invoicing-tab-failed'))
    await screen.findByTestId('invoicing-retry-log-failed-1')

    await user.click(screen.getByTestId('invoicing-retry-log-failed-1'))

    await waitFor(() => expect(mock.state.syncCalls).toBe(1))
    await waitFor(() => expect(toastCalls.success.length).toBe(1))
  })

  it('shows the holded_not_connected disabled state with a Connect link', async () => {
    mock.state.syncResult = { holded_not_connected: true }
    const user = userEvent.setup()
    render(<Invoicing />)
    await screen.findByTestId('invoicing-sync-button')

    await user.click(screen.getByTestId('invoicing-sync-button'))

    // Sync button becomes disabled; the not-connected card + Connect link show.
    await waitFor(() =>
      expect(screen.getByTestId('invoicing-sync-button')).toBeDisabled(),
    )
    expect(screen.getByTestId('invoicing-not-connected')).toBeInTheDocument()
    const connect = screen.getByTestId('invoicing-connect-holded')
    expect(connect).toHaveAttribute('href', '/account/integrations/payments')
    // An error toast explained the not-connected state.
    expect(toastCalls.error.length).toBe(1)
    // No success toast, no refetch.
    expect(toastCalls.success.length).toBe(0)
    expect(mock.state.fetchCalls).toBe(1)
  })

  it('booking-ref link navigates to the booking detail deep link', async () => {
    const assign = vi.fn()
    const original = window.location
    // jsdom: window.location.assign is a no-op spy target.
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: { ...original, assign },
    })
    try {
      render(<Invoicing />)
      const link = await screen.findByTestId('invoicing-booking-link-log-pending-1')
      await userEvent.setup().click(link)
      expect(assign).toHaveBeenCalledWith('/bookings?open=bk-1')
    } finally {
      Object.defineProperty(window, 'location', {
        configurable: true,
        value: original,
      })
    }
  })

  it('shows the error state when the fetch fails', async () => {
    const { fetchHoldedInvoices } = await import('@/lib/holded-invoicing')
    vi.mocked(fetchHoldedInvoices).mockRejectedValueOnce(new Error('boom'))
    render(<Invoicing />)
    expect(await screen.findByText(/failed to load invoices/i)).toBeInTheDocument()
    expect(screen.getByText('boom')).toBeInTheDocument()
  })
})
