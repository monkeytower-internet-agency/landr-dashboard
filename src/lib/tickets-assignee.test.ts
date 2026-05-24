// landr-wwhn.22 — tests for the assignee data layer.
//
// Covers: fetchAssignableUsers and patchTicketAssignee.
//
// Kept separate from tickets-board.test.ts and tickets-detail.test.ts to avoid
// a triple-mock of @/lib/supabase in one file; the two existing suites use
// different mock builder shapes.
//
// fetchAssignableUsers: .select().order()  → terminal via builder.then().
// patchTicketAssignee:  .update().eq()     → terminal via builder.then().

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- Supabase mock ----------------------------------------------------------

const { mock } = vi.hoisted(() => {
  type BuildResult = { data: unknown; error: { message: string } | null }

  const state = {
    rows: [] as unknown[],
    error: null as { message: string } | null,
    lastUpdate: null as Record<string, unknown> | null,
    fromTable: '',
  }

  const makeBuilder = (): Record<string, unknown> => {
    const b: Record<string, unknown> = {}
    Object.assign(b, {
      select: vi.fn(() => b),
      eq: vi.fn(() => b),
      update: vi.fn((vals: Record<string, unknown>) => {
        state.lastUpdate = vals
        return b
      }),
      order: vi.fn(() => b),
      // Terminal used by fetchAssignableUsers (no .limit() — ends after .order()).
      // Also used by patchTicketAssignee (update().eq() chain).
      then: (resolve: (v: BuildResult) => void) =>
        resolve({ data: state.rows, error: state.error }),
    })
    return b
  }

  const supabase = {
    from: vi.fn((table: string) => {
      state.fromTable = table
      return makeBuilder()
    }),
  }

  return { mock: { state, supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

import { fetchAssignableUsers, patchTicketAssignee } from './tickets'
import type { AssignableUser } from './tickets'

// ---- helpers ----------------------------------------------------------------

function makeAssignableUser(overrides: Partial<AssignableUser> = {}): AssignableUser {
  return {
    id: 'user-1',
    email: 'olaf@landr.de',
    is_landr_staff: true,
    is_claude_agent: false,
    ...overrides,
  }
}

beforeEach(() => {
  mock.state.rows = []
  mock.state.error = null
  mock.state.lastUpdate = null
  mock.state.fromTable = ''
  vi.clearAllMocks()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---- fetchAssignableUsers ---------------------------------------------------

describe('fetchAssignableUsers', () => {
  it('queries the assignable_users view', async () => {
    mock.state.rows = []
    await fetchAssignableUsers()
    expect(mock.supabase.from).toHaveBeenCalledWith('assignable_users')
  })

  it('returns rows on success', async () => {
    const human = makeAssignableUser()
    const agent = makeAssignableUser({
      id: 'agent-1',
      email: 'claude-agent@landr.de',
      is_landr_staff: false,
      is_claude_agent: true,
    })
    mock.state.rows = [human, agent]
    const result = await fetchAssignableUsers()
    expect(result).toHaveLength(2)
    expect(result[0]).toMatchObject({ id: 'user-1', is_landr_staff: true })
    expect(result[1]).toMatchObject({ id: 'agent-1', is_claude_agent: true })
  })

  it('returns [] when query yields empty rows', async () => {
    mock.state.rows = []
    const result = await fetchAssignableUsers()
    expect(result).toEqual([])
  })

  it('throws on Supabase error', async () => {
    mock.state.error = { message: 'permission denied' }
    await expect(fetchAssignableUsers()).rejects.toThrow('permission denied')
  })
})

// ---- patchTicketAssignee ----------------------------------------------------

describe('patchTicketAssignee', () => {
  it('calls supabase update with the assignee id', async () => {
    const updateSpy = vi.fn<(vals: Record<string, unknown>) => Record<string, unknown>>((vals) => {
      mock.state.lastUpdate = vals
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        eq: vi.fn(async () => ({ error: null })),
      })
      return b
    })
    mock.supabase.from.mockReturnValueOnce({ update: updateSpy })

    await patchTicketAssignee('ticket-1', 'user-1')
    expect(updateSpy).toHaveBeenCalledWith({ assignee_id: 'user-1' })
  })

  it('calls supabase update with null to unassign', async () => {
    const updateSpy = vi.fn<(vals: Record<string, unknown>) => Record<string, unknown>>((vals) => {
      mock.state.lastUpdate = vals
      const b: Record<string, unknown> = {}
      Object.assign(b, {
        eq: vi.fn(async () => ({ error: null })),
      })
      return b
    })
    mock.supabase.from.mockReturnValueOnce({ update: updateSpy })

    await patchTicketAssignee('ticket-1', null)
    expect(updateSpy).toHaveBeenCalledWith({ assignee_id: null })
  })

  it('throws when Supabase returns an error', async () => {
    const eqSpy = vi.fn(async () => ({ error: { message: 'RLS denied' } }))
    mock.supabase.from.mockReturnValueOnce({
      update: vi.fn(() => ({ eq: eqSpy })),
    })
    await expect(patchTicketAssignee('ticket-1', 'user-1')).rejects.toThrow(
      'RLS denied',
    )
  })
})
