import { useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { GripVerticalIcon, Trash2Icon } from 'lucide-react'
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
import { explanationFor } from '@/lib/ui-explanations'
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { TierTable } from './TierTable'

type Props = {
  rule: PricingRule
  operatorId: string
  currency: string
  onDeleted: () => void
  onRefetch: () => void
  /** Optional drag handle (provided by SortableRuleItem). */
  dragHandle?: ReactNode
  /** Optional style for the draggable wrapper (transform/transition). */
  wrapperStyle?: CSSProperties
  /** Visual flag while this row is being dragged. */
  isDragging?: boolean
  /** Forwarded ref for dnd-kit setNodeRef. */
  innerRef?: (node: HTMLElement | null) => void
}

// ---- rule-kind chip with explanation tooltip (landr-12ux) ---------------

function RuleKindChip({ kind }: { kind: RuleKind }) {
  const label = RULE_KIND_LABELS[kind]
  const explanation = explanationFor('ruleKind', kind)
  const pill = (
    <span
      className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium"
      // Native title so a11y / keyboard users still get the explanation
      // when the shadcn Tooltip's hover affordance isn't available.
      title={explanation ?? undefined}
    >
      {label}
    </span>
  )
  if (!explanation) return pill
  return (
    <TooltipProvider delayDuration={150}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="inline-flex">{pill}</span>
        </TooltipTrigger>
        <TooltipContent className="max-w-xs text-balance">
          {explanation}
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
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

// ---- default drag handle ------------------------------------------------

/**
 * Static (non-interactive) drag handle for the rule chip header. The
 * SortableRuleItem wrapper attaches the actual dnd-kit listeners; this
 * component only renders the visual affordance + a11y label.
 */
export function RuleDragHandle({
  attributes,
  listeners,
  className,
}: {
  attributes?: Record<string, unknown>
  listeners?: Record<string, unknown>
  className?: string
}) {
  return (
    <button
      type="button"
      aria-label="Drag to reorder rule"
      className={
        'text-muted-foreground hover:text-foreground -ml-1 inline-flex h-6 w-6 shrink-0 cursor-grab items-center justify-center rounded touch-none active:cursor-grabbing' +
        (className ? ' ' + className : '')
      }
      {...(attributes ?? {})}
      {...(listeners ?? {})}
    >
      <GripVerticalIcon className="size-4" />
    </button>
  )
}

// ---- main component -----------------------------------------------------

export function PricingRuleEditor({
  rule,
  operatorId,
  currency,
  onDeleted,
  onRefetch,
  dragHandle,
  wrapperStyle,
  isDragging,
  innerRef,
}: Props) {
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

  function toggleActive() {
    patchMutation.mutate({ active: !rule.active })
  }

  const tiered = isTieredKind(rule.rule_kind)

  return (
    <div
      ref={innerRef}
      style={wrapperStyle}
      className={
        'space-y-1 rounded-md border p-3' +
        (isDragging ? ' opacity-50 shadow-md' : '')
      }
    >
      {/* Header row */}
      <div className="flex flex-wrap items-center gap-2">
        {dragHandle ?? null}

        {/* landr-12ux — rule-kind chip with an explanation Tooltip so
            operators can hover the chip to see what e.g. "Consecutive-day
            tiers" actually computes. */}
        <RuleKindChip kind={rule.rule_kind} />

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
