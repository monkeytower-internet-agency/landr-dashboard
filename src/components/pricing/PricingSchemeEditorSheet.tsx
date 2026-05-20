import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  closestCenter,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  createRule,
  fetchPricingSchemeTree,
  patchPricingScheme,
  patchRule,
  RULE_KIND_LABELS,
  type PricingRule,
  type PricingScheme,
  type RuleKind,
} from '@/lib/pricingSchemes'
import { SortableRuleItem } from './SortableRuleItem'
import { diffSortChanges } from './pricing-reorder-math'

type Props = {
  schemeId: string | null
  operatorId: string
  onClose: () => void
}

const RULE_KIND_OPTIONS: RuleKind[] = [
  'per_day_base',
  'per_streak_tier',
  'per_total_days_tier',
  'per_participant_tier',
  'percentage_discount',
  'flat_discount',
  'fixed_total',
]

export function PricingSchemeEditorSheet({ schemeId, operatorId, onClose }: Props) {
  const open = schemeId !== null
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      <SheetContent className="w-full sm:max-w-lg flex flex-col overflow-hidden">
        {schemeId ? (
          <PricingSchemeEditorBody
            key={schemeId}
            schemeId={schemeId}
            operatorId={operatorId}
            onClose={onClose}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = {
  schemeId: string
  operatorId: string
  onClose: () => void
}

function PricingSchemeEditorBody({ schemeId, operatorId, onClose: _onClose }: BodyProps) {
  const qc = useQueryClient()
  const queryKey = ['pricing-scheme-tree', operatorId, schemeId] as const

  const { data: scheme, isLoading, error, refetch } = useQuery<PricingScheme>({
    queryKey,
    queryFn: () => fetchPricingSchemeTree(operatorId, schemeId),
    enabled: !!schemeId,
  })

  // After any mutation that changes the scheme tree, refetch the tree.
  function onRefetch() {
    void refetch()
    // Also keep ['pricing-schemes'] in sync for the list page.
    qc.invalidateQueries({ queryKey: ['pricing-schemes', operatorId] })
  }

  if (isLoading) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Loading…</SheetTitle>
        </SheetHeader>
        <p className="text-muted-foreground p-4 text-sm">Loading pricing scheme…</p>
      </>
    )
  }

  if (error || !scheme) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Error</SheetTitle>
        </SheetHeader>
        <p className="text-destructive p-4 text-sm">
          Failed to load scheme: {(error as Error | null)?.message ?? 'unknown error'}
        </p>
      </>
    )
  }

  return (
    <SchemeEditor
      scheme={scheme}
      operatorId={operatorId}
      onRefetch={onRefetch}
    />
  )
}

type EditorProps = {
  scheme: PricingScheme
  operatorId: string
  onRefetch: () => void
}

