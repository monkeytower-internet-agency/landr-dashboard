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
