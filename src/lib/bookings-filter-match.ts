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

import { isPastBooking, type BookingRow } from '@/lib/bookings'
import type { BookingsFilters } from '@/lib/bookings-filters'

export function matchesFilters(
  booking: BookingRow,
  filters: BookingsFilters,
  now: Date = new Date(),
): boolean {
  // landr-qhi0 — past-activity view toggle. Hide past bookings when
  // showPast is false (the default). Applied BEFORE chip filters so a
  // hidden past row never contributes to e.g. lifecycle counts.
  if (!filters.showPast && isPastBooking(booking, now)) return false

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
