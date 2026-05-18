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
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
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
  customer: {
    id: 'c-1',
    first_name: 'Carol',
    last_name: 'Chen',
    email: 'carol@example.com',
  },
  items: [
    {
      id: 'i-1',
      date_range_start: null,
      date_range_end: null,
      selected_days: null,
      products: { id: 'p-1', name: 'Tandem Flight' },
    },
  ],
}

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
  fetchSpy.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

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
})
