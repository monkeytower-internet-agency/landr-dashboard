// landr-7dya.11 — tests for the pure ticket-filter core: defaults, the active
// count / empty check, URL (de)serialization round-trips, the time-floor
// resolver, and the per-ticket AND predicate (incl. derived-state sets and the
// absent-field skip for severity/origin_tier on public board rows).

import { describe, expect, it } from 'vitest'

import {
  TICKET_FILTER_DEFAULTS,
  activeFilterCount,
  filterFromParams,
  filterToParams,
  isFilterEmpty,
  resolveTimeFloorISO,
  ticketMatchesFilter,
  type FilterMatchContext,
  type TicketFilter,
  type TicketLike,
} from './ticket-filters'

// ---- helpers ----------------------------------------------------------------

function makeTicket(over: Partial<TicketLike> = {}): TicketLike {
  return {
    id: 't1',
    status: 'backlog',
    type: 'bug',
    priority: 'p2',
    perceived_impact: 'idea',
    moscow: null,
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    created_at: '2026-05-20T10:00:00.000Z',
    updated_at: '2026-05-25T10:00:00.000Z',
    ...over,
  }
}

const EMPTY_CTX: FilterMatchContext = {
  currentUserId: null,
  assignedToMeIds: new Set(),
  unreadIds: new Set(),
  watchingIds: new Set(),
  mentionedMeIds: new Set(),
  timeFloorISO: null,
}

function ctx(over: Partial<FilterMatchContext> = {}): FilterMatchContext {
  return { ...EMPTY_CTX, ...over }
}

function filter(over: Partial<TicketFilter> = {}): TicketFilter {
  return { ...TICKET_FILTER_DEFAULTS, ...over }
}

// ---- active count / empty ---------------------------------------------------

describe('activeFilterCount / isFilterEmpty', () => {
  it('default filter has zero active facets and is empty', () => {
    expect(activeFilterCount(TICKET_FILTER_DEFAULTS)).toBe(0)
    expect(isFilterEmpty(TICKET_FILTER_DEFAULTS)).toBe(true)
  })

  it('counts each active facet once', () => {
    const f = filter({
      operatorId: 'op-2',
      status: 'ready',
      blockedOnly: true,
      assignedToMe: true,
      timeRange: '7d',
    })
    expect(activeFilterCount(f)).toBe(5)
    expect(isFilterEmpty(f)).toBe(false)
  })

  it('timeField alone does not count (only timeRange does)', () => {
    expect(activeFilterCount(filter({ timeField: 'created' }))).toBe(0)
  })
})

// ---- time floor resolver ----------------------------------------------------

describe('resolveTimeFloorISO', () => {
  const NOW = Date.parse('2026-05-27T12:00:00.000Z')

  it('returns null for no range', () => {
    expect(resolveTimeFloorISO(null, NOW)).toBeNull()
  })

  it('resolves 24h to exactly one day before now', () => {
    expect(resolveTimeFloorISO('24h', NOW)).toBe('2026-05-26T12:00:00.000Z')
  })

  it('resolves 7d to seven days before now', () => {
    expect(resolveTimeFloorISO('7d', NOW)).toBe('2026-05-20T12:00:00.000Z')
  })
})

// ---- URL round-trip ---------------------------------------------------------

