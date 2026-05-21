// landr-r87i — Settings → Operations. v2 of landr-84n1.
//
// Lets the operator curate the DEFAULT per-booking checklist items
// (operator_checklist_templates table). Add/remove/reorder/rename rows;
// Save submits the full ordered list via PUT. Per-booking done flags and
// custom items continue to live in dashboard localStorage v1 — only the
// seed list is operator-curated server-side.

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import {
  CHECKLIST_TEMPLATE_QUERY_KEY,
  fetchChecklistTemplate,
  putChecklistTemplate,
  type ChecklistTemplate,
  type ChecklistTemplateItemWire,
} from '@/lib/checklistTemplate'

// Editor draft is a flat array; we re-stamp `order` from index at save time.
type DraftItem = {
  key: string
  label: string
}

function makeDraftKey(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `tpl-${Date.now().toString(36)}-${rand}`
}

function sortToDraft(template: ChecklistTemplate): DraftItem[] {
  return [...template.items]
    .sort((a, b) => a.order - b.order)
    .map((i) => ({ key: i.key, label: i.label }))
}

export function OperationsSettings() {
  const { currentOperatorId } = useOperator()

  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.operations },
        ]}
      />
      {currentOperatorId ? (
        <ChecklistTemplateLoader operatorId={currentOperatorId} />
      ) : (
        <div className="text-muted-foreground p-6">
          {t.operationsSettings.noOperator}
        </div>
      )}
    </>
  )
}

type LoaderProps = { operatorId: string }

function ChecklistTemplateLoader({ operatorId }: LoaderProps) {
  const { data, isLoading, error } = useQuery({
    queryKey: CHECKLIST_TEMPLATE_QUERY_KEY(operatorId),
    queryFn: () => fetchChecklistTemplate(operatorId),
  })

  if (isLoading || !data) {
    return (
      <div className="text-muted-foreground p-6">
        {t.operationsSettings.loading}
      </div>
    )
  }
  if (error) {
    return (
      <div className="text-destructive p-6">
        {t.operationsSettings.error} — {(error as Error).message}
      </div>
    )
  }

  // Mount keyed on the server data's identity. After Save we invalidate
  // the query — when the refreshed data lands, React Query returns a
  // fresh object reference, the key changes, and the inner form
  // remounts with the server-normalised draft. This is what lets us
  // avoid useEffect-driven state sync (and the
  // react-hooks/set-state-in-effect lint).
  return (
    <ChecklistTemplateEditor
      key={JSON.stringify(data.items)}
      operatorId={operatorId}
      initialData={data}
    />
  )
}

type EditorProps = {
  operatorId: string
  initialData: ChecklistTemplate
}

