import { useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { GripVerticalIcon, Trash2Icon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
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

// ---- engine params contract (landr-d2uy) --------------------------------
//
// The pricing ENGINE (landr-api/app/services/pricing.py) is the contract —
// it reads these exact keys per rule_kind and nothing else. This editor
// must WRITE only these keys. For back-compat display of rows that were
// seeded/edited under the old (wrong) UI keys, reads fall back to the
// legacy key so existing data doesn't render as blank/zero, but every
// PATCH re-normalises the row onto the engine key.
//
//   fixed_total            -> amount                  (legacy: total)
//   percentage_discount    -> percent                  (legacy: percentage)
//   flat_discount          -> amount                   (no legacy alias)
//   time_of_day_surcharge  -> window, surcharge_per_day (no legacy alias)
//   manual_override        -> amount, reason           (no legacy alias)
//
// See PricingRuleEditor.contract.test.tsx, which pins this table against
// the ParamsEditor's actual onPatch payloads per kind.

function ParamsEditor({ rule, currency, onPatch }: ParamsEditorProps) {
  const kind: RuleKind = rule.rule_kind
  const params = rule.params as {
    percent?: number
    percentage?: number
    amount?: number
    total?: number
    window?: string
    surcharge_per_day?: number
    reason?: string | null
  }
  const pctCurrent = params.percent ?? params.percentage ?? 0
  const amtCurrent = params.amount ?? params.total ?? 0
  const windowCurrent = params.window ?? ''
  const surchargeCurrent = params.surcharge_per_day ?? 0
  const reasonCurrent = params.reason ?? ''

  const [pctVal, setPctVal] = useState(String(pctCurrent))
  const [amtVal, setAmtVal] = useState(String(amtCurrent))
  const [windowVal, setWindowVal] = useState(windowCurrent)
  const [surchargeVal, setSurchargeVal] = useState(String(surchargeCurrent))
  const [reasonVal, setReasonVal] = useState(reasonCurrent)

  // ---- composite-kind draft state (landr-d2uy fix-forward) --------------
  //
  // time_of_day_surcharge and manual_override each PATCH two fields as one
  // full-replace params object, pairing the just-edited field with the
  // sibling's "current" value. `rule.params` only refreshes once the PATCH's
  // onSuccess -> onRefetch round-trip resolves, so reading the sibling
  // straight from props is racy: edit field A, blur (PATCH 1 in flight),
  // then edit+blur field B before PATCH 1's refetch lands, and PATCH 2 would
  // carry field A's STALE pre-edit value — silently reverting the just-saved
  // edit, because the API PATCH replaces the whole params jsonb column.
  //
  // Fix: track each composite field's last-known-good value in local state,
  // seeded from props on mount and advanced optimistically the moment we
  // fire a PATCH for it — never re-derived from `rule.params` afterwards.
  // The sibling field then always composes against the freshest value this
  // editor instance actually sent, regardless of when the refetch resolves.
  const [windowDraft, setWindowDraft] = useState(windowCurrent)
  const [surchargeDraft, setSurchargeDraft] = useState(surchargeCurrent)
  const [overrideAmtDraft, setOverrideAmtDraft] = useState(amtCurrent)
  const [reasonDraft, setReasonDraft] = useState(reasonCurrent)

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
            // Engine key is `percent` (landr-d2uy) — never write `percentage`.
            onPatch({ params: { percent: v } })
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
          value={amtVal}
          onChange={(e) => setAmtVal(e.target.value)}
          onBlur={() => {
            const v = parseFloat(amtVal)
            if (isNaN(v) || v < 0) { setAmtVal(String(amtCurrent)); return }
            if (v === amtCurrent) return
            // Engine key is `amount` (landr-d2uy) — never write `total`.
            onPatch({ params: { amount: v } })
          }}
          type="number"
          min={0}
          step={0.01}
        />
      </div>
    )
  }

  if (kind === 'time_of_day_surcharge') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Label htmlFor={`param-window-${rule.id}`} className="shrink-0 text-sm">
          Window (HH:MM-HH:MM)
        </Label>
        <Input
          id={`param-window-${rule.id}`}
          className="h-7 w-32 text-sm"
          value={windowVal}
          placeholder="18:00-22:00"
          onChange={(e) => setWindowVal(e.target.value)}
          onBlur={() => {
            const v = windowVal.trim()
            if (v === windowDraft) return
            setWindowDraft(v)
            onPatch({ params: { window: v, surcharge_per_day: surchargeDraft } })
          }}
        />
        <Label htmlFor={`param-surcharge-${rule.id}`} className="shrink-0 text-sm">
          Surcharge / day ({currency})
        </Label>
        <Input
          id={`param-surcharge-${rule.id}`}
          className="h-7 w-28 text-sm"
          value={surchargeVal}
          onChange={(e) => setSurchargeVal(e.target.value)}
          onBlur={() => {
            const v = parseFloat(surchargeVal)
            if (isNaN(v) || v < 0) { setSurchargeVal(String(surchargeDraft)); return }
            if (v === surchargeDraft) return
            setSurchargeDraft(v)
            onPatch({ params: { window: windowDraft, surcharge_per_day: v } })
          }}
          type="number"
          min={0}
          step={0.01}
        />
      </div>
    )
  }

  if (kind === 'manual_override') {
    return (
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <Label htmlFor={`param-${rule.id}`} className="shrink-0 text-sm">
          Override total ({currency})
        </Label>
        <Input
          id={`param-${rule.id}`}
          className="h-7 w-28 text-sm"
          value={amtVal}
          onChange={(e) => setAmtVal(e.target.value)}
          onBlur={() => {
            const v = parseFloat(amtVal)
            if (isNaN(v) || v < 0) { setAmtVal(String(overrideAmtDraft)); return }
            if (v === overrideAmtDraft) return
            setOverrideAmtDraft(v)
            onPatch({ params: { amount: v, reason: reasonDraft || null } })
          }}
          type="number"
          min={0}
          step={0.01}
        />
        <Label htmlFor={`param-reason-${rule.id}`} className="shrink-0 text-sm">
          Reason
        </Label>
        <Input
          id={`param-reason-${rule.id}`}
          className="h-7 w-48 text-sm"
          value={reasonVal}
          onChange={(e) => setReasonVal(e.target.value)}
          onBlur={() => {
            const v = reasonVal.trim()
            if (v === (reasonDraft ?? '')) return
            setReasonDraft(v)
            onPatch({ params: { amount: overrideAmtDraft, reason: v || null } })
          }}
        />
      </div>
    )
  }

  return null
}

