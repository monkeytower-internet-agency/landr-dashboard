import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createTier,
  deleteTier,
  patchTier,
  type PricingTier,
  type RuleKind,
} from '@/lib/pricingSchemes'

type Props = {
  tiers: PricingTier[]
  ruleId: string
  operatorId: string
  ruleKind: RuleKind
  currency: string
  onRefetch: () => void
}

function thresholdLabel(ruleKind: RuleKind): string {
  return ruleKind === 'per_participant_tier' ? 'Participants' : 'Days'
}

function amountLabel(ruleKind: RuleKind, currency: string): string {
  switch (ruleKind) {
    case 'per_day_base':
    case 'per_streak_tier':
    case 'per_total_days_tier':
      return `${currency}/day`
    case 'per_participant_tier':
      return `${currency}/person`
    default:
      return currency
  }
}

// Which amount field does this rule kind use?
function usesAmountPerUnit(ruleKind: RuleKind): boolean {
  return [
    'per_day_base',
    'per_streak_tier',
    'per_total_days_tier',
    'per_participant_tier',
  ].includes(ruleKind)
}

// ---- Individual tier row ------------------------------------------------

type TierRowProps = {
  tier: PricingTier
  operatorId: string
  ruleKind: RuleKind
  currency: string
  onDeleted: () => void
  onRefetch: () => void
}

function TierRow({ tier, operatorId, ruleKind, currency, onDeleted, onRefetch }: TierRowProps) {
  const perUnit = usesAmountPerUnit(ruleKind)

  const [minVal, setMinVal] = useState(String(tier.threshold_min))
  const [maxVal, setMaxVal] = useState(
    tier.threshold_max != null ? String(tier.threshold_max) : '',
  )
  const [amountVal, setAmountVal] = useState(
    String(perUnit ? (tier.amount_per_unit ?? '') : (tier.amount_total ?? '')),
  )

  const patchMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchTier>[2]) =>
      patchTier(operatorId, tier.id, body),
    onSuccess: () => onRefetch(),
    onError: (err: Error) => toast.error(`Failed to update tier: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteTier(operatorId, tier.id),
    onSuccess: onDeleted,
    onError: (err: Error) => toast.error(`Failed to delete tier: ${err.message}`),
  })

  function saveMin() {
    const v = parseInt(minVal, 10)
    if (isNaN(v) || v < 0) { setMinVal(String(tier.threshold_min)); return }
    if (v === tier.threshold_min) return
    patchMutation.mutate({ threshold_min: v })
  }

  function saveMax() {
    if (maxVal === '') {
      if (tier.threshold_max === null) return
      patchMutation.mutate({ threshold_max: null })
      return
    }
    const v = parseInt(maxVal, 10)
    if (isNaN(v) || v < 0) {
      setMaxVal(tier.threshold_max != null ? String(tier.threshold_max) : '')
      return
    }
    if (v === tier.threshold_max) return
    patchMutation.mutate({ threshold_max: v })
  }

  function saveAmount() {
    const v = parseFloat(amountVal)
    if (isNaN(v)) {
      setAmountVal(String(perUnit ? (tier.amount_per_unit ?? '') : (tier.amount_total ?? '')))
      return
    }
    const current = perUnit ? tier.amount_per_unit : tier.amount_total
    if (v === current) return
    patchMutation.mutate(
      perUnit ? { amount_per_unit: v } : { amount_total: v },
    )
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-1 pr-2">
        <Input
          className="h-7 w-20 text-sm"
          value={minVal}
          onChange={(e) => setMinVal(e.target.value)}
          onBlur={saveMin}
          type="number"
          min={0}
        />
      </td>
      <td className="py-1 pr-2">
        <Input
          className="h-7 w-20 text-sm"
          value={maxVal}
          onChange={(e) => setMaxVal(e.target.value)}
          onBlur={saveMax}
          placeholder="∞"
          type="number"
          min={0}
        />
      </td>
      <td className="py-1 pr-2">
        <Input
          className="h-7 w-28 text-sm"
          value={amountVal}
          onChange={(e) => setAmountVal(e.target.value)}
          onBlur={saveAmount}
          type="number"
          step="0.01"
          min={0}
        />
      </td>
      <td className="py-1">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Delete tier"
          disabled={deleteMutation.isPending}
          onClick={() => deleteMutation.mutate()}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </td>
    </tr>
  )
}

// ---- Add-tier row -------------------------------------------------------

type AddTierRowProps = {
  ruleId: string
  operatorId: string
  ruleKind: RuleKind
  currency: string
  onAdded: () => void
}

function AddTierRow({ ruleId, operatorId, ruleKind, currency, onAdded }: AddTierRowProps) {
  const perUnit = usesAmountPerUnit(ruleKind)
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [amount, setAmount] = useState('')

  const createMutation = useMutation({
    mutationFn: () => {
      const minV = parseInt(min, 10)
      if (isNaN(minV) || minV < 0) throw new Error('Min must be a non-negative integer')
      const amountV = parseFloat(amount)
      if (isNaN(amountV)) throw new Error('Amount is required')
      const maxV = max !== '' ? parseInt(max, 10) : undefined
      return createTier(operatorId, ruleId, {
        threshold_min: minV,
        threshold_max: maxV ?? null,
        ...(perUnit ? { amount_per_unit: amountV } : { amount_total: amountV }),
        currency,
      })
    },
    onSuccess: () => {
      setMin('')
      setMax('')
      setAmount('')
      onAdded()
    },
    onError: (err: Error) => toast.error(`Failed to add tier: ${err.message}`),
  })

  return (
    <tr className="border-t">
      <td className="pt-2 pr-2">
        <Input
          className="h-7 w-20 text-sm"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="0"
          type="number"
          min={0}
        />
      </td>
      <td className="pt-2 pr-2">
        <Input
          className="h-7 w-20 text-sm"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder="∞"
          type="number"
          min={0}
        />
      </td>
      <td className="pt-2 pr-2">
        <Input
          className="h-7 w-28 text-sm"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0.00"
          type="number"
          step="0.01"
          min={0}
        />
      </td>
      <td className="pt-2">
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Add tier"
          disabled={createMutation.isPending || !min || !amount}
          onClick={() => createMutation.mutate()}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </td>
    </tr>
  )
}

// ---- TierTable ----------------------------------------------------------

export function TierTable({
  tiers,
  ruleId,
  operatorId,
  ruleKind,
  currency,
  onRefetch,
}: Props) {
  const thLabel = thresholdLabel(ruleKind)
  const amLabel = amountLabel(ruleKind, currency)

  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs">
            <th className="pb-1 pr-2 text-left font-medium">Min ({thLabel})</th>
            <th className="pb-1 pr-2 text-left font-medium">Max ({thLabel})</th>
            <th className="pb-1 pr-2 text-left font-medium">Amount ({amLabel})</th>
            <th className="pb-1" />
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => (
            <TierRow
              key={tier.id}
              tier={tier}
              operatorId={operatorId}
              ruleKind={ruleKind}
              currency={currency}
              onDeleted={onRefetch}
              onRefetch={onRefetch}
            />
          ))}
          <AddTierRow
            ruleId={ruleId}
            operatorId={operatorId}
            ruleKind={ruleKind}
            currency={currency}
            onAdded={onRefetch}
          />
        </tbody>
      </table>
    </div>
  )
}
