// landr-1lj — verifies the pure filter-matching semantics:
//   - empty dimension = match-all
//   - within dimension = union (OR)
//   - across dimensions = intersection (AND)
//   - item-level filters match if ANY item satisfies
//   - participant-level filters match if ANY participant satisfies.

import { describe, expect, it } from 'vitest'

import type { BookingRow } from './bookings'
import { EMPTY_FILTERS, type BookingsFilters } from './bookings-filters'
import { filterBookings, matchesFilters } from './bookings-filter-match'

function row(overrides: Partial<BookingRow>): BookingRow {
  return {
    id: 'b-1',
    created_at: '2026-05-12T10:00:00.000Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'Alice',
      last_name: 'A',
      email: 'a@example.com',
      phone: null,
    },
    items: [
      {
        id: 'i-1',
        date_range_start: null,
        date_range_end: null,
        selected_days: null,
        products: {
          id: 'p-1',
          name: 'Tandem',
          product_kind: 'service',
          service_time_shape: 'time_slot',
        },
      },
    ],
    participants: [
      { id: 'pt-1', pickup_location: { id: 'loc-1', name: 'Hotel Alpha' } },
    ],
    ...overrides,
  }
}

function f(overrides: Partial<BookingsFilters>): BookingsFilters {
  return { ...EMPTY_FILTERS, ...overrides }
}

