// landr-n2j2 — Inline-edit write machinery for the Bookings table cells.
//
// Mirrors the calendar-reschedule pattern (src/lib/calendar-reschedule.ts):
//   - optimistic write across every registered query cache,
//   - rollback on error,
//   - tidy invalidate after settle.
//
// Three surface areas:
//   - rescheduleEarliestItem  → PATCH /bookings/{id}/products/{lineId}
//     dates (re-runs pricing via FastAPI, write-routing-convention).
//   - applyApprovalDecision   → POST /bookings/{id}/approval branch=general
//     | secondary, the only "status" write available in v1. Arbitrary
//     stage swaps have no endpoint yet (see follow-up bd ticket).
//   - overridePrice           → POST /api/staff/operators/{op}/bookings/{id}
//     /price-override (landr-puix). Operator-set manual gross_total
//     override; reason is required by the server.

import { useCallback, useEffect, useMemo, useRef } from 'react'
import { useMutation, useQueryClient, type QueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  patchBookingProduct,
  postGeneralApprovalDecision,
  postHotelApprovalDecision,
  setBookingPriceOverride,
  stageCode,
  type ApprovalDecision,
  type BookingRow,
} from '@/lib/bookings'
import { applyRescheduleToCache } from '@/lib/calendar-reschedule'
import { t } from '@/lib/strings'

type QueryKey = ReadonlyArray<unknown>

type Snapshots = Array<{ key: QueryKey; prev: BookingRow[] | undefined }>

export type InlineEditBookingOptions = {
  /** Query keys to optimistically update + invalidate after settle. */
  queryKeys: ReadonlyArray<QueryKey>
}

export type RescheduleEarliestArgs = {
  bookingId: string
  /** booking_products row id whose dates change (caller resolves which one). */
  itemId: string
  /** Previous start date — used to roll back if the PATCH fails. */
  previousStart: string | null
  /** Previous end date — used to roll back if the PATCH fails. */
  previousEnd: string | null
  /** New start date (ISO YYYY-MM-DD). */
  newStart: string
  /** New end date (ISO YYYY-MM-DD) or null. */
  newEnd: string | null
}

export type StatusChangeArgs = {
  bookingId: string
  /** Decision (approve / reject) targeted by the dropdown selection. */
  decision: ApprovalDecision
  /** From-stage drives which approval branch to call. */
  fromStage: string
}

export type PriceOverrideArgs = {
  bookingId: string
  /** Operator id — required because the endpoint is operator-scoped
   *  (/api/staff/operators/{op}/...). The hook bails with a toast when
   *  no operator is selected, mirroring the no-show / mark-paid flow. */
  operatorId: string | null | undefined
  /** New gross_total to commit (numeric or numeric-string). 0 is a
   *  legitimate "comp" value; negatives are rejected server-side. */
  newGrossTotal: number
  /** Operator-supplied justification (required by the server). */
  reason: string
  /** Previous gross_total for visual rollback in the cache snapshot.
   *  Pass row.gross_total when there is no existing override; pass
   *  row.override_gross_total when replacing one. */
  previousGrossTotal: number | string | null | undefined
}

export type InlineEditBookingApi = {
  rescheduleEarliestItem: (args: RescheduleEarliestArgs) => void
  applyApprovalDecision: (args: StatusChangeArgs) => void
  overridePrice: (args: PriceOverrideArgs) => void
}

// ---- cache helpers ------------------------------------------------------

/** Apply an approval decision to the in-memory cache so the row's status
 *  flips immediately. Approve → confirmed; reject → cancelled. The stage
 *  code is left untouched — the server will re-emit the canonical stage
 *  on the next refresh; until then the badge falls back to semantic state. */
export function applyApprovalToCache(
  rows: BookingRow[] | undefined,
  bookingId: string,
  decision: ApprovalDecision,
): BookingRow[] | undefined {
  if (!rows) return rows
  let touched = false
  const next = rows.map((row) => {
    if (row.id !== bookingId) return row
    touched = true
    return {
      ...row,
      current_semantic_state:
        decision === 'approve' ? ('confirmed' as const) : ('cancelled' as const),
    }
  })
  return touched ? next : rows
}

/** Apply a price override to the in-memory cache. Stamps
 *  override_gross_total + override_reason + override_applied_at so
 *  priceDisplay flips immediately. The server-side recompute of
 *  balance_due is reflected on the next invalidation; until then the
 *  optimistic write keeps balance_due in sync by overwriting it to
 *  the same numeric value (full-balance heuristic — overrides are
 *  typically applied pre-payment, so this is the common case). */
