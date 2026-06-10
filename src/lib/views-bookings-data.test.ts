// landr-9kbl — pure-pipe tests for the shared Views data helpers.
// The React Query hook (useViewBookings) is exercised through ViewPage's
// integration tests; here we cover the filter + sort logic in isolation.
// landr-a4pl.3 — extended with holded_status + balance_due filter tests.

import { describe, expect, it } from 'vitest'
import type { BookingRow, HoldedStatus } from '@/lib/bookings'
import {
  applyView,
  applyViewSort,
  matchesViewFilters,
} from '@/lib/views-bookings-data'
import type { Filter } from '@/lib/views-filters'

function row(overrides: Partial<BookingRow> = {}): BookingRow {
  return {
    id: 'r',
    created_at: '2026-05-01T10:00:00Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'c',
      first_name: 'Marie',
      last_name: 'Curie',
      email: 'marie@example.com',
      phone: null,
    },
    items: [
      {
        id: 'it',
        date_range_start: '2026-05-10',
        date_range_end: '2026-05-12',
        selected_days: null,
        products: {
          id: 'p',
          name: 'Tandem flight',
          product_kind: 'service',
          service_time_shape: 'single_date',
        },
      },
    ],
    ...overrides,
  }
}

describe('matchesViewFilters', () => {
  it('matches when no filters are present', () => {
    expect(matchesViewFilters(row(), [])).toBe(true)
  })

  it('text eq is case-sensitive (uses === semantics, not contains)', () => {
    const f: Filter = { field: 'customer_first_name', op: 'eq', values: ['Marie'] }
    expect(matchesViewFilters(row(), [f])).toBe(true)
    expect(matchesViewFilters(row(), [{ ...f, values: ['marie'] }])).toBe(false)
  })

  it('text contains is case-insensitive', () => {
    const f: Filter = {
      field: 'customer_email',
      op: 'contains',
      values: ['MARIE'],
    }
    expect(matchesViewFilters(row(), [f])).toBe(true)
  })

  it('enum in matches any of the values', () => {
    const f: Filter = {
      field: 'current_stage',
      op: 'in',
      values: ['confirmed', 'awaiting_general_approval'],
    }
    expect(matchesViewFilters(row(), [f])).toBe(true)
    expect(
      matchesViewFilters(
        row({ current_stage: { code: 'cancelled' } }),
        [f],
      ),
    ).toBe(false)
  })

  it('number gt/lt work as expected on booking_total', () => {
    const gt: Filter = { field: 'booking_total', op: 'gt', values: [50] }
    expect(matchesViewFilters(row({ gross_total: 100 }), [gt])).toBe(true)
    expect(matchesViewFilters(row({ gross_total: 10 }), [gt])).toBe(false)
  })

  it('date within respects [from, to] inclusive bounds (item-level)', () => {
    const f: Filter = {
      field: 'date_range_start',
      op: 'within',
      values: ['2026-05-09', '2026-05-11'],
    }
    expect(matchesViewFilters(row(), [f])).toBe(true)
    expect(
      matchesViewFilters(
        row({
          items: [
            {
              id: 'it2',
              date_range_start: '2026-06-01',
              date_range_end: null,
              selected_days: null,
              products: null,
            },
          ],
        }),
        [f],
      ),
    ).toBe(false)
  })

  it('multi-item bookings match when ANY item satisfies the filter', () => {
    const r = row({
      items: [
        { id: 'a', date_range_start: '2026-04-01', date_range_end: null, selected_days: null, products: null },
        { id: 'b', date_range_start: '2026-05-10', date_range_end: null, selected_days: null, products: null },
      ],
    })
    const f: Filter = {
      field: 'date_range_start',
      op: 'within',
      values: ['2026-05-01', '2026-05-31'],
    }
    expect(matchesViewFilters(r, [f])).toBe(true)
  })

  it('AND across multiple filter chips', () => {
    const r = row({ gross_total: 200 })
    const filters: Filter[] = [
      { field: 'current_stage', op: 'eq', values: ['awaiting_general_approval'] },
      { field: 'booking_total', op: 'gte', values: [150] },
    ]
    expect(matchesViewFilters(r, filters)).toBe(true)
    expect(
      matchesViewFilters(row({ gross_total: 50 }), filters),
    ).toBe(false)
  })

  it('is_null / is_not_null', () => {
    expect(
      matchesViewFilters(row({ customer: null }), [
        { field: 'customer_first_name', op: 'is_null', values: [] },
      ]),
    ).toBe(true)
    expect(
      matchesViewFilters(row(), [
        { field: 'customer_first_name', op: 'is_not_null', values: [] },
      ]),
    ).toBe(true)
  })

  // landr-1zxt — relative-date tokens are resolved at compare-time.
  it('resolves relative tokens against a stable `now` for eq', () => {
    const now = new Date(2026, 4, 21, 12, 0, 0) // 2026-05-21
    const today: Filter = {
      field: 'date_range_start',
      op: 'eq',
      values: ['today'],
    }
    expect(
      matchesViewFilters(
        row({
          items: [
            {
              id: 'a',
              date_range_start: '2026-05-21',
              date_range_end: null,
              selected_days: null,
              products: null,
            },
          ],
        }),
        [today],
        now,
      ),
    ).toBe(true)
    expect(
      matchesViewFilters(
        row({
          items: [
            {
              id: 'a',
              date_range_start: '2026-05-20',
              date_range_end: null,
              selected_days: null,
              products: null,
            },
          ],
        }),
        [today],
        now,
      ),
    ).toBe(false)
  })

  it('resolves a [start_of_week, end_of_week] within range', () => {
    // 2026-05-21 = Thursday → Mon..Sun = 2026-05-18 .. 2026-05-24.
    const now = new Date(2026, 4, 21, 12, 0, 0)
    const thisWeek: Filter = {
      field: 'date_range_start',
      op: 'within',
      values: ['start_of_week', 'end_of_week'],
    }
    expect(
      matchesViewFilters(
        row({
          items: [
            {
              id: 'a',
              date_range_start: '2026-05-19',
              date_range_end: null,
              selected_days: null,
              products: null,
            },
          ],
        }),
        [thisWeek],
        now,
      ),
    ).toBe(true)
    expect(
      matchesViewFilters(
        row({
          items: [
            {
              id: 'a',
              date_range_start: '2026-05-25',
              date_range_end: null,
              selected_days: null,
              products: null,
            },
          ],
        }),
        [thisWeek],
        now,
      ),
    ).toBe(false)
  })

  it('mixes relative tokens and literal ISO dates in the same chip', () => {
    const now = new Date(2026, 4, 21, 12, 0, 0)
    // [literal, +7d] → [2026-05-15, 2026-05-28]
    const f: Filter = {
      field: 'date_range_start',
      op: 'within',
      values: ['2026-05-15', '+7d'],
    }
    expect(
      matchesViewFilters(
        row({
          items: [
            {
              id: 'a',
              date_range_start: '2026-05-21',
              date_range_end: null,
              selected_days: null,
              products: null,
            },
          ],
        }),
        [f],
        now,
      ),
    ).toBe(true)
    expect(
      matchesViewFilters(
        row({
          items: [
            {
              id: 'a',
              date_range_start: '2026-05-29',
              date_range_end: null,
              selected_days: null,
              products: null,
            },
          ],
        }),
        [f],
        now,
      ),
    ).toBe(false)
  })

  it('unknown field is ignored (forward-compat for v2 custom fields)', () => {
    expect(
      matchesViewFilters(row(), [
        { field: 'unknown_field_v2', op: 'eq', values: ['x'] },
      ]),
    ).toBe(true)
  })

  // landr-kjls — product_name extractor added so the Board layout (and the
  // shared Table layout) can filter on a multi-item field. ANY-item match
  // semantics, mirrors date_range_start.
  it('product_name matches when ANY booking item carries the named product', () => {
    const r = row({
      items: [
        {
          id: 'a',
          date_range_start: '2026-05-10',
          date_range_end: null,
          selected_days: null,
          products: {
            id: 'p1',
            name: 'Tandem flight',
            product_kind: 'service',
            service_time_shape: 'single_date',
          },
        },
        {
          id: 'b',
          date_range_start: '2026-05-11',
          date_range_end: null,
          selected_days: null,
          products: {
            id: 'p2',
            name: 'Hotel room',
            product_kind: 'service',
            service_time_shape: null,
          },
        },
      ],
    })
    expect(
      matchesViewFilters(r, [
        { field: 'product_name', op: 'eq', values: ['Hotel room'] },
      ]),
    ).toBe(true)
    expect(
      matchesViewFilters(r, [
        { field: 'product_name', op: 'eq', values: ['Bungee jump'] },
      ]),
    ).toBe(false)
  })
})

