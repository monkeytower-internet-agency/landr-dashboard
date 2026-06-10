// landr-a4pl.2 — API client helpers for the Holded invoicing surface.
//
// Backs the /invoicing route (status table + Sync-now button). Mirrors the
// operator-scoped api() helper pattern used across src/lib/*.ts (see
// commissions.ts): every call hangs off
// `/api/staff/operators/${operatorId}/holded/...` and the FastAPI side does
// the operator-staff auth.
//
// Contract (epic landr-a4pl, single source of truth):
//   [A] GET  …/holded/invoices?bucket=&limit=&offset=
//       -> { summary, rows: HoldedInvoiceRow[] }
//   [B] POST …/holded/sync
//       -> HoldedSyncResult | { holded_not_connected: true }

import { api } from '@/lib/api-client'

// ---- enums --------------------------------------------------------------

/** Raw per-row sync status from external_sync_log. */
export type HoldedInvoiceStatus =
  | 'pending'
  | 'in_flight'
  | 'succeeded'
  | 'failed'
  | 'blocked_on_human'

/**
 * UI bucket the API derives from the raw status:
 *   succeeded         -> transferred
 *   failed            -> failed (needs attention)
 *   blocked_on_human  -> blocked
 *   pending/in_flight -> pending (UI sub-flags 'due soon' vs 'overdue')
 */
export type HoldedInvoiceBucket =
  | 'transferred'
  | 'pending'
  | 'failed'
  | 'blocked'

/** The four buckets surfaced as filter tabs, in display order. */
export const HOLDED_BUCKETS: readonly HoldedInvoiceBucket[] = [
  'transferred',
  'pending',
  'failed',
  'blocked',
] as const

/**
 * Age (in days since finalisation) at or beyond which a still-pending invoice
 * is flagged 'overdue' (amber) rather than merely 'due soon'. Per the epic
 * contract: >2d = overdue.
 */
export const PENDING_OVERDUE_AGE_DAYS = 2

/** Pending sub-flag derived client-side from age_days. */
export type PendingFlag = 'due_soon' | 'overdue'

/**
 * Classify a pending row's urgency from its age. Only meaningful for the
 * `pending` bucket; other buckets ignore this.
 */
export function pendingFlagFor(ageDays: number): PendingFlag {
  return ageDays > PENDING_OVERDUE_AGE_DAYS ? 'overdue' : 'due_soon'
}

// ---- row + summary shapes ----------------------------------------------

export type HoldedInvoiceRow = {
  sync_log_id: string
  booking_id: string
  /** Short human booking id (e.g. the ref shown elsewhere in the dashboard). */
  booking_ref: string
  customer_name: string
  /** ISO timestamp the booking was finalised. */
  finalised_at: string
  /** Pre-formatted amount string incl. currency (minor units already → text). */
  amount: string
  status: HoldedInvoiceStatus
  bucket: HoldedInvoiceBucket
  /** Holded invoice id on transferred rows, else null. */
  external_reference: string | null
  /** Last failure message on failed rows, else null. */
  failure_reason: string | null
  attempt_count: number
  max_attempts: number
  /** ISO timestamp of the next scheduled retry, or null. */
  next_retry_at: string | null
  /** ISO timestamp the row succeeded, or null. */
  succeeded_at: string | null
  /** Whole days since finalised_at (drives the pending overdue flag). */
  age_days: number
}

export type HoldedInvoiceSummary = {
  transferred: number
  pending: number
  failed: number
  blocked: number
  total: number
}

export type HoldedInvoicesResponse = {
  summary: HoldedInvoiceSummary
  rows: HoldedInvoiceRow[]
}

/** Result of a successful POST …/holded/sync pass. */
export type HoldedSyncOk = {
  attempted: number
  succeeded: number
  failed: number
  retried: number
  blocked: number
  remaining_pending: number
}

/** Returned (instead of a sync pass) when the operator has no Holded key. */
export type HoldedNotConnected = {
  holded_not_connected: true
}

export type HoldedSyncResult = HoldedSyncOk | HoldedNotConnected

/** Narrowing guard: the operator hasn't connected Holded. */
export function isHoldedNotConnected(
  result: HoldedSyncResult,
): result is HoldedNotConnected {
  return (
    (result as HoldedNotConnected).holded_not_connected === true
  )
}

// ---- calls --------------------------------------------------------------

export type FetchHoldedInvoicesOpts = {
  bucket?: HoldedInvoiceBucket
  limit?: number
  offset?: number
}

/**
 * [A] GET the operator's Holded invoice transfer log + summary counts.
 * `bucket` (optional) server-filters to a single tab; omitting it returns the
 * full log (the surface filters client-side per tab anyway, but the param is
 * wired so large operators can scope the read).
 */
export async function fetchHoldedInvoices(
  operatorId: string,
  opts: FetchHoldedInvoicesOpts = {},
): Promise<HoldedInvoicesResponse> {
  const params = new URLSearchParams()
  if (opts.bucket) params.set('bucket', opts.bucket)
  if (opts.limit != null) params.set('limit', String(opts.limit))
  if (opts.offset != null) params.set('offset', String(opts.offset))
  const qs = params.toString()
  return api<HoldedInvoicesResponse>(
    'GET',
    `/api/staff/operators/${operatorId}/holded/invoices${qs ? `?${qs}` : ''}`,
  )
}

/**
 * [B] POST a single operator-scoped Holded sync pass. Returns the per-pass
 * counts, OR `{ holded_not_connected: true }` when the operator has no Holded
 * API key (the API returns this gracefully rather than 500ing).
 */
export async function syncHoldedInvoices(
  operatorId: string,
): Promise<HoldedSyncResult> {
  return api<HoldedSyncResult>(
    'POST',
    `/api/staff/operators/${operatorId}/holded/sync`,
  )
}
