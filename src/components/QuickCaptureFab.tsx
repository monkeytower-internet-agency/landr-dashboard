// landr-f18d (UI) + landr-eaqr (Save wire-up) — Quick-capture FAB.
//
// Globally-visible FAB (bottom-right corner, mounted by AppShell) that lets
// an operator capture a phone-call booking in 3 fields without leaving the
// current page. Click → modal Dialog with:
//   - Customer name (required)
//   - Customer email (required)
//   - Product (NativeSelect, populated from fetchProducts for the current
//     operator, filtered to active+publicly-listed rows so we don't surface
//     archived SKUs or addon-only lines)
//   - Date (single ISO date — sufficient for the most common phone-capture
//     case of a one-day booking; multi-day capture stays in the full
//     BookingDetailSheet flow)
//
// On Save (landr-eaqr):
//   1. POST /api/staff/operators/{operatorId}/bookings/quick-create with
//      the 4 fields (see @/lib/booking-create). The endpoint upserts the
//      contact by email, drafts the booking + line at price, and returns
//      { booking_id, contact_id }.
//   2. Invalidate the ['bookings', operatorId] query so the bookings table
//      and notifications counter pick up the new row immediately.
//   3. Navigate to /bookings?open=<booking_id> — the landr-ne58
//      deep-link effect on the Bookings route picks the param up and
//      opens BookingDetailSheet for the new row, where the operator
//      can fill in participants, addons, and any pricing overrides.
//   4. On error (422/400 from the endpoint) surface a toast carrying
//      the server's `detail.error` code so the operator sees
//      "product_not_found" / "drafted_stage_missing" rather than a
//      generic HTTP code.

import { useMemo, useState } from 'react'
import { PlusIcon } from 'lucide-react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  quickCreateBooking,
  type QuickCreateBookingResult,
} from '@/lib/booking-create'
import { fetchProducts, type ProductRow } from '@/lib/products'
import { useOperator } from '@/lib/operator'

// Same trivial regex the public widget uses for inline email validation —
// keep it permissive (server is the source of truth) but enough to catch
// the obvious typos before the operator hits Save.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10)
}

