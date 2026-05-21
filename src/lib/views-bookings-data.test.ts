// landr-9kbl — pure-pipe tests for the shared Views data helpers.
// The React Query hook (useViewBookings) is exercised through ViewPage's
// integration tests; here we cover the filter + sort logic in isolation.

import { describe, expect, it } from 'vitest'
import type { BookingRow } from '@/lib/bookings'
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

  it('unknown field is ignored (forward-compat for v2 custom fields)', () => {
    expect(
      matchesViewFilters(row(), [
        { field: 'unknown_field_v2', op: 'eq', values: ['x'] },
      ]),
    ).toBe(true)
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
