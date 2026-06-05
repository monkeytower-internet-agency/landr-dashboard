import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { cn } from '@/lib/utils'
import {
  mobileSheetContent,
  mobileSheetHeader,
  mobileSheetBody,
} from '@/lib/mobile-sheet-classes'
import {
  COMMISSION_RULE_KIND_LABELS,
  RECIPIENT_KIND_LABELS,
  createCommissionRule,
  fetchCommissionSchemeTree,
  patchCommissionScheme,
  type CommissionRule,
  type CommissionRuleKind,
  type CommissionScheme,
} from '@/lib/commissions'
import { CommissionRuleEditor } from './CommissionRuleEditor'

type Props = {
  schemeId: string | null
  operatorId: string
  onClose: () => void
}

const RULE_KIND_OPTIONS: CommissionRuleKind[] = [
  'base_percentage_of_net',
  'base_percentage_of_gross',
  'base_flat_per_booking',
  'base_flat_per_day',
  'value_tier',
  'participant_count_tier',
  'monthly_volume_bonus',
  'product_override',
  'channel_override',
  'date_pattern_override',
  'campaign_override',
  'effective_period',
  'manual_override',
]

export function CommissionSchemeEditorSheet({ schemeId, operatorId, onClose }: Props) {
  const open = schemeId !== null
  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose() }}>
      {/* landr-3qkr.3 — full-screen below md. */}
      <SheetContent
        className={cn('w-full sm:max-w-lg flex flex-col overflow-hidden', mobileSheetContent)}
      >
        {schemeId ? (
          <EditorBody key={schemeId} schemeId={schemeId} operatorId={operatorId} />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = {
  schemeId: string
  operatorId: string
}

function EditorBody({ schemeId, operatorId }: BodyProps) {
  const qc = useQueryClient()
  const queryKey = ['commission-scheme-tree', operatorId, schemeId] as const

  const { data: scheme, isLoading, error, refetch } = useQuery<CommissionScheme>({
    queryKey,
    queryFn: () => fetchCommissionSchemeTree(operatorId, schemeId),
    enabled: !!schemeId,
  })

  function onRefetch() {
    void refetch()
    qc.invalidateQueries({ queryKey: ['commission-schemes', operatorId] })
  }

  if (isLoading) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Loading…</SheetTitle>
          <SheetDescription className="sr-only">
            Loading commission scheme details.
          </SheetDescription>
        </SheetHeader>
        <p className="text-muted-foreground p-4 text-sm">Loading commission scheme…</p>
      </>
    )
  }

  if (error || !scheme) {
    return (
      <>
        <SheetHeader>
          <SheetTitle>Error</SheetTitle>
          <SheetDescription className="sr-only">
            Failed to load the commission scheme.
          </SheetDescription>
        </SheetHeader>
        <p className="text-destructive p-4 text-sm">
          Failed to load scheme: {(error as Error | null)?.message ?? 'unknown error'}
        </p>
      </>
    )
  }

  return <SchemeEditor scheme={scheme} operatorId={operatorId} onRefetch={onRefetch} />
}

type EditorProps = {
  scheme: CommissionScheme
  operatorId: string
  onRefetch: () => void
}

function SchemeEditor({ scheme, operatorId, onRefetch }: EditorProps) {
  const [nameVal, setNameVal] = useState(scheme.name)
  const [notesVal, setNotesVal] = useState(scheme.notes ?? '')
  const [newRuleKind, setNewRuleKind] = useState<CommissionRuleKind>(
    'base_percentage_of_net',
  )
  const [nextSortOrder, setNextSortOrder] = useState(
    scheme.rules.length > 0
      ? Math.max(...scheme.rules.map((r) => r.sort_order)) + 10
      : 10,
  )

  const orderedRules = useMemo<CommissionRule[]>(
    () => [...scheme.rules].sort((a, b) => a.sort_order - b.sort_order),
    [scheme.rules],
  )

  const patchMutation = useMutation({
    mutationFn: (body: Parameters<typeof patchCommissionScheme>[2]) =>
      patchCommissionScheme(operatorId, scheme.id, body),
    onSuccess: () => onRefetch(),
    onError: (err: Error) => toast.error(`Failed to update scheme: ${err.message}`),
  })

  const addRuleMutation = useMutation({
    mutationFn: () =>
      createCommissionRule(operatorId, scheme.id, {
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

  return (
    <>
      {/* landr-3qkr.3 — sticky header below md. */}
      <SheetHeader className={cn('border-b pb-4 px-4 pt-4', mobileSheetHeader)}>
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
          <span className="inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium">
            {RECIPIENT_KIND_LABELS[scheme.recipient_kind]}
          </span>
          <Button
            type="button"
            size="sm"
            variant={scheme.active ? 'default' : 'outline'}
            className="h-7 px-2 text-xs"
            onClick={() => patchMutation.mutate({ active: !scheme.active })}
            disabled={patchMutation.isPending}
          >
            {scheme.active ? 'Active' : 'Inactive'}
          </Button>
        </div>
        <SheetTitle className="sr-only">{scheme.name}</SheetTitle>
        <SheetDescription className="sr-only">
          Edit commission scheme rules, tiers, and metadata.
        </SheetDescription>
      </SheetHeader>

      {/* landr-3qkr.3 — pb-safe via mobileSheetBody. */}
      <div className={cn('flex-1 overflow-y-auto px-4 py-4 space-y-4', mobileSheetBody)}>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Notes</Label>
          <Textarea
            value={notesVal}
            onChange={(e) => setNotesVal(e.target.value)}
            onBlur={saveNotes}
            rows={2}
            className="text-sm resize-none"
            placeholder="Optional notes about this commission scheme…"
          />
        </div>

        <div className="space-y-2">
          <p className="text-sm font-medium">Rules</p>
          {orderedRules.length === 0 ? (
            <p className="text-muted-foreground text-sm">No rules yet — add one below.</p>
          ) : (
            <div className="space-y-2">
              {orderedRules.map((rule) => (
                <CommissionRuleEditor
                  key={rule.id}
                  rule={rule}
                  operatorId={operatorId}
                  currency={scheme.currency}
                  onRefetch={onRefetch}
                />
              ))}
            </div>
          )}
        </div>

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
                onChange={(e) => setNewRuleKind(e.target.value as CommissionRuleKind)}
              >
                {RULE_KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {COMMISSION_RULE_KIND_LABELS[k]}
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
