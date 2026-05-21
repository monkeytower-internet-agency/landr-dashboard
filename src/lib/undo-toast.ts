// landr-v6aq — generic "Deleted X — Undo" toast wired to the staff_trash
// restore router (landr-4pn1). Mirrors the calendar-reschedule undo pattern
// (src/lib/calendar-reschedule.ts) but for the soft-delete surfaces:
// BookingDetailSheet cancel + ProductsManager delete.
//
// Why a separate helper instead of inlining sonner: the undo flow has three
// orthogonal pieces (success toast, restore call, post-restore reconcile)
// and every caller plumbs the same shape. Centralising here keeps the
// trash-router contract in one place — future callers (operator_tags,
// pricing_schemes) wire the same helper without re-implementing the
// restore-toast loop.
//
// The toast duration is sonner's default 5s (no explicit `duration` on the
// toast options), matching the ticket spec.

import { toast } from 'sonner'
import type { QueryClient } from '@tanstack/react-query'

import { restoreTrashRow, type TrashKind } from '@/lib/trash'
import { t } from '@/lib/strings'

export type ShowDeleteUndoToastArgs = {
  /** Operator that owns the soft-deleted row. */
  operatorId: string
  /** Trash kind — picks the restore endpoint. */
  kind: TrashKind
  /** id of the soft-deleted row to restore on Undo. */
  rowId: string
  /**
   * Toast message shown after the delete lands, e.g.
   * "Deleted Tandem Flight". Caller composes this so the localized noun
   * stays close to the action site (BookingDetailSheet says "booking",
   * ProductsManager says "product").
   */
  message: string
  /**
   * QueryClient used to invalidate caches after a successful restore so the
   * row reappears in the list surfaces without a manual refresh. The trash
   * router runs as service-role under FastAPI; realtime UPDATE events also
   * fire, but we don't depend on them landing in time for the toast.
   */
  queryClient: QueryClient
  /**
   * Query keys to invalidate after restore. Same shape as the
   * useDragReschedule queryKeys option — pass every cache that should
   * re-fetch (bookings + views-bookings, products + product-kind-counts,
   * etc).
   */
  invalidateQueryKeys: ReadonlyArray<ReadonlyArray<unknown>>
}

/**
 * Show a confirmation toast with an "Undo" action that restores a
 * soft-deleted row via the staff_trash router.
 *
 * The toast uses sonner's default 5s duration (the ticket spec). After 5s
 * the toast dismisses on its own and the undo opportunity is gone — the
 * row stays soft-deleted (operators can still recover it from the Trash
 * surface). The Undo click is therefore lossy if you wait too long, which
 * matches the calendar-reschedule pattern.
 */
export function showDeleteUndoToast(args: ShowDeleteUndoToastArgs): void {
  const {
    operatorId,
    kind,
    rowId,
    message,
    queryClient,
    invalidateQueryKeys,
  } = args

  toast.success(message, {
    action: {
      label: t.undo.action,
      onClick: () => {
        // Fire-and-forget: the await chain runs after onClick returns and
        // surfaces success/error via secondary toasts. We don't try to
        // disable the button mid-flight because sonner re-renders the
        // toast on action click anyway.
        void runUndo({
          operatorId,
          kind,
          rowId,
          queryClient,
          invalidateQueryKeys,
        })
      },
    },
  })
}

async function runUndo(args: {
  operatorId: string
  kind: TrashKind
  rowId: string
  queryClient: QueryClient
  invalidateQueryKeys: ReadonlyArray<ReadonlyArray<unknown>>
}): Promise<void> {
  try {
    await restoreTrashRow(args.operatorId, args.kind, args.rowId)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    toast.error(t.undo.restoreError, { description: message })
    return
  }
  // Invalidate every registered cache so the row reappears. We do this
  // after the restore POST resolves so the next fetch sees deleted_at=null.
  for (const key of args.invalidateQueryKeys) {
    args.queryClient.invalidateQueries({ queryKey: key as unknown[] })
  }
  toast.success(t.undo.restored)
}