export function QuickCaptureFab() {
  const { currentOperatorId } = useOperator()
  const [open, setOpen] = useState(false)

  // Hide the FAB until an operator is selected. The shell renders us
  // unconditionally inside the protected tree, but the operator context can
  // be null on first paint while membership loads (or for landr staff who
  // briefly have no operator selected). Bailing here prevents the FAB from
  // flashing in and the dialog from opening into an empty product list.
  if (!currentOperatorId) return null

  return (
    <>
      <Button
        type="button"
        size="icon-lg"
        aria-label="Quick capture booking"
        title="Quick capture booking"
        // landr-3qkr.6 — bottom-safe-6 keeps the FAB clear of the
        // home-indicator on notched phones (plain bottom-6 tucked it partly
        // under the gesture bar). No-ops to 1.5rem where there's no inset.
        className="fixed bottom-safe-6 right-6 z-30 rounded-full shadow-lg"
        onClick={() => setOpen(true)}
        data-testid="quick-capture-fab"
      >
        <PlusIcon className="size-5" aria-hidden />
      </Button>
      <QuickCaptureDialog
        operatorId={currentOperatorId}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}

type DialogProps = {
  operatorId: string
  open: boolean
  onOpenChange: (open: boolean) => void
}

function QuickCaptureDialog({ operatorId, open, onOpenChange }: DialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Quick capture booking</DialogTitle>
          <DialogDescription>
            Capture a phone booking in three fields. You can fill in the rest
            (participants, pricing overrides, notes) afterwards on the
            booking detail.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <QuickCaptureBody
            operatorId={operatorId}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type BodyProps = {
  operatorId: string
  onClose: () => void
}

function QuickCaptureBody({ operatorId, onClose }: BodyProps) {
  const [customerName, setCustomerName] = useState('')
  const [customerEmail, setCustomerEmail] = useState('')
  const [productId, setProductId] = useState('')
  const [date, setDate] = useState(() => todayIsoDate())

  const qc = useQueryClient()
  const navigate = useNavigate()

  const productsQuery = useQuery<ProductRow[]>({
    queryKey: ['quick-capture-products', operatorId],
    queryFn: () => fetchProducts(operatorId),
  })

  const createMutation = useMutation<
    QuickCreateBookingResult,
    Error,
    {
      customer_name: string
      customer_email: string
      product_id: string
      date: string
    }
  >({
    mutationFn: (payload) => quickCreateBooking(operatorId, payload),
    onSuccess: (result) => {
      // Refresh the bookings table + notifications counter so the new
      // row is visible the moment the detail sheet opens. We invalidate
      // the broad ['bookings'] prefix to catch both the operator-scoped
      // list and the approvals counter (mirrors useRealtimeQuery's
      // realtime-tick behaviour for a parity-flush after a mutation).
      void qc.invalidateQueries({ queryKey: ['bookings'] })
      onClose()
      // Deep-link to the new booking — Bookings.tsx's `?open=` effect
      // (landr-ne58) reads the param and pops the detail sheet for
      // result.booking_id once the bookings query resolves.
      navigate(`/bookings?open=${result.booking_id}`)
    },
    onError: (err) => {
      // The api() helper unwraps FastAPI's `detail.error` strings into
      // the thrown Error's message — surface verbatim so the operator
      // sees `product_not_found` or `drafted_stage_missing` rather than
      // a generic HTTP code.
      toast.error(`Couldn't create booking: ${err.message}`)
    },
  })

  // Same filter the public widget applies: only active, publicly-listed,
  // non-addon-only products are bookable end-to-end. Addon-only rows (e.g.
  // "Insurance") aren't valid as the primary line.
  const eligibleProducts = useMemo(() => {
    const rows = productsQuery.data ?? []
    return rows.filter(
      (p) => p.active && p.is_publicly_listed && !p.is_addon_only,
    )
  }, [productsQuery.data])

  // Auto-select the first eligible product so a fast operator can name,
  // email, date, Save without an extra dropdown click.
  if (productId === '' && eligibleProducts.length > 0) {
    setProductId(eligibleProducts[0].id)
  }
  // Drop the selection if the product list changes and our pick no longer
  // qualifies (e.g. operator just archived it from another tab).
  if (
    productId !== '' &&
    productsQuery.data &&
    !eligibleProducts.some((p) => p.id === productId)
  ) {
    setProductId('')
  }

  const trimmedName = customerName.trim()
  const trimmedEmail = customerEmail.trim()
  const emailValid = EMAIL_RE.test(trimmedEmail)
  const dateValid = /^\d{4}-\d{2}-\d{2}$/.test(date)
  const canSubmit =
    trimmedName.length > 0 &&
    emailValid &&
    productId !== '' &&
    dateValid &&
    !productsQuery.isPending &&
    !createMutation.isPending

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (!canSubmit) return
    createMutation.mutate({
      customer_name: trimmedName,
      customer_email: trimmedEmail,
      product_id: productId,
      date,
    })
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="qc-customer-name" className="text-xs">
            Customer name
          </Label>
          <Input
            id="qc-customer-name"
            autoFocus
            autoComplete="off"
            value={customerName}
            onChange={(e) => setCustomerName(e.target.value)}
            placeholder="Jane Doe"
          />
        </div>

        <div className="space-y-1">
          <Label htmlFor="qc-customer-email" className="text-xs">
            Customer email
          </Label>
          <Input
            id="qc-customer-email"
            type="email"
            autoComplete="off"
            value={customerEmail}
            onChange={(e) => setCustomerEmail(e.target.value)}
            placeholder="jane@example.com"
            aria-invalid={
              customerEmail.length > 0 && !emailValid ? true : undefined
            }
          />
          {customerEmail.length > 0 && !emailValid ? (
            <p className="text-destructive text-xs">
              Enter a valid email address.
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="qc-product" className="text-xs">
            Product
          </Label>
          <NativeSelect
            id="qc-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={productsQuery.isPending || eligibleProducts.length === 0}
          >
            {eligibleProducts.length === 0 ? (
              <option value="">— no bookable product —</option>
            ) : null}
            {eligibleProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          {productsQuery.isSuccess && eligibleProducts.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No active, publicly-listed product yet. Add one in Settings →
              Products to enable quick capture.
            </p>
          ) : null}
        </div>

        <div className="space-y-1">
          <Label htmlFor="qc-date" className="text-xs">
            Date
          </Label>
          <Input
            id="qc-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      <DialogFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={createMutation.isPending}
        >
          Cancel
        </Button>
        <Button type="submit" disabled={!canSubmit}>
          {createMutation.isPending ? 'Saving…' : 'Save'}
        </Button>
      </DialogFooter>
    </form>
  )
}
