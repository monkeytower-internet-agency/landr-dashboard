// landr-wwhn.11 — tests for the tickets data layer.
//
// Covers: TICKET_COLUMNS ordering + draggable flags, fetchTickets, fetchTicketsStaff,
// patchTicketStatus, and the DRAGGABLE_STATUSES gate.

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
    // The mock update builder returns the builder; the eq().limit chain
    // actually resolves. We need the update chain to resolve — rebuild
    // the fromBuilder mock to capture the update call properly.
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
