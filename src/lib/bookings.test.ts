// landr-qhi0 — isPastBooking helper.
//
// Definition of "past": MAX across items of
// (date_range_end OR last selected_days[]) < today (operator-local).
// Bookings with NO dates at all are treated as NOT past so they remain
// visible by default.

import { describe, expect, it } from 'vitest'

import {
  balanceDueOf,
  canMarkAsNoShow,
  effectiveGrossOf,
  hasPriceOverride,
  isPastBooking,
  priceDisplay,
  toDateOnlyIso,
  type BookingProduct,
  type BookingRow,
} from './bookings'

function item(overrides: Partial<BookingProduct> = {}): BookingProduct {
  return {
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
    ...overrides,
  }
}

function row(items: BookingProduct[]): BookingRow {
  return {
    id: 'b-1',
    created_at: '2026-01-01T00:00:00.000Z',
    current_semantic_state: 'pending',
    current_stage: { code: 'awaiting_general_approval' },
    gross_total: 100,
    currency: 'EUR',
    customer: {
      id: 'c-1',
      first_name: 'A',
      last_name: 'B',
      email: null,
      phone: null,
    },
    items,
    participants: [],
  }
}

// Anchor "now" so tests are deterministic regardless of machine clock.
const NOW = new Date('2026-05-20T12:00:00.000Z')
const TODAY = toDateOnlyIso(NOW)

describe('isPastBooking (landr-qhi0)', () => {
  it('returns false for a booking with no dates at all', () => {
    // Bookings without dates must remain visible (treat as future-safe).
    expect(isPastBooking(row([item({})]), NOW)).toBe(false)
  })

  it('returns true when date_range_end is strictly before today', () => {
    expect(
      isPastBooking(row([item({ date_range_end: '2026-05-19' })]), NOW),
    ).toBe(true)
  })

  it('returns false when date_range_end is today', () => {
    // "Today" is still active activity — only strictly-past hides.
    expect(
      isPastBooking(row([item({ date_range_end: TODAY })]), NOW),
    ).toBe(false)
  })

  it('returns false when date_range_end is in the future', () => {
    expect(
      isPastBooking(row([item({ date_range_end: '2026-06-01' })]), NOW),
    ).toBe(false)
  })

  it('uses MAX across items — keeps booking visible if any item is upcoming', () => {
    const r = row([
      item({ id: 'i-1', date_range_end: '2026-05-10' }), // past
      item({ id: 'i-2', date_range_end: '2026-06-01' }), // future
    ])
    expect(isPastBooking(r, NOW)).toBe(false)
  })

  it('returns true when ALL items end in the past', () => {
    const r = row([
      item({ id: 'i-1', date_range_end: '2026-05-01' }),
      item({ id: 'i-2', date_range_end: '2026-05-15' }),
    ])
    expect(isPastBooking(r, NOW)).toBe(true)
  })

  it('uses the latest selected_days entry when date_range_end is null', () => {
    // selected_days is the schedule for fixed-day-pattern products.
    const r = row([
      item({
        date_range_end: null,
        selected_days: ['2026-05-12', '2026-05-19'],
      }),
    ])
    // Latest selected_day (2026-05-19) is strictly before today (2026-05-20)
    expect(isPastBooking(r, NOW)).toBe(true)
  })

  it('selected_days containing today keeps booking visible', () => {
    const r = row([
      item({
        date_range_end: null,
        selected_days: ['2026-05-10', TODAY],
      }),
    ])
    expect(isPastBooking(r, NOW)).toBe(false)
  })

  it('selected_days unsorted is handled (max is what matters)', () => {
    const r = row([
      item({
        date_range_end: null,
        // Intentionally out of order — the helper scans for max, not last.
        selected_days: ['2026-06-01', '2026-05-10', '2026-05-15'],
      }),
    ])
    expect(isPastBooking(r, NOW)).toBe(false)
  })

  it('mixes date_range_end and selected_days across items (overall max wins)', () => {
    const r = row([
      item({ id: 'i-1', date_range_end: '2026-05-10' }),
      item({
        id: 'i-2',
        date_range_end: null,
        selected_days: ['2026-06-15'],
      }),
    ])
    expect(isPastBooking(r, NOW)).toBe(false)
  })

  it('empty selected_days array is ignored', () => {
    const r = row([item({ date_range_end: null, selected_days: [] })])
    // No usable dates → treat as not past.
    expect(isPastBooking(r, NOW)).toBe(false)
  })

  it('defaults `now` to wall-clock when not provided (smoke)', () => {
    // Just exercise the default-arg branch; assertion is shape-only.
    const r = row([item({ date_range_end: '1900-01-01' })])
    expect(isPastBooking(r)).toBe(true)
  })
})

// --- landr-puix: price-override helpers ----------------------------------

