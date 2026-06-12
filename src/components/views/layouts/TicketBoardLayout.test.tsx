// landr-wwhn.17 — tests for TicketBoardLayout.
//
// Covers:
//   - 5 kanban columns render (one per TicketStatus)
//   - tickets grouped into correct columns
//   - area filter chips render for all canonical areas
//   - clicking an area filter chip toggles the area in config
//   - clearing active filters calls onConfigChange with empty labelAreas
//   - "Clear" button only appears when areas are active
//   - read-mostly columns render with "auto" badge
// landr-wwhn.31:
//   - operator filter bar hidden for non-staff
//   - operator filter bar visible for staff with operators
//   - clicking operator chip calls onConfigChange with ticketConfig.operatorId
//   - clicking active operator chip clears the filter (set to null)
//   - Clear button clears the operator filter
//
// DnD drag semantics are covered by the board-level resolveTicketDrop tests
// in src/lib/tickets-board.test.ts; we skip pointer-event drive here.

import {
  render as rtlRender,
  screen,
  fireEvent,
  type RenderOptions,
} from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { TicketRow } from '@/lib/tickets'
import type { SavedViewWithState } from '@/lib/saved-views'
import { TicketBoardLayout } from './TicketBoardLayout'
import { TICKET_LABEL_AREAS } from '@/lib/tickets-views-data'

// ---- module mocks -----------------------------------------------------------
// useOperator: default non-staff (empty staffOperators) so operator filter
// is hidden. Tests that need it override via mockReturnValue before rendering.
// useEntitlements: default non-staff (effectiveIsStaff = false).
// useAuth: default unauthenticated (session = null) so the actorId query is
//   disabled (no authUid → no public-user lookup → actorId = null).
//   Tests that exercise actor-exclusion wiring can override this.

vi.mock('@/lib/operator', () => ({
  useOperator: vi.fn(() => ({
    currentOperatorId: 'op-1',
    staffOperators: [],
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    loading: false,
    switchOperator: vi.fn(),
    viewAsActive: false,
    viewAsOperator: null,
    enterViewAs: vi.fn(),
    exitViewAs: vi.fn(),
    staffOperatorsLoading: false,
  })),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: vi.fn(() => ({
    isEnabled: () => true,
    isLandrStaff: false,
    effectiveIsStaff: false,
    isLoading: false,
  })),
  EntitlementsProvider: ({ children }: { children: ReactElement }) => children,
}))

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    session: null,
    user: null,
    loading: false,
    signOut: vi.fn(),
  })),
  AuthProvider: ({ children }: { children: ReactElement }) => children,
}))

// Import mocked hooks so tests can override return values.
import { useOperator } from '@/lib/operator'
import { useEntitlements } from '@/lib/entitlements'

// ---- helpers ----------------------------------------------------------------

function makeView(
  configOverrides: Record<string, unknown> = {},
): SavedViewWithState {
  return {
    id: 'view-1',
    operator_id: 'op-1',
    creator_user_id: 'user-1',
    entity_type: 'ticket',
    visibility: 'personal',
    name: 'My tickets',
    config: configOverrides,
    sort_order: 0,
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
    user_state: { pinned: false, hidden: false, sort_order: 0 },
  }
}

function makeTicket(
  id: string,
  status: TicketRow['status'] = 'backlog',
): TicketRow {
  return {
    id,
    context: 'operations',
    type: 'bug',
    title: `Ticket ${id}`,
    body: null,
    status,
    priority: 'p2',
    perceived_impact: 'annoying',
    reporter_id: null,
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    moscow: null,
    origin_tier: null,
    origin_operator_label: null,
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
  }
}

function render(ui: ReactElement, options?: RenderOptions) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return rtlRender(
    <QueryClientProvider client={qc}>
      <MemoryRouter>{ui}</MemoryRouter>
    </QueryClientProvider>,
    options,
  )
}

afterEach(() => {
  vi.clearAllMocks()
})

// ---- column rendering -------------------------------------------------------

