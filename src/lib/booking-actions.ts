/**
 * useBookingActions — extracts the 10 booking-action mutations + their
 * derived busy/eligibility flags from BookingDetailBody.
 *
 * All mutations mirror the original implementations verbatim; no logic
 * has been changed. The hook owns only: useMutation wiring, derived
 * `busy` flag, and eligibility flags.
 *
 * Dialog open/close state remains in BookingDetailBody because the
 * dialogs are rendered in the same subtree.
 */

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { useOperator } from '@/lib/operator'
import {
  balanceDueOf,
  canMarkAsNoShow,
  canMarkAsPaid,
  cancelBooking,
  clearBookingPriceOverride,
  customerDisplay,
  getConfirmationStatus,
  hasPriceOverride,
  invalidateBookingCaches,
  markBookingAsNoShow,
  markBookingAsPaid,
  patchBookingProduct,
  patchCustomerContact,
  postGeneralApprovalDecision,
  postHotelApprovalDecision,
  resendConfirmation,
  sendConfirmation,
  setBookingStage,
  stageCode,
  type BookingRow,
  type MarkAsPaidMethod,
  type SetStageRequest,
} from '@/lib/bookings'
import { downloadInvoicePdf } from '@/lib/invoice-download'
import { t } from '@/lib/strings'
import { showDeleteUndoToast } from '@/lib/undo-toast'

// Re-export so callers don't need a separate import from @/lib/bookings.
export type { MarkAsPaidMethod }

// ---------------------------------------------------------------------------
// Types shared with BookingDetailBody
// ---------------------------------------------------------------------------

export type CustomerDraft = {
  first_name: string
  last_name: string
  email: string
  phone: string
}

export type ItemDraft = {
  id: string
  date_range_start: string | null
  date_range_end: string | null
  selected_days: string[]
}

// ---------------------------------------------------------------------------
// Internal helpers (identical to the originals in BookingDetailSheet.tsx)
// ---------------------------------------------------------------------------

function arraysEqual(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) return false
  }
  return true
}

function deriveBounds(days: string[]): {
  start: string | null
  end: string | null
} {
  if (days.length === 0) return { start: null, end: null }
  const sorted = [...days].sort()
  return { start: sorted[0], end: sorted[sorted.length - 1] }
}

export function customerDraftFromRow(row: BookingRow): CustomerDraft {
  const c = row.customer
  return {
    first_name: c?.first_name ?? '',
    last_name: c?.last_name ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
  }
}

export function itemDraftsFromRow(row: BookingRow): ItemDraft[] {
  return row.items.map((it) => ({
    id: it.id,
    date_range_start: it.date_range_start,
    date_range_end: it.date_range_end,
    selected_days: [...(it.selected_days ?? [])].sort(),
  }))
}

// ---------------------------------------------------------------------------
// Hook params
// ---------------------------------------------------------------------------