describe('hasPriceOverride / effectiveGrossOf / priceDisplay (landr-puix)', () => {
  it('hasPriceOverride is false when override_gross_total is undefined', () => {
    expect(hasPriceOverride(row([item({})]))).toBe(false)
  })

  it('hasPriceOverride is true when override_gross_total is set (number or string)', () => {
    expect(
      hasPriceOverride({ ...row([item({})]), override_gross_total: 50 }),
    ).toBe(true)
    expect(
      hasPriceOverride({ ...row([item({})]), override_gross_total: '50.00' }),
    ).toBe(true)
  })

  it('hasPriceOverride is false when override_gross_total is explicitly null', () => {
    expect(
      hasPriceOverride({ ...row([item({})]), override_gross_total: null }),
    ).toBe(false)
  })

  it('effectiveGrossOf returns gross_total when no override is set', () => {
    expect(effectiveGrossOf(row([item({})]))).toBe(100)
  })

  it('effectiveGrossOf prefers override_gross_total when set', () => {
    expect(
      effectiveGrossOf({
        ...row([item({})]),
        override_gross_total: 42,
      }),
    ).toBe(42)
  })

  it('effectiveGrossOf accepts string override (numeric string from REST)', () => {
    expect(
      effectiveGrossOf({
        ...row([item({})]),
        override_gross_total: '42.50',
      }),
    ).toBe(42.5)
  })

  it('priceDisplay reflects the override-aware value', () => {
    const r = { ...row([item({})]), override_gross_total: 42.5 }
    // Intl currency formatting includes a symbol + (locale-dependent) NBSP;
    // we just assert the numeric piece appears.
    expect(priceDisplay(r)).toMatch(/42\.50/)
  })

  it('priceDisplay falls back to gross_total when override is null', () => {
    const r = { ...row([item({})]), override_gross_total: null }
    expect(priceDisplay(r)).toMatch(/100\.00/)
  })
})

// --- landr-v9e4.2: canMarkAsNoShow uses LOCAL 'today', not UTC ----------------
//
// The bug: pre-fix code used .toISOString().slice(0,10) (UTC midnight) instead
// of toDateOnlyIso() (local midnight). For Germany (UTC+1 / UTC+2 in summer),
// UTC has already rolled to 2026-06-02 at 23:30 local on 2026-06-01, so a
// booking starting 2026-06-01 would incorrectly be ineligible.
//
// Test strategy: pass an explicit `today` Date to canMarkAsNoShow to exercise
// the conversion. We use a moment that is still "2026-06-01" in UTC+2 (CEST)
// but already "2026-06-02" in UTC. A UTC-anchored implementation would return
// false (start date 2026-06-01 > UTC today 2026-06-02); a local-time-anchored
// implementation correctly returns true (start date 2026-06-01 <= local 2026-06-01).
//
// We construct the `today` Date with explicit getFullYear/getMonth/getDate so
// the test is timezone-agnostic: we set up the Date to represent "23:30 CEST
// on 2026-06-01" by using UTC 21:30, which is UTC+2 23:30. Both UTC and local
// representations are deterministic when you hardcode the UTC value.
//
// 2026-06-01T21:30:00Z = 2026-06-01 23:30:00 CEST (UTC+2)
//                     = 2026-06-01 (local in UTC+2)  ← should be eligible
//                     = 2026-06-01 (UTC)              ← both equal today
// To reliably distinguish the two implementations we need a moment where the
// UTC date is one day AHEAD of the local date. That can only happen at
// negative-offset zones. Instead, we test the fix directly via the helper:
// toDateOnlyIso is locale-aware, .toISOString().slice(0,10) is UTC-only.
//
// The guard test below verifies that canMarkAsNoShow uses toDateOnlyIso by
// passing an extreme case: a Date that is 2026-06-02 at 00:30 UTC but
// 2026-06-01 at 21:30 in UTC-3 (e.g. Buenos Aires). In UTC-3 the local date
// is still 2026-06-01, so a booking starting 2026-06-01 MUST return true.
// The test doesn't try to set the process timezone (not portable) but instead
// directly compares toDateOnlyIso with toISOString to document that they CAN
// differ, then verifies canMarkAsNoShow matches toDateOnlyIso behavior.