describe('TicketBoardLayout — column rendering', () => {
  it('renders all 5 columns', () => {
    render(
      <TicketBoardLayout
        view={makeView()}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    for (const col of ['backlog', 'ready', 'in_progress', 'in_review', 'done']) {
      expect(
        screen.getByTestId(`ticket-board-column-${col}`),
      ).toBeInTheDocument()
    }
  })

  it('groups tickets into the correct columns', () => {
    const items = [
      makeTicket('t1', 'backlog'),
      makeTicket('t2', 'ready'),
      makeTicket('t3', 'backlog'),
      makeTicket('t4', 'done'),
    ]
    render(
      <TicketBoardLayout
        view={makeView()}
        items={items}
        onConfigChange={vi.fn()}
      />,
    )

    // backlog column has 2 cards
    expect(
      screen.getByTestId('ticket-board-column-count-backlog').textContent,
    ).toBe('2')
    // ready column has 1 card
    expect(
      screen.getByTestId('ticket-board-column-count-ready').textContent,
    ).toBe('1')
    // done column has 1 card
    expect(
      screen.getByTestId('ticket-board-column-count-done').textContent,
    ).toBe('1')
    // in_progress column is empty
    expect(
      screen.getByTestId('ticket-board-column-count-in_progress').textContent,
    ).toBe('0')
  })

  it('shows "auto" badge on read-mostly columns', () => {
    render(
      <TicketBoardLayout
        view={makeView()}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    // in_progress, in_review, done are read-mostly
    for (const col of ['in_progress', 'in_review', 'done']) {
      expect(
        screen.getByTestId(`ticket-board-column-${col}`).getAttribute(
          'data-board-column-read-mostly',
        ),
      ).toBe('true')
    }
  })
})

// ---- label / area filter bar -----------------------------------------------

describe('TicketBoardLayout — label filter bar', () => {
  it('renders a chip for every canonical area', () => {
    render(
      <TicketBoardLayout
        view={makeView()}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    for (const area of TICKET_LABEL_AREAS) {
      expect(screen.getByTestId(`ticket-area-filter-${area}`)).toBeInTheDocument()
    }
  })

  it('does NOT show the Clear button when no areas are active', () => {
    render(
      <TicketBoardLayout
        view={makeView()}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    expect(
      screen.queryByTestId('ticket-area-filter-clear'),
    ).not.toBeInTheDocument()
  })

  it('shows the Clear button when at least one area is active', () => {
    render(
      <TicketBoardLayout
        view={makeView({ ticketConfig: { labelAreas: ['dashboard'] } })}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    expect(screen.getByTestId('ticket-area-filter-clear')).toBeInTheDocument()
  })

  it('clicking an inactive chip calls onConfigChange with that area added', () => {
    const onConfigChange = vi.fn()
    render(
      <TicketBoardLayout
        view={makeView()}
        items={[]}
        onConfigChange={onConfigChange}
      />,
    )
    fireEvent.click(screen.getByTestId('ticket-area-filter-dashboard'))
    expect(onConfigChange).toHaveBeenCalledOnce()
    const [newConfig] = onConfigChange.mock.calls[0] as [
      Record<string, unknown>,
    ]
    const tc = newConfig.ticketConfig as { labelAreas: string[] }
    expect(tc.labelAreas).toContain('dashboard')
  })

  it('clicking an active chip removes it from the config', () => {
    const onConfigChange = vi.fn()
    render(
      <TicketBoardLayout
        view={makeView({ ticketConfig: { labelAreas: ['dashboard', 'api'] } })}
        items={[]}
        onConfigChange={onConfigChange}
      />,
    )
    // dashboard chip is active — clicking removes it
    fireEvent.click(screen.getByTestId('ticket-area-filter-dashboard'))
    expect(onConfigChange).toHaveBeenCalledOnce()
    const [newConfig] = onConfigChange.mock.calls[0] as [
      Record<string, unknown>,
    ]
    const tc = newConfig.ticketConfig as { labelAreas: string[] }
    expect(tc.labelAreas).not.toContain('dashboard')
    expect(tc.labelAreas).toContain('api')
  })

  it('clicking Clear resets labelAreas to empty array', () => {
    const onConfigChange = vi.fn()
    render(
      <TicketBoardLayout
        view={makeView({ ticketConfig: { labelAreas: ['dashboard'] } })}
        items={[]}
        onConfigChange={onConfigChange}
      />,
    )
    fireEvent.click(screen.getByTestId('ticket-area-filter-clear'))
    expect(onConfigChange).toHaveBeenCalledOnce()
    const [newConfig] = onConfigChange.mock.calls[0] as [
      Record<string, unknown>,
    ]
    const tc = newConfig.ticketConfig as { labelAreas: string[] }
    expect(tc.labelAreas).toEqual([])
  })

  it('active chip has aria-pressed=true; inactive has aria-pressed=false', () => {
    render(
      <TicketBoardLayout
        view={makeView({ ticketConfig: { labelAreas: ['dashboard'] } })}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    const dashChip = screen.getByTestId('ticket-area-filter-dashboard')
    const apiChip = screen.getByTestId('ticket-area-filter-api')
    expect(dashChip).toHaveAttribute('aria-pressed', 'true')
    expect(apiChip).toHaveAttribute('aria-pressed', 'false')
  })
})

// ---- operator filter bar (landr-wwhn.31) ------------------------------------

const STAFF_OPERATORS = [
  { id: 'op-a', slug: 'alpha', name: 'Alpha Travels', onboarded_at: '2026-01-01T00:00:00Z' },
  { id: 'op-b', slug: 'beta', name: 'Beta Outdoors', onboarded_at: '2026-01-01T00:00:00Z' },
]

/** Make useOperator return staffOperators and useEntitlements return staff. */
function asStaff() {
  vi.mocked(useOperator).mockReturnValue({
    currentOperatorId: 'op-a',
    staffOperators: STAFF_OPERATORS,
    operators: [{ id: 'op-a', slug: 'alpha', name: 'Alpha Travels', onboarded_at: null }],
    loading: false,
    switchOperator: vi.fn(),
    viewAsActive: false,
    viewAsOperator: null,
    enterViewAs: vi.fn(),
    exitViewAs: vi.fn(),
    staffOperatorsLoading: false,
    currentOperator: { id: 'op-a', slug: 'alpha', name: 'Alpha Travels', onboarded_at: null },
    refreshOperators: vi.fn(),
  })
  vi.mocked(useEntitlements).mockReturnValue({
    isEnabled: () => true,
    isLandrStaff: true,
    effectiveIsStaff: true,
    isLoading: false,
  })
}

describe('TicketBoardLayout — operator filter bar (landr-wwhn.31)', () => {
  it('does NOT render the operator filter bar for non-staff', () => {
    // Default mock is non-staff / empty staffOperators.
    render(
      <TicketBoardLayout
        view={makeView()}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    expect(
      screen.queryByTestId('ticket-board-operator-filter'),
    ).not.toBeInTheDocument()
  })

  it('renders the operator filter bar for staff with operators', () => {
    asStaff()
    render(
      <TicketBoardLayout
        view={makeView()}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    expect(
      screen.getByTestId('ticket-board-operator-filter'),
    ).toBeInTheDocument()
    for (const op of STAFF_OPERATORS) {
      expect(
        screen.getByTestId(`ticket-operator-filter-${op.id}`),
      ).toBeInTheDocument()
    }
  })

  it('does NOT show Clear button when no operator is active', () => {
    asStaff()
    render(
      <TicketBoardLayout
        view={makeView()}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    expect(
      screen.queryByTestId('ticket-operator-filter-clear'),
    ).not.toBeInTheDocument()
  })

  it('shows Clear button when an operator is active in the config', () => {
    asStaff()
    render(
      <TicketBoardLayout
        view={makeView({ ticketConfig: { operatorId: 'op-a' } })}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    expect(
      screen.getByTestId('ticket-operator-filter-clear'),
    ).toBeInTheDocument()
  })

  it('active operator chip has aria-pressed=true; inactive has aria-pressed=false', () => {
    asStaff()
    render(
      <TicketBoardLayout
        view={makeView({ ticketConfig: { operatorId: 'op-a' } })}
        items={[]}
        onConfigChange={vi.fn()}
      />,
    )
    expect(
      screen.getByTestId('ticket-operator-filter-op-a'),
    ).toHaveAttribute('aria-pressed', 'true')
    expect(
      screen.getByTestId('ticket-operator-filter-op-b'),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('clicking an inactive operator chip calls onConfigChange with that operatorId', () => {
    asStaff()
    const onConfigChange = vi.fn()
    render(
      <TicketBoardLayout
        view={makeView()}
        items={[]}
        onConfigChange={onConfigChange}
      />,
    )
    fireEvent.click(screen.getByTestId('ticket-operator-filter-op-a'))
    expect(onConfigChange).toHaveBeenCalledOnce()
    const [newConfig] = onConfigChange.mock.calls[0] as [Record<string, unknown>]
    const tc = newConfig.ticketConfig as { operatorId: string }
    expect(tc.operatorId).toBe('op-a')
  })

  it('clicking the active operator chip clears the filter (removes operatorId)', () => {
    asStaff()
    const onConfigChange = vi.fn()
    render(
      <TicketBoardLayout
        view={makeView({ ticketConfig: { operatorId: 'op-a' } })}
        items={[]}
        onConfigChange={onConfigChange}
      />,
    )
    fireEvent.click(screen.getByTestId('ticket-operator-filter-op-a'))
    expect(onConfigChange).toHaveBeenCalledOnce()
    const [newConfig] = onConfigChange.mock.calls[0] as [Record<string, unknown>]
    const tc = newConfig.ticketConfig as Record<string, unknown>
    expect(tc.operatorId).toBeUndefined()
  })

  it('clicking Clear calls onConfigChange without operatorId', () => {
    asStaff()
    const onConfigChange = vi.fn()
    render(
      <TicketBoardLayout
        view={makeView({ ticketConfig: { operatorId: 'op-a' } })}
        items={[]}
        onConfigChange={onConfigChange}
      />,
    )
    fireEvent.click(screen.getByTestId('ticket-operator-filter-clear'))
    expect(onConfigChange).toHaveBeenCalledOnce()
    const [newConfig] = onConfigChange.mock.calls[0] as [Record<string, unknown>]
    const tc = newConfig.ticketConfig as Record<string, unknown>
    expect(tc.operatorId).toBeUndefined()
  })
})
