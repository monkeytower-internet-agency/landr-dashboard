// landr-7dya.11 — TicketFilterProvider integration: the URL is the single
// source of truth. We verify the provider derives the filter from the URL,
// patchFilter / clearFilter write it back (deep-linkable), and the `matches`
// predicate reflects the active facets. Auth + the data layer are mocked so the
// test focuses on the provider's URL ↔ filter wiring.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ session: { user: { id: 'auth-1' } } }),
}))

vi.mock('@/lib/tickets', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/tickets')>('@/lib/tickets')
  return {
    ...actual,
    fetchCurrentPublicUser: vi.fn(async () => ({
      id: 'pub-1',
      email: 'olaf@landr.de',
      is_landr_staff: true,
    })),
  }
})

vi.mock('@/lib/ticket-filter-data', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/ticket-filter-data')
  >('@/lib/ticket-filter-data')
  return {
    ...actual,
    // No network in this test — derived sets empty, server ids "match all".
    fetchFilterDerivedSets: vi.fn(async () => actual.EMPTY_DERIVED_SETS),
    fetchFilteredStaffTicketIds: vi.fn(async () => null),
  }
})

import { TicketFilterProvider, useTicketFilter } from './ticket-filter-context'

// ---- probe component --------------------------------------------------------

function Probe() {
  const { filter, patchFilter, clearFilter, matches } = useTicketFilter()
  const loc = useLocation()
  return (
    <div>
      <span data-testid="search">{loc.search}</span>
      <span data-testid="status">{filter.status ?? 'none'}</span>
      <span data-testid="mine">{String(filter.assignedToMe)}</span>
      <span data-testid="match-ready">
        {String(
          matches({
            id: 't1',
            status: 'ready',
            type: 'bug',
            priority: 'p2',
            perceived_impact: 'idea',
            moscow: null,
            operator_id: 'op-1',
            assignee_id: null,
            blocked: false,
            created_at: '2026-05-01T00:00:00.000Z',
            updated_at: '2026-05-01T00:00:00.000Z',
          }),
        )}
      </span>
      <button
        type="button"
        data-testid="set-ready"
        onClick={() => patchFilter({ status: 'ready' })}
      >
        set ready
      </button>
      <button type="button" data-testid="clear" onClick={clearFilter}>
        clear
      </button>
    </div>
  )
}

function renderAt(initial: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const wrapper = (children: ReactNode) => (
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <TicketFilterProvider>{children}</TicketFilterProvider>
      </MemoryRouter>
    </QueryClientProvider>
  )
  return render(wrapper(<Probe />))
}

beforeEach(() => vi.clearAllMocks())
afterEach(() => vi.clearAllMocks())

describe('TicketFilterProvider', () => {
  it('derives the filter from the URL on mount (deep-link)', () => {
    renderAt('/staff/tickets?status=ready&mine=1')
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(screen.getByTestId('mine')).toHaveTextContent('true')
  })

  it('patchFilter writes the facet into the URL', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets')
    expect(screen.getByTestId('status')).toHaveTextContent('none')
    await user.click(screen.getByTestId('set-ready'))
    expect(screen.getByTestId('search')).toHaveTextContent('status=ready')
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
  })

  it('clearFilter strips the filter params from the URL', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets?status=done&unread=1')
    await user.click(screen.getByTestId('clear'))
    expect(screen.getByTestId('search')).toHaveTextContent('')
    expect(screen.getByTestId('status')).toHaveTextContent('none')
  })

  it('matches reflects the active status facet', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets')
    // No filter → the ready ticket matches.
    expect(screen.getByTestId('match-ready')).toHaveTextContent('true')
    // After setting status=ready it still matches (the probe ticket IS ready).
    await user.click(screen.getByTestId('set-ready'))
    expect(screen.getByTestId('match-ready')).toHaveTextContent('true')
  })

  it('preserves unrelated params (e.g. ?open=<id>) on patch', async () => {
    const user = userEvent.setup()
    renderAt('/staff/tickets?open=ticket-9')
    await user.click(screen.getByTestId('set-ready'))
    const search = screen.getByTestId('search').textContent ?? ''
    expect(search).toContain('open=ticket-9')
    expect(search).toContain('status=ready')
  })
})