export function applyPriceOverrideToCache(
  rows: BookingRow[] | undefined,
  bookingId: string,
  newGrossTotal: number,
  reason: string,
): BookingRow[] | undefined {
  if (!rows) return rows
  let touched = false
  const nowIso = new Date().toISOString()
  const next = rows.map((row) => {
    if (row.id !== bookingId) return row
    touched = true
    return {
      ...row,
      override_gross_total: newGrossTotal,
      override_reason: reason,
      override_applied_at: nowIso,
      balance_due: newGrossTotal,
    }
  })
  return touched ? next : rows
}

function snapshot(qc: QueryClient, keys: ReadonlyArray<QueryKey>): Snapshots {
  return keys.map((key) => ({
    key,
    prev: qc.getQueryData<BookingRow[] | undefined>(key as unknown[]),
  }))
}

function rollback(qc: QueryClient, snapshots: Snapshots): void {
  for (const { key, prev } of snapshots) {
    qc.setQueryData(key as unknown[], prev)
  }
}

function invalidateAll(qc: QueryClient, keys: ReadonlyArray<QueryKey>): void {
  for (const key of keys) {
    qc.invalidateQueries({ queryKey: key as unknown[] })
  }
}

// ---- hook ---------------------------------------------------------------

/**
 * Inline-edit write hook for Bookings table cells. Owns optimistic cache
 * writes + rollback + toasts for the cell-level edit surface.
 *
 * Stable callbacks: `queryKeys` is kept in a ref so callers can construct
 * the array inline without re-creating the API every render.
 */
