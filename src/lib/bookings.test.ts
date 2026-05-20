// landr-qhi0 — isPastBooking helper.
//
// Definition of "past": MAX across items of
// (date_range_end OR last selected_days[]) < today (operator-local).
// Bookings with NO dates at all are treated as NOT past so they remain
// visible by default.

import { describe, expect, it } from 'vitest'

import {
  isPastBooking,
  toDateOnlyIso,
  type BookingItem,
  type BookingRow,
} from './bookings'

function item(overrides: Partial<BookingItem> = {}): BookingItem {
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

function row(items: BookingItem[]): BookingRow {
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
