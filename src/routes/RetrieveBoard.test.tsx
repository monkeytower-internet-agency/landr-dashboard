// landr-znzz.8 — tests for the /retrieve operator retrieve board route.
//
// Mocks the checkins client (fetch + patch) and useOperator, renders the
// board under a QueryClient + MemoryRouter, and asserts: rows render grouped
// by status, the still-out row is highlighted, the map link points at the
// dropped pin, setting a retrieve_state chip PATCHes with the right body, and
// the empty state shows when there are no check-ins. Mirrors Audit.test.tsx.

import {
  render as rtlRender,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import type { Checkin, RetrievePatch } from '@/lib/checkins'

const { mock } = vi.hoisted(() => {
  const state = {
    rows: [] as Checkin[],
    error: null as Error | null,
    lastPatch: null as { checkinId: string; patch: RetrievePatch } | null,
  }
  return { mock: { state } }
})

vi.mock('@/lib/checkins', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/checkins')>('@/lib/checkins')
  return {
    ...actual,
    fetchCheckins: vi.fn(async () => {
      if (mock.state.error) throw mock.state.error
      return mock.state.rows
    }),
    patchCheckinRetrieve: vi.fn(
      async (_opId: string, checkinId: string, patch: RetrievePatch) => {
        mock.state.lastPatch = { checkinId, patch }
        const found = mock.state.rows.find((r) => r.id === checkinId)
        return { ...(found as Checkin), ...patch }
      },
    ),
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
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { RetrieveBoard } from './RetrieveBoard'

function render(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
    ...options,
  })
}

function makeCheckin(overrides: Partial<Checkin> = {}): Checkin {
  return {
    id: 'c-1',
    booking_id: 'b-1',
    booking_participant_id: 'bp-1',
    day_date: '2026-05-25',
    status: 'in_progress',
    latitude: null,
    longitude: null,
    note: null,
    retrieve_state: null,
    retrieve_note: null,
    first_name: 'Anna',
    last_name: 'Vogel',
    created_at: '2026-05-25T10:00:00Z',
    updated_at: '2026-05-25T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
  mock.state.lastPatch = null
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('RetrieveBoard — smoke', () => {
  it('renders the page heading and day picker', async () => {
    render(<RetrieveBoard />)
    expect(
      await screen.findByRole('heading', { name: /retrieve board/i, level: 1 }),
    ).toBeInTheDocument()
    expect(screen.getByLabelText(/^day$/i)).toBeInTheDocument()
  })

  it('shows the empty state when there are no check-ins', async () => {
    mock.state.rows = []
    render(<RetrieveBoard />)
    expect(
      await screen.findByText(/no check-ins recorded for this day/i),
    ).toBeInTheDocument()
  })

  it('renders the error state on a fetch failure', async () => {
    mock.state.error = new Error('rls-denied')
    render(<RetrieveBoard />)
    expect(
      await screen.findByText(/failed to load the retrieve board/i),
    ).toBeInTheDocument()
    expect(screen.getByText(/rls-denied/i)).toBeInTheDocument()
  })
})

describe('RetrieveBoard — rows', () => {
  it('renders a row per check-in with name + status chip', async () => {
    mock.state.rows = [
      makeCheckin({ id: 'c-1', first_name: 'Anna', status: 'in_progress' }),
      makeCheckin({
        id: 'c-2',
        first_name: 'Bo',
        status: 'arrived_designated',
      }),
    ]
    render(<RetrieveBoard />)
    const rows = await screen.findAllByTestId('checkin-row')
    expect(rows).toHaveLength(2)
    expect(screen.getByText('Anna Vogel')).toBeInTheDocument()
    expect(screen.getByText('Bo Vogel')).toBeInTheDocument()
  })

  it('orders still-out (in_progress) rows ahead of landed rows', async () => {
    mock.state.rows = [
      makeCheckin({ id: 'designated', status: 'arrived_designated' }),
      makeCheckin({ id: 'still-out', status: 'in_progress' }),
    ]
    render(<RetrieveBoard />)
    const rows = await screen.findAllByTestId('checkin-row')
    expect(rows[0].getAttribute('data-status')).toBe('in_progress')
    expect(rows[1].getAttribute('data-status')).toBe('arrived_designated')
  })

  it('shows the overdue hint on the still-out row', async () => {
    mock.state.rows = [makeCheckin({ status: 'in_progress' })]
    render(<RetrieveBoard />)
    expect(
      await screen.findByText(/not yet checked in/i),
    ).toBeInTheDocument()
  })

  it('renders coords + an OpenStreetMap link for arrived_elsewhere', async () => {
    mock.state.rows = [
      makeCheckin({
        status: 'arrived_elsewhere',
        latitude: 28.12345,
        longitude: -13.54321,
      }),
    ]
    render(<RetrieveBoard />)
    expect(await screen.findByText('28.12345, -13.54321')).toBeInTheDocument()
    const link = screen.getByRole('link', { name: /open map/i })
    expect(link.getAttribute('href')).toContain('openstreetmap.org')
    expect(link.getAttribute('href')).toContain('mlat=28.12345')
  })

  it('renders the customer note when present', async () => {
    mock.state.rows = [
      makeCheckin({ note: 'landed in a field by the church' }),
    ]
    render(<RetrieveBoard />)
    expect(
      await screen.findByText(/landed in a field by the church/i),
    ).toBeInTheDocument()
  })
})

describe('RetrieveBoard — retrieve workflow', () => {
  it('PATCHes the retrieve_state when a chip is clicked', async () => {
    mock.state.rows = [makeCheckin({ id: 'c-1', retrieve_state: null })]
    const user = userEvent.setup()
    render(<RetrieveBoard />)
    await screen.findByTestId('checkin-row')

    const chip = screen.getByRole('button', { name: /driver assigned/i })
    await user.click(chip)

    await vi.waitFor(() => {
      expect(mock.state.lastPatch).toEqual({
        checkinId: 'c-1',
        patch: { retrieve_state: 'driver_assigned' },
      })
    })
  })

  it('clears the retrieve_state when the active chip is clicked again', async () => {
    mock.state.rows = [
      makeCheckin({ id: 'c-1', retrieve_state: 'pending' }),
    ]
    const user = userEvent.setup()
    render(<RetrieveBoard />)
    await screen.findByTestId('checkin-row')

    const chip = screen.getByRole('button', { name: /^pending$/i })
    expect(chip.getAttribute('aria-pressed')).toBe('true')
    await user.click(chip)

    await vi.waitFor(() => {
      expect(mock.state.lastPatch).toEqual({
        checkinId: 'c-1',
        patch: { retrieve_state: null },
      })
    })
  })

  it('PATCHes the retrieve_note when the Save button is clicked', async () => {
    mock.state.rows = [makeCheckin({ id: 'c-1', retrieve_note: null })]
    const user = userEvent.setup()
    render(<RetrieveBoard />)
    const [row] = await screen.findAllByTestId('checkin-row')

    const textarea = within(row).getByLabelText(/retrieve note/i)
    await user.type(textarea, 'ETA 20m')
    await user.click(within(row).getByRole('button', { name: /save note/i }))

    await vi.waitFor(() => {
      expect(mock.state.lastPatch).toEqual({
        checkinId: 'c-1',
        patch: { retrieve_note: 'ETA 20m' },
      })
    })
  })

  it('disables Save while the note matches the saved value', async () => {
    mock.state.rows = [
      makeCheckin({ id: 'c-1', retrieve_note: 'ETA 20m' }),
    ]
    render(<RetrieveBoard />)
    const [row] = await screen.findAllByTestId('checkin-row')
    expect(
      within(row).getByRole('button', { name: /save note/i }),
    ).toBeDisabled()
  })

  it('surfaces a free-text retrieve_state set outside the chip set', async () => {
    mock.state.rows = [
      makeCheckin({ id: 'c-1', retrieve_state: 'handed_to_rescue' }),
    ]
    render(<RetrieveBoard />)
    expect(await screen.findByText('handed_to_rescue')).toBeInTheDocument()
  })
})
