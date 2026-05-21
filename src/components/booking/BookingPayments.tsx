// landr-uzup — Payments tab inside BookingDetailSheet.
//
// Lists every payments + payment_refunds row for the open booking, with
// a "Refund" action on each succeeded/partially_refunded payment.
//
// The list is fetched directly via Supabase REST (RLS already scopes
// rows to the caller's operator); writes go through the FastAPI refund
// endpoint because the server has to validate refundable_remaining and
// write an audit row. After a successful refund, the component
// invalidates its own query AND the parent booking caches so
// balance_due / current_stage updates flow through.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Undo2 } from 'lucide-react'

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
import { Textarea } from '@/components/ui/textarea'
import {
  canRefundPayment,
  fetchBookingPayments,
  invalidateBookingCaches,
  numberFormatter,
  refundableRemainingOf,
  refundPayment,
  type BookingPaymentRow,
  type BookingRefundRow,
} from '@/lib/bookings'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string | null
  bookingId: string
  bookingCurrency: string | null
}

const PAYMENTS_QUERY_KEY = 'booking-payments'

function paymentsQueryKey(bookingId: string) {
  return [PAYMENTS_QUERY_KEY, bookingId] as const
}

function formatTimestamp(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return d.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function providerLabel(provider: string): string {
  switch (provider) {
    case 'stripe':
      return t.bookings.payments.providerStripe
    case 'manual_cash':
      return t.bookings.payments.providerCash
    case 'manual_transfer':
      return t.bookings.payments.providerTransfer
    case 'manual_card':
      return t.bookings.payments.providerCard
    case 'imported_historical':
      return t.bookings.payments.providerImported
    default:
      return provider
  }
}

function paymentStatusLabel(status: string): string {
  switch (status) {
    case 'succeeded':
      return t.bookings.payments.statusSucceeded
    case 'pending':
      return t.bookings.payments.statusPending
    case 'failed':
      return t.bookings.payments.statusFailed
    case 'refunded':
      return t.bookings.payments.statusRefunded
    case 'partially_refunded':
      return t.bookings.payments.statusPartiallyRefunded
    default:
      return status
  }
}

function refundStatusLabel(status: string): string {
  switch (status) {
    case 'succeeded':
      return t.bookings.payments.refundStatusSucceeded
    case 'pending':
      return t.bookings.payments.refundStatusPending
    case 'failed':
      return t.bookings.payments.refundStatusFailed
    default:
      return status
  }
}

export function BookingPayments({ operatorId, bookingId, bookingCurrency }: Props) {
  const queryClient = useQueryClient()
  const [refundTarget, setRefundTarget] = useState<BookingPaymentRow | null>(null)
  const [refundAmount, setRefundAmount] = useState<string>('')
  const [refundReason, setRefundReason] = useState<string>('')

  const paymentsQuery = useQuery({
    queryKey: paymentsQueryKey(bookingId),
    queryFn: () => fetchBookingPayments(bookingId),
  })

  const refundMutation = useMutation({
    mutationFn: async () => {
      if (!operatorId) throw new Error('No operator selected.')
      if (!refundTarget) throw new Error('No payment selected.')
      const trimmedAmount = refundAmount.trim()
      const trimmedReason = refundReason.trim()
      return refundPayment(operatorId, bookingId, refundTarget.id, {
        amount: trimmedAmount.length > 0 ? trimmedAmount : null,
        reason: trimmedReason.length > 0 ? trimmedReason : null,
      })
    },
    onSuccess: () => {
      toast.success(t.bookings.payments.refundToastSuccess)
      setRefundTarget(null)
      setRefundAmount('')
      setRefundReason('')
      // Refresh this panel + the parent booking caches so balance_due
      // and any downstream views (Bookings list, calendar) reflect the
      // new state.
      void queryClient.invalidateQueries({ queryKey: paymentsQueryKey(bookingId) })
      void invalidateBookingCaches(queryClient)
    },
    onError: (err: Error) => {
      toast.error(t.bookings.payments.refundToastError, {
        description: err.message,
      })
    },
  })

  const fmt = numberFormatter(bookingCurrency || 'EUR')

  if (paymentsQuery.isLoading) {
    return <p className="text-muted-foreground text-sm">{t.bookings.payments.loading}</p>
  }
  if (paymentsQuery.error) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {t.bookings.payments.error}
      </p>
    )
  }
  const data = paymentsQuery.data
  if (!data || (data.payments.length === 0 && data.refunds.length === 0)) {
    return <p className="text-muted-foreground text-sm">{t.bookings.payments.empty}</p>
  }

  // Group refunds by payment_id so each payment row carries its refunds.
  const refundsByPayment = new Map<string, BookingRefundRow[]>()
  for (const r of data.refunds) {
    const list = refundsByPayment.get(r.payment_id) ?? []
    list.push(r)
    refundsByPayment.set(r.payment_id, list)
  }

  return (
    <>
      <div className="flex flex-col gap-3" data-testid="booking-payments-list">
        {data.payments.map((p) => {
          const remaining = refundableRemainingOf(p)
          const refundable = canRefundPayment(p)
          const childRefunds = refundsByPayment.get(p.id) ?? []
          return (
            <Card key={p.id} data-testid={`booking-payment-${p.id}`}>
              <CardHeader className="flex flex-row items-start justify-between gap-3 pb-2">
                <div className="flex flex-col gap-0.5">
                  <CardTitle className="text-base">
                    {fmt.format(Number(p.amount))} · {providerLabel(p.provider)}
                  </CardTitle>
                  <p className="text-muted-foreground text-xs">
                    {paymentStatusLabel(p.status)} ·{' '}
                    {formatTimestamp(p.paid_at ?? p.created_at)}
                  </p>
                </div>
                {refundable && operatorId ? (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      setRefundTarget(p)
                      setRefundAmount(remaining.toFixed(2))
                      setRefundReason('')
                    }}
                    data-testid={`booking-payment-refund-btn-${p.id}`}
                  >
                    <Undo2 className="size-4" />
                    {t.bookings.payments.refundAction}
                  </Button>
                ) : null}
              </CardHeader>
              {Number(p.refunded_amount) > 0 || childRefunds.length > 0 ? (
                <CardContent className="flex flex-col gap-1.5 pt-0">
                  <p className="text-muted-foreground text-xs">
                    {t.bookings.payments.refundedSoFar(
                      fmt.format(Number(p.refunded_amount)),
                      fmt.format(remaining),
                    )}
                  </p>
                  {childRefunds.length > 0 ? (
                    <ul
                      className="border-l-muted-foreground/30 flex flex-col gap-1 border-l-2 pl-3 text-xs"
                      data-testid={`booking-payment-refunds-${p.id}`}
                    >
                      {childRefunds.map((r) => (
                        <li key={r.id} className="flex items-center justify-between gap-2">
                          <span>
                            <span className="font-medium">
                              −{fmt.format(Number(r.refund_amount))}
                            </span>{' '}
                            · {refundStatusLabel(r.status)} ·{' '}
                            {formatTimestamp(r.completed_at ?? r.initiated_at)}
                          </span>
                          {r.reason ? (
                            <span
                              className="text-muted-foreground italic truncate max-w-[50%]"
                              title={r.reason}
                            >
                              {r.reason}
                            </span>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </CardContent>
              ) : null}
            </Card>
          )
        })}
      </div>

      {/* Refund dialog */}
      <AlertDialog
        open={refundTarget !== null}
        onOpenChange={(next) => {
          if (refundMutation.isPending) return
          if (!next) {
            setRefundTarget(null)
            setRefundAmount('')
            setRefundReason('')
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.bookings.payments.refundDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {refundTarget
                ? t.bookings.payments.refundDialogDescription(
                    fmt.format(refundableRemainingOf(refundTarget)),
                    providerLabel(refundTarget.provider),
                  )
                : ''}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-refund-amount">
                {t.bookings.payments.refundAmountLabel} ({bookingCurrency || 'EUR'})
              </Label>
              <Input
                id="bk-refund-amount"
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0.01"
                value={refundAmount}
                onChange={(e) => setRefundAmount(e.target.value)}
                disabled={refundMutation.isPending}
                data-testid="booking-refund-amount"
              />
              <p className="text-muted-foreground text-xs">
                {t.bookings.payments.refundAmountHint}
              </p>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="bk-refund-reason">
                {t.bookings.payments.refundReasonLabel}
              </Label>
              <Textarea
                id="bk-refund-reason"
                value={refundReason}
                onChange={(e) => setRefundReason(e.target.value)}
                placeholder={t.bookings.payments.refundReasonPlaceholder}
                disabled={refundMutation.isPending}
                rows={2}
                data-testid="booking-refund-reason"
              />
            </div>
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={refundMutation.isPending}>
              {t.bookings.payments.refundCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              disabled={refundMutation.isPending}
              onClick={(e) => {
                e.preventDefault()
                refundMutation.mutate()
              }}
              data-testid="booking-refund-confirm"
            >
              {refundMutation.isPending
                ? t.bookings.payments.refundWorking
                : t.bookings.payments.refundConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
