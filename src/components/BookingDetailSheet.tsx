import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Unlock } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Textarea } from '@/components/ui/textarea'
import { CustomerNameLink } from '@/components/CustomerNameLink'
import { DayChips } from '@/components/booking/DayChips'
import { MultiDayPicker } from '@/components/booking/MultiDayPicker'
import { StageBadge } from '@/components/booking/StageBadge'
import {
  cancelBooking,
  customerDisplay,
  invalidateBookingCaches,
  patchBookingProduct,
  patchCustomerContact,
  postHotelApprovalDecision,
  priceDisplay,
  stageCode,
  type BookingRow,
} from '@/lib/bookings'
import { t } from '@/lib/strings'

type Props = {
  row: BookingRow | null
  onOpenChange: (open: boolean) => void
  onCustomerClick?: (contactId: string) => void
}

export function BookingDetailSheet({
  row,
  onOpenChange,
  onCustomerClick,
}: Props) {
  const open = row !== null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* landr-li8e — widen to ~60vw on desktop so operators can review
          line items, participants and customer details without scrolling
          sideways. Keep w-full on mobile (the sm: breakpoint kicks in
          ≥640px) and stay as a Sheet (not modal) so the underlying list
          stays visible. */}
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-[60vw]">
        {row ? (
          <BookingDetailBody
            key={row.id}
            row={row}
            onClose={() => onOpenChange(false)}
            onCustomerClick={onCustomerClick}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = {
  row: BookingRow
  onClose: () => void
  onCustomerClick?: (contactId: string) => void
}

type CustomerDraft = {
  first_name: string
  last_name: string
  email: string
  phone: string
}

type ItemDraft = {
  id: string
  date_range_start: string | null
  date_range_end: string | null
  selected_days: string[]
}

function customerDraftFromRow(row: BookingRow): CustomerDraft {
  const c = row.customer
  return {
    first_name: c?.first_name ?? '',
    last_name: c?.last_name ?? '',
    email: c?.email ?? '',
    phone: c?.phone ?? '',
  }
}

function itemDraftsFromRow(row: BookingRow): ItemDraft[] {
  return row.items.map((it) => ({
    id: it.id,
    date_range_start: it.date_range_start,
    date_range_end: it.date_range_end,
    selected_days: [...(it.selected_days ?? [])].sort(),
  }))
}

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

function formatRangeLabel(days: string[]): string | null {
  const { start, end } = deriveBounds(days)
  if (!start || !end) return null
  if (start === end) return start
  return `${start} → ${end}`
}

function BookingDetailBody({ row, onClose, onCustomerClick }: BodyProps) {
  const queryClient = useQueryClient()
  const [customer, setCustomer] = useState<CustomerDraft>(() =>
    customerDraftFromRow(row),
  )
  const [items, setItems] = useState<ItemDraft[]>(() => itemDraftsFromRow(row))
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showUnblock, setShowUnblock] = useState(false)

  const code = stageCode(row)
  const canUnblock = code === 'awaiting_hotel_approval'

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
      toast.success(t.bookings.cancel.toastSuccess)
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

  const busy =
    saveMutation.isPending ||
    cancelMutation.isPending ||
    unblockMutation.isPending

  function updateItem(itemId: string, updater: (it: ItemDraft) => ItemDraft) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? updater(it) : it)))
  }

  function toggleDay(itemId: string, day: string) {
    updateItem(itemId, (it) => {
      const has = it.selected_days.includes(day)
      const next = has
        ? it.selected_days.filter((d) => d !== day)
        : [...it.selected_days, day]
      next.sort()
      return { ...it, selected_days: next }
    })
  }

  const cancelReasonReady = cancelReason.trim().length >= 3

  return (
    <>
      <SheetHeader>
        <SheetTitle>{t.bookings.detailsTitle}</SheetTitle>
        <SheetDescription>
          {row.customer && onCustomerClick ? (
            <span className="inline-flex flex-wrap items-center gap-x-1">
              <CustomerNameLink
                contactId={row.customer.id}
                display={customerDisplay(row)}
                onClick={onCustomerClick}
                className="text-foreground font-medium"
              />
              <span aria-hidden>·</span>
              <span>{`#${row.id.slice(0, 8)} · ${priceDisplay(row)}`}</span>
            </span>
          ) : (
            `#${row.id.slice(0, 8)} · ${priceDisplay(row)}`
          )}
        </SheetDescription>
      </SheetHeader>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (isDirty && !busy) saveMutation.mutate()
        }}
        className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2"
        aria-label={t.bookings.detailsTitle}
      >
        {/* Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t.bookings.detail.sectionStatus}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <StageBadge
              state={row.current_semantic_state}
              stageCode={code}
              className="self-start"
            />
            {canUnblock ? (
              <Button
                type="button"
                onClick={() => setShowUnblock(true)}
                disabled={busy}
                className="self-start"
              >
                <Unlock className="size-4" />
                {t.bookings.hotelUnblock.label}
              </Button>
            ) : null}
          </CardContent>
        </Card>

        {/* Customer */}
        {row.customer ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t.bookings.detail.sectionCustomer}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-first-name">
                  {t.bookings.detail.customerFirstName}
                </Label>
                <Input
                  id="bk-first-name"
                  value={customer.first_name}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, first_name: e.target.value }))
                  }
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-last-name">
                  {t.bookings.detail.customerLastName}
                </Label>
                <Input
                  id="bk-last-name"
                  value={customer.last_name}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, last_name: e.target.value }))
                  }
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-email">
                  {t.bookings.detail.customerEmail}
                </Label>
                <Input
                  id="bk-email"
                  type="email"
                  value={customer.email}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, email: e.target.value }))
                  }
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-phone">
                  {t.bookings.detail.customerPhone}
                </Label>
                <Input
                  id="bk-phone"
                  type="tel"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, phone: e.target.value }))
                  }
                  disabled={busy}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Dates / line items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t.bookings.detail.sectionDates}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {items.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">
                {t.bookings.detail.noSelectedDays}
              </p>
            ) : (
              items.map((draft, idx) => {
                const item = row.items[idx]
                const heading = t.bookings.detail.itemHeading(
                  item?.products?.name ?? null,
                  idx,
                )
                const rangeLabel = formatRangeLabel(draft.selected_days)
                return (
                  <div
                    key={draft.id}
                    className="flex flex-col gap-3 rounded-md border p-3"
                  >
                    <div className="text-sm font-medium">{heading}</div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t.bookings.detail.pickerLabel}</Label>
                      <MultiDayPicker
                        value={draft.selected_days}
                        onChange={(next) =>
                          updateItem(draft.id, (it) => ({
                            ...it,
                            selected_days: next,
                          }))
                        }
                        initialMonth={draft.selected_days[0] ?? undefined}
                        disabled={busy}
                      />
                      <p className="text-muted-foreground text-xs">
                        {t.bookings.detail.pickerHint}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t.bookings.detail.selectedDaysLabel}</Label>
                      <DayChips
                        days={draft.selected_days}
                        editable
                        onToggle={(day) => toggleDay(draft.id, day)}
                      />
                      {rangeLabel ? (
                        <p className="text-muted-foreground text-xs">
                          {t.bookings.detail.rangeSummary(rangeLabel)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t.bookings.detail.sectionPricing}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                {t.bookings.detail.grossTotalLabel}
              </span>
              <span className="text-lg font-semibold">{priceDisplay(row)}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              {t.bookings.detail.recomputeHint}
            </p>
          </CardContent>
        </Card>
      </form>

      <SheetFooter className="flex flex-row items-center justify-between gap-2 border-t">
        <Button
          type="button"
          variant="destructive"
          onClick={() => setShowCancel(true)}
          disabled={busy}
        >
          {t.bookings.cancel.action}
        </Button>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            {t.bookings.detail.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || busy}
            title={!isDirty ? t.bookings.detail.noChanges : undefined}
          >
            {saveMutation.isPending
              ? t.bookings.detail.saving
              : t.bookings.detail.save}
          </Button>
        </div>
      </SheetFooter>

      {/* Cancel-with-reason dialog */}
      <AlertDialog
        open={showCancel}
        onOpenChange={(next) => {
          if (cancelMutation.isPending) return
          if (!next) setCancelReason('')
          setShowCancel(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.bookings.cancel.dialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.bookings.cancel.dialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-cancel-reason">
              {t.bookings.cancel.reasonLabel}
            </Label>
            <Textarea
              id="bk-cancel-reason"
              value={cancelReason}
              onChange={(e) => setCancelReason(e.target.value)}
              placeholder={t.bookings.cancel.reasonPlaceholder}
              disabled={cancelMutation.isPending}
              rows={4}
            />
            {!cancelReasonReady && cancelReason.length > 0 ? (
              <p className="text-destructive text-xs" role="alert">
                {t.bookings.cancel.reasonTooShort}
              </p>
            ) : null}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelMutation.isPending}>
              {t.bookings.cancel.cancelAction}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={!cancelReasonReady || cancelMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                if (!cancelReasonReady) return
                cancelMutation.mutate()
              }}
              variant="destructive"
            >
              {cancelMutation.isPending
                ? t.bookings.cancel.cancelling
                : t.bookings.cancel.confirmAction}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Hotel-unblock confirmation */}
      <AlertDialog
        open={showUnblock}
        onOpenChange={(next) => {
          if (unblockMutation.isPending) return
          setShowUnblock(next)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.bookings.hotelUnblock.label}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.bookings.hotelUnblock.description}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={unblockMutation.isPending}>
              {t.bookings.hotelUnblock.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={unblockMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                unblockMutation.mutate()
              }}
            >
              {unblockMutation.isPending
                ? t.bookings.hotelUnblock.working
                : t.bookings.hotelUnblock.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
