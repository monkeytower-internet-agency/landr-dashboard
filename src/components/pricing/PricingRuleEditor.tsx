import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  deleteRule,
  isTieredKind,
  patchRule,
  RULE_KIND_LABELS,
  type PricingRule,
  type RuleKind,
} from '@/lib/pricingSchemes'
import { TierTable } from './TierTable'

type Props = {
  rule: PricingRule
  operatorId: string
  currency: string
  onDeleted: () => void
  onRefetch: () => void
}

// ---- module-level params editor for non-tiered rule kinds ---------------

type ParamsEditorProps = {
  rule: PricingRule
  currency: string
  onPatch: (body: { params: Record<string, unknown> }) => void
}

function ParamsEditor({ rule, currency, onPatch }: ParamsEditorProps) {
  const kind: RuleKind = rule.rule_kind
  const pctCurrent = (rule.params as { percentage?: number }).percentage ?? 0
  const amtCurrent = (rule.params as { amount?: number }).amount ?? 0
  const totCurrent = (rule.params as { total?: number }).total ?? 0

  const [pctVal, setPctVal] = useState(String(pctCurrent))
  const [amtVal, setAmtVal] = useState(String(amtCurrent))
  const [totVal, setTotVal] = useState(String(totCurrent))

  if (kind === 'percentage_discount') {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Label htmlFor={`param-${rule.id}`} className="shrink-0 text-sm">
          Percentage (0–100)
        </Label>
        <Input
          id={`param-${rule.id}`}
          className="h-7 w-24 text-sm"
          value={pctVal}
          onChange={(e) => setPctVal(e.target.value)}
          onBlur={() => {
            const v = parseFloat(pctVal)
            if (isNaN(v) || v < 0 || v > 100) { setPctVal(String(pctCurrent)); return }
            if (v === pctCurrent) return
            onPatch({ params: { percentage: v } })
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

  if (kind === 'flat_discount') {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Label htmlFor={`param-${rule.id}`} className="shrink-0 text-sm">
          Discount amount ({currency})
        </Label>
        <Input
          id={`param-${rule.id}`}
          className="h-7 w-28 text-sm"
          value={amtVal}
          onChange={(e) => setAmtVal(e.target.value)}
          onBlur={() => {
            const v = parseFloat(amtVal)
            if (isNaN(v) || v < 0) { setAmtVal(String(amtCurrent)); return }
            if (v === amtCurrent) return
            onPatch({ params: { amount: v } })
          }}
          type="number"
          min={0}
          step={0.01}
        />
      </div>
    )
  }

  if (kind === 'fixed_total') {
    return (
      <div className="mt-2 flex items-center gap-2">
        <Label htmlFor={`param-${rule.id}`} className="shrink-0 text-sm">
          Fixed total ({currency})
        </Label>
        <Input
          id={`param-${rule.id}`}
          className="h-7 w-28 text-sm"
          value={totVal}
          onChange={(e) => setTotVal(e.target.value)}
          onBlur={() => {
            const v = parseFloat(totVal)
            if (isNaN(v) || v < 0) { setTotVal(String(totCurrent)); return }
            if (v === totCurrent) return
            onPatch({ params: { total: v } })
          }}
          type="number"
          min={0}
          step={0.01}
        />
      </div>
    )
  }

  return null
}

// ---- main component -----------------------------------------------------

export function PricingRuleEditor({
  rule,
  operatorId,
  currency,
  onDeleted,
  onRefetch,
}: Props) {
  const [sortOrder, setSortOrder] = useState(String(rule.sort_order))

  const patchMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchRule>[2]) =>
      patchRule(operatorId, rule.id, body),
    onSuccess: () => onRefetch(),
    onError: (err: Error) =>
      toast.error(`Failed to update rule: ${err.message}`),
  })

  const deleteMutation = useMutation({
    mutationFn: () => deleteRule(operatorId, rule.id),
    onSuccess: onDeleted,
    onError: (err: Error) =>
      toast.error(`Failed to delete rule: ${err.message}`),
  })

  function saveSortOrder() {
    const v = parseInt(sortOrder, 10)
    if (isNaN(v)) { setSortOrder(String(rule.sort_order)); return }
    if (v === rule.sort_order) return
    patchMutation.mutate({ sort_order: v })
  }

  function toggleActive() {
    patchMutation.mutate({ active: !rule.active })
  }

  const tiered = isTieredKind(rule.rule_kind)

  return (
    <div className="space-y-1 rounded-md border p-3">
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
          {RULE_KIND_LABELS[rule.rule_kind]}
        </span>

        <div className="flex items-center gap-1">
          <Label htmlFor={`sort-${rule.id}`} className="text-muted-foreground text-xs">
            Order
          </Label>
          <Input
            id={`sort-${rule.id}`}
            className="h-6 w-14 text-xs"
            value={sortOrder}
            onChange={(e) => setSortOrder(e.target.value)}
            onBlur={saveSortOrder}
            type="number"
          />
        </div>

        <Button
          type="button"
          size="sm"
          variant={rule.active ? 'default' : 'outline'}
          className="h-6 px-2 text-xs"
          onClick={toggleActive}
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

      {/* Content area */}
      {tiered ? (
        <TierTable
          tiers={rule.tiers}
          ruleId={rule.id}
          operatorId={operatorId}
          ruleKind={rule.rule_kind}
          currency={currency}
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
