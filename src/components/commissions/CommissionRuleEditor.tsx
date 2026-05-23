import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  COMMISSION_RULE_KIND_LABELS,
  deleteCommissionRule,
  isTieredCommissionKind,
  patchCommissionRule,
  type CommissionRule,
} from '@/lib/commissions'
import { CommissionTierTable } from './CommissionTierTable'

type Props = {
  rule: CommissionRule
  operatorId: string
  currency: string
  onRefetch: () => void
}

// ---- params editor for non-tiered rule kinds ----------------------------
// base_percentage_of_net / _gross -> params.percent (fraction)
// base_flat_per_booking / _day    -> params.amount (currency)
// other override kinds            -> no inline param (params is freeform;
//                                    edit via the API directly for v1)

type ParamsEditorProps = {
  rule: CommissionRule
  currency: string
  onPatch: (body: { params: Record<string, unknown> }) => void
}

function ParamsEditor({ rule, currency, onPatch }: ParamsEditorProps) {
  const kind = rule.rule_kind
  const isPercent =
    kind === 'base_percentage_of_net' || kind === 'base_percentage_of_gross'
  const isFlat =
    kind === 'base_flat_per_booking' || kind === 'base_flat_per_day'

  const percentCurrent = (rule.params as { percent?: number }).percent ?? 0
  const amountCurrent = (rule.params as { amount?: number }).amount ?? 0

  const [pctVal, setPctVal] = useState(String(percentCurrent * 100))
  const [amtVal, setAmtVal] = useState(String(amountCurrent))

  if (isPercent) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Label htmlFor={`param-${rule.id}`} className="shrink-0 text-sm">
          Rate
        </Label>
        <Input
          id={`param-${rule.id}`}
          className="h-7 w-24 text-sm"
          value={pctVal}
          onChange={(e) => setPctVal(e.target.value)}
          onBlur={() => {
            const pct = parseFloat(pctVal)
            if (isNaN(pct) || pct < 0 || pct > 100) {
              setPctVal(String(percentCurrent * 100))
              return
            }
            const fraction = pct / 100
            if (fraction === percentCurrent) return
            onPatch({ params: { ...rule.params, percent: fraction } })
          }}
          type="number"
          min={0}
          max={100}
          step={0.01}
        />
        <span className="text-muted-foreground text-sm">%</span>
      </div>
    )
  }

  if (isFlat) {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Label htmlFor={`param-${rule.id}`} className="shrink-0 text-sm">
          Amount ({currency})
        </Label>
        <Input
          id={`param-${rule.id}`}
          className="h-7 w-28 text-sm"
          value={amtVal}
          onChange={(e) => setAmtVal(e.target.value)}
          onBlur={() => {
            const v = parseFloat(amtVal)
            if (isNaN(v) || v < 0) { setAmtVal(String(amountCurrent)); return }
            if (v === amountCurrent) return
            onPatch({ params: { ...rule.params, amount: v } })
          }}
          type="number"
          min={0}
          step={0.01}
        />
      </div>
    )
  }

  return (
    <p className="mt-2 text-xs text-muted-foreground">
      This rule type uses advanced parameters edited via the API.
    </p>
  )
}

// ---- main ---------------------------------------------------------------

export function CommissionRuleEditor({ rule, operatorId, currency, onRefetch }: Props) {
  const patchMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchCommissionRule>[2]) =>
      patchCommissionRule(operatorId, rule.id, body),
    onSuccess: () => onRefetch(),
    onError: (err: Error) => toast.error(`Failed to update rule: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteCommissionRule(operatorId, rule.id),
    onSuccess: onRefetch,
    onError: (err: Error) => toast.error(`Failed to delete rule: ${err.message}`),
  })

  const tiered = isTieredCommissionKind(rule.rule_kind)

  return (
    <div className="space-y-1 rounded-md border p-3">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
          {COMMISSION_RULE_KIND_LABELS[rule.rule_kind]}
        </span>
        <Button
          type="button"
          size="sm"
          variant={rule.active ? 'default' : 'outline'}
          className="h-6 px-2 text-xs"
          onClick={() => patchMutation.mutate({ active: !rule.active })}
          disabled={patchMutation.isPending}
        >
          {rule.active ? 'Active' : 'Inactive'}
        </Button>
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label="Delete rule"
          className="ml-auto"
          disabled={deleteMutation.isPending}
          onClick={() => {
            if (window.confirm('Delete this rule? All its tiers will also be removed.')) {
              deleteMutation.mutate()
            }
          }}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      </div>

      {tiered ? (
        <CommissionTierTable
          tiers={rule.tiers}
          ruleId={rule.id}
          operatorId={operatorId}
          onRefetch={onRefetch}
        />
      ) : (
        <ParamsEditor
          rule={rule}
          currency={currency}
          onPatch={(body) => patchMutation.mutate(body)}
        />
      )}
    </div>
  )
}
