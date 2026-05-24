// landr-wwhn.12 — exercise the supabase REST INSERT wrapper for the
// tickets table. Mirrors the product-addons test pattern (mock the
// supabase client at the @supabase/supabase-js layer, record the
// query-builder chain, assert payload shape + column select).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

type Call = { method: string; args: unknown[] }

const { mockSupabase } = vi.hoisted(() => {
  const state = {
    fromCalls: [] as string[],
    calls: [] as Call[],
    nextResult: { data: null as unknown, error: null as unknown },
  }

  const builder: Record<string, unknown> = {}
  const record = (method: string, ...args: unknown[]) => {
    state.calls.push({ method, args })
    return builder
  }
  Object.assign(builder, {
    select: vi.fn((...args: unknown[]) => record('select', ...args)),
    insert: vi.fn((...args: unknown[]) => record('insert', ...args)),
    single: vi.fn(async () => state.nextResult),
    then: (resolve: (v: unknown) => void) => resolve(state.nextResult),
  })

  const supabase = {
    from: vi.fn((table: string) => {
      state.fromCalls.push(table)
      return builder
    }),
  }
  return { mockSupabase: { state, supabase, builder } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mockSupabase.supabase,
  getSupabase: () => mockSupabase.supabase,
}))

import { createTicket } from './tickets'

beforeEach(() => {
  mockSupabase.state.fromCalls.length = 0
  mockSupabase.state.calls.length = 0
  mockSupabase.state.nextResult = { data: null, error: null }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('tickets — supabase REST wrapper (landr-wwhn.12)', () => {
  it('createTicket inserts onto the tickets table and returns the saved row', async () => {
    const returned = {
      id: 'ticket-uuid-1',
      context: 'operations',
      type: 'bug',
      title: 'Login fails on iOS',
      body: 'Steps: open app, tap login.',
      status: 'backlog',
      priority: 'p2',
      perceived_impact: 'blocking',
      reporter_id: null,
      operator_id: 'op-1',
      assignee_id: null,
      blocked: false,
      created_at: '2026-05-24T10:00:00Z',
      updated_at: '2026-05-24T10:00:00Z',
    }
    mockSupabase.state.nextResult = { data: returned, error: null }

    const result = await createTicket({
      operator_id: 'op-1',
      reporter_id: null,
      type: 'bug',
      title: 'Login fails on iOS',
      body: 'Steps: open app, tap login.',
      perceived_impact: 'blocking',
    })

    expect(result.id).toBe('ticket-uuid-1')
    expect(result.type).toBe('bug')
    expect(result.perceived_impact).toBe('blocking')

    expect(mockSupabase.state.fromCalls).toEqual(['tickets'])

    const insertCall = mockSupabase.state.calls.find((c) => c.method === 'insert')
    expect(insertCall?.args[0]).toMatchObject({
      operator_id: 'op-1',
      reporter_id: null,
      type: 'bug',
      title: 'Login fails on iOS',
      body: 'Steps: open app, tap login.',
      perceived_impact: 'blocking',
    })

    const selectCall = mockSupabase.state.calls.find((c) => c.method === 'select')
    // The SELECT string should cover all public columns.
    expect(selectCall?.args[0]).toMatch(/id/)
    expect(selectCall?.args[0]).toMatch(/type/)
    expect(selectCall?.args[0]).toMatch(/perceived_impact/)
    // Internal-only fields MUST NOT appear in the select.
    expect(selectCall?.args[0]).not.toMatch(/severity/)
    expect(selectCall?.args[0]).not.toMatch(/linked_bd_id/)
    expect(selectCall?.args[0]).not.toMatch(/promotion_prompt/)
    expect(selectCall?.args[0]).not.toMatch(/sync_status/)
  })

  it('createTicket supports optional context field', async () => {
    mockSupabase.state.nextResult = {
      data: {
        id: 'ticket-2',
        context: 'community',
        type: 'feature',
        title: 'Forum upvoting',
        body: null,
        status: 'backlog',
        priority: 'p2',
        perceived_impact: 'idea',
        reporter_id: null,
        operator_id: 'op-1',
        assignee_id: null,
        blocked: false,
        created_at: '2026-05-24T10:00:00Z',
        updated_at: '2026-05-24T10:00:00Z',
      },
      error: null,
    }

    await createTicket({
      operator_id: 'op-1',
      reporter_id: null,
      type: 'feature',
      title: 'Forum upvoting',
      perceived_impact: 'idea',
      context: 'community',
    })

    const insertCall = mockSupabase.state.calls.find((c) => c.method === 'insert')
    expect(insertCall?.args[0]).toMatchObject({ context: 'community' })
  })

  it('createTicket throws when supabase returns an error', async () => {
    mockSupabase.state.nextResult = {
      data: null,
      error: { message: 'permission denied for table tickets' },
    }

    await expect(
      createTicket({
        operator_id: 'op-1',
        reporter_id: null,
        type: 'bug',
        title: 'A bug',
        perceived_impact: 'annoying',
      }),
    ).rejects.toThrow(/permission denied/)
  })
})
