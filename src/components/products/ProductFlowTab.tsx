// landr-71kz.7 — "Flow" tab for the product editor.
//
// Lets the operator configure the booking step sequence for a single product:
//   • Pinned ghost row at top: "Product selection" (non-draggable)
//   • Draggable list of modules (selection, participants, accommodation,
//     service_addons, pickup, custom_form)
//   • Pinned ghost row at bottom: "Review & checkout" (non-draggable)
//   • "+ Add form" to attach a custom_form module from the operator's library
//
// Writes go directly to Supabase REST via product-flow.ts helpers (hybrid
// write-routing rule: plain row writes, no server-side side effects).
// The UNIQUE(product_id, position) constraint is DEFERRABLE, so a full
// position rewrite in one REST call is safe.
//
// Zero rows = "default flow" — we show an empty state explaining that without
// configuration the product uses the generic booking flow.

import { useState } from 'react'
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
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { GripVerticalIcon, PlusIcon, Trash2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import {
  deleteFlowModule,
  fetchFlowModules,
  fetchOperatorForms,
  insertFlowModule,
  MODULE_KIND_LABELS,
  STANDARD_KINDS,
  upsertFlowModulePositions,
  type FlowModule,
  type FormRef,
  type ModuleKind,
} from '@/lib/product-flow'

// ── Types ──────────────────────────────────────────────────────────────────

type Props = {
  productId: string
  operatorId: string
}

// ── Pinned ghost row ───────────────────────────────────────────────────────

function PinnedRow({ label }: { label: string }) {
  return (
    // landr-hxnb.8 — pinned steps use catalog-hue soft-bg + dashed border to convey
    // non-draggable status. Display font keeps them readable at a glance.
    <div
      aria-disabled="true"
      className="flex items-center gap-3 rounded-md border-2 border-dashed border-hue-catalog-vivid/40 bg-hue-catalog-soft-bg/50 px-3 py-2.5 text-sm opacity-70"
    >
      <GripVerticalIcon className="size-4 opacity-0" aria-hidden="true" />
      <span className="font-display text-hue-catalog-vivid font-medium">{label}</span>
    </div>
  )
}

// ── Sortable module row ────────────────────────────────────────────────────

type SortableModuleRowProps = {
  module: FlowModule
  forms: FormRef[]
  onDelete: (id: string) => void
}

function SortableModuleRow({ module, forms, onDelete }: SortableModuleRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: module.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Resolve form name for custom_form modules.
  const formName =
    module.module_kind === 'custom_form' && module.form_id
      ? (forms.find((f) => f.id === module.form_id)?.name ?? module.form_id)
      : null

  return (
    // landr-hxnb.8 — module cards: card-comic framing + catalog-hue handle affordance.
    // isDragging lifts with shadow-l to hint the active drag.
    <div
      ref={setNodeRef}
      style={style}
      className={[
        // landr-hxnb.8 — border-comic gives the draggable card its comic outline
        'flex items-center gap-3 rounded-md border-comic bg-card px-3 py-2.5 text-sm transition-shadow',
        isDragging ? 'opacity-50 shadow-l' : 'shadow-s',
      ]
        .filter(Boolean)
        .join(' ')}
    >
      {/* landr-hxnb.8 — characterful drag handle: catalog-hue on hover */}
      <button
        type="button"
        className="touch-none cursor-grab text-muted-foreground transition-colors hover:text-hue-catalog-vivid active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" aria-hidden="true" />
      </button>
      <span className="font-display flex-1 truncate font-medium">
        {MODULE_KIND_LABELS[module.module_kind]}
        {formName ? (
          <span className="ml-2 text-xs font-normal text-muted-foreground">({formName})</span>
        ) : null}
      </span>
      <button
        type="button"
        onClick={() => onDelete(module.id)}
        className="text-muted-foreground transition-colors hover:text-destructive"
        aria-label={`Remove ${MODULE_KIND_LABELS[module.module_kind]} step`}
      >
        <Trash2Icon className="size-4" />
      </button>
    </div>
  )
}

// ── Main component ─────────────────────────────────────────────────────────

export function ProductFlowTab({ productId, operatorId }: Props) {
  const qc = useQueryClient()
  const modulesKey = ['product-flow-modules', productId] as const
  const formsKey = ['operator-forms', operatorId] as const

  const modulesQuery = useQuery<FlowModule[]>({
    queryKey: modulesKey,
    queryFn: () => fetchFlowModules(productId),
    enabled: !!productId,
  })

  const formsQuery = useQuery<FormRef[]>({
    queryKey: formsKey,
    queryFn: () => fetchOperatorForms(operatorId),
    enabled: !!operatorId,
  })

  const modules = modulesQuery.data ?? []
  const forms = formsQuery.data ?? []

  // Optimistic display order (ids). null = follow server order.
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null)
  const serverIds = modules.map((m) => m.id)

  // Drop override once server confirms the new order.
  if (
    orderOverride !== null &&
    orderOverride.length === serverIds.length &&
    orderOverride.every((id, i) => serverIds[i] === id)
  ) {
    queueMicrotask(() => setOrderOverride(null))
  }

  const displayIds = orderOverride ?? serverIds
  const moduleById = new Map(modules.map((m) => [m.id, m]))
  const displayModules = displayIds
    .map((id) => moduleById.get(id))
    .filter((m): m is FlowModule => m !== undefined)

  // ── DnD ────────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorderMutation = useMutation({
    mutationFn: async (nextOrder: string[]) => {
      const updatedModules = nextOrder.map((id, idx) => {
        const m = moduleById.get(id)!
        return { ...m, position: idx + 1 }
      })
      await upsertFlowModulePositions(updatedModules)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: modulesKey })
    },
    onError: (err: Error) => {
      setOrderOverride(null)
      toast.error(`Failed to save order: ${err.message}`)
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return
    const current = orderOverride ?? serverIds
    const oldIndex = current.indexOf(String(active.id))
    const newIndex = current.indexOf(String(over.id))
    if (oldIndex < 0 || newIndex < 0) return
    const nextOrder = arrayMove(current, oldIndex, newIndex)
    setOrderOverride(nextOrder)
    reorderMutation.mutate(nextOrder)
  }

  // ── Add standard module ─────────────────────────────────────────────────

  const [addKind, setAddKind] = useState<ModuleKind>('participants')

  const addModuleMutation = useMutation({
    mutationFn: async ({ kind, formId }: { kind: ModuleKind; formId?: string }) => {
      const nextPosition = modules.length > 0
        ? Math.max(...modules.map((m) => m.position)) + 1
        : 1
      return insertFlowModule(productId, kind, nextPosition, formId)
    },
    onSuccess: (inserted) => {
      qc.setQueryData<FlowModule[]>(modulesKey, (prev) =>
        prev ? [...prev, inserted] : [inserted],
      )
    },
    onError: (err: Error) => {
      toast.error(`Failed to add module: ${err.message}`)
    },
  })

  // ── Add custom_form module ──────────────────────────────────────────────

  const [selectedFormId, setSelectedFormId] = useState<string>('')

  function handleAddForm() {
    if (!selectedFormId) return
    addModuleMutation.mutate({ kind: 'custom_form', formId: selectedFormId })
    setSelectedFormId('')
  }

  // ── Delete module ───────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteFlowModule(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: modulesKey })
      const previous = qc.getQueryData<FlowModule[]>(modulesKey)
      qc.setQueryData<FlowModule[]>(modulesKey, (prev) =>
        prev ? prev.filter((m) => m.id !== id) : prev,
      )
      return { previous }
    },
    onError: (err: Error, _id, ctx) => {
      if (ctx?.previous) qc.setQueryData(modulesKey, ctx.previous)
      toast.error(`Failed to remove module: ${err.message}`)
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: modulesKey })
    },
  })

  // ── Render ──────────────────────────────────────────────────────────────

  if (modulesQuery.isError) {
    return (
      <p role="alert" className="text-sm text-destructive">
        Failed to load flow configuration: {modulesQuery.error?.message}
      </p>
    )
  }

  const isLoading = modulesQuery.isPending

  return (
    <div className="flex flex-col gap-4">
      {/* landr-hxnb.8 — empty state: catalog-hue framing */}
      {!isLoading && modules.length === 0 ? (
        <Card className="card-comic bg-hue-catalog-soft-bg/40">
          <CardHeader>
            <CardTitle className="font-display text-base text-hue-catalog-vivid">Default booking flow</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              No modules configured — this product uses the default booking
              flow. Add steps below to customise the sequence for this product.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* Step list */}
      <div className="flex flex-col gap-2">
        {/* Top pinned: product selection */}
        <PinnedRow label="Product selection (pinned)" />

        {isLoading ? (
          <p className="text-sm text-muted-foreground px-1">Loading flow…</p>
        ) : (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext items={displayIds} strategy={verticalListSortingStrategy}>
              <div className="flex flex-col gap-2">
                {displayModules.map((module) => (
                  <SortableModuleRow
                    key={module.id}
                    module={module}
                    forms={forms}
                    onDelete={(id) => deleteMutation.mutate(id)}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        )}

        {/* Bottom pinned: review & checkout */}
        <PinnedRow label="Review & checkout (pinned)" />
      </div>

      {/* landr-hxnb.8 — "Add step" panel: surface-dense for information density */}
      <div className="surface-dense flex flex-col gap-2 rounded-md border p-3 shadow-s">
        <p className="font-display text-sm font-semibold">Add step</p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <NativeSelect
              aria-label="Module type to add"
              value={addKind}
              onChange={(e) => setAddKind(e.target.value as ModuleKind)}
            >
              {STANDARD_KINDS.map((k) => (
                <option key={k} value={k}>
                  {MODULE_KIND_LABELS[k]}
                </option>
              ))}
            </NativeSelect>
          </div>
          <Button
            type="button"
            size="sm"
            disabled={addModuleMutation.isPending}
            onClick={() => addModuleMutation.mutate({ kind: addKind })}
            className="font-display bg-hue-catalog-vivid text-hue-catalog-on-color hover:opacity-90"
          >
            <PlusIcon className="size-4" />
            Add
          </Button>
        </div>
      </div>

      {/* landr-hxnb.8 — "Attach custom form" panel: same dense well treatment */}
      {forms.length > 0 ? (
        <div className="surface-dense flex flex-col gap-2 rounded-md border p-3 shadow-s">
          <p className="font-display text-sm font-semibold">Attach custom form</p>
          <div className="flex items-end gap-2">
            <div className="flex-1">
              <NativeSelect
                aria-label="Form to attach"
                value={selectedFormId}
                onChange={(e) => setSelectedFormId(e.target.value)}
              >
                <option value="">Select a form…</option>
                {forms.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </NativeSelect>
            </div>
            <Button
              type="button"
              size="sm"
              disabled={!selectedFormId || addModuleMutation.isPending}
              onClick={handleAddForm}
              className="font-display bg-hue-catalog-vivid text-hue-catalog-on-color hover:opacity-90"
            >
              <PlusIcon className="size-4" />
              Add form
            </Button>
          </div>
        </div>
      ) : formsQuery.isSuccess && forms.length === 0 ? (
        <p className="px-1 text-sm text-muted-foreground">
          No forms in your library yet. Create one in Settings → Forms to attach it here.
        </p>
      ) : null}
    </div>
  )
}