export function useInlineEditBooking(
  options: InlineEditBookingOptions,
): InlineEditBookingApi {
  const qc = useQueryClient()
  const keysRef = useRef(options.queryKeys)
  useEffect(() => {
    keysRef.current = options.queryKeys
  }, [options.queryKeys])

  const dateMutation = useMutation({
    mutationFn: async (args: {
      bookingId: string
      itemId: string
      startDate: string
      endDate: string | null
    }) => {
      await patchBookingProduct(args.bookingId, args.itemId, {
        date_range_start: args.startDate,
        date_range_end: args.endDate,
      })
    },
  })

  const approvalMutation = useMutation({
    mutationFn: async (args: {
      bookingId: string
      branch: 'general' | 'secondary'
      decision: ApprovalDecision
    }) => {
      if (args.branch === 'general') {
        await postGeneralApprovalDecision({
          bookingId: args.bookingId,
          decision: args.decision,
        })
      } else {
        await postHotelApprovalDecision({
          bookingId: args.bookingId,
          decision: args.decision,
        })
      }
    },
  })

  const priceOverrideMutation = useMutation({
    mutationFn: async (args: {
      operatorId: string
      bookingId: string
      newGrossTotal: number
      reason: string
    }) => {
      await setBookingPriceOverride(args.operatorId, args.bookingId, {
        override_gross_total: args.newGrossTotal,
        reason: args.reason,
      })
    },
  })

  // Refs keep the mutation APIs out of the callback dep arrays — useMutation
  // returns a fresh object each render, so naively depending on it would
  // recreate the callbacks (and any memo that closes over them) every render,
  // which churns the BookingsTable column memo and detaches mid-click DOM
  // nodes from the table. The ref-write happens in an effect to satisfy the
  // react-hooks/refs rule (no ref access during render).
  const dateMutationRef = useRef(dateMutation)
  const approvalMutationRef = useRef(approvalMutation)
  const priceOverrideMutationRef = useRef(priceOverrideMutation)
  useEffect(() => {
    dateMutationRef.current = dateMutation
    approvalMutationRef.current = approvalMutation
    priceOverrideMutationRef.current = priceOverrideMutation
  })

  const rescheduleEarliestItem = useCallback<
    InlineEditBookingApi['rescheduleEarliestItem']
  >(
    (args) => {
      const keys = keysRef.current
      const snapshots = snapshot(qc, keys)
      for (const key of keys) {
        qc.setQueryData<BookingRow[] | undefined>(key as unknown[], (rows) =>
          applyRescheduleToCache(rows, args.itemId, args.newStart, args.newEnd),
        )
      }
      dateMutationRef.current.mutate(
        {
          bookingId: args.bookingId,
          itemId: args.itemId,
          startDate: args.newStart,
          endDate: args.newEnd,
        },
        {
          onSuccess: () => {
            toast.success(t.bookings.inlineEdit.datesUpdated)
            invalidateAll(qc, keysRef.current)
          },
          onError: (err: Error) => {
            rollback(qc, snapshots)
            toast.error(t.bookings.inlineEdit.datesUpdateError, {
              description: err.message,
            })
          },
        },
      )
    },
    [qc],
  )

  const applyApprovalDecision = useCallback<
    InlineEditBookingApi['applyApprovalDecision']
  >(
    (args) => {
      const branch =
        args.fromStage === 'awaiting_general_approval'
          ? 'general'
          : args.fromStage === 'awaiting_hotel_approval'
            ? 'secondary'
            : null
      if (!branch) {
        // No approval endpoint covers this stage. Bail loudly so the cell
        // restores to the previous selection on the next render — the
        // dropdown is gated upstream, this is the belt-and-braces check.
        toast.error(t.bookings.inlineEdit.statusUpdateError, {
          description: t.bookings.inlineEdit.statusUnchangedFromStage(
            args.fromStage,
          ),
        })
        return
      }
      const keys = keysRef.current
      const snapshots = snapshot(qc, keys)
      for (const key of keys) {
        qc.setQueryData<BookingRow[] | undefined>(key as unknown[], (rows) =>
          applyApprovalToCache(rows, args.bookingId, args.decision),
        )
      }
      approvalMutationRef.current.mutate(
        { bookingId: args.bookingId, branch, decision: args.decision },
        {
          onSuccess: () => {
            toast.success(t.bookings.inlineEdit.statusUpdated)
            invalidateAll(qc, keysRef.current)
          },
          onError: (err: Error) => {
            rollback(qc, snapshots)
            toast.error(t.bookings.inlineEdit.statusUpdateError, {
              description: err.message,
            })
          },
        },
      )
    },
    [qc],
  )

  const overridePrice = useCallback<InlineEditBookingApi['overridePrice']>(
    (args) => {
      if (!args.operatorId) {
        // The endpoint is operator-scoped — bail with a clear toast
        // when no operator is selected (rare outside tests / the
        // operator-switcher mid-load window).
        toast.error(t.bookings.inlineEdit.priceUpdateError, {
          description: t.bookings.inlineEdit.priceNoOperator,
        })
        return
      }
      if (!Number.isFinite(args.newGrossTotal) || args.newGrossTotal < 0) {
        // Defence-in-depth — the dialog also validates; the server
        // returns 422 for negatives.
        toast.error(t.bookings.inlineEdit.priceUpdateError, {
          description: t.bookings.inlineEdit.priceInvalidValue,
        })
        return
      }
      const reason = args.reason.trim()
      if (!reason) {
        toast.error(t.bookings.inlineEdit.priceUpdateError, {
          description: t.bookings.inlineEdit.priceReasonRequired,
        })
        return
      }
      const keys = keysRef.current
      const snapshots = snapshot(qc, keys)
      for (const key of keys) {
        qc.setQueryData<BookingRow[] | undefined>(key as unknown[], (rows) =>
          applyPriceOverrideToCache(rows, args.bookingId, args.newGrossTotal, reason),
        )
      }
      priceOverrideMutationRef.current.mutate(
        {
          operatorId: args.operatorId,
          bookingId: args.bookingId,
          newGrossTotal: args.newGrossTotal,
          reason,
        },
        {
          onSuccess: () => {
            toast.success(t.bookings.inlineEdit.priceUpdated)
            invalidateAll(qc, keysRef.current)
          },
          onError: (err: Error) => {
            rollback(qc, snapshots)
            toast.error(t.bookings.inlineEdit.priceUpdateError, {
              description: err.message,
            })
          },
        },
      )
    },
    [qc],
  )

  // Memoise the returned object so callers that close over it (e.g.
  // BookingsTable's column useMemo) don't re-build on every render and
  // tear down the table mid-click. All three callbacks are already stable
  // via useCallback above.
  return useMemo(
    () => ({ rescheduleEarliestItem, applyApprovalDecision, overridePrice }),
    [rescheduleEarliestItem, applyApprovalDecision, overridePrice],
  )
}

// ---- exported helpers (used by BookingsTable to build cell controls) ----

// earliestScheduledItem is re-exported from @/lib/bookings — same selector
// the calendar uses (bookingsToCalendarEvents).

/** Map a (fromStage, decisionValue) pair to the decision the approval
 *  endpoint expects. Returns null when the selection is the current value
 *  or when no transition is wired. */
export function decisionFromSelection(
  fromStage: string | null,
  selection: string,
): ApprovalDecision | null {
  if (!fromStage) return null
  if (selection === 'approve') return 'approve'
  if (selection === 'reject') return 'reject'
  return null
}

/** Inline-edit options for the status dropdown, scoped to the transitions
 *  the v1 endpoints can express. Returns an empty list when no transition
 *  is available from the current stage (cell renders read-only). */
export function statusOptionsFor(
  row: BookingRow,
): Array<{ value: string; label: string }> {
  const code = stageCode(row)
  if (code !== 'awaiting_general_approval' && code !== 'awaiting_hotel_approval') {
    return []
  }
  return [
    { value: 'noop', label: t.bookings.inlineEdit.clickToEdit },
    { value: 'approve', label: t.bookings.stage.confirmed },
    { value: 'reject', label: t.bookings.stage.cancelled },
  ]
}