describe('applyViewSort', () => {
  it('sorts by booking_total asc / desc and leaves input untouched', () => {
    const rows = [row({ id: 'a', gross_total: 30 }), row({ id: 'b', gross_total: 10 }), row({ id: 'c', gross_total: 20 })]
    const asc = applyViewSort(
      rows,
      { sort: [{ key: 'booking_total', dir: 'asc' }] },
      'booking',
    )
    expect(asc.map((r) => r.id)).toEqual(['b', 'c', 'a'])
    const desc = applyViewSort(
      rows,
      { sort: [{ key: 'booking_total', dir: 'desc' }] },
      'booking',
    )
    expect(desc.map((r) => r.id)).toEqual(['a', 'c', 'b'])
    // Input not mutated.
    expect(rows.map((r) => r.id)).toEqual(['a', 'b', 'c'])
  })

  it('puts nulls last regardless of direction', () => {
    const rows = [row({ id: 'a', gross_total: 'NaN-ish' as unknown as number }), row({ id: 'b', gross_total: 10 })]
    const asc = applyViewSort(
      rows,
      { sort: [{ key: 'booking_total', dir: 'asc' }] },
      'booking',
    )
    expect(asc[0].id).toBe('b')
  })

  it('returns input order when no sort entries', () => {
    const rows = [row({ id: 'a' }), row({ id: 'b' })]
    expect(applyViewSort(rows, {}, 'booking').map((r) => r.id)).toEqual([
      'a',
      'b',
    ])
  })
})

