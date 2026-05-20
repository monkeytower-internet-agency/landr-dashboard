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
} from '@/lib/pricingSchemes'
import { TierTable } from './TierTable'

type Props = {
  rule: PricingRule
  operatorId: string
  currency: string
  onDeleted: () => void
  onRefetch: () => void
}

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

  // ---- params inputs for non-tiered rules ----
  function ParamsEditor() {
    const kind = rule.rule_kind

    if (kind === 'percentage_discount') {
      const current = (rule.params as { percentage?: number }).percentage ?? ''
      const [val, setVal] = useState(String(current))
      function save() {
        const v = parseFloat(val)
        if (isNaN(v) || v < 0 || v > 100) { setVal(String(current)); return }
        if (v === current) return
        patchMutation.mutate({ params: { percentage: v } })
      }
      return (
        <div className="mt-2 flex items-center gap-2">
          <Label htmlFor={`param-${rule.id}`} className="text-sm shrink-0">
            Percentage (0–100)
          </Label>
          <Input
            id={`param-${rule.id}`}
            className="h-7 w-24 text-sm"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={save}
            type="number"
            min={0}
            max={100}
            step={0.01}
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
      )
    }

    if (kind === 'flat_discount') {
      const current = (rule.params as { amount?: number }).amount ?? ''
      const [val, setVal] = useState(String(current))
      function save() {
        const v = parseFloat(val)
        if (isNaN(v) || v < 0) { setVal(String(current)); return }
        if (v === current) return
        patchMutation.mutate({ params: { amount: v } })
      }
      return (
        <div className="mt-2 flex items-center gap-2">
          <Label htmlFor={`param-${rule.id}`} className="text-sm shrink-0">
            Discount amount ({currency})
          </Label>
          <Input
            id={`param-${rule.id}`}
            className="h-7 w-28 text-sm"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={save}
            type="number"
            min={0}
            step={0.01}
          />
        </div>
      )
    }

    if (kind === 'fixed_total') {
      const current = (rule.params as { total?: number }).total ?? ''
      const [val, setVal] = useState(String(current))
      function save() {
        const v = parseFloat(val)
        if (isNaN(v) || v < 0) { setVal(String(current)); return }
        if (v === current) return
        patchMutation.mutate({ params: { total: v } })
      }
      return (
        <div className="mt-2 flex items-center gap-2">
          <Label htmlFor={`param-${rule.id}`} className="text-sm shrink-0">
            Fixed total ({currency})
          </Label>
          <Input
            id={`param-${rule.id}`}
            className="h-7 w-28 text-sm"
            value={val}
            onChange={(e) => setVal(e.target.value)}
            onBlur={save}
            type="number"
            min={0}
            step={0.01}
          />
        </div>
      )
    }

    return null
  }

  return (
    <div className="rounded-md border p-3 space-y-1">
      {/* Header row */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
          {RULE_KIND_LABELS[rule.rule_kind]}
        </span>

        <div className="flex items-center gap-1">
          <Label htmlFor={`sort-${rule.id}`} className="text-xs text-muted-foreground">
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
        <ParamsEditor />
      )}
    </div>
  )
}
