// landr-agiw.3 — System lane data layer: system-filed tickets (operator_id NULL,
// context='system') surface as a synthetic rail lane.
import { afterEach, describe, expect, it, vi } from 'vitest'

type Call = {
  table: string
  select: string
  is: Record<string, unknown>
  eq: Record<string, unknown>
}

const { mock } = vi.hoisted(() => {
  const state = {
    rowsByTable: {} as Record<string, unknown[]>,
    calls: [] as Call[],
  }

  function makeBuilder(table: string) {
    const call: Call = { table, select: '', is: {}, eq: {} }
    state.calls.push(call)
    const builder: Record<string, unknown> = {}
    Object.assign(builder, {
      select: vi.fn((sel: string) => {
        call.select = sel
        return builder
      }),
      is: vi.fn((col: string, val: unknown) => {
        call.is[col] = val
        return builder
      }),
      eq: vi.fn((col: string, val: unknown) => {
        call.eq[col] = val
        return builder
      }),
      in: vi.fn(() => builder),
      order: vi.fn(() => builder),
      limit: vi.fn(() => builder),
      then: (
        onFulfilled: (v: { data: unknown[]; error: null }) => unknown,
      ) =>
        Promise.resolve({
          data: state.rowsByTable[table] ?? [],
          error: null,
        }).then(onFulfilled),
    })
    return builder
  }

  return {
    mock: {
      state,
      supabase: { from: vi.fn((t: string) => makeBuilder(t)) },
    },
  }
})

vi.mock('@/lib/supabase', () => ({ supabase: mock.supabase }))

import {
  fetchSystemInboxThreads,
  fetchSystemLaneSummary,
  SYSTEM_LANE_ID,
  SYSTEM_LANE_NAME,
} from '@/lib/feedback-inbox'

afterEach(() => {
  mock.state.rowsByTable = {}
  mock.state.calls = []
})

describe('fetchSystemLaneSummary', () => {
  it('returns a synthetic System summary keyed by the sentinel id', async () => {
    mock.state.rowsByTable['tickets_staff'] = [
      { id: 't1', updated_at: '2026-06-01T08:00:00Z' },
      { id: 't2', updated_at: '2026-06-01T07:00:00Z' },
    ]
    const summary = await fetchSystemLaneSummary()
    expect(summary).not.toBeNull()
    expect(summary!.operator_id).toBe(SYSTEM_LANE_ID)
    expect(summary!.operator_name).toBe(SYSTEM_LANE_NAME)
    expect(summary!.ticket_count).toBe(2)
    expect(summary!.last_activity_at).toBe('2026-06-01T08:00:00Z')
    expect(summary!.unread_count).toBe(0)
    // Filtered to ownerless system tickets.
    const call = mock.state.calls.find((c) => c.table === 'tickets_staff')!
    expect(call.is.operator_id).toBeNull()
    expect(call.eq.context).toBe('system')
  })

  it('returns null when there are no system tickets (lane hidden)', async () => {
    mock.state.rowsByTable['tickets_staff'] = []
    expect(await fetchSystemLaneSummary()).toBeNull()
  })
})

describe('fetchSystemInboxThreads', () => {
  it('queries ownerless system tickets and builds threads', async () => {
    mock.state.rowsByTable['tickets_staff'] = [
      {
        id: 't1',
        context: 'system',
        type: 'bug',
        title: 'Promotion failed: staging→main',
        body: 'boom',
        status: 'backlog',
        priority: 'p1',
        perceived_impact: 'blocking',
        reporter_id: null,
        operator_id: null,
        assignee_id: null,
        blocked: false,
        moscow: null,
        created_at: '2026-06-01T08:00:00Z',
        updated_at: '2026-06-01T08:00:00Z',
      },
    ]
    mock.state.rowsByTable['ticket_comments_staff'] = []
    const threads = await fetchSystemInboxThreads()
    expect(threads).toHaveLength(1)
    expect(threads[0]!.ticket.id).toBe('t1')
    expect(threads[0]!.ticket.operator_id).toBeNull()
    const call = mock.state.calls.find((c) => c.table === 'tickets_staff')!
    expect(call.is.operator_id).toBeNull()
    expect(call.eq.context).toBe('system')
  })
})