function SchemeEditor({ scheme, operatorId, onRefetch }: EditorProps) {
  const [nameVal, setNameVal] = useState(scheme.name)
  const [notesVal, setNotesVal] = useState(scheme.notes ?? '')
  const [newRuleKind, setNewRuleKind] = useState<RuleKind>('per_day_base')
  const [nextSortOrder, setNextSortOrder] = useState(
    scheme.rules.length > 0
      ? Math.max(...scheme.rules.map((r) => r.sort_order)) + 10
      : 10,
  )

  // Server-derived canonical order (by sort_order asc).
  const serverOrderedRules = useMemo<PricingRule[]>(
    () => [...scheme.rules].sort((a, b) => a.sort_order - b.sort_order),
    [scheme.rules],
  )
  const serverOrderIds = useMemo(
    () => serverOrderedRules.map((r) => r.id),
    [serverOrderedRules],
  )

  // Optimistic override after drop; null = follow server order.
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null)

  // Drop the override once the server confirms our new ordering.
  if (
    orderOverride !== null &&
    orderOverride.length === serverOrderIds.length &&
    orderOverride.every((id, i) => serverOrderIds[i] === id)
  ) {
    // Schedule the reset; doing it inline during render is safe because
    // setState during render only re-renders if the value actually differs.
    queueMicrotask(() => setOrderOverride(null))
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  )

  const reorderMutation = useMutation({
    mutationFn: async (changes: { id: string; sort_order: number }[]) => {
      await Promise.all(
        changes.map((c) =>
          patchRule(operatorId, c.id, { sort_order: c.sort_order }),
        ),
      )
    },
    onSuccess: () => onRefetch(),
    onError: (err: Error) => {
      // Revert the optimistic order and surface the failure.
      setOrderOverride(null)
      toast.error(`Failed to save rule order: ${err.message}`)
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const currentOrder = orderOverride ?? serverOrderIds
    const oldIndex = currentOrder.indexOf(String(active.id))
    const newIndex = currentOrder.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return

    const nextOrder = arrayMove(currentOrder, oldIndex, newIndex)
    setOrderOverride(nextOrder)

    const changes = diffSortChanges(scheme.rules, nextOrder)
    if (changes.length === 0) return
    reorderMutation.mutate(changes)
  }

  const patchMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchPricingScheme>[2]) =>
      patchPricingScheme(operatorId, scheme.id, body),
    onSuccess: () => onRefetch(),
    onError: (err: Error) => toast.error(`Failed to update scheme: ${err.message}`),
  })

  const addRuleMutation = useMutation({
    mutationFn: () =>
      createRule(operatorId, scheme.id, {
        rule_kind: newRuleKind,
        sort_order: nextSortOrder,
      }),
    onSuccess: () => {
      setNextSortOrder((s) => s + 10)
      onRefetch()
      toast.success('Rule added.')
    },
    onError: (err: Error) => toast.error(`Failed to add rule: ${err.message}`),
  })

  function saveName() {
    const trimmed = nameVal.trim()
    if (!trimmed) { setNameVal(scheme.name); return }
    if (trimmed === scheme.name) return
    patchMutation.mutate({ name: trimmed })
  }

  function saveNotes() {
    const trimmed = notesVal.trim() || null
    if (trimmed === (scheme.notes ?? null)) return
    patchMutation.mutate({ notes: trimmed })
  }

  function toggleActive() {
    patchMutation.mutate({ active: !scheme.active })
  }

  // Effective render order: optimistic override (if set) wins, else server order.
  const ruleById = new Map(scheme.rules.map((r) => [r.id, r]))
  const displayIds = orderOverride ?? serverOrderIds
  const displayRules = displayIds
    .map((id) => ruleById.get(id))
    .filter((r): r is PricingRule => r !== undefined)

  return (
    <>
      <SheetHeader className="border-b pb-4">
        <div className="flex items-center gap-2 flex-wrap">
          <Input
            className="h-8 text-base font-semibold flex-1 min-w-0"
            value={nameVal}
            onChange={(e) => setNameVal(e.target.value)}
            onBlur={saveName}
            aria-label="Scheme name"
          />
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
            {scheme.currency}
          </span>
          <Button
            type="button"
            size="sm"
            variant={scheme.active ? 'default' : 'outline'}
            className="h-7 px-2 text-xs"
            onClick={toggleActive}
            disabled={patchMutation.isPending}
          >
            {scheme.active ? 'Active' : 'Inactive'}
          </Button>
        </div>
        <SheetTitle className="sr-only">{scheme.name}</SheetTitle>
      </SheetHeader>

      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {/* Notes */}
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea
            value={notesVal}
            onChange={(e) => setNotesVal(e.target.value)}
            onBlur={saveNotes}
            rows={2}
            className="text-sm resize-none"
            placeholder="Optional notes about this pricing scheme…"
          />
        </div>

        {/* Rules */}
        <div className="space-y-2">
          <p className="text-sm font-medium">Rules</p>
          {displayRules.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              No rules yet — add one below.
            </p>
          ) : (
            <DndContext
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={displayIds}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-2">
                  {displayRules.map((rule) => (
                    <SortableRuleItem
                      key={rule.id}
                      rule={rule}
                      operatorId={operatorId}
                      currency={scheme.currency}
                      onDeleted={onRefetch}
                      onRefetch={onRefetch}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        {/* Add rule */}
        <div className="rounded-md border p-3 space-y-2">
          <p className="text-sm font-medium">Add rule</p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <Label htmlFor="new-rule-kind" className="text-xs">
                Rule type
              </Label>
              <NativeSelect
                id="new-rule-kind"
                value={newRuleKind}
                onChange={(e) => setNewRuleKind(e.target.value as RuleKind)}
              >
                {RULE_KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {RULE_KIND_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              onClick={() => addRuleMutation.mutate()}
              disabled={addRuleMutation.isPending}
            >
              Add
            </Button>
          </div>
        </div>
      </div>
    </>
  )
}