function ChecklistTemplateEditor({ operatorId, initialData }: EditorProps) {
  const qc = useQueryClient()
  // Initialise from the prop ONCE — the parent remounts us when a new
  // server payload arrives, so we never need to mirror prop -> state.
  const [draft, setDraft] = useState<DraftItem[]>(() =>
    sortToDraft(initialData),
  )

  const mutation = useMutation({
    mutationFn: (items: ChecklistTemplateItemWire[]) =>
      putChecklistTemplate(operatorId, items),
    onSuccess: () => {
      toast.success(t.operationsSettings.toastSaved)
      qc.invalidateQueries({
        queryKey: CHECKLIST_TEMPLATE_QUERY_KEY(operatorId),
      })
    },
    onError: (err: Error) => {
      toast.error(t.operationsSettings.toastSaveError, {
        description: err.message,
      })
    },
  })

  const dirty = useMemo(() => {
    const baseline = sortToDraft(initialData)
    if (baseline.length !== draft.length) return true
    return baseline.some(
      (s, i) => s.key !== draft[i].key || s.label !== draft[i].label,
    )
  }, [initialData, draft])

  const validationError = useMemo(() => {
    for (const item of draft) {
      if (!item.label.trim()) return t.operationsSettings.emptyLabelError
    }
    const labels = draft.map((i) => i.label.trim().toLowerCase())
    if (new Set(labels).size !== labels.length) {
      return t.operationsSettings.duplicateLabelError
    }
    return null
  }, [draft])

  const updateLabel = (idx: number, label: string) => {
    setDraft((d) => {
      const next = d.slice()
      next[idx] = { ...next[idx], label }
      return next
    })
  }

  const removeAt = (idx: number) => {
    setDraft((d) => d.filter((_, i) => i !== idx))
  }

  const move = (idx: number, dir: -1 | 1) => {
    setDraft((d) => {
      const target = idx + dir
      if (target < 0 || target >= d.length) return d
      const next = d.slice()
      const [removed] = next.splice(idx, 1)
      next.splice(target, 0, removed)
      return next
    })
  }

  const addItem = () => {
    setDraft((d) => [...d, { key: makeDraftKey(), label: '' }])
  }

  const revert = () => {
    setDraft(sortToDraft(initialData))
  }

  const save = () => {
    if (validationError) return
    const items: ChecklistTemplateItemWire[] = draft.map((item, idx) => ({
      key: item.key,
      label: item.label.trim(),
      order: idx,
    }))
    mutation.mutate(items)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t.operationsSettings.title}</h1>
      <p className="text-muted-foreground text-sm">
        {t.operationsSettings.subtitle}
      </p>

      <Card>
        <CardHeader>
          <CardTitle>{t.operationsSettings.sectionChecklist}</CardTitle>
          <CardDescription>
            {t.operationsSettings.sectionChecklistDesc}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {draft.length === 0 ? (
            <p className="text-muted-foreground text-sm italic">
              {t.operationsSettings.empty}
            </p>
          ) : (
            <ul
              className="flex flex-col gap-2"
              role="list"
              data-testid="operations-checklist-list"
            >
              {draft.map((item, idx) => (
                <li
                  key={item.key}
                  className="flex items-center gap-2"
                  data-testid={`operations-checklist-row-${idx}`}
                >
                  <Label htmlFor={`tpl-item-${item.key}`} className="sr-only">
                    {t.operationsSettings.labelAria(idx)}
                  </Label>
                  <Input
                    id={`tpl-item-${item.key}`}
                    value={item.label}
                    onChange={(e) => updateLabel(idx, e.target.value)}
                    disabled={mutation.isPending}
                    aria-label={t.operationsSettings.labelAria(idx)}
                    data-testid={`operations-checklist-input-${idx}`}
                  />
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={idx === 0 || mutation.isPending}
                    onClick={() => move(idx, -1)}
                    aria-label={t.operationsSettings.moveUpAria(item.label)}
                    data-testid={`operations-checklist-up-${idx}`}
                  >
                    <ArrowUp className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={idx === draft.length - 1 || mutation.isPending}
                    onClick={() => move(idx, 1)}
                    aria-label={t.operationsSettings.moveDownAria(item.label)}
                    data-testid={`operations-checklist-down-${idx}`}
                  >
                    <ArrowDown className="size-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={mutation.isPending}
                    onClick={() => removeAt(idx)}
                    aria-label={t.operationsSettings.removeAria(item.label)}
                    data-testid={`operations-checklist-remove-${idx}`}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-center gap-2">
            <Button
              type="button"
              variant="secondary"
              onClick={addItem}
              disabled={mutation.isPending}
              aria-label={t.operationsSettings.addAria}
              data-testid="operations-checklist-add"
            >
              {t.operationsSettings.addAction}
            </Button>
          </div>

          {validationError ? (
            <p role="alert" className="text-destructive text-xs">
              {validationError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <div className="flex justify-end gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={revert}
          disabled={!dirty || mutation.isPending}
          data-testid="operations-checklist-revert"
        >
          {t.operationsSettings.revert}
        </Button>
        <Button
          type="button"
          onClick={save}
          disabled={!dirty || !!validationError || mutation.isPending}
          data-testid="operations-checklist-save"
        >
          {mutation.isPending
            ? t.operationsSettings.saving
            : t.operationsSettings.save}
        </Button>
      </div>
    </div>
  )
}