export type BookingActionsParams = {
  row: BookingRow
  /** Current customer draft (from useState in BookingDetailBody). */
  customer: CustomerDraft
  /** Current item drafts (from useState in BookingDetailBody). */
  items: ItemDraft[]
  onClose: () => void
  // Dialog state — the hook resets these on mutation success.
  setShowCancel: (v: boolean) => void
  setCancelReason: (v: string) => void
  cancelReason: string
  setShowUnblock: (v: boolean) => void
  setShowHotelDecline: (v: boolean) => void
  setHotelDeclineNote: (v: string) => void
  hotelDeclineNote: string
  setShowNoShow: (v: boolean) => void
  setChargeCancellationFee: (v: boolean) => void
  chargeCancellationFee: boolean
  setShowGeneralApprove: (v: boolean) => void
  setGeneralApproveNote: (v: string) => void
  generalApproveNote: string
  setShowGeneralReject: (v: boolean) => void
  setGeneralRejectNote: (v: string) => void
  generalRejectNote: string
  setShowMarkPaid: (v: boolean) => void
  setMarkPaidMethod: (v: MarkAsPaidMethod) => void
  setMarkPaidAmount: (v: string) => void
  setMarkPaidNote: (v: string) => void
  markPaidMethod: MarkAsPaidMethod
  markPaidAmount: string
  markPaidNote: string
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useBookingActions({
  row,
  customer,
  items,
  onClose,
  setShowCancel,
  setCancelReason,
  cancelReason,
  setShowUnblock,
  setShowHotelDecline,
  setHotelDeclineNote,
  hotelDeclineNote,
  setShowNoShow,
  setChargeCancellationFee,
  chargeCancellationFee,
  setShowGeneralApprove,
  setGeneralApproveNote,
  generalApproveNote,
  setShowGeneralReject,
  setGeneralRejectNote,
  generalRejectNote,
  setShowMarkPaid,
  setMarkPaidMethod,
  setMarkPaidAmount,
  setMarkPaidNote,
  markPaidMethod,
  markPaidAmount,
  markPaidNote,
}: BookingActionsParams) {
  const queryClient = useQueryClient()
  const { currentOperatorId } = useOperator()

  // ---------------------------------------------------------------------------
  // Eligibility (mirrors the originals verbatim)
  // ---------------------------------------------------------------------------

  const code = stageCode(row)
  // landr-b304 — both stage codes route through transition_booking_approval's
  // branch=secondary (see 20260514071000_transition_booking_approval.sql):
  // awaiting_hotel_approval is the Para42 historical-exception code,
  // awaiting_secondary_approval is the generic canonical replacement. Gate
  // both the unblock (approve) and decline (reject) buttons on either code
  // so operators on either stage naming see both actions.
  const canUnblock =
    code === 'awaiting_hotel_approval' || code === 'awaiting_secondary_approval'
  const canGeneralApprove = code === 'awaiting_general_approval'
  const canNoShow = canMarkAsNoShow(row)
  const canMarkPaid = canMarkAsPaid(row)
  const balanceDue = balanceDueOf(row)

  // ---------------------------------------------------------------------------
  // Dirty tracking (mirrors the originals verbatim)
  // ---------------------------------------------------------------------------

  const originalCustomer = customerDraftFromRow(row)
  const originalItems = itemDraftsFromRow(row)

  const customerDirty =
    !!row.customer &&
    (customer.first_name !== originalCustomer.first_name ||
      customer.last_name !== originalCustomer.last_name ||
      customer.email !== originalCustomer.email ||
      customer.phone !== originalCustomer.phone)

  const dirtyItems = items.filter((draft, idx) => {
    const orig = originalItems[idx]
    if (!orig) return true
    return !arraysEqual(draft.selected_days, orig.selected_days)
  })

  const isDirty = customerDirty || dirtyItems.length > 0

  // ---------------------------------------------------------------------------
  // Cache invalidation helper
  // ---------------------------------------------------------------------------

  const invalidateAll = () => {
    // landr-399m — ['bookings'] + ['views-bookings'] live in the shared
    // invalidateBookingCaches helper so CustomerDetailSheet + GeneralApprovals
    // (and any future booking-writing surface) stay in lock-step. The Views
    // layer (lib/views-bookings-data.ts:useViewBookings) keys under a
    // different prefix that ['bookings'] doesn't match — see helper comment.
    void invalidateBookingCaches(queryClient)
    queryClient.invalidateQueries({ queryKey: ['calendar'] })
    queryClient.invalidateQueries({ queryKey: ['contacts'] })
  }

  // ---------------------------------------------------------------------------
  // Mutations (verbatim copies from BookingDetailBody)
  // ---------------------------------------------------------------------------

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (customerDirty && row.customer) {
        await patchCustomerContact(row.customer.id, {
          first_name: customer.first_name.trim() || null,
          last_name: customer.last_name.trim() || null,
          email: customer.email.trim() || null,
          phone: customer.phone.trim() || null,
        })
      }
      for (const draft of dirtyItems) {
        const orig = originalItems.find((o) => o.id === draft.id)
        const patch: Parameters<typeof patchBookingProduct>[2] = {}
        const draftBounds = deriveBounds(draft.selected_days)
        const origBounds = orig
          ? deriveBounds(orig.selected_days)
          : { start: null, end: null }
        if (!orig || draftBounds.start !== origBounds.start) {
          patch.date_range_start = draftBounds.start
        }
        if (!orig || draftBounds.end !== origBounds.end) {
          patch.date_range_end = draftBounds.end
        }
        if (!orig || !arraysEqual(draft.selected_days, orig.selected_days)) {
          patch.selected_days = draft.selected_days
        }
        await patchBookingProduct(row.id, draft.id, patch)
      }
    },
    onSuccess: () => {
      toast.success(t.bookings.detail.saveToastSuccess)
      invalidateAll()
      onClose()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.detail.saveToastError, {
        description: err.message,
      })
    },
  })

  const cancelMutation = useMutation({
    mutationFn: async () => {
      await cancelBooking(row.id, cancelReason.trim())
    },
    onSuccess: () => {
      // landr-v6aq — replace the plain success toast with the undo flow
      // (calendar-reschedule pattern). The 5s window calls the staff_trash
      // restore router on Undo, which flips deleted_at back to NULL.
      // Falls back to the plain toast when no operator is selected (rare
      // outside tests; restore is operator-scoped on the server).
      if (currentOperatorId) {
        showDeleteUndoToast({
          operatorId: currentOperatorId,
          kind: 'bookings',
          rowId: row.id,
          message: t.undo.deletedBooking(customerDisplay(row)),
          queryClient,
          invalidateQueryKeys: [['bookings'], ['views-bookings']],
        })
      } else {
        toast.success(t.bookings.cancel.toastSuccess)
      }
      setShowCancel(false)
      setCancelReason('')
      invalidateAll()
      onClose()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.cancel.toastError, { description: err.message })
    },
  })

  const unblockMutation = useMutation({
    mutationFn: async () => {
      await postHotelApprovalDecision({
        bookingId: row.id,
        decision: 'approve',
      })
    },
    onSuccess: () => {
      toast.success(t.bookings.hotelUnblock.toastSuccess)
      setShowUnblock(false)
      invalidateAll()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.hotelUnblock.toastError, {
        description: err.message,
      })
    },
  })

  // landr-b304 — hotel-declined mutation. Sibling to unblockMutation; calls
  // the same postHotelApprovalDecision wrapper (branch=secondary) with
  // decision='reject', which hard-cancels the booking via
  // transition_booking_approval into the operator's cancelled stage and
  // writes a distinct approval_transition audit row
  // (app.approval_branch='secondary', app.approval_decision='rejected').
  // Mirrors generalRejectMutation: optional note, closes the sheet on
  // success since the booking leaves the open-booking set.
  const hotelDeclineMutation = useMutation({
    mutationFn: async () => {
      await postHotelApprovalDecision({
        bookingId: row.id,
        decision: 'reject',
        notes: hotelDeclineNote.trim() || undefined,
      })
    },
    onSuccess: () => {
      toast.success(t.bookings.hotelDecline.toastSuccess)
      setShowHotelDecline(false)
      setHotelDeclineNote('')
      invalidateAll()
      onClose()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.hotelDecline.toastError, {
        description: err.message,
      })
    },
  })

  // landr-hgd4 — general approve mutation. Mirrors the GeneralApprovals page's
  // approve action; calls postGeneralApprovalDecision (branch=general).
  const generalApproveMutation = useMutation({
    mutationFn: async () => {
      await postGeneralApprovalDecision({
        bookingId: row.id,
        decision: 'approve',
        notes: generalApproveNote.trim() || undefined,
      })
    },
    onSuccess: () => {
      toast.success(t.bookings.generalApprove.toastApproved)
      setShowGeneralApprove(false)
      setGeneralApproveNote('')
      invalidateAll()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.generalApprove.toastError, {
        description: err.message,
      })
    },
  })

  // landr-hgd4 — general reject mutation. Mirrors the GeneralApprovals page's
  // reject action; calls postGeneralApprovalDecision (branch=general,
  // decision=reject). Reject notes are optional but surfaced prominently
  // (mirrors the cancel-reason pattern — same dialog style, no min-length guard
  // since the server treats notes as optional too).
  const generalRejectMutation = useMutation({
    mutationFn: async () => {
      await postGeneralApprovalDecision({
        bookingId: row.id,
        decision: 'reject',
        notes: generalRejectNote.trim() || undefined,
      })
    },
    onSuccess: () => {
      toast.success(t.bookings.generalApprove.toastRejected)
      setShowGeneralReject(false)
      setGeneralRejectNote('')
      invalidateAll()
      onClose()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.generalApprove.toastError, {
        description: err.message,
      })
    },
  })

  // landr-ng3m — mark-as-no-show. Requires currentOperatorId because the
  // endpoint lives under /api/staff/operators/{op}/... — the cross-tenant
  // guard is path-based on the server.
  const noShowMutation = useMutation({
    mutationFn: async () => {
      if (!currentOperatorId) {
        throw new Error('No operator selected.')
      }
      await markBookingAsNoShow(currentOperatorId, row.id, chargeCancellationFee)
    },
    onSuccess: () => {
      toast.success(t.bookings.noShow.toastSuccess)
      setShowNoShow(false)
      setChargeCancellationFee(false)
      invalidateAll()
      onClose()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.noShow.toastError, { description: err.message })
    },
  })

  // landr-okxm — mark-as-paid mutation. Same path-based operator
  // scoping as the no-show + invoice endpoints; the server inserts the
  // payments row and (if balance hits zero) advances current_stage_id
  // out of awaiting_payment.
  const markPaidMutation = useMutation({
    mutationFn: async () => {
      if (!currentOperatorId) {
        throw new Error('No operator selected.')
      }
      const trimmedAmount = markPaidAmount.trim()
      const trimmedNote = markPaidNote.trim()
      await markBookingAsPaid(currentOperatorId, row.id, {
        method: markPaidMethod,
        amount: trimmedAmount.length > 0 ? trimmedAmount : null,
        note: trimmedNote.length > 0 ? trimmedNote : null,
      })
    },
    onSuccess: () => {
      toast.success(t.bookings.markPaid.toastSuccess)
      setShowMarkPaid(false)
      setMarkPaidMethod('cash')
      setMarkPaidAmount('')
      setMarkPaidNote('')
      invalidateAll()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.markPaid.toastError, { description: err.message })
    },
  })

  // landr-puix — clear an operator-set price override. Only shown when
  // hasPriceOverride(row) is true (the footer hides the button
  // otherwise so canCancel logic stays simple). Operator-scoped DELETE
  // route; the server-side trigger recomputes balance_due against the
  // engine gross_total so a subsequent refresh shows the engine price
  // back in the table cell.
  const clearOverrideMutation = useMutation({
    mutationFn: async () => {
      if (!currentOperatorId) {
        throw new Error('No operator selected.')
      }
      await clearBookingPriceOverride(currentOperatorId, row.id)
    },
    onSuccess: () => {
      toast.success(t.bookings.inlineEdit.priceClearedToast)
      invalidateAll()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.inlineEdit.priceClearError, {
        description: err.message,
      })
    },
  })

  // landr-6629 — resend booking confirmation with old→new diff.
  // Requires currentOperatorId (operator-scoped endpoint). The status
  // query (confirmation-status) drives the dot-badge on the button;
  // it refetches after a successful resend so the badge clears.
  const confirmationStatusQuery = useQuery({
    queryKey: ['confirmation-status', currentOperatorId, row.id],
    queryFn: () =>
      currentOperatorId
        ? getConfirmationStatus(currentOperatorId, row.id)
        : Promise.resolve({
            last_sent_at: null,
            has_material_changes: false,
            has_prior_confirmation: false,
          }),
    enabled: !!currentOperatorId,
    staleTime: 60_000,
  })
  const hasMaterialChanges =
    confirmationStatusQuery.data?.has_material_changes ?? false
  // landr-tf39 — the Resend-Confirmation button only makes sense once a real
  // confirmation has gone out; rendering it for never-confirmed bookings is
  // how the premature-confirmation bug happened.
  const hasPriorConfirmation =
    confirmationStatusQuery.data?.has_prior_confirmation ?? false

  const resendConfirmationMutation = useMutation({
    mutationFn: async () => {
      if (!currentOperatorId) {
        throw new Error('No operator selected.')
      }
      return resendConfirmation(currentOperatorId, row.id)
    },
    onSuccess: (result) => {
      const n = result.changes.length
      if (n > 0) {
        toast.success(t.bookings.resendConfirmation.toastSuccessWithChanges(n))
      } else {
        toast.success(t.bookings.resendConfirmation.toastSuccess)
      }
      // Refetch status so the badge clears / reflects current state.
      void confirmationStatusQuery.refetch()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.resendConfirmation.toastError, {
        description: err.message,
      })
    },
  })

  // landr-uvfg.6 — send the FIRST confirmation for never-confirmed bookings.
  // Only rendered when hasPriorConfirmation === false. On success the
  // confirmation-status query is refetched so the button flips to "Resend".
  const sendConfirmationMutation = useMutation({
    mutationFn: async () => {
      if (!currentOperatorId) {
        throw new Error('No operator selected.')
      }
      return sendConfirmation(currentOperatorId, row.id)
    },
    onSuccess: () => {
      const customer = customerDisplay(row)
      toast.success(t.bookings.sendConfirmation.toastSuccess(customer))
      // Refetch so the "Send confirmation" button flips to "Resend confirmation".
      void confirmationStatusQuery.refetch()
      invalidateAll()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.sendConfirmation.toastError, {
        description: err.message,
      })
    },
  })

  // landr-irds — server-rendered invoice PDF download. Requires
  // currentOperatorId because the endpoint is operator-scoped
  // (/api/staff/operators/{op}/bookings/{id}/invoice.pdf). Cache
  // doesn't need invalidation — the download is read-only.
  const invoiceMutation = useMutation({
    mutationFn: async () => {
      if (!currentOperatorId) {
        throw new Error('No operator selected.')
      }
      await downloadInvoicePdf({
        operatorId: currentOperatorId,
        bookingId: row.id,
      })
    },
    onError: (err: Error) => {
      toast.error(t.bookings.invoice.toastError, { description: err.message })
    },
  })

  // ---------------------------------------------------------------------------
  // Derived busy flag
  // ---------------------------------------------------------------------------

  const busy =
    saveMutation.isPending ||
    cancelMutation.isPending ||
    unblockMutation.isPending ||
    hotelDeclineMutation.isPending ||
    generalApproveMutation.isPending ||
    generalRejectMutation.isPending ||
    noShowMutation.isPending ||
    markPaidMutation.isPending ||
    clearOverrideMutation.isPending ||
    invoiceMutation.isPending ||
    resendConfirmationMutation.isPending ||
    sendConfirmationMutation.isPending

  // landr-puix — Clear-override visibility. Gated on currentOperatorId
  // too (the DELETE route is operator-scoped), mirroring the no-show /
  // mark-paid buttons. When no operator is selected the button stays
  // hidden rather than rendering disabled — same UX pattern.
  const showClearOverride = hasPriceOverride(row) && !!currentOperatorId

  return {
    saveMutation,
    cancelMutation,
    unblockMutation,
    hotelDeclineMutation,
    generalApproveMutation,
    generalRejectMutation,
    noShowMutation,
    markPaidMutation,
    clearOverrideMutation,
    invoiceMutation,
    resendConfirmationMutation,
    sendConfirmationMutation,
    confirmationStatusQuery,
    busy,
    showClearOverride,
    canUnblock,
    canGeneralApprove,
    canNoShow,
    canMarkPaid,
    balanceDue,
    hasMaterialChanges,
    hasPriorConfirmation,
    isDirty,
    invalidateAll,
  }
}

// ---------------------------------------------------------------------------
// useSetStage (landr-uvfg.8 / T8)
// ---------------------------------------------------------------------------

/**
 * Hook for the free-form set-stage control in BookingDetailSheet. Standalone
 * (not folded into useBookingActions) because the detail sheet drives the
 * two-step force flow itself — it reads the SetStageResult to decide whether
 * to open the non-canonical confirm dialog and re-POST with force:true.
 *
 * onSuccess runs after every applied transition (force or not) so the sheet
 * can invalidate caches; the caller still inspects mutateAsync's return value
 * for requires_confirmation.
 */
export function useSetStage(
  operatorId: string | null,
  bookingId: string,
  onSuccess: () => void,
) {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (body: SetStageRequest) => {
      if (!operatorId) throw new Error('No operator selected.')
      return setBookingStage(operatorId, bookingId, body)
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      onSuccess()
    },
  })
}
