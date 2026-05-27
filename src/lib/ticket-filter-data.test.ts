// landr-7dya.11 — tests for the filter data layer: server-side PostgREST
// narrowing for the row-intrinsic facets, the no-server-filter short-circuit,
// the 42703 (undefined column) graceful retry without severity/origin_tier,
// and the per-user derived-set resolution (assigned / unread / watching /
// mentioned-me) from notifications + ticket_watchers.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---- supabase mock ----------------------------------------------------------
//
// Each .from(table) returns a fresh chainable builder that records its filter
// calls and resolves at .limit() (the terminal in the data layer). A per-table
// result queue lets a test stage rows / errors per table.

type FilterCall = { method: string; args: unknown[] }

const { sb } = vi.hoisted(() => {
  const state = {
    // table → array of { data, error } results, consumed FIFO per .limit().
    results: {} as Record<string, Array<{ data: unknown; error: unknown }>>,
    // table → the recorded chain calls of the most recent builder.
    calls: {} as Record<string, FilterCall[]>,
    fromOrder: [] as string[],
  }

  const makeBuilder = (table: string) => {
    const calls: FilterCall[] = []
    state.calls[table] = calls
    const b: Record<string, unknown> = {}
    const chain = (method: string) =>
      vi.fn((...args: unknown[]) => {
        calls.push({ method, args })
        return b
      })
    const terminal = vi.fn((...args: unknown[]) => {
      calls.push({ method: 'limit', args })
      const queue = state.results[table] ?? []
      const next = queue.shift() ?? { data: [], error: null }
      return Promise.resolve(next)
    })
    Object.assign(b, {
      select: chain('select'),
      eq: chain('eq'),
      is: chain('is'),
      not: chain('not'),
      gte: chain('gte'),
      lte: chain('lte'),
      limit: terminal,
    })
    return b
  }

  const supabase = {
    from: vi.fn((table: string) => {
      state.fromOrder.push(table)
      return makeBuilder(table)
    }),
  }

  return { sb: { state, supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: sb.supabase,
  getSupabase: () => sb.supabase,
}))

import { TICKET_FILTER_DEFAULTS, type TicketFilter } from './ticket-filters'
import {
  fetchFilterDerivedSets,
  fetchFilteredStaffTicketIds,
  hasServerFilters,
} from './ticket-filter-data'

function reset() {
  sb.state.results = {}
  sb.state.calls = {}
  sb.state.fromOrder = []
  sb.supabase.from.mockClear()
}

function stage(table: string, result: { data: unknown; error: unknown }) {
  sb.state.results[table] = sb.state.results[table] ?? []
  sb.state.results[table].push(result)
}

function filter(over: Partial<TicketFilter> = {}): TicketFilter {
  return { ...TICKET_FILTER_DEFAULTS, ...over }
}

beforeEach(reset)
afterEach(() => vi.clearAllMocks())

// ---- hasServerFilters -------------------------------------------------------

describe('hasServerFilters', () => {
  it('is false for the default filter', () => {
    expect(hasServerFilters(TICKET_FILTER_DEFAULTS)).toBe(false)
  })

  it('is true for any row-intrinsic facet', () => {
    expect(hasServerFilters(filter({ status: 'ready' }))).toBe(true)
    expect(hasServerFilters(filter({ blockedOnly: true }))).toBe(true)
    expect(hasServerFilters(filter({ timeRange: '7d' }))).toBe(true)
    expect(hasServerFilters(filter({ assignedToMe: true }))).toBe(true)
  })

  it('is false when only derived-state chips (not assignedToMe) are set', () => {
    expect(hasServerFilters(filter({ unreadOnly: true }))).toBe(false)
    expect(hasServerFilters(filter({ watchingOnly: true }))).toBe(false)
    expect(hasServerFilters(filter({ mentionedMeOnly: true }))).toBe(false)
  })
})

// ---- fetchFilteredStaffTicketIds -------------------------------------------

describe('fetchFilteredStaffTicketIds', () => {
  it('returns null without a query when no row-intrinsic facet is active', async () => {
    const ids = await fetchFilteredStaffTicketIds(TICKET_FILTER_DEFAULTS, 'me')
    expect(ids).toBeNull()
    expect(sb.supabase.from).not.toHaveBeenCalled()
  })

  it('pushes status / blocked / unassigned to PostgREST and returns the id set', async () => {
    stage('tickets_staff', { data: [{ id: 'a' }, { id: 'b' }], error: null })
    const ids = await fetchFilteredStaffTicketIds(
      filter({ status: 'ready', blockedOnly: true, unassignedOnly: true }),
      null,
    )
    expect(sb.supabase.from).toHaveBeenCalledWith('tickets_staff')
    const calls = sb.state.calls['tickets_staff']
    expect(calls).toContainEqual({ method: 'eq', args: ['status', 'ready'] })
    expect(calls).toContainEqual({ method: 'eq', args: ['blocked', true] })
    expect(calls).toContainEqual({ method: 'is', args: ['assignee_id', null] })
    expect(ids).toEqual(new Set(['a', 'b']))
  })

  it('pushes assignedToMe as assignee_id = currentUserId', async () => {
    stage('tickets_staff', { data: [{ id: 'x' }], error: null })
    await fetchFilteredStaffTicketIds(filter({ assignedToMe: true }), 'user-42')
    expect(sb.state.calls['tickets_staff']).toContainEqual({
      method: 'eq',
      args: ['assignee_id', 'user-42'],
    })
  })

  it('applies the time window on updated_at by default', async () => {
    stage('tickets_staff', { data: [], error: null })
    const NOW = Date.parse('2026-05-27T12:00:00.000Z')
    await fetchFilteredStaffTicketIds(filter({ timeRange: '24h' }), null, NOW)
    expect(sb.state.calls['tickets_staff']).toContainEqual({
      method: 'gte',
      args: ['updated_at', '2026-05-26T12:00:00.000Z'],
    })
  })

  it('applies the time window on created_at when timeField=created', async () => {
    stage('tickets_staff', { data: [], error: null })
    const NOW = Date.parse('2026-05-27T12:00:00.000Z')
    await fetchFilteredStaffTicketIds(
      filter({ timeRange: '24h', timeField: 'created' }),
      null,
      NOW,
    )
    expect(sb.state.calls['tickets_staff']).toContainEqual({
      method: 'gte',
      args: ['created_at', '2026-05-26T12:00:00.000Z'],
    })
  })

  it('retries without severity/origin_tier on a 42703 undefined-column error', async () => {
    // First attempt errors (view predates the columns); retry succeeds.
    stage('tickets_staff', {
      data: null,
      error: { code: '42703', message: 'column tickets_staff.origin_tier does not exist' },
    })
    stage('tickets_staff', { data: [{ id: 'r' }], error: null })

    const ids = await fetchFilteredStaffTicketIds(
      filter({ severity: 'critical', originTier: 'staging', status: 'done' }),
      null,
    )
    expect(ids).toEqual(new Set(['r']))
    // Two from() calls: original + retry.
    expect(sb.supabase.from).toHaveBeenCalledTimes(2)
  })

  it('throws on a non-column error', async () => {
    stage('tickets_staff', {
      data: null,
      error: { code: '500', message: 'boom' },
    })
    await expect(
      fetchFilteredStaffTicketIds(filter({ status: 'ready' }), null),
    ).rejects.toThrow('boom')
  })
})

// ---- fetchFilterDerivedSets ------------------------------------------------

describe('fetchFilterDerivedSets', () => {
  it('returns empty sets without querying when currentUserId is null', async () => {
    const sets = await fetchFilterDerivedSets(null)
    expect(sets.assignedToMeIds.size).toBe(0)
    expect(sets.unreadIds.size).toBe(0)
    expect(sets.watchingIds.size).toBe(0)
    expect(sets.mentionedMeIds.size).toBe(0)
    expect(sb.supabase.from).not.toHaveBeenCalled()
  })

  it('resolves assigned / unread / watching / mentioned sets', async () => {
    stage('tickets_staff', { data: [{ id: 'assigned-1' }], error: null })
    stage('notifications', {
      data: [
        { ticket_id: 'n-unread', event_type: 'status_changed', read_at: null },
        { ticket_id: 'n-read', event_type: 'status_changed', read_at: '2026-05-01T00:00:00Z' },
        { ticket_id: 'n-mention', event_type: 'mentioned', read_at: null },
        { ticket_id: null, event_type: 'announcement', read_at: null },
      ],
      error: null,
    })
    stage('ticket_watchers', {
      data: [{ ticket_id: 'w-1' }, { ticket_id: 'w-2' }],
      error: null,
    })

    const sets = await fetchFilterDerivedSets('me')

    expect(sets.assignedToMeIds).toEqual(new Set(['assigned-1']))
    // unread set: the two read_at=null rows with a ticket_id (n-unread, n-mention)
    expect(sets.unreadIds).toEqual(new Set(['n-unread', 'n-mention']))
    // mentioned set: only the event_type='mentioned' row
    expect(sets.mentionedMeIds).toEqual(new Set(['n-mention']))
    expect(sets.watchingIds).toEqual(new Set(['w-1', 'w-2']))
  })

  it('throws if any of the parallel queries errors', async () => {
    stage('tickets_staff', { data: [], error: null })
    stage('notifications', { data: null, error: { message: 'notif boom' } })
    stage('ticket_watchers', { data: [], error: null })
    await expect(fetchFilterDerivedSets('me')).rejects.toThrow('notif boom')
  })
})
