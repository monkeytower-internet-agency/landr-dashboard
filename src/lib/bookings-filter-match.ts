// landr-1lj — pure filter-matching logic shared by the table and calendar.
//
// Semantics:
//   - Empty dimension = match all (no filter on that axis).
//   - WITHIN a dimension: union ("status is X OR Y").
//   - ACROSS dimensions: intersection ("status is X AND product is Y").
//   - Multi-item bookings match if ANY item satisfies an item-level filter
//     (product, product_kind, service_time_shape).
//   - Multi-participant bookings match if ANY participant satisfies the
//     pickup_location filter.

import {
  earliestServiceDate,
  isPastBooking,
  type BookingRow,
} from '@/lib/bookings'
import type {
  BookingsFilters,
  ServiceDateRangePreset,
} from '@/lib/bookings-filters'

// landr-68a9 — half-open service-date window helpers for the quick-filter
// presets. Bounds are computed in LOCAL time so "today" / "this week"
// match the operator's wall-clock expectation rather than UTC. Booking
// service dates are ISO YYYY-MM-DD strings (see earliestServiceDate); we
// compare on the same calendar-day grid.

function ymd(date: Date): string {
  // Pad month/day; toISOString would shift by TZ which is exactly what we
  // want to avoid here. Format mirrors what booking_products stores.
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function addDays(date: Date, n: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + n)
  return next
}

/** Half-open window [start, end) of ISO YYYY-MM-DD strings for a preset. */
export function serviceDateRangeWindow(
  preset: ServiceDateRangePreset,
  now: Date = new Date(),
): { start: string; endExclusive: string } {
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  switch (preset) {
    case 'today': {
      return { start: ymd(today), endExclusive: ymd(addDays(today, 1)) }
    }
    case 'this_week': {
      // ISO week: Monday → Sunday. JS getDay(): 0=Sun..6=Sat. Compute the
      // offset back to Monday so weekday choice doesn't matter.
      const dow = today.getDay()
      const offsetToMonday = (dow + 6) % 7
      const monday = addDays(today, -offsetToMonday)
      return { start: ymd(monday), endExclusive: ymd(addDays(monday, 7)) }
    }
    case 'next_30d': {
      // Inclusive of today, next 30 days → 30-day half-open window.
      return { start: ymd(today), endExclusive: ymd(addDays(today, 30)) }
    }
  }
}

function matchesServiceDatePreset(
  booking: BookingRow,
  preset: ServiceDateRangePreset,
  now: Date,
): boolean {
  const start = earliestServiceDate(booking)
  if (!start) return false
  const { start: from, endExclusive: to } = serviceDateRangeWindow(preset, now)
  return start >= from && start < to
}

export function matchesFilters(
  booking: BookingRow,
  filters: BookingsFilters,
  now: Date = new Date(),
): boolean {
  // landr-qhi0 — past-activity view toggle. Hide past bookings when
  // showPast is false (the default). Applied BEFORE chip filters so a
  // hidden past row never contributes to e.g. lifecycle counts.
  if (!filters.showPast && isPastBooking(booking, now)) return false

  // landr-68a9 — quick-filter strip service-date preset. Applied after
  // showPast so the preset windows ("today" / "this week" / "next 30d")
  // can intentionally include rows even when showPast is off, as long as
  // they land inside the preset window.
  if (filters.serviceDateRange) {
    if (!matchesServiceDatePreset(booking, filters.serviceDateRange, now)) {
      return false
    }
  }

  // Lifecycle state (current_stage.code).
  if (filters.lifecycleStates.length > 0) {
    const stage = booking.current_stage?.code ?? null
    if (!stage || !filters.lifecycleStates.includes(stage)) return false
  }

  // Product (booking_products.products.id).
  if (filters.productIds.length > 0) {
    const ok = booking.items.some(
      (it) => it.products && filters.productIds.includes(it.products.id),
    )
    if (!ok) return false
  }

  // Pickup location (booking_participants.pickup_location_id).
  if (filters.pickupLocationIds.length > 0) {
    const participants = booking.participants ?? []
    const ok = participants.some(
      (p) =>
        p.pickup_location &&
        filters.pickupLocationIds.includes(p.pickup_location.id),
    )
    if (!ok) return false
  }

  // Product kind (products.product_kind).
  if (filters.productKinds.length > 0) {
    const ok = booking.items.some(
      (it) =>
        it.products && filters.productKinds.includes(it.products.product_kind),
    )
    if (!ok) return false
  }

  // Service time shape (products.service_time_shape).
  if (filters.serviceTimeShapes.length > 0) {
    const ok = booking.items.some(
      (it) =>
        it.products &&
        it.products.service_time_shape !== null &&
        filters.serviceTimeShapes.includes(it.products.service_time_shape),
    )
    if (!ok) return false
  }

  return true
}

/** Memo-friendly batch filter. */
export function filterBookings(
  bookings: BookingRow[],
  filters: BookingsFilters,
  now: Date = new Date(),
): BookingRow[] {
  return bookings.filter((b) => matchesFilters(b, filters, now))
}