describe('matchesFilters', () => {
  it('empty filters match everything', () => {
    expect(matchesFilters(row({}), EMPTY_FILTERS)).toBe(true)
  })

  describe('lifecycleStates', () => {
    it('matches when stage code is in the selection', () => {
      expect(
        matchesFilters(
          row({}),
          f({ lifecycleStates: ['awaiting_general_approval', 'cancelled'] }),
        ),
      ).toBe(true)
    })
    it('rejects when stage code is not in the selection', () => {
      expect(
        matchesFilters(row({}), f({ lifecycleStates: ['confirmed_paid'] })),
      ).toBe(false)
    })
    it('rejects when booking has no stage code at all', () => {
      expect(
        matchesFilters(
          row({ current_stage: null }),
          f({ lifecycleStates: ['anything'] }),
        ),
      ).toBe(false)
    })
  })

  describe('productIds — multi-item: ANY item matches', () => {
    const multi = row({
      items: [
        {
          id: 'i-1',
          date_range_start: null,
          date_range_end: null,
          selected_days: null,
          products: {
            id: 'p-1',
            name: 'A',
            product_kind: 'service',
            service_time_shape: 'time_slot',
          },
        },
        {
          id: 'i-2',
          date_range_start: null,
          date_range_end: null,
          selected_days: null,
          products: {
            id: 'p-2',
            name: 'B',
            product_kind: 'service',
            service_time_shape: 'days_range',
          },
        },
      ],
    })
    it('matches when any item product is selected', () => {
      expect(matchesFilters(multi, f({ productIds: ['p-2'] }))).toBe(true)
    })
    it('rejects when no item product is selected', () => {
      expect(matchesFilters(multi, f({ productIds: ['p-99'] }))).toBe(false)
    })
    it('union within dimension', () => {
      expect(matchesFilters(multi, f({ productIds: ['p-99', 'p-1'] }))).toBe(
        true,
      )
    })
  })

  describe('pickupLocationIds — multi-participant: ANY participant matches', () => {
    const multi = row({
      participants: [
        { id: 'pt-1', pickup_location: { id: 'loc-1', name: 'A' } },
        { id: 'pt-2', pickup_location: null },
        { id: 'pt-3', pickup_location: { id: 'loc-2', name: 'B' } },
      ],
    })
    it('matches when any participant has a selected pickup', () => {
      expect(matchesFilters(multi, f({ pickupLocationIds: ['loc-2'] }))).toBe(
        true,
      )
    })
    it('rejects when none does', () => {
      expect(
        matchesFilters(multi, f({ pickupLocationIds: ['loc-999'] })),
      ).toBe(false)
    })
    it('rejects when participants are missing entirely', () => {
      expect(
        matchesFilters(
          row({ participants: undefined }),
          f({ pickupLocationIds: ['loc-1'] }),
        ),
      ).toBe(false)
    })
  })

  describe('productKinds + serviceTimeShapes', () => {
    it('matches matching kind', () => {
      expect(matchesFilters(row({}), f({ productKinds: ['service'] }))).toBe(
        true,
      )
    })
    it('rejects different kind', () => {
      expect(
        matchesFilters(row({}), f({ productKinds: ['gift_card'] })),
      ).toBe(false)
    })
    it('matches matching shape', () => {
      expect(
        matchesFilters(row({}), f({ serviceTimeShapes: ['time_slot'] })),
      ).toBe(true)
    })
    it('rejects when items have null shape (non-service products)', () => {
      const giftCardRow = row({
        items: [
          {
            id: 'i-1',
            date_range_start: null,
            date_range_end: null,
            selected_days: null,
            products: {
              id: 'p-gc',
              name: 'GC',
              product_kind: 'gift_card',
              service_time_shape: null,
            },
          },
        ],
      })
      expect(
        matchesFilters(giftCardRow, f({ serviceTimeShapes: ['time_slot'] })),
      ).toBe(false)
      // But the kind filter still picks it up.
      expect(
        matchesFilters(giftCardRow, f({ productKinds: ['gift_card'] })),
      ).toBe(true)
    })
  })

  describe('cross-dimension intersection', () => {
    it('requires ALL non-empty dimensions to match', () => {
      const filters = f({
        lifecycleStates: ['awaiting_general_approval'],
        productKinds: ['service'],
      })
      expect(matchesFilters(row({}), filters)).toBe(true)

      // Same booking but with a non-service product → kind axis fails.
      const giftCardRow = row({
        items: [
          {
            id: 'i-1',
            date_range_start: null,
            date_range_end: null,
            selected_days: null,
            products: {
              id: 'p-gc',
              name: 'GC',
              product_kind: 'gift_card',
              service_time_shape: null,
            },
          },
        ],
      })
      expect(matchesFilters(giftCardRow, filters)).toBe(false)
    })
  })

  describe('filterBookings', () => {
    it('keeps only matching rows', () => {
      const a = row({ id: 'a', current_stage: { code: 'confirmed_paid' } })
      const b = row({ id: 'b', current_stage: { code: 'cancelled' } })
      const c = row({ id: 'c', current_stage: null })

      const out = filterBookings([a, b, c], f({ lifecycleStates: ['cancelled'] }))
      expect(out.map((r) => r.id)).toEqual(['b'])
    })

    it('returns all rows when filters are empty', () => {
      const a = row({ id: 'a' })
      const b = row({ id: 'b' })
      expect(filterBookings([a, b], EMPTY_FILTERS).map((r) => r.id)).toEqual([
        'a',
        'b',
      ])
    })
  })

  // ----- landr-qhi0 — showPast view toggle -----------------------------
  describe('showPast (landr-qhi0)', () => {
    // Deterministic clock — avoids machine-time flakiness.
    const NOW = new Date('2026-05-20T12:00:00.000Z')

    function withEnd(id: string, end: string | null): BookingRow {
      return row({
        id,
        items: [
          {
            id: `${id}-i`,
            date_range_start: null,
            date_range_end: end,
            selected_days: null,
            products: {
              id: 'p-1',
              name: 'X',
              product_kind: 'service',
              service_time_shape: 'time_slot',
            },
          },
        ],
      })
    }

    it('hides past-activity rows when showPast=false (default)', () => {
      const past = withEnd('past', '2026-05-10')
      const future = withEnd('future', '2026-06-10')
      const noDates = withEnd('no-dates', null)

      const out = filterBookings([past, future, noDates], EMPTY_FILTERS, NOW)
      // Past row hidden; future + dateless rows kept.
      expect(out.map((r) => r.id).sort()).toEqual(['future', 'no-dates'])
    })

    it('keeps past-activity rows when showPast=true', () => {
      const past = withEnd('past', '2026-05-10')
      const future = withEnd('future', '2026-06-10')

      const out = filterBookings(
        [past, future],
        f({ showPast: true }),
        NOW,
      )
      expect(out.map((r) => r.id).sort()).toEqual(['future', 'past'])
    })

    it('showPast=false applies BEFORE chip filters', () => {
      // A past row that would otherwise match the lifecycle chip is still
      // hidden when showPast=false.
      const past = withEnd('past', '2026-05-10')
      // The base row factory has current_stage.code = awaiting_general_approval.
      const out = filterBookings(
        [past],
        f({
          showPast: false,
          lifecycleStates: ['awaiting_general_approval'],
        }),
        NOW,
      )
      expect(out).toEqual([])

      // With showPast=true the same chip filter passes.
      const out2 = filterBookings(
        [past],
        f({
          showPast: true,
          lifecycleStates: ['awaiting_general_approval'],
        }),
        NOW,
      )
      expect(out2.map((r) => r.id)).toEqual(['past'])
    })
  })
})