describe('applyView (filter + sort composition)', () => {
  it('filters then sorts', () => {
    const rows = [
      row({ id: 'a', gross_total: 30, current_stage: { code: 'cancelled' } }),
      row({ id: 'b', gross_total: 10, current_stage: { code: 'awaiting_general_approval' } }),
      row({ id: 'c', gross_total: 20, current_stage: { code: 'awaiting_general_approval' } }),
    ]
    const out = applyView(
      rows,
      {
        filters: [
          { field: 'current_stage', op: 'eq', values: ['awaiting_general_approval'] },
        ],
        sort: [{ key: 'booking_total', dir: 'desc' }],
      },
      'booking',
    )
    expect(out.map((r) => r.id)).toEqual(['c', 'b'])
  })
})

// landr-m4zq — weekStartsOn flows through applyView and matchesViewFilters
// to the resolver so 'This week' chips honour the operator's setting.
describe('applyView / matchesViewFilters — weekStartsOn (landr-m4zq)', () => {
  // 2026-05-21 = Thursday. Mon-first week = 2026-05-18..24; Sun-first
  // week = 2026-05-17..23. 2026-05-24 is Sunday → in Mon-first week,
  // outside Sun-first week.
  const thursday = new Date(2026, 4, 21, 12, 0, 0)
  const thisWeekFilter: Filter = {
    field: 'date_range_start',
    op: 'within',
    values: ['start_of_week', 'end_of_week'],
  }
  function rowOnSunday24() {
    return row({
      items: [
        {
          id: 'a',
          date_range_start: '2026-05-24',
          date_range_end: null,
          selected_days: null,
          products: null,
        },
      ],
    })
  }

  it('Mon-first (default 1): Sunday May 24 is inside this week', () => {
    expect(
      matchesViewFilters(rowOnSunday24(), [thisWeekFilter], thursday, 1),
    ).toBe(true)
  })

  it('Sun-first (0): Sunday May 24 is OUTSIDE this week (next week starts)', () => {
    expect(
      matchesViewFilters(rowOnSunday24(), [thisWeekFilter], thursday, 0),
    ).toBe(false)
  })

  it('applyView forwards weekStartsOn to the matcher', () => {
    const r = rowOnSunday24()
    const config = { filters: [thisWeekFilter] }
    expect(applyView([r], config, 'booking', thursday, 1)).toHaveLength(1)
    expect(applyView([r], config, 'booking', thursday, 0)).toHaveLength(0)
  })

  it('default weekStartsOn is 1 when omitted', () => {
    // Backwards-compatible signature: callers that don't pass weekStartsOn
    // still get Monday-first behaviour.
    expect(
      matchesViewFilters(rowOnSunday24(), [thisWeekFilter], thursday),
    ).toBe(true)
    const config = { filters: [thisWeekFilter] }
    expect(applyView([rowOnSunday24()], config, 'booking', thursday)).toHaveLength(1)
  })
})

