// landr-wwhn.11 — tests for the board side of the tickets data layer.
//
// Kept in a separate file from tickets.test.ts (landr-wwhn.12's createTicket
// suite) because the two need different supabase query-builder mock shapes:
// the create suite mocks an insert→single→thenable chain, the board suite
// mocks select→eq→order→limit + update→eq chains. Splitting avoids a
// double-mock of @/lib/supabase in one file.
//
// Covers: TICKET_COLUMNS ordering + draggable flags, DRAGGABLE_STATUSES gate,
// fetchTickets, fetchTicketsStaff, patchTicketStatus, and the pure
// resolveTicketDrop resolver.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TicketRow } from './tickets'

// ---- Supabase mock ----------------------------------------------------------

const { mock } = vi.hoisted(() => {
  type Builder = Record<string, unknown>
  const state = {
    rows: [] as TicketRow[],
    error: null as { message: string } | null,
    lastUpdate: null as Record<string, unknown> | null,
  }

  const fromBuilder = (): Builder => {
    const b: Builder = {}
    Object.assign(b, {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      update: vi.fn((vals: Record<string, unknown>) => {
        state.lastUpdate = vals
        return b
      }),
      order: vi.fn(() => b),
      limit: vi.fn(async () => ({ data: state.rows, error: state.error })),
    })
    return b
  }

  const supabase = {
    from: vi.fn(() => fromBuilder()),
    channel: vi.fn(() => ({ on: vi.fn().mockReturnThis(), subscribe: vi.fn() })),
    removeChannel: vi.fn(),
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

import {
  DRAGGABLE_STATUSES,
  TICKET_COLUMNS,
  fetchTickets,
  fetchTicketsStaff,
  patchTicketStatus,
  resolveTicketDrop,
} from './tickets'

// ---- helpers ----------------------------------------------------------------

function makeTicket(overrides: Partial<TicketRow> = {}): TicketRow {
  return {
    id: 'ticket-1',
    context: 'operations',
    type: 'bug',
    title: 'Test ticket',
    body: null,
    status: 'backlog',
    priority: 'p2',
    perceived_impact: 'annoying',
    reporter_id: 'user-1',
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    moscow: null,
    origin_tier: null,
    origin_operator_label: null,
    created_at: '2026-05-24T10:00:00Z',
    updated_at: '2026-05-24T10:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
  mock.state.lastUpdate = null
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---- TICKET_COLUMNS ---------------------------------------------------------

describe('TICKET_COLUMNS', () => {
  it('has exactly 5 columns in the right order', () => {
    const keys = TICKET_COLUMNS.map((c) => c.key)
    expect(keys).toEqual([
      'backlog',
      'ready',
      'in_progress',
      'in_review',
      'done',
    ])
  })

  it('marks backlog and ready as draggable', () => {
    const draggable = TICKET_COLUMNS.filter((c) => c.draggable).map((c) => c.key)
    expect(draggable).toEqual(['backlog', 'ready'])
  })

  it('marks in_progress, in_review, done as read-mostly', () => {
    const readMostly = TICKET_COLUMNS.filter((c) => c.readMostly).map((c) => c.key)
    expect(readMostly).toEqual(['in_progress', 'in_review', 'done'])
  })
})

// ---- DRAGGABLE_STATUSES -----------------------------------------------------

describe('DRAGGABLE_STATUSES', () => {
  it('includes backlog and ready', () => {
    expect(DRAGGABLE_STATUSES.has('backlog')).toBe(true)
    expect(DRAGGABLE_STATUSES.has('ready')).toBe(true)
  })

  it('does NOT include bd-authoritative statuses', () => {
    expect(DRAGGABLE_STATUSES.has('in_progress')).toBe(false)
    expect(DRAGGABLE_STATUSES.has('in_review')).toBe(false)
    expect(DRAGGABLE_STATUSES.has('done')).toBe(false)
  })
})

// ---- fetchTickets -----------------------------------------------------------

describe('fetchTickets', () => {
  it('returns rows on success', async () => {
    const row = makeTicket()
    mock.state.rows = [row]
    const result = await fetchTickets('op-1')
    expect(result).toEqual([row])
  })

  it('throws on Supabase error', async () => {
    mock.state.error = { message: 'connection refused' }
    mock.state.rows = []
    await expect(fetchTickets('op-1')).rejects.toThrow('connection refused')
  })
})

// ---- fetchTicketsStaff ------------------------------------------------------

describe('fetchTicketsStaff', () => {
  it('returns rows from tickets_staff view', async () => {
    const row = makeTicket()
    mock.state.rows = [row]
    const result = await fetchTicketsStaff()
    // The from() call should target tickets_staff
    expect(mock.supabase.from).toHaveBeenCalledWith('tickets_staff')
    expect(result).toEqual([row])
  })
})

// ---- patchTicketStatus ------------------------------------------------------

describe('patchTicketStatus', () => {
  it('calls supabase update with the new status', async () => {
    const updateSpy = vi.fn(() => ({
      eq: vi.fn(async () => ({ error: null })),
    }))
    mock.supabase.from.mockReturnValueOnce({ update: updateSpy })

    await patchTicketStatus('ticket-1', 'ready')
    expect(updateSpy).toHaveBeenCalledWith({ status: 'ready' })
  })

  it('throws when Supabase returns an error', async () => {
    const eqSpy = vi.fn(async () => ({ error: { message: 'update failed' } }))
    mock.supabase.from.mockReturnValueOnce({
      update: vi.fn(() => ({ eq: eqSpy })),
    })
    await expect(patchTicketStatus('ticket-1', 'ready')).rejects.toThrow(
      'update failed',
    )
  })
})

// ---- resolveTicketDrop (pure) -----------------------------------------------

describe('resolveTicketDrop', () => {
  const tickets: TicketRow[] = [
    makeTicket({ id: 'tk-1', status: 'backlog' }),
    makeTicket({ id: 'tk-2', status: 'ready' }),
    makeTicket({ id: 'tk-3', status: 'in_progress' }),
  ]

  it('returns null when overId is null', () => {
    expect(
      resolveTicketDrop({ activeId: 'tk-1', overId: null, tickets }),
    ).toBeNull()
  })

  it('returns null when activeId is not in tickets', () => {
    expect(
      resolveTicketDrop({
        activeId: 'unknown',
        overId: 'column:ready',
        tickets,
      }),
    ).toBeNull()
  })

  it('returns null when dropping onto the same column', () => {
    expect(
      resolveTicketDrop({
        activeId: 'tk-1',
        overId: 'column:backlog',
        tickets,
      }),
    ).toBeNull()
  })

  it('returns null when target is a bd-authoritative column', () => {
    // backlog → in_progress should be rejected
    expect(
      resolveTicketDrop({
        activeId: 'tk-1',
        overId: 'column:in_progress',
        tickets,
      }),
    ).toBeNull()
  })

  it('returns null when dragging FROM a bd-authoritative column', () => {
    // in_progress ticket dragged to backlog should be rejected
    expect(
      resolveTicketDrop({
        activeId: 'tk-3',
        overId: 'column:backlog',
        tickets,
      }),
    ).toBeNull()
  })

  it('resolves a valid human-owned column drop (column target)', () => {
    const result = resolveTicketDrop({
      activeId: 'tk-1',
      overId: 'column:ready',
      tickets,
    })
    expect(result).toEqual({ ticketId: 'tk-1', newStatus: 'ready' })
  })

  it('resolves a valid drop onto another card (inherits column)', () => {
    // tk-1 (backlog) dropped onto tk-2 (ready) → should move to ready
    const result = resolveTicketDrop({
      activeId: 'tk-1',
      overId: 'tk-2',
      tickets,
    })
    expect(result).toEqual({ ticketId: 'tk-1', newStatus: 'ready' })
  })

  it('returns null when dropping onto a card in a bd-authoritative column', () => {
    // tk-1 (backlog) dropped onto tk-3 (in_progress) → rejected
    expect(
      resolveTicketDrop({
        activeId: 'tk-1',
        overId: 'tk-3',
        tickets,
      }),
    ).toBeNull()
  })
})
