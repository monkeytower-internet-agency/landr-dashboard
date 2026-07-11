import { useMemo, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { fetchProducts, type ProductRow } from '@/lib/products'
import { formatCurrency } from '@/lib/reporting'
import {
  consecutiveDays,
  ruleKindLabel,
  simulateEstimate,
  type SimulateEstimateResponse,
} from '@/lib/pricing-simulator'

/**
 * Pricing-rule simulator dialog (landr-5gk7).
 *
 * Opens from the PricingSchemeEditorSheet header. The operator picks a
 * product that uses this scheme, a start date, a day count, and a
 * participants count; we POST the existing public estimate endpoint
 * (via lib/pricing-simulator) and render the resulting grand total +
 * a per-rule before/after trace.
 *
 * Constraints worth knowing:
 *  - The public endpoint requires `active=true` AND `is_publicly_listed=true`;
 *    we filter the product picker to those rows + scope to products whose
 *    default_pricing_scheme_id points at the current scheme. If no
 *    product qualifies we surface a hint rather than disabling the
 *    dialog entirely (operators should still see WHY they can't preview).
 *  - The simulator never writes any DB rows — it's a pure read+compute,
 *    so re-running is safe and free.
 *  - Voucher codes are intentionally NOT exposed here: the public
 *    estimate body doesn't accept voucher_code today (see
 *    public_operators.EstimateRequest); when that lands we'll add a
 *    field and a 'Voucher applied' row to the trace.
 */

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  schemeId: string
  operatorId: string
  /** landr-wl7h — the operator's opaque widget_token, NOT the slug. The
   * public estimate endpoint's {token} path segment resolves against
   * widget_token; passing the slug 404s every time. */
  widgetToken: string
  /** Display-only; piped into the dialog header so the operator can confirm scope. */
  schemeName: string
}

