// landr-wwhn.23 — unit tests for MoSCoW planning helpers.

import { describe, expect, it } from 'vitest'
import { buildMoscowBuckets, computeMoscowStats } from './moscow-planning'
import type { TicketRow } from './tickets'

function makeTicket(
  overrides: Partial<TicketRow> & Pick<TicketRow, 'id'>,
): TicketRow {
  return {
    context: 'operations',
    type: 'feature',
    title: 'Test ticket',
    body: null,
    status: 'backlog',
    priority: 'p2',
    perceived_impact: 'idea',
    reporter_id: null,
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    moscow: null,
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
    ...overrides,
  }
}

describe('buildMoscowBuckets', () => {
  it('returns 5 buckets in canonical order (must, should, could, wont, unplanned)', () => {
    const buckets = buildMoscowBuckets([], 'all')
    expect(buckets).toHaveLength(5)
    expect(buckets.map((b) => b.key)).toEqual(['must', 'should', 'could', 'wont', null])
  })

  it('groups tickets into correct buckets', () => {
    const tickets = [
      makeTicket({ id: 't1', moscow: 'must' }),
      makeTicket({ id: 't2', moscow: 'should' }),
      makeTicket({ id: 't3', moscow: 'could' }),
      makeTicket({ id: 't4', moscow: 'wont' }),
      makeTicket({ id: 't5', moscow: null }),
      makeTicket({ id: 't6', moscow: 'must' }),
    ]
    const buckets = buildMoscowBuckets(tickets, 'all')
    expect(buckets.find((b) => b.key === 'must')?.tickets).toHaveLength(2)
    expect(buckets.find((b) => b.key === 'should')?.tickets).toHaveLength(1)
    expect(buckets.find((b) => b.key === 'could')?.tickets).toHaveLength(1)
    expect(buckets.find((b) => b.key === 'wont')?.tickets).toHaveLength(1)
    expect(buckets.find((b) => b.key === null)?.tickets).toHaveLength(1)
  })

  it('filters to feature tickets only when typeFilter is "feature"', () => {
    const tickets = [
      makeTicket({ id: 'f1', type: 'feature', moscow: 'must' }),
      makeTicket({ id: 'b1', type: 'bug', moscow: 'must' }),
      makeTicket({ id: 'a1', type: 'annoyance', moscow: null }),
    ]
    const buckets = buildMoscowBuckets(tickets, 'feature')
    const mustBucket = buckets.find((b) => b.key === 'must')!
    expect(mustBucket.tickets).toHaveLength(1)
    expect(mustBucket.tickets[0].id).toBe('f1')
    const unplanned = buckets.find((b) => b.key === null)!
    expect(unplanned.tickets).toHaveLength(0)
  })

  it('includes all types when typeFilter is "all"', () => {
    const tickets = [
      makeTicket({ id: 'f1', type: 'feature', moscow: 'must' }),
      makeTicket({ id: 'b1', type: 'bug', moscow: 'must' }),
    ]
    const buckets = buildMoscowBuckets(tickets, 'all')
    const mustBucket = buckets.find((b) => b.key === 'must')!
    expect(mustBucket.tickets).toHaveLength(2)
  })

  it('returns empty buckets when tickets list is empty', () => {
    const buckets = buildMoscowBuckets([], 'feature')
    expect(buckets.every((b) => b.tickets.length === 0)).toBe(true)
  })
})

describe('computeMoscowStats', () => {
  it('computes correct totals', () => {
    const tickets = [
      makeTicket({ id: 't1', moscow: 'must' }),
      makeTicket({ id: 't2', moscow: 'must' }),
      makeTicket({ id: 't3', moscow: 'should' }),
      makeTicket({ id: 't4', moscow: null }),
      makeTicket({ id: 't5', moscow: null }),
    ]
    const stats = computeMoscowStats(tickets)
    expect(stats.total).toBe(5)
    expect(stats.planned).toBe(3)
    expect(stats.unplanned).toBe(2)
    expect(stats.byTag.must).toBe(2)
    expect(stats.byTag.should).toBe(1)
    expect(stats.byTag.could).toBe(0)
    expect(stats.byTag.wont).toBe(0)
  })

  it('returns all zeros for empty input', () => {
    const stats = computeMoscowStats([])
    expect(stats.total).toBe(0)
    expect(stats.planned).toBe(0)
    expect(stats.unplanned).toBe(0)
  })
})