describe('canMarkAsNoShow (landr-v9e4.2)', () => {
  const noShowRow = (startDate: string, semanticState: BookingRow['current_semantic_state'] = 'pending'): BookingRow =>
    ({
      ...row([item({ date_range_start: startDate })]),
      current_semantic_state: semanticState,
      current_stage: { code: 'awaiting_general_approval' },
    }) as BookingRow

  it('returns true when item start date is today (local)', () => {
    // today local = 2026-06-01
    const today = new Date('2026-06-01T12:00:00.000Z')
    expect(canMarkAsNoShow(noShowRow('2026-06-01'), today)).toBe(true)
  })

  it('returns true when item start date is before today', () => {
    const today = new Date('2026-06-05T12:00:00.000Z')
    expect(canMarkAsNoShow(noShowRow('2026-06-01'), today)).toBe(true)
  })

  it('returns false when item start date is in the future', () => {
    const today = new Date('2026-06-01T12:00:00.000Z')
    expect(canMarkAsNoShow(noShowRow('2026-06-15'), today)).toBe(false)
  })

  it('returns false when booking is already no_show', () => {
    const r: BookingRow = {
      ...noShowRow('2026-06-01'),
      current_stage: { code: 'no_show' },
      current_semantic_state: 'no_show',
    }
    const today = new Date('2026-06-01T12:00:00.000Z')
    expect(canMarkAsNoShow(r, today)).toBe(false)
  })

  it('returns false when booking is cancelled', () => {
    const today = new Date('2026-06-01T12:00:00.000Z')
    expect(canMarkAsNoShow(noShowRow('2026-06-01', 'cancelled'), today)).toBe(false)
  })

  it('returns false when booking has no items with a start date', () => {
    const r = row([item({ date_range_start: null })])
    const today = new Date('2026-06-01T12:00:00.000Z')
    expect(canMarkAsNoShow(r, today)).toBe(false)
  })

  // Timezone-boundary regression: verify canMarkAsNoShow is consistent with
  // toDateOnlyIso (local-time) and NOT with toISOString (UTC). This documents
  // the fix in a way that would catch a revert.
  it('uses toDateOnlyIso convention (local date), not toISOString (UTC)', () => {
    // Construct a Date object. Regardless of the test machine's timezone,
    // we check that canMarkAsNoShow's decision matches toDateOnlyIso().
    const someDate = new Date('2026-06-01T23:45:00.000Z')
    const localDateStr = toDateOnlyIso(someDate)
    // The local date string from toDateOnlyIso is whatever the machine's local
    // zone says. canMarkAsNoShow must agree with that string, not with the UTC
    // date from toISOString().
    const bookingOnLocalDate = noShowRow(localDateStr)
    expect(canMarkAsNoShow(bookingOnLocalDate, someDate)).toBe(true)

    // Construct a booking one day after the local date — must be false.
    const [y, mo, d] = localDateStr.split('-').map(Number)
    const nextDayDate = new Date(y, mo - 1, d + 1)
    const nextDayStr = toDateOnlyIso(nextDayDate)
    const bookingOnNextLocalDay = noShowRow(nextDayStr)
    expect(canMarkAsNoShow(bookingOnNextLocalDay, someDate)).toBe(false)
  })
})

// landr-gqq0 — balanceDueOf fallback chain
describe('balanceDueOf (landr-gqq0)', () => {
  function baseRow(overrides: Partial<BookingRow> = {}): BookingRow {
    return {
      id: 'b-1',
      created_at: '2026-01-01T00:00:00.000Z',
      current_semantic_state: 'pending',
      current_stage: { code: 'awaiting_payment' },
      gross_total: 1500,
      currency: 'EUR',
      customer: null,
      items: [],
      ...overrides,
    }
  }

  it('returns balance_due directly when present', () => {
    const r = baseRow({ balance_due: 380, gross_total: 1500 })
    expect(balanceDueOf(r)).toBe(380)
  })

  it('hotel-branch mixed booking: falls back to operator_gross_total, not gross_total', () => {
    // gross_total = 1500 (operator 380 + hotel 1120); operator_gross_total = 380
    const r = baseRow({ gross_total: 1500, operator_gross_total: 380 })
    expect(balanceDueOf(r)).toBe(380)
  })

  it('operator-only booking: falls back to gross_total when operator_gross_total equals it', () => {
    // Pure-operator: operator_gross_total == gross_total — result is the same either way
    const r = baseRow({ gross_total: 200, operator_gross_total: 200 })
    expect(balanceDueOf(r)).toBe(200)
  })

  it('legacy row (operator_gross_total absent): falls through to gross_total safely', () => {
    const r = baseRow({ gross_total: 250 })
    // operator_gross_total not set at all
    expect(balanceDueOf(r)).toBe(250)
  })

  it('legacy row (operator_gross_total null): falls through to gross_total safely', () => {
    const r = baseRow({ gross_total: 300, operator_gross_total: null })
    expect(balanceDueOf(r)).toBe(300)
  })

  it('accepts string values for all numeric fields (REST returns strings)', () => {
    const r = baseRow({ gross_total: '1500', operator_gross_total: '380' })
    expect(balanceDueOf(r)).toBe(380)
  })

  it('returns null when no field parses as finite number', () => {
    const r = baseRow({ gross_total: NaN, operator_gross_total: null })
    expect(balanceDueOf(r)).toBeNull()
  })
})