export function SimulateDialog({
  open,
  onOpenChange,
  schemeId,
  operatorId,
  widgetToken,
  schemeName,
}: Props) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Simulate pricing</DialogTitle>
          <DialogDescription>
            Preview how rules in <span className="font-medium">{schemeName}</span>{' '}
            fire on a dummy booking. Nothing is saved.
          </DialogDescription>
        </DialogHeader>
        {open ? (
          <SimulateDialogBody
            schemeId={schemeId}
            operatorId={operatorId}
            widgetToken={widgetToken}
          />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

type BodyProps = {
  schemeId: string
  operatorId: string
  widgetToken: string
}

function SimulateDialogBody({ schemeId, operatorId, widgetToken }: BodyProps) {
  // Default start date = today. Default 1 day, 1 participant — minimal
  // valid request the operator can immediately fire to see a baseline.
  const today = useMemo(() => new Date().toISOString().slice(0, 10), [])
  const [productId, setProductId] = useState<string>('')
  const [startDate, setStartDate] = useState(today)
  const [dayCount, setDayCount] = useState(1)
  const [participants, setParticipants] = useState(1)
  const [lastResult, setLastResult] = useState<SimulateEstimateResponse | null>(
    null,
  )

  // All products for this operator. We filter client-side so the
  // dropdown's empty-state hint can distinguish "no products at all"
  // from "no products using this scheme" from "no publicly-listed
  // products" — three failure modes the operator needs to debug
  // separately.
  const productsQuery = useQuery<ProductRow[]>({
    queryKey: ['products-for-simulator', operatorId],
    queryFn: () => fetchProducts(operatorId),
    enabled: !!operatorId,
  })

  const eligibleProducts = useMemo(() => {
    const rows = productsQuery.data ?? []
    return rows.filter(
      (p) =>
        p.default_pricing_scheme_id === schemeId &&
        p.is_publicly_listed &&
        p.active,
    )
  }, [productsQuery.data, schemeId])

  // Auto-select the first eligible product so the operator can hit
  // 'Simulate' without an extra click in the common case (one scheme,
  // one product).
  if (productId === '' && eligibleProducts.length > 0) {
    setProductId(eligibleProducts[0].id)
  }
  // Drop the selection if the user switches schemes and the previously
  // picked product no longer qualifies — keeps the dropdown honest.
  if (
    productId !== '' &&
    productsQuery.data &&
    !eligibleProducts.some((p) => p.id === productId)
  ) {
    setProductId('')
  }

  const simulateMutation = useMutation({
    mutationFn: async () => {
      const days = consecutiveDays(startDate, dayCount)
      return simulateEstimate(widgetToken, productId, {
        selected_days: days,
        participants_count: participants,
      })
    },
    onSuccess: (result) => setLastResult(result),
  })

  const canSubmit =
    productId !== '' &&
    dayCount >= 1 &&
    participants >= 1 &&
    !simulateMutation.isPending &&
    /^\d{4}-\d{2}-\d{2}$/.test(startDate)

  return (
    <div className="space-y-4">
      {/* Inputs */}
      <div className="space-y-3">
        <div className="space-y-1">
          <Label htmlFor="sim-product" className="text-xs">
            Product
          </Label>
          <NativeSelect
            id="sim-product"
            value={productId}
            onChange={(e) => setProductId(e.target.value)}
            disabled={productsQuery.isPending || eligibleProducts.length === 0}
          >
            {eligibleProducts.length === 0 ? (
              <option value="">— no eligible product —</option>
            ) : null}
            {eligibleProducts.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </NativeSelect>
          {productsQuery.isSuccess && eligibleProducts.length === 0 ? (
            <p className="text-muted-foreground text-xs">
              No publicly-listed product uses this scheme yet. Assign the
              scheme to a product and make it publicly listed to simulate.
            </p>
          ) : null}
        </div>

        {/* landr-3qkr.6 — stack to one column below sm so the native date
            picker + number inputs aren't squeezed to ~96px on a 360px phone;
            three across from sm up (desktop unchanged). */}
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="space-y-1">
            <Label htmlFor="sim-start" className="text-xs">
              Start date
            </Label>
            <Input
              id="sim-start"
              type="date"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sim-days" className="text-xs">
              Days
            </Label>
            <Input
              id="sim-days"
              type="number"
              min={1}
              value={dayCount}
              onChange={(e) => setDayCount(Math.max(1, Number(e.target.value)))}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="sim-participants" className="text-xs">
              Participants
            </Label>
            <Input
              id="sim-participants"
              type="number"
              min={1}
              value={participants}
              onChange={(e) =>
                setParticipants(Math.max(1, Number(e.target.value)))
              }
            />
          </div>
        </div>

        <div className="flex justify-end">
          <Button
            type="button"
            onClick={() => simulateMutation.mutate()}
            disabled={!canSubmit}
          >
            {simulateMutation.isPending ? 'Simulating…' : 'Simulate'}
          </Button>
        </div>
      </div>

      {/* Error */}
      {simulateMutation.isError ? (
        <p className="text-destructive text-sm">
          {(simulateMutation.error as Error).message}
        </p>
      ) : null}

      {/* Result */}
      {lastResult ? <SimulateResult result={lastResult} /> : null}
    </div>
  )
}

function SimulateResult({ result }: { result: SimulateEstimateResponse }) {
  const grand = Number(result.grand_total)
  return (
    <div className="space-y-3 border-t pt-4">
      <div className="flex items-baseline justify-between">
        <p className="text-sm font-medium">Computed price</p>
        <p className="text-xl font-semibold">
          {formatCurrency(grand, result.currency)}
        </p>
      </div>

      {/* Per-line breakdown — main product + any add-ons. */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Line items</p>
        <ul className="space-y-1">
          {result.line_items.map((li, i) => (
            <li
              key={`${li.product_id}-${i}`}
              className="flex justify-between text-sm"
            >
              <span>
                {li.label}
                {li.qty > 1 ? ` × ${li.qty}` : ''}
                {li.units > 0 ? ` (${li.units})` : ''}
              </span>
              <span className="tabular-nums">
                {formatCurrency(Number(li.line_total), result.currency)}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {/* Applied rule trace — the marquee feature: shows WHICH rules fired
          and how the running total changed at each step. */}
      <div className="space-y-1">
        <p className="text-xs text-muted-foreground">Rules fired</p>
        {result.applied_rules.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            No rules fired (e.g. zero-day input, or no rules active).
          </p>
        ) : (
          <ul className="space-y-1">
            {result.applied_rules.map((r, i) => {
              const delta = r.after - r.before
              const sign = delta > 0 ? '+' : ''
              return (
                <li
                  key={`${r.rule_id}-${i}`}
                  className="flex items-baseline justify-between gap-2 text-sm"
                >
                  <span className="min-w-0 truncate">
                    {ruleKindLabel(r.kind)}
                  </span>
                  <span className="text-muted-foreground tabular-nums text-xs">
                    {formatCurrency(r.before, result.currency)} →{' '}
                    {formatCurrency(r.after, result.currency)}
                    {delta !== 0 ? (
                      <span
                        className={
                          delta > 0
                            ? 'text-foreground ml-1'
                            : 'text-emerald-600 ml-1'
                        }
                      >
                        ({sign}
                        {formatCurrency(delta, result.currency)})
                      </span>
                    ) : null}
                  </span>
                </li>
              )
            })}
          </ul>
        )}
      </div>
    </div>
  )
}