describe('filterToParams / filterFromParams', () => {
  it('default filter serializes to no params', () => {
    const p = filterToParams(TICKET_FILTER_DEFAULTS)
    expect(p.toString()).toBe('')
  })

  it('round-trips a fully-populated filter', () => {
    const original = filter({
      operatorId: 'op-9',
      status: 'in_review',
      type: 'feature',
      severity: 'critical',
      priority: 'p0',
      moscow: 'must',
      perceivedImpact: 'blocking',
      originTier: 'staging',
      blockedOnly: true,
      unassignedOnly: true,
      timeRange: '30d',
      timeField: 'created',
      assignedToMe: true,
      unreadOnly: true,
      watchingOnly: true,
      mentionedMeOnly: true,
    })
    const params = filterToParams(original)
    const parsed = filterFromParams(params)
    expect(parsed).toEqual(original)
  })

  it('preserves unrelated params (e.g. ?open=<id>)', () => {
    const base = new URLSearchParams('open=ticket-7')
    const params = filterToParams(filter({ status: 'done' }), base)
    expect(params.get('open')).toBe('ticket-7')
    expect(params.get('status')).toBe('done')
  })

  it('clearing a facet deletes its param', () => {
    const base = filterToParams(filter({ status: 'ready', unreadOnly: true }))
    expect(base.get('status')).toBe('ready')
    const cleared = filterToParams(TICKET_FILTER_DEFAULTS, base)
    expect(cleared.get('status')).toBeNull()
    expect(cleared.get('unread')).toBeNull()
  })

  it('drops invalid enum values on parse (forward/backward compat)', () => {
    const params = new URLSearchParams('status=bogus&prio=p9&tier=qa')
    const parsed = filterFromParams(params)
    expect(parsed.status).toBeNull()
    expect(parsed.priority).toBeNull()
    expect(parsed.originTier).toBeNull()
  })

  it('does not persist the default (updated) time field', () => {
    const params = filterToParams(filter({ timeRange: '7d', timeField: 'updated' }))
    expect(params.get('sinceField')).toBeNull()
    expect(params.get('since')).toBe('7d')
  })

  it('omits the time field when no range is set even if created', () => {
    const params = filterToParams(filter({ timeRange: null, timeField: 'created' }))
    expect(params.get('sinceField')).toBeNull()
  })
})

// ---- predicate: row-intrinsic facets ---------------------------------------

describe('ticketMatchesFilter — row-intrinsic', () => {
  it('empty filter matches every ticket', () => {
    expect(ticketMatchesFilter(makeTicket(), TICKET_FILTER_DEFAULTS, EMPTY_CTX)).toBe(
      true,
    )
  })

  it('operator filter excludes a different operator', () => {
    const f = filter({ operatorId: 'op-2' })
    expect(ticketMatchesFilter(makeTicket({ operator_id: 'op-1' }), f, EMPTY_CTX)).toBe(false)
    expect(ticketMatchesFilter(makeTicket({ operator_id: 'op-2' }), f, EMPTY_CTX)).toBe(true)
  })

  it('status / type / priority / moscow / impact combine with AND', () => {
    const f = filter({
      status: 'ready',
      type: 'feature',
      priority: 'p1',
      moscow: 'should',
      perceivedImpact: 'annoying',
    })
    const match = makeTicket({
      status: 'ready',
      type: 'feature',
      priority: 'p1',
      moscow: 'should',
      perceived_impact: 'annoying',
    })
    expect(ticketMatchesFilter(match, f, EMPTY_CTX)).toBe(true)
    // Flip one facet → excluded.
    expect(
      ticketMatchesFilter({ ...match, priority: 'p2' }, f, EMPTY_CTX),
    ).toBe(false)
  })

  it('blockedOnly excludes unblocked tickets', () => {
    const f = filter({ blockedOnly: true })
    expect(ticketMatchesFilter(makeTicket({ blocked: false }), f, EMPTY_CTX)).toBe(false)
    expect(ticketMatchesFilter(makeTicket({ blocked: true }), f, EMPTY_CTX)).toBe(true)
  })

  it('unassignedOnly excludes assigned tickets', () => {
    const f = filter({ unassignedOnly: true })
    expect(ticketMatchesFilter(makeTicket({ assignee_id: 'u1' }), f, EMPTY_CTX)).toBe(false)
    expect(ticketMatchesFilter(makeTicket({ assignee_id: null }), f, EMPTY_CTX)).toBe(true)
  })
})

describe('ticketMatchesFilter — severity / origin_tier absent-field skip', () => {
  it('matches a staff row by severity', () => {
    const f = filter({ severity: 'critical' })
    expect(ticketMatchesFilter(makeTicket({ severity: 'critical' }), f, EMPTY_CTX)).toBe(true)
    expect(ticketMatchesFilter(makeTicket({ severity: 'minor' }), f, EMPTY_CTX)).toBe(false)
  })

  it('does NOT exclude a public row that lacks the severity field', () => {
    // A board (public) row has no severity field → undefined → skip the facet.
    const f = filter({ severity: 'critical' })
    const publicRow = makeTicket()
    delete (publicRow as Partial<TicketLike>).severity
    expect(ticketMatchesFilter(publicRow, f, EMPTY_CTX)).toBe(true)
  })

  it('filters by origin_tier when present, skips when absent', () => {
    const f = filter({ originTier: 'staging' })
    expect(ticketMatchesFilter(makeTicket({ origin_tier: 'staging' }), f, EMPTY_CTX)).toBe(true)
    expect(ticketMatchesFilter(makeTicket({ origin_tier: 'prod' }), f, EMPTY_CTX)).toBe(false)
    const publicRow = makeTicket()
    delete (publicRow as Partial<TicketLike>).origin_tier
    expect(ticketMatchesFilter(publicRow, f, EMPTY_CTX)).toBe(true)
  })
})

