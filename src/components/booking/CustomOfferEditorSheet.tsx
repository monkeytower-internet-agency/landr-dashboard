import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Plus, Trash2 } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
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
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  mobileSheetContent,
  mobileSheetHeader,
  mobileSheetBody,
  mobileSheetFooter,
} from '@/lib/mobile-sheet-classes'
import {
  clearCustomOffer,
  fetchCustomOffer,
  putCustomOffer,
  type CustomOffer,
  type CustomOfferLineInput,
} from '@/lib/customOffer'
import { invalidateBookingCaches } from '@/lib/bookings'
import { t } from '@/lib/strings'

type Props = {
  bookingId: string | null
  operatorId: string
  onClose: () => void
}

// A line as edited in the form. Prices are kept as raw strings so the
// operator can type freely; we only coerce on save.
type DraftLine = {
  key: string
  label: string
  unitPrice: string
  isFree: boolean
  // Carried through so an existing participant link survives a re-save.
  participantId: string | null
}

let _keySeq = 0
function nextKey(): string {
  _keySeq += 1
  return `line-${_keySeq}`
}

function parsePrice(raw: string): number {
  const n = Number.parseFloat(raw.replace(',', '.'))
  return Number.isFinite(n) && n >= 0 ? n : 0
}

export function CustomOfferEditorSheet({ bookingId, operatorId, onClose }: Props) {
  const open = bookingId !== null
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      {/* landr-3qkr.3 — full-screen below md. */}
      <SheetContent
        className={cn('w-full sm:max-w-lg flex flex-col overflow-hidden', mobileSheetContent)}
      >
        {bookingId ? (
          <CustomOfferEditorBody
            key={bookingId}
            bookingId={bookingId}
            operatorId={operatorId}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = {
  bookingId: string
  operatorId: string
  onClose: () => void
}

function CustomOfferEditorBody({ bookingId, operatorId, onClose }: BodyProps) {
  const isMobile = useIsMobile()
  const qc = useQueryClient()
  const queryKey = ['custom-offer', operatorId, bookingId] as const

  const { data, isLoading, error } = useQuery<CustomOffer>({
    queryKey,
    queryFn: () => fetchCustomOffer(operatorId, bookingId),
    enabled: !!bookingId,
  })

  // ---- Local draft state, seeded once from the server response --------
  const [lines, setLines] = useState<DraftLine[] | null>(null)
  // Para42 contract defaults: discount when pax > 6, IGIC 7%.
  const [threshold, setThreshold] = useState('6')
  const [discountPct, setDiscountPct] = useState('0') // whole percent in the UI
  const [taxPct, setTaxPct] = useState('7')
  const [seeded, setSeeded] = useState(false)

  // Seed the form from the loaded offer exactly once.
  if (!seeded && data) {
    const seededLines: DraftLine[] = data.lines.length
      ? data.lines.map((ln) => ({
          key: nextKey(),
          label: ln.label ?? '',
          unitPrice: ln.is_free ? '0' : ln.unit_price,
          isFree: ln.is_free,
          participantId: ln.booking_participant_id,
        }))
      : [{ key: nextKey(), label: '', unitPrice: '0', isFree: false, participantId: null }]
    setLines(seededLines)
    if (data.group_threshold != null) setThreshold(String(data.group_threshold))
    if (data.group_discount_pct != null) {
      // server stores a fraction (0.10); UI shows whole percent (10).
      setDiscountPct(String(Math.round(Number(data.group_discount_pct) * 100)))
    }
    setSeeded(true)
  }

  const effectiveLines = useMemo(() => lines ?? [], [lines])

  // ---- Live preview (mirrors the server math) -------------------------
  const preview = useMemo(() => {
    const payingLines = effectiveLines.filter((l) => !l.isFree)
    const freeCount = effectiveLines.length - payingLines.length
    const subtotal = payingLines.reduce((s, l) => s + parsePrice(l.unitPrice), 0)
    const thr = Number.parseInt(threshold, 10)
    const pct = parsePrice(discountPct) / 100
    const discountApplies =
      Number.isFinite(thr) && pct > 0 && payingLines.length > thr
    const net = +(subtotal * (1 - (discountApplies ? pct : 0))).toFixed(2)
    const tax = +(net * (parsePrice(taxPct) / 100)).toFixed(2)
    const gross = +(net + tax).toFixed(2)
    return {
      payingCount: payingLines.length,
      freeCount,
      net,
      tax,
      gross,
      discountApplies,
    }
  }, [effectiveLines, threshold, discountPct, taxPct])

  const saveMutation = useMutation({
    mutationFn: () => {
      const payload: CustomOfferLineInput[] = effectiveLines.map((l, i) => ({
        booking_participant_id: l.participantId,
        label: l.label.trim() || null,
        unit_price: l.isFree ? '0.00' : parsePrice(l.unitPrice).toFixed(2),
        is_free: l.isFree,
        sort_order: i,
      }))
      const pct = parsePrice(discountPct) / 100
      return putCustomOffer(operatorId, bookingId, {
        lines: payload,
        group_threshold: Math.max(0, Number.parseInt(threshold, 10) || 0),
        group_discount_pct: (pct >= 1 ? 0 : pct).toFixed(4),
        tax_rate: (parsePrice(taxPct) / 100).toFixed(4),
      })
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      invalidateBookingCaches(qc)
      toast.success(t.bookings.customOffer.saved)
      onClose()
    },
    onError: (e) => toast.error((e as Error).message || t.bookings.customOffer.saveFailed),
  })

  const clearMutation = useMutation({
    mutationFn: () => clearCustomOffer(operatorId, bookingId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey })
      invalidateBookingCaches(qc)
      toast.success(t.bookings.customOffer.cleared)
      onClose()
    },
    onError: (e) => toast.error((e as Error).message || t.bookings.customOffer.saveFailed),
  })

  const busy = saveMutation.isPending || clearMutation.isPending

  function updateLine(key: string, patch: Partial<DraftLine>) {
    setLines((cur) =>
      (cur ?? []).map((l) => (l.key === key ? { ...l, ...patch } : l)),
    )
  }
  function addLine() {
    setLines((cur) => [
      ...(cur ?? []),
      { key: nextKey(), label: '', unitPrice: '0', isFree: false, participantId: null },
    ])
  }
  function removeLine(key: string) {
    setLines((cur) => (cur ?? []).filter((l) => l.key !== key))
  }

  if (isLoading) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>{t.bookings.customOffer.title}</SheetTitle>
          <SheetDescription className="sr-only">
            {t.bookings.customOffer.description}
          </SheetDescription>
        </SheetHeader>
        <p className="text-muted-foreground p-4 text-sm">{t.bookings.detail.saving}</p>
      </>
    )
  }

  if (error || !data) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>{t.bookings.customOffer.title}</SheetTitle>
          <SheetDescription className="sr-only">
            {t.bookings.customOffer.description}
          </SheetDescription>
        </SheetHeader>
        <p className="text-destructive p-4 text-sm">
          {(error as Error | null)?.message ?? 'Failed to load custom offer.'}
        </p>
      </>
    )
  }

  return (
    <>
      {/* landr-3qkr.3 — sticky header below md with notch clearance. */}
      <SheetHeader className={cn('p-4', isMobile && mobileSheetHeader)}>
        <SheetTitle>{t.bookings.customOffer.title}</SheetTitle>
        <SheetDescription>{t.bookings.customOffer.description}</SheetDescription>
      </SheetHeader>

      {/* landr-3qkr.3 — pb-safe via mobileSheetBody. */}
      <div className={cn('flex-1 overflow-y-auto px-1 py-2 flex flex-col gap-4', mobileSheetBody)}>
        {/* ---- Per-participant lines ---- */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <Label className="text-sm font-medium">
              {t.bookings.customOffer.linesLabel}
            </Label>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={addLine}
              disabled={busy}
              data-testid="custom-offer-add-line"
            >
              <Plus className="size-4" />
              {t.bookings.customOffer.addLine}
            </Button>
          </div>

          {effectiveLines.map((l) => (
            <div
              key={l.key}
              className="flex items-center gap-2 rounded-md border p-2"
              data-testid="custom-offer-line"
            >
              <Input
                value={l.label}
                onChange={(e) => updateLine(l.key, { label: e.target.value })}
                placeholder={t.bookings.customOffer.linePlaceholder}
                disabled={busy}
                className="flex-1"
                aria-label={t.bookings.customOffer.linePlaceholder}
              />
              <Input
                type="number"
                min={0}
                step="0.01"
                value={l.isFree ? '0' : l.unitPrice}
                onChange={(e) => updateLine(l.key, { unitPrice: e.target.value })}
                disabled={busy || l.isFree}
                className="w-24"
                aria-label={t.bookings.customOffer.priceLabel}
                data-testid="custom-offer-line-price"
              />
              <label className="flex items-center gap-1 text-xs whitespace-nowrap">
                <Checkbox
                  checked={l.isFree}
                  onChange={(e) =>
                    updateLine(l.key, {
                      isFree: e.target.checked,
                      unitPrice: e.target.checked ? '0' : l.unitPrice,
                    })
                  }
                  disabled={busy}
                  data-testid="custom-offer-line-free"
                />
                {t.bookings.customOffer.freeLabel}
              </label>
              <Button
                type="button"
                size="icon"
                variant="ghost"
                onClick={() => removeLine(l.key)}
                disabled={busy}
                aria-label={t.bookings.customOffer.removeLine}
              >
                <Trash2 className="size-4" />
              </Button>
            </div>
          ))}
          <p className="text-muted-foreground text-xs">
            {t.bookings.customOffer.freeHint}
          </p>
        </div>

        {/* ---- Group discount + tax ---- */}
        <div className="grid grid-cols-3 gap-3">
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t.bookings.customOffer.thresholdLabel}</Label>
            <Input
              type="number"
              min={0}
              value={threshold}
              onChange={(e) => setThreshold(e.target.value)}
              disabled={busy}
              data-testid="custom-offer-threshold"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t.bookings.customOffer.discountLabel}</Label>
            <Input
              type="number"
              min={0}
              max={99}
              value={discountPct}
              onChange={(e) => setDiscountPct(e.target.value)}
              disabled={busy}
              data-testid="custom-offer-discount"
            />
          </div>
          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t.bookings.customOffer.taxLabel}</Label>
            <Input
              type="number"
              min={0}
              max={99}
              value={taxPct}
              onChange={(e) => setTaxPct(e.target.value)}
              disabled={busy}
              data-testid="custom-offer-tax"
            />
          </div>
        </div>

        {/* ---- Live preview ---- */}
        <div className="rounded-md border bg-muted/30 p-3 text-sm flex flex-col gap-1">
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t.bookings.customOffer.payingCount}
            </span>
            <span>{preview.payingCount}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">
              {t.bookings.customOffer.freeCount}
            </span>
            <span data-testid="custom-offer-free-count">{preview.freeCount}</span>
          </div>
          {preview.discountApplies ? (
            <div className="flex justify-between text-emerald-600">
              <span>{t.bookings.customOffer.discountApplied}</span>
              <span>−{discountPct}%</span>
            </div>
          ) : null}
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.bookings.customOffer.netLabel}</span>
            <span data-testid="custom-offer-net">{preview.net.toFixed(2)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-muted-foreground">{t.bookings.customOffer.taxTotalLabel}</span>
            <span>{preview.tax.toFixed(2)}</span>
          </div>
          <div className="flex justify-between font-semibold">
            <span>{t.bookings.customOffer.grossLabel}</span>
            <span data-testid="custom-offer-gross">{preview.gross.toFixed(2)}</span>
          </div>
          <p className="text-muted-foreground text-xs pt-1">
            {t.bookings.customOffer.commissionFreeHint}
          </p>
        </div>
      </div>

      {/* landr-3qkr.3 — sticky bottom bar on mobile. */}
      <SheetFooter className={cn(
        'flex flex-row items-center justify-between gap-2 border-t pt-3',
        isMobile ? mobileSheetFooter : 'px-4 py-3',
      )}>
        {data.custom_offer_applied ? (
          <Button
            type="button"
            variant="outline"
            onClick={() => clearMutation.mutate()}
            disabled={busy}
            data-testid="custom-offer-clear"
          >
            {clearMutation.isPending ? t.bookings.detail.saving : t.bookings.customOffer.clear}
          </Button>
        ) : (
          <span />
        )}
        <div className="flex items-center gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={busy}>
            {t.bookings.customOffer.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={busy || effectiveLines.length === 0}
            data-testid="custom-offer-save"
          >
            {saveMutation.isPending ? t.bookings.detail.saving : t.bookings.customOffer.apply}
          </Button>
        </div>
      </SheetFooter>
    </>
  )
}