// landr-a4pl.3 — holded_status + balance_due filter tests
describe('matchesViewFilters — holded_status (landr-a4pl.3)', () => {
  function rowWithHolded(status?: HoldedStatus): BookingRow {
    return row({ holded_status: status })
  }

  it('eq filter matches the exact holded_status value', () => {
    const f: Filter = { field: 'holded_status', op: 'eq', values: ['failed'] }
    expect(matchesViewFilters(rowWithHolded('failed'), [f])).toBe(true)
    expect(matchesViewFilters(rowWithHolded('pending'), [f])).toBe(false)
    expect(matchesViewFilters(rowWithHolded('transferred'), [f])).toBe(false)
  })

  it('in filter matches when holded_status is any of the values', () => {
    const f: Filter = { field: 'holded_status', op: 'in', values: ['pending', 'failed'] }
    expect(matchesViewFilters(rowWithHolded('pending'), [f])).toBe(true)
    expect(matchesViewFilters(rowWithHolded('failed'), [f])).toBe(true)
    expect(matchesViewFilters(rowWithHolded('transferred'), [f])).toBe(false)
    expect(matchesViewFilters(rowWithHolded('blocked'), [f])).toBe(false)
  })

  it('defaults to "none" for rows with no holded_status field', () => {
    const f: Filter = { field: 'holded_status', op: 'eq', values: ['none'] }
    // No holded_status on the row — should still match 'none'.
    expect(matchesViewFilters(row(), [f])).toBe(true)
  })

  it('rows with holded_status=none do NOT match a pending/failed filter', () => {
    const f: Filter = { field: 'holded_status', op: 'in', values: ['pending', 'failed'] }
    expect(matchesViewFilters(rowWithHolded('none'), [f])).toBe(false)
    expect(matchesViewFilters(row(), [f])).toBe(false)
  })

  it('eq filter for blocked matches', () => {
    const f: Filter = { field: 'holded_status', op: 'eq', values: ['blocked'] }
    expect(matchesViewFilters(rowWithHolded('blocked'), [f])).toBe(true)
    expect(matchesViewFilters(rowWithHolded('failed'), [f])).toBe(false)
  })
})

describe('matchesViewFilters — balance_due (landr-a4pl.3)', () => {
  it('gt 0 matches rows with a positive balance', () => {
    const f: Filter = { field: 'balance_due', op: 'gt', values: [0] }
    expect(matchesViewFilters(row({ balance_due: 150 }), [f])).toBe(true)
    expect(matchesViewFilters(row({ balance_due: 0 }), [f])).toBe(false)
    expect(matchesViewFilters(row({ balance_due: -1 }), [f])).toBe(false)
  })

  it('lt filter matches rows below the threshold', () => {
    const f: Filter = { field: 'balance_due', op: 'lt', values: [100] }
    expect(matchesViewFilters(row({ balance_due: 50 }), [f])).toBe(true)
    expect(matchesViewFilters(row({ balance_due: 100 }), [f])).toBe(false)
    expect(matchesViewFilters(row({ balance_due: 200 }), [f])).toBe(false)
  })

  it('gte / lte filters work', () => {
    const gte: Filter = { field: 'balance_due', op: 'gte', values: [100] }
    const lte: Filter = { field: 'balance_due', op: 'lte', values: [100] }
    expect(matchesViewFilters(row({ balance_due: 100 }), [gte])).toBe(true)
    expect(matchesViewFilters(row({ balance_due: 99 }), [gte])).toBe(false)
    expect(matchesViewFilters(row({ balance_due: 100 }), [lte])).toBe(true)
    expect(matchesViewFilters(row({ balance_due: 101 }), [lte])).toBe(false)
  })

  it('falls back to gross_total when balance_due is absent', () => {
    // Row without balance_due — extractor should fall back to gross_total=100
    const baseRow = row({ gross_total: 100 })
    const { balance_due: _, ...rowNoBalance } = baseRow
    const f: Filter = { field: 'balance_due', op: 'gt', values: [0] }
    expect(matchesViewFilters(rowNoBalance as BookingRow, [f])).toBe(true)
  })
})
