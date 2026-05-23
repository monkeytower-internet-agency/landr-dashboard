import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { BookingProviderAssignments } from '@/components/booking/BookingProviderAssignments'

type AssignmentFixture = {
  id: string
  operator_id: string
  booking_id: string
  provider_id: string
  provider_role_id: string
  assignment_date: string
  notes: string | null
  created_at: string
  updated_at: string
}

const { mock } = vi.hoisted(() => ({
  mock: {
    state: {
      assignments: [] as AssignmentFixture[],
      roster: [] as Array<{
        id: string
        operator_id: string
        contact_id: string | null
        display_name: string
        default_role_id: string | null
        active: boolean
        sort_order: number
        created_at: string
        updated_at: string
      }>,
      lastCreate: null as Record<string, unknown> | null,
      lastDelete: null as string | null,
    },
  },
}))

vi.mock('@/lib/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers')>()
  return {
    ...actual,
    fetchBookingAssignments: vi.fn(async () => mock.state.assignments),
    fetchProviderRoster: vi.fn(async () => mock.state.roster),
    createAssignment: vi.fn(
      async (_op: string, bookingId: string, body: Record<string, unknown>) => {
        mock.state.lastCreate = body
        const row: AssignmentFixture = {
          id: `asg-${mock.state.assignments.length + 1}`,
          operator_id: 'op-1',
          booking_id: bookingId,
          provider_id: body.provider_id as string,
          provider_role_id: 'role-1',
          assignment_date: body.assignment_date as string,
          notes: null,
          created_at: '2026-05-22T00:00:00Z',
          updated_at: '2026-05-22T00:00:00Z',
        }
        mock.state.assignments = [...mock.state.assignments, row]
        return row
      },
    ),
    deleteAssignment: vi.fn(async (id: string) => {
      mock.state.lastDelete = id
      mock.state.assignments = mock.state.assignments.filter((a) => a.id !== id)
    }),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function render(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

const ITEMS = [
  {
    date_range_start: '2026-06-01',
    date_range_end: '2026-06-02',
    selected_days: null,
  },
]

function seedRoster() {
  mock.state.roster = [
    {
      id: 'prov-1',
      operator_id: 'op-1',
      contact_id: null,
      display_name: 'Marie Dubois',
      default_role_id: 'role-1',
      active: true,
      sort_order: 0,
      created_at: '2026-05-22T00:00:00Z',
      updated_at: '2026-05-22T00:00:00Z',
    },
  ]
}

afterEach(() => {
  mock.state.assignments = []
  mock.state.roster = []
  mock.state.lastCreate = null
  mock.state.lastDelete = null
  vi.clearAllMocks()
})

describe('BookingProviderAssignments', () => {
  it('renders one row per booking-day', async () => {
    seedRoster()
    render(
      <BookingProviderAssignments
        operatorId="op-1"
        bookingId="bk-1"
        items={ITEMS}
      />,
    )
    expect(await screen.findByText('2026-06-01')).toBeInTheDocument()
    expect(screen.getByText('2026-06-02')).toBeInTheDocument()
  })

  it('shows the no-providers hint when roster is empty', async () => {
    render(
      <BookingProviderAssignments
        operatorId="op-1"
        bookingId="bk-1"
        items={ITEMS}
      />,
    )
    expect(
      await screen.findByText(/No providers in your roster yet/i),
    ).toBeInTheDocument()
  })

  it('shows the no-days hint when the booking has no scheduled days', async () => {
    seedRoster()
    render(
      <BookingProviderAssignments
        operatorId="op-1"
        bookingId="bk-1"
        items={[
          { date_range_start: null, date_range_end: null, selected_days: null },
        ]}
      />,
    )
    expect(
      await screen.findByText(/no scheduled days yet/i),
    ).toBeInTheDocument()
  })

  it('assigns a provider to a day', async () => {
    const user = userEvent.setup()
    seedRoster()
    render(
      <BookingProviderAssignments
        operatorId="op-1"
        bookingId="bk-1"
        items={ITEMS}
      />,
    )

    await screen.findByText('2026-06-01')
    await user.selectOptions(
      screen.getByTestId('assign-select-2026-06-01'),
      'prov-1',
    )
    await user.click(screen.getByTestId('assign-add-2026-06-01'))

    await waitFor(() => {
      expect(mock.state.lastCreate).toEqual({
        provider_id: 'prov-1',
        assignment_date: '2026-06-01',
      })
    })
  })

  it('renders an assigned provider chip and unassigns it', async () => {
    const user = userEvent.setup()
    seedRoster()
    mock.state.assignments = [
      {
        id: 'asg-1',
        operator_id: 'op-1',
        booking_id: 'bk-1',
        provider_id: 'prov-1',
        provider_role_id: 'role-1',
        assignment_date: '2026-06-01',
        notes: null,
        created_at: '2026-05-22T00:00:00Z',
        updated_at: '2026-05-22T00:00:00Z',
      },
    ]
    render(
      <BookingProviderAssignments
        operatorId="op-1"
        bookingId="bk-1"
        items={ITEMS}
      />,
    )

    const chip = await screen.findByTestId('assignment-chip-asg-1')
    expect(chip).toHaveTextContent('Marie Dubois')

    await user.click(
      screen.getByRole('button', { name: /Unassign Marie Dubois on 2026-06-01/i }),
    )
    await waitFor(() => {
      expect(mock.state.lastDelete).toBe('asg-1')
    })
  })
})