// ---- params strip for TIERED rule kinds (landr-c53m.3) ------------------
//
// per_day_base and per_streak_tier read params.per_participant as an
// opt-in headcount multiplier (see landr-api/app/services/pricing.py:
// _eval_per_day_base, _eval_per_streak_tier, _eval_per_total_days_tier) —
// flipping it materially changes the computed price (Para42's guided-day
// per_streak_tier rules seed this true). The tiered branch renders
// TierTable instead of ParamsEditor, so this bool was unreachable from the
// UI entirely.
//
// per_total_days_tier is ALSO consulted by the engine (_eval_per_total_days_
// tier reads params.per_participant too), so the toggle renders for it.
// per_participant_tier is the one exception: _eval_per_participant_tier
// never reads params.per_participant (the rule is already inherently
// participant-scoped), so rendering the toggle there would be a reachable
// but functionally-inert control — exactly the phantom-config class this
// epic eliminates. TieredParamsEditor early-returns null for that kind.
//
// Same full-replace PATCH contract as ParamsEditor (landr-d2uy): the API
// PATCH replaces the whole params jsonb column (staff_pricing.py
// patch_rule — `sb.table(...).update(updates)`, not a jsonb merge), so the
// write must carry forward every OTHER params key already on the row (e.g.
// per_day_base's amount_per_day) — never just `{ per_participant }` alone,
// or the toggle would silently zero out the rest of the rule's params.
// Local draft state mirrors ParamsEditor's composite-kind pattern: seeded
// from props once, then always mutated off the last full params object
// THIS editor instance actually sent — never re-derived from `rule.params`
// after a write, since that prop only refreshes once the PATCH's
// onSuccess -> onRefetch round-trip resolves.
//
// Double-submit + rollback (fix-forward, review-gate findings on PR #356):
// the Switch must disable while a PATCH is in flight (rapid double-click
// with no server-side version guard lets an out-of-order commit land the
// STALE toggle value), and a failed PATCH must roll the optimistic draft
// back to the last-known-good value rather than leaving the switch stuck
// showing the unsaved state forever.

type TieredParamsEditorProps = {
  rule: PricingRule
  onPatch: (
    body: { params: Record<string, unknown> },
    options?: { onError?: () => void },
  ) => void
  isPending: boolean
}

function TieredParamsEditor({ rule, onPatch, isPending }: TieredParamsEditorProps) {
  const [paramsDraft, setParamsDraft] = useState<Record<string, unknown>>(
    rule.params,
  )
  const checked = Boolean(paramsDraft.per_participant)

  // _eval_per_participant_tier never reads per_participant — reachable but
  // inert control, so don't render it for this kind at all.
  if (rule.rule_kind === 'per_participant_tier') return null

  return (
    <div className="mt-2 flex items-center gap-2">
      <Switch
        id={`param-per-participant-${rule.id}`}
        checked={checked}
        size="sm"
        disabled={isPending}
        onClick={() => {
          const previous = paramsDraft
          const next = { ...paramsDraft, per_participant: !checked }
          setParamsDraft(next)
          onPatch(
            { params: next },
            {
              onError: () => setParamsDraft(previous),
            },
          )
        }}
      />
      <Label
        htmlFor={`param-per-participant-${rule.id}`}
        className="cursor-pointer text-sm font-normal"
      >
        Scale by participant count
      </Label>
    </div>
  )
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
        <>
          <TieredParamsEditor
            rule={rule}
            isPending={patchMutation.isPending}
            onPatch={(body, options) => patchMutation.mutate(body, options)}
          />
          <TierTable
            tiers={rule.tiers}
            ruleId={rule.id}
            operatorId={operatorId}
            ruleKind={rule.rule_kind}
            currency={currency}
            onRefetch={onRefetch}
          />
        </>
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