// ---- predicate: time window -------------------------------------------------

describe('ticketMatchesFilter — time window', () => {
  it('keeps tickets updated after the floor (updated field, default)', () => {
    const f = filter({ timeRange: '7d', timeField: 'updated' })
    const c = ctx({ timeFloorISO: '2026-05-24T00:00:00.000Z' })
    // updated_at 2026-05-25 is after the floor.
    expect(ticketMatchesFilter(makeTicket(), f, c)).toBe(true)
    // updated_at before the floor is excluded.
    expect(
      ticketMatchesFilter(makeTicket({ updated_at: '2026-05-20T00:00:00.000Z' }), f, c),
    ).toBe(false)
  })

  it('uses created_at when timeField is created', () => {
    const f = filter({ timeRange: '7d', timeField: 'created' })
    const c = ctx({ timeFloorISO: '2026-05-22T00:00:00.000Z' })
    // created_at 2026-05-20 is BEFORE the floor → excluded even though
    // updated_at (2026-05-25) is after it.
    expect(ticketMatchesFilter(makeTicket(), f, c)).toBe(false)
  })
})

// ---- predicate: derived-state ----------------------------------------------

describe('ticketMatchesFilter — derived-state sets', () => {
  it('assignedToMe matches via the precomputed set', () => {
    const f = filter({ assignedToMe: true })
    const c = ctx({ assignedToMeIds: new Set(['t1']) })
    expect(ticketMatchesFilter(makeTicket({ id: 't1' }), f, c)).toBe(true)
    expect(ticketMatchesFilter(makeTicket({ id: 't2' }), f, c)).toBe(false)
  })

  it('assignedToMe also matches via direct assignee compare', () => {
    const f = filter({ assignedToMe: true })
    const c = ctx({ currentUserId: 'me' })
    expect(ticketMatchesFilter(makeTicket({ assignee_id: 'me' }), f, c)).toBe(true)
    expect(ticketMatchesFilter(makeTicket({ assignee_id: 'other' }), f, c)).toBe(false)
  })

  it('unread / watching / mentionedMe each gate on their set', () => {
    expect(
      ticketMatchesFilter(
        makeTicket({ id: 'a' }),
        filter({ unreadOnly: true }),
        ctx({ unreadIds: new Set(['a']) }),
      ),
    ).toBe(true)
    expect(
      ticketMatchesFilter(
        makeTicket({ id: 'a' }),
        filter({ unreadOnly: true }),
        ctx({ unreadIds: new Set(['b']) }),
      ),
    ).toBe(false)
    expect(
      ticketMatchesFilter(
        makeTicket({ id: 'a' }),
        filter({ watchingOnly: true }),
        ctx({ watchingIds: new Set(['a']) }),
      ),
    ).toBe(true)
    expect(
      ticketMatchesFilter(
        makeTicket({ id: 'a' }),
        filter({ mentionedMeOnly: true }),
        ctx({ mentionedMeIds: new Set(['a']) }),
      ),
    ).toBe(true)
  })

  it('combines a derived chip with a row-intrinsic facet (AND)', () => {
    const f = filter({ unreadOnly: true, status: 'ready' })
    const c = ctx({ unreadIds: new Set(['a']) })
    // unread AND ready → match
    expect(ticketMatchesFilter(makeTicket({ id: 'a', status: 'ready' }), f, c)).toBe(true)
    // unread but not ready → excluded
    expect(ticketMatchesFilter(makeTicket({ id: 'a', status: 'done' }), f, c)).toBe(false)
    // ready but not unread → excluded
    expect(ticketMatchesFilter(makeTicket({ id: 'z', status: 'ready' }), f, c)).toBe(false)
  })
})
