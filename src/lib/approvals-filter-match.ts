// landr-aqn4 — pure filter-matching logic for the Approvals queue.
//
// Semantics (mirrors src/lib/bookings-filter-match.ts):
//   - Empty dimension = match all (no filter on that axis).
//   - WITHIN a dimension: union ("reason is X OR Y").
//   - ACROSS dimensions: intersection ("reason is X AND product is Y").
//   - Multi-item bookings match if ANY item satisfies an item-level
//     filter (productIds).

import {
  approvalReasonsOf,
  isNewCustomer,
  priceBucketOf,
  stageOf,
  urgencyBucketOf,
  type ApprovalReasonBucket,
  type BookingRow,
} from '@/lib/bookings'
import type { ApprovalsFilters } from '@/lib/approvals-filters'

export function matchesApprovalsFilters(
  booking: BookingRow,
  filters: ApprovalsFilters,
  now: Date = new Date(),
): boolean {
  // Reason buckets (union — a booking with capacity+first-time matches
  // either chip independently).
  if (filters.reasons.length > 0) {
    const buckets = approvalReasonsOf(booking)
    const ok = filters.reasons.some((r) =>
      buckets.has(r as ApprovalReasonBucket),
    )
    if (!ok) return false
  }

  // Product (booking_products.products.id).
  if (filters.productIds.length > 0) {
    const ok = booking.items.some(
      (it) => it.products && filters.productIds.includes(it.products.id),
    )
    if (!ok) return false
  }

  // Customer status: 'new' / 'returning'.
  if (filters.customerStatus.length > 0) {
    const status = isNewCustomer(booking) ? 'new' : 'returning'
    if (!filters.customerStatus.includes(status)) return false
  }

  // Urgency bucket.
  if (filters.urgency.length > 0) {
    const bucket = urgencyBucketOf(booking, now)
    if (!filters.urgency.includes(bucket)) return false
  }

  // Price bucket.
  if (filters.price.length > 0) {
    const bucket = priceBucketOf(booking)
    if (!filters.price.includes(bucket)) return false
  }

  // landr-qmdo — Stage bucket ('general' | 'secondary' | 'hotel'). Rows
  // whose current_stage.code doesn't map to one of the three known stages
  // (stageOf → null) are excluded whenever the dimension is active.
  if (filters.stages.length > 0) {
    const bucket = stageOf(booking)
    if (!bucket || !filters.stages.includes(bucket)) return false
  }

  return true
}

/** Memo-friendly batch filter. */
export function filterApprovals(
  bookings: BookingRow[],
  filters: ApprovalsFilters,
  now: Date = new Date(),
): BookingRow[] {
  return bookings.filter((b) => matchesApprovalsFilters(b, filters, now))
}
