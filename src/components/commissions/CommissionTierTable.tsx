import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  createCommissionTier,
  deleteCommissionTier,
  patchCommissionTier,
  type CommissionTier,
} from '@/lib/commissions'

/**
 * Tier editor for tiered commission rule kinds (value_tier,
 * participant_count_tier, monthly_volume_bonus). Mirrors the pricing
 * TierTable but for the commission_rule_tiers shape:
 *   - thresholds are numeric (booking value / participants / volume)
 *   - the value column is `rate` (a fraction, e.g. 0.05 = 5%); operators
 *     who need a flat amount use a non-tiered flat rule kind instead, so
 *     the editor surfaces `rate` only. (fixed_amount remains settable via
 *     the API for advanced setups; not exposed in this v1 inline editor.)
 *
 * The DB enforces a rate XOR fixed_amount CHECK, so every tier here sends
 * a rate.
 */

type Props = {
  tiers: CommissionTier[]
  ruleId: string
  operatorId: string
  onRefetch: () => void
}

function ratePct(rate: number | null): string {
  if (rate == null) return ''
  // Stored as a fraction; show as a percentage for editing.
  return String(rate * 100)
}

// ---- individual tier row ------------------------------------------------

type TierRowProps = {
  tier: CommissionTier
  operatorId: string
  onRefetch: () => void
}

function TierRow({ tier, operatorId, onRefetch }: TierRowProps) {
  const [minVal, setMinVal] = useState(String(tier.threshold_min))
  const [maxVal, setMaxVal] = useState(
    tier.threshold_max != null ? String(tier.threshold_max) : '',
  )
  const [rateVal, setRateVal] = useState(ratePct(tier.rate))

  const patchMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchCommissionTier>[2]) =>
      patchCommissionTier(operatorId, tier.id, body),
    onSuccess: () => onRefetch(),
    onError: (err: Error) => toast.error(`Failed to update tier: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCommissionTier(operatorId, tier.id),
    onSuccess: onRefetch,
    onError: (err: Error) => toast.error(`Failed to delete tier: ${err.message}`),
  })

  function saveMin() {
    const v = parseFloat(minVal)
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
    const v = parseFloat(maxVal)
    if (isNaN(v) || v < 0) {
      setMaxVal(tier.threshold_max != null ? String(tier.threshold_max) : '')
      return
    }
    if (v === tier.threshold_max) return
    patchMutation.mutate({ threshold_max: v })
  }

  function saveRate() {
    const pct = parseFloat(rateVal)
    if (isNaN(pct) || pct < 0) { setRateVal(ratePct(tier.rate)); return }
    const fraction = pct / 100
    if (fraction === tier.rate) return
    patchMutation.mutate({ rate: fraction })
  }

  return (
    <tr className="border-b last:border-0">
      <td className="py-1 pr-2">
        <Input
          className="h-7 w-24 text-sm"
          value={minVal}
          onChange={(e) => setMinVal(e.target.value)}
          onBlur={saveMin}
          type="number"
          min={0}
          step="0.01"
        />
      </td>
      <td className="py-1 pr-2">
        <Input
          className="h-7 w-24 text-sm"
          value={maxVal}
          onChange={(e) => setMaxVal(e.target.value)}
          onBlur={saveMax}
          placeholder="∞"
          type="number"
          min={0}
          step="0.01"
        />
      </td>
      <td className="py-1 pr-2">
        <Input
          className="h-7 w-24 text-sm"
          value={rateVal}
          onChange={(e) => setRateVal(e.target.value)}
          onBlur={saveRate}
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

// ---- add-tier row -------------------------------------------------------

type AddTierRowProps = {
  ruleId: string
  operatorId: string
  onAdded: () => void
}

function AddTierRow({ ruleId, operatorId, onAdded }: AddTierRowProps) {
  const [min, setMin] = useState('')
  const [max, setMax] = useState('')
  const [rate, setRate] = useState('')

  const createMutation = useMutation({
    mutationFn: () => {
      const minV = parseFloat(min)
      if (isNaN(minV) || minV < 0) throw new Error('Min must be a non-negative number')
      const pct = parseFloat(rate)
      if (isNaN(pct) || pct < 0) throw new Error('Rate is required')
      const maxV = max !== '' ? parseFloat(max) : undefined
      return createCommissionTier(operatorId, ruleId, {
        threshold_min: minV,
        threshold_max: maxV ?? null,
        rate: pct / 100,
      })
    },
    onSuccess: () => {
      setMin('')
      setMax('')
      setRate('')
      onAdded()
    },
    onError: (err: Error) => toast.error(`Failed to add tier: ${err.message}`),
  })

  return (
    <tr className="border-t">
      <td className="pt-2 pr-2">
        <Input
          className="h-7 w-24 text-sm"
          value={min}
          onChange={(e) => setMin(e.target.value)}
          placeholder="0"
          type="number"
          min={0}
          step="0.01"
        />
      </td>
      <td className="pt-2 pr-2">
        <Input
          className="h-7 w-24 text-sm"
          value={max}
          onChange={(e) => setMax(e.target.value)}
          placeholder="∞"
          type="number"
          min={0}
          step="0.01"
        />
      </td>
      <td className="pt-2 pr-2">
        <Input
          className="h-7 w-24 text-sm"
          value={rate}
          onChange={(e) => setRate(e.target.value)}
          placeholder="5"
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
          disabled={createMutation.isPending || !min || !rate}
          onClick={() => createMutation.mutate()}
        >
          <PlusIcon className="size-3.5" />
        </Button>
      </td>
    </tr>
  )
}

// ---- table --------------------------------------------------------------

export function CommissionTierTable({ tiers, ruleId, operatorId, onRefetch }: Props) {
  return (
    <div className="mt-2 overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b text-muted-foreground text-xs">
            <th className="pb-1 pr-2 text-left font-medium">From</th>
            <th className="pb-1 pr-2 text-left font-medium">To</th>
            <th className="pb-1 pr-2 text-left font-medium">Rate (%)</th>
            <th className="pb-1" />
          </tr>
        </thead>
        <tbody>
          {tiers.map((tier) => (
            <TierRow
              key={tier.id}
              tier={tier}
              operatorId={operatorId}
              onRefetch={onRefetch}
            />
          ))}
          <AddTierRow
            ruleId={ruleId}
            operatorId={operatorId}
            onAdded={onRefetch}
          />
        </tbody>
      </table>
    </div>
  )
}
