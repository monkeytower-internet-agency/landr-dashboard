/**
 * /settings/forms/:formId — full form-field builder editor (landr-71kz.6).
 *
 * Three-column layout:
 *   Left  — @dnd-kit sortable field list + add-field panel.
 *   Right — inspector for the selected field (type/key/label/help/
 *           required/validation/options/visibility_rule).
 *   Bottom — live preview pane that evaluates visibility rules in real
 *            time so the operator sees conditional behaviour.
 *
 * All writes go direct Supabase REST (RLS + audit triggers cover plain
 * row ops; no FastAPI endpoint needed — hybrid write-routing convention).
 * Gated behind the `form_builder` feature via the route declaration in
 * App.tsx (which already applies gatedSection for /settings/forms).
 */
import {
  type CSSProperties,
  useMemo,
  useRef,
  useState,
} from 'react'
import { Link, useParams } from 'react-router-dom'
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
import {
  ArrowLeftIcon,
  GripVerticalIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import { Switch } from '@/components/ui/switch'
import { LocalizedTextField } from '@/components/LocalizedTextField'
import {
  createFormField,
  deleteFormField,
  fetchFormFields,
  fetchForms,
  isFieldVisible,
  patchFormField,
  FIELD_TYPE_LABELS,
  FIELD_TYPES,
  type FieldOption,
  type FieldType,
  type FieldValidation,
  type FormField,
  type VisibilityRule,
} from '@/lib/forms'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

// ── helpers ──────────────────────────────────────────────────────────────────

/** Does this field type support options (select / radio / multiselect)? */
function hasOptions(ft: FieldType) {
  return ft === 'select' || ft === 'radio' || ft === 'multiselect'
}

/** Does this field type support number-range validation (min/max)? */
function hasNumberValidation(ft: FieldType) {
  return ft === 'number'
}

/** Does this field type support text-length + pattern validation? */
function hasTextValidation(ft: FieldType) {
  return ft === 'text' || ft === 'textarea'
}

/** Convert a label to a key candidate (same rules as nameToFormKey). */
function labelToKey(label: string) {
  return label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 64)
}

// ── page shell ────────────────────────────────────────────────────────────────

export function FormEditor() {
  const { formId } = useParams<{ formId: string }>()
  const { currentOperatorId } = useOperator()

  // Fetch the forms list to get the form name for the breadcrumb.
  const formsQuery = useQuery({
    queryKey: ['forms', currentOperatorId],
    queryFn: () => fetchForms(currentOperatorId!),
    enabled: !!currentOperatorId,
  })

  const form = formsQuery.data?.find((f) => f.id === formId)

  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.forms, to: '/settings/forms' },
          { label: form?.name ?? t.formEditor.crumb },
        ]}
      />

      {formsQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t.formEditor.loading}</p>
      ) : !formId ? (
        <p className="text-muted-foreground text-sm">{t.formEditor.notFound}</p>
      ) : (
        <>
          {/* landr-hxnb.8 — back link with catalog-hue hover */}
          <div className="mb-4">
            <Button asChild variant="outline" size="sm" className="font-display border-hue-catalog-vivid/40 hover:bg-hue-catalog-soft-bg hover:text-hue-catalog-vivid">
              <Link to="/settings/forms">
                <ArrowLeftIcon className="size-3.5" />
                {t.formEditor.backToLibrary}
              </Link>
            </Button>
          </div>
          <FormEditorBody formId={formId} />
        </>
      )}
    </>
  )
}

// ── main editor body ──────────────────────────────────────────────────────────

function FormEditorBody({ formId }: { formId: string }) {
  const qc = useQueryClient()
  const queryKey = ['form-fields', formId] as const

  const fieldsQuery = useQuery<FormField[]>({
    queryKey,
    queryFn: () => fetchFormFields(formId),
  })

  const [selectedId, setSelectedId] = useState<string | null>(null)
  // Optimistic position override for drag-and-drop.
  const [orderOverride, setOrderOverride] = useState<string[] | null>(null)

  const fields = fieldsQuery.data ?? []
  const serverOrder = fields.map((f) => f.id)
  const displayIds = orderOverride ?? serverOrder
  const fieldById = useMemo(() => new Map(fields.map((f) => [f.id, f])), [fields])
  const displayFields = displayIds
    .map((id) => fieldById.get(id))
    .filter((f): f is FormField => !!f)

  // Compute selected field; if the selected ID was deleted, treat as null (no
  // setState in an effect — just derive during render).
  const effectiveSelectedId =
    selectedId && fieldById.has(selectedId) ? selectedId : null
  const selectedField = effectiveSelectedId
    ? (fieldById.get(effectiveSelectedId) ?? null)
    : null

  function invalidate() {
    void qc.invalidateQueries({ queryKey })
  }

  // ── reorder ──────────────────────────────────────────────────────────────

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  )

  const reorderMutation = useMutation({
    mutationFn: async (changes: { id: string; position: number }[]) => {
      await Promise.all(
        changes.map((c) => patchFormField(c.id, { position: c.position })),
      )
    },
    onSuccess: () => {
      setOrderOverride(null)
      invalidate()
      toast.success(t.formEditor.toastReordered)
    },
    onError: (err: Error) => {
      setOrderOverride(null)
      toast.error(t.formEditor.toastReorderError, { description: err.message })
    },
  })

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const current = orderOverride ?? serverOrder
    const oldIdx = current.indexOf(String(active.id))
    const newIdx = current.indexOf(String(over.id))
    if (oldIdx < 0 || newIdx < 0) return

    const next = arrayMove(current, oldIdx, newIdx)
    setOrderOverride(next)

    // Build the minimal position changes (0-based sequential).
    const changes = next
      .map((id, idx) => ({ id, position: idx }))
      .filter(({ id, position }) => {
        const orig = fields.find((f) => f.id === id)
        return orig && orig.position !== position
      })
    if (changes.length === 0) return
    reorderMutation.mutate(changes)
  }

  // ── live preview answers (controlled by preview inputs) ───────────────────

  const [previewAnswers, setPreviewAnswers] = useState<Record<string, unknown>>(
    {},
  )

  function handlePreviewAnswer(key: string, value: unknown) {
    setPreviewAnswers((prev) => ({ ...prev, [key]: value }))
  }

  if (fieldsQuery.isError) {
    return (
      <p className="text-destructive text-sm" role="alert">
        {(fieldsQuery.error as Error).message}
      </p>
    )
  }

  return (
    <div className="flex flex-col gap-6">
      {/* ── top row: field list + inspector ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* ── left: field list + add ── landr-hxnb.8: catalog-hue panel border */}
        <section className="flex flex-col gap-3 rounded-md border-2 border-hue-catalog-vivid/20 bg-hue-catalog-soft-bg/20 p-4 shadow-s">
          <h2 className="font-display text-sm font-semibold text-hue-catalog-vivid">{t.formEditor.fieldsPanel}</h2>

          {fieldsQuery.isPending ? (
            <p className="text-muted-foreground text-sm">
              {t.formEditor.loading}
            </p>
          ) : displayFields.length === 0 ? (
            // landr-hxnb.8 — catalog-hue empty state for the field list
            <p className="rounded border-2 border-dashed border-hue-catalog-vivid/30 bg-hue-catalog-soft-bg/40 p-4 text-center text-sm text-muted-foreground">
              {t.formEditor.noFields}
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
                <ul className="flex flex-col divide-y rounded-md border">
                  {displayFields.map((field) => (
                    <SortableFieldRow
                      key={field.id}
                      field={field}
                      formId={formId}
                      isSelected={field.id === selectedId}
                      onSelect={() =>
                        setSelectedId((prev) =>
                          prev === field.id ? null : field.id,
                        )
                      }
                      onDeleted={invalidate}
                    />
                  ))}
                </ul>
              </SortableContext>
            </DndContext>
          )}

          <AddFieldPanel
            formId={formId}
            existingKeys={new Set(fields.map((f) => f.key))}
            nextPosition={fields.length}
            onCreated={(field) => {
              invalidate()
              setSelectedId(field.id)
            }}
          />
        </section>

        {/* ── right: inspector ── landr-hxnb.8: surface-dense for info density */}
        <section className="surface-dense flex flex-col gap-3 rounded-md border p-4 shadow-s">
          {selectedField ? (
            <FieldInspector
              key={selectedField.id}
              field={selectedField}
              precedingFields={displayFields.filter(
                (f) => f.id !== selectedField.id &&
                  displayIds.indexOf(f.id) < displayIds.indexOf(selectedField.id),
              )}
              onSaved={invalidate}
            />
          ) : (
            <p className="text-muted-foreground flex h-32 items-center justify-center text-sm">
              {t.formEditor.inspectorPlaceholder}
            </p>
          )}
        </section>
      </div>

      {/* ── preview pane ── landr-hxnb.8: framed as a comic "device" — warm cream bg + thick outline */}
      <section className="card-comic rounded-xl bg-[oklch(0.975_0.025_92)] p-4 shadow-m dark:bg-[oklch(0.16_0.008_35)]">
        <div className="mb-3 flex items-center gap-2">
          {/* "device" chrome strip */}
          <div className="h-2 w-2 rounded-full bg-hue-catalog-vivid/60" aria-hidden="true" />
          <div className="h-2 w-2 rounded-full bg-amber-400/60" aria-hidden="true" />
          <div className="h-2 w-2 rounded-full bg-green-400/60" aria-hidden="true" />
          <h2 className="font-display ml-2 text-sm font-semibold">{t.formEditor.previewTitle}</h2>
        </div>
        {displayFields.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.formEditor.previewEmpty}
          </p>
        ) : (
          <div className="flex max-w-lg flex-col gap-4">
            {displayFields.map((field) => (
              <PreviewField
                key={field.id}
                field={field}
                answers={previewAnswers}
                onAnswer={handlePreviewAnswer}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  )
}

// ── sortable field row ────────────────────────────────────────────────────────

type RowProps = {
  field: FormField
  formId: string
  isSelected: boolean
  onSelect: () => void
  onDeleted: () => void
}

function SortableFieldRow({ field, formId: _formId, isSelected, onSelect, onDeleted }: RowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: field.id })

  const style: CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  const [confirmDelete, setConfirmDelete] = useState(false)

  const deleteMutation = useMutation({
    mutationFn: () => deleteFormField(field.id),
    onSuccess: () => {
      onDeleted()
      toast.success(t.formEditor.toastDeleted)
      setConfirmDelete(false)
    },
    onError: (err: Error) => {
      toast.error(t.formEditor.toastDeleteError, { description: err.message })
    },
  })

  return (
    <li
      ref={setNodeRef}
      style={style}
      className={cn(
        // landr-hxnb.8 — field rows: selected = catalog-hue soft-bg; idle = card bg.
        'flex items-center gap-2 p-3 transition-colors',
        isSelected
          ? 'bg-hue-catalog-soft-bg'
          : 'hover:bg-hue-catalog-soft-bg/40',
      )}
      data-testid={`field-row-${field.id}`}
    >
      {/* landr-hxnb.8 — characterful drag handle: catalog-hue on hover/grab */}
      <button
        type="button"
        className="touch-none cursor-grab text-muted-foreground transition-colors hover:text-hue-catalog-vivid active:cursor-grabbing"
        aria-label="Drag to reorder"
        {...attributes}
        {...listeners}
      >
        <GripVerticalIcon className="size-4" />
      </button>

      {/* Field info — click to select */}
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        onClick={onSelect}
        aria-pressed={isSelected}
      >
        <span className="font-display block truncate text-sm font-medium">{field.label}</span>
        {/* landr-hxnb.8 — field-type chip: catalog-hue pill, playful */}
        <span className="mt-0.5 flex items-center gap-1.5">
          <span className="font-display inline-flex items-center rounded-full bg-hue-catalog-soft-bg px-1.5 py-px text-[10px] font-semibold uppercase tracking-wide text-hue-catalog-vivid">
            {FIELD_TYPE_LABELS[field.field_type]}
          </span>
          <span className="text-muted-foreground truncate font-mono text-xs">
            {field.key}
            {field.required ? ' · *' : ''}
          </span>
        </span>
      </button>

      {/* Delete */}
      {confirmDelete ? (
        <div className="flex shrink-0 items-center gap-1">
          <Button
            type="button"
            size="sm"
            variant="destructive"
            disabled={deleteMutation.isPending}
            onClick={() => deleteMutation.mutate()}
            data-testid={`field-row-${field.id}-confirm-delete`}
          >
            {deleteMutation.isPending
              ? t.formEditor.deletingField
              : t.formEditor.deleteFieldConfirm}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="ghost"
            onClick={() => setConfirmDelete(false)}
          >
            {t.formEditor.deleteFieldCancel}
          </Button>
        </div>
      ) : (
        <Button
          type="button"
          size="icon-sm"
          variant="ghost"
          aria-label={t.formEditor.deleteField}
          onClick={() => setConfirmDelete(true)}
          data-testid={`field-row-${field.id}-delete`}
        >
          <Trash2Icon className="size-3.5" />
        </Button>
      )}
    </li>
  )
}

// ── add-field panel ───────────────────────────────────────────────────────────

type AddFieldPanelProps = {
  formId: string
  existingKeys: Set<string>
  nextPosition: number
  onCreated: (field: FormField) => void
}

function AddFieldPanel({
  formId,
  existingKeys,
  nextPosition,
  onCreated,
}: AddFieldPanelProps) {
  const [type, setType] = useState<FieldType>('text')
  const [label, setLabel] = useState('')
  const [key, setKey] = useState('')
  const [keyTouched, setKeyTouched] = useState(false)

  const derivedKey = keyTouched ? key : labelToKey(label)
  const dupeKey = !!derivedKey && existingKeys.has(derivedKey)
  const canAdd =
    label.trim().length > 0 &&
    derivedKey.length > 0 &&
    !dupeKey

  const addMutation = useMutation({
    mutationFn: () =>
      createFormField(formId, {
        key: derivedKey,
        field_type: type,
        label: label.trim(),
        position: nextPosition,
      }),
    onSuccess: (field) => {
      onCreated(field)
      setLabel('')
      setKey('')
      setKeyTouched(false)
      setType('text')
    },
    onError: (err: Error) => {
      toast.error('Could not add field', { description: err.message })
    },
  })

  return (
    // landr-hxnb.8 — "add field" panel: catalog-hue tint to signal "creation zone"
    <div className="flex flex-col gap-3 rounded-md border-2 border-dashed border-hue-catalog-vivid/30 bg-hue-catalog-soft-bg/30 p-3">
      <p className="font-display text-xs font-semibold text-hue-catalog-vivid">{t.formEditor.addField}</p>

      <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap sm:items-end">
        <div className="flex flex-col gap-1">
          <label className="text-xs" htmlFor="add-field-type">
            {t.formEditor.addFieldType}
          </label>
          <NativeSelect
            id="add-field-type"
            value={type}
            onChange={(e) => setType(e.target.value as FieldType)}
            className="h-8 text-sm sm:w-36"
          >
            {FIELD_TYPES.map((ft) => (
              <option key={ft} value={ft}>
                {FIELD_TYPE_LABELS[ft]}
              </option>
            ))}
          </NativeSelect>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs" htmlFor="add-field-label">
            {t.formEditor.addFieldLabel}
          </label>
          <Input
            id="add-field-label"
            value={label}
            onChange={(e) => {
              setLabel(e.target.value)
              if (!keyTouched) setKey(labelToKey(e.target.value))
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                if (canAdd && !addMutation.isPending) addMutation.mutate()
              }
            }}
            placeholder={t.formEditor.addFieldLabelPlaceholder}
            maxLength={200}
            className="h-8 text-sm sm:w-52"
            data-testid="add-field-label"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs" htmlFor="add-field-key">
            {t.formEditor.addFieldKey}
          </label>
          <Input
            id="add-field-key"
            value={derivedKey}
            onChange={(e) => {
              setKeyTouched(true)
              setKey(
                e.target.value
                  .toLowerCase()
                  .replace(/[^a-z0-9_]/g, '_')
                  .replace(/^_+/, '')
                  .slice(0, 64),
              )
            }}
            placeholder={t.formEditor.addFieldKeyPlaceholder}
            maxLength={64}
            className="h-8 font-mono text-sm sm:w-44"
            data-testid="add-field-key"
          />
        </div>

        {/* landr-hxnb.8 — catalog-hue CTA for field creation */}
        <Button
          type="button"
          size="sm"
          disabled={!canAdd || addMutation.isPending}
          onClick={() => addMutation.mutate()}
          data-testid="add-field-submit"
          className="font-display bg-hue-catalog-vivid text-hue-catalog-on-color hover:opacity-90"
        >
          <PlusIcon className="size-4" />
          {addMutation.isPending
            ? t.formEditor.addFieldCreating
            : t.formEditor.addFieldCreate}
        </Button>
      </div>
      {dupeKey && (
        <p className="text-destructive text-xs" role="alert">
          {t.formEditor.addFieldDupeKey}
        </p>
      )}
    </div>
  )
}

// ── field inspector ───────────────────────────────────────────────────────────

type InspectorProps = {
  field: FormField
  /** Fields that come BEFORE this one in position order (visibility rule choices). */
  precedingFields: FormField[]
  onSaved: () => void
}

function FieldInspector({ field, precedingFields, onSaved }: InspectorProps) {
  // Local drafts — we auto-save on blur / change for booleans + selects.
  const [label, setLabel] = useState(field.label)
  const [labelLocalized, setLabelLocalized] = useState(
    field.label_localized ?? null,
  )
  const [helpText, setHelpText] = useState(field.help_text ?? '')
  const [helpLocalized, setHelpLocalized] = useState(
    field.help_text_localized ?? null,
  )
  const [required, setRequired] = useState(field.required)
  const [validation, setValidation] = useState<FieldValidation>(
    field.validation ?? {},
  )
  const [options, setOptions] = useState<FieldOption[]>(field.options ?? [])
  const [visRule, setVisRule] = useState<VisibilityRule | null>(
    field.visibility_rule ?? null,
  )
  const [busy, setBusy] = useState(false)

  // Track what was last saved to avoid spurious saves.
  const savedRef = useRef({
    label: field.label,
    labelLocalized: field.label_localized,
    helpText: field.help_text ?? '',
    helpLocalized: field.help_text_localized,
    required: field.required,
    validation: field.validation,
    options: field.options,
    visRule: field.visibility_rule,
  })

  async function save(patch: Parameters<typeof patchFormField>[1]) {
    if (busy) return
    setBusy(true)
    try {
      await patchFormField(field.id, patch)
      toast.success(t.formEditor.toastSaved)
      onSaved()
    } catch (err) {
      toast.error(t.formEditor.toastSaveError, {
        description: (err as Error).message,
      })
    } finally {
      setBusy(false)
    }
  }

  function saveLabel() {
    const trimmed = label.trim()
    if (!trimmed) { setLabel(savedRef.current.label); return }
    if (trimmed === savedRef.current.label && labelLocalized === savedRef.current.labelLocalized) return
    savedRef.current.label = trimmed
    savedRef.current.labelLocalized = labelLocalized
    void save({ label: trimmed, label_localized: labelLocalized })
  }

  function saveHelp() {
    const trimmed = helpText.trim() || null
    const prevTrimmed = savedRef.current.helpText.trim() || null
    if (trimmed === prevTrimmed && helpLocalized === savedRef.current.helpLocalized) return
    savedRef.current.helpText = trimmed ?? ''
    savedRef.current.helpLocalized = helpLocalized
    void save({ help_text: trimmed, help_text_localized: helpLocalized })
  }

  function toggleRequired() {
    const next = !required
    setRequired(next)
    savedRef.current.required = next
    void save({ required: next })
  }

  function saveValidation(next: FieldValidation) {
    setValidation(next)
    savedRef.current.validation = next
    void save({ validation: Object.keys(next).length > 0 ? next : null })
  }

  function saveOptions(next: FieldOption[]) {
    setOptions(next)
    savedRef.current.options = next
    void save({ options: next.length > 0 ? next : null })
  }

  function saveVisRule(next: VisibilityRule | null) {
    setVisRule(next)
    savedRef.current.visRule = next
    void save({ visibility_rule: next })
  }

  const ft = field.field_type

  return (
    <div className="flex flex-col gap-5">
      {/* landr-hxnb.8 — inspector header: display font + catalog-hue accent */}
      <h2 className="font-display text-sm font-semibold">{field.label}</h2>

      {/* ── field type (read-only display) ── landr-hxnb.8: playful catalog chip */}
      <div>
        <p className="mb-1 text-xs font-medium">{t.formEditor.sectionType}</p>
        <span className="font-display inline-flex items-center rounded-full bg-hue-catalog-soft-bg px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide text-hue-catalog-vivid">
          {FIELD_TYPE_LABELS[ft]}
        </span>
      </div>

      {/* ── key (read-only) ── landr-hxnb.8: surface-dense code badge */}
      <div>
        <p className="mb-1 text-xs font-medium">{t.formEditor.sectionKey}</p>
        <code className="rounded bg-[var(--surface-dense)] px-2 py-0.5 font-mono text-xs">{field.key}</code>
        <p className="mt-1 text-xs text-muted-foreground">
          {t.formEditor.keyImmutableWarning}
        </p>
      </div>

      {/* ── label + localization ── */}
      <div>
        <Label className="mb-1 text-xs font-medium" htmlFor="inspector-label">
          {t.formEditor.sectionLabel}
        </Label>
        <LocalizedTextField
          id="inspector-label"
          label={t.formEditor.labelBase}
          base={label}
          localized={labelLocalized}
          onChange={(base, loc) => {
            setLabel(base)
            setLabelLocalized(loc)
          }}
        />
        {/* Save on blur of the whole group — use a wrapper div with onBlur */}
        <div
          onBlur={(e) => {
            // Only trigger save when focus leaves the label group entirely.
            if (!e.currentTarget.contains(e.relatedTarget as Node | null)) {
              saveLabel()
            }
          }}
          className="sr-only"
          aria-hidden
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={saveLabel}
          className="mt-2"
        >
          {busy ? t.formEditor.saving : t.formEditor.save}
        </Button>
      </div>

      {/* ── help text + localization ── */}
      <div>
        <Label className="mb-1 text-xs font-medium" htmlFor="inspector-help">
          {t.formEditor.sectionHelp}
        </Label>
        <LocalizedTextField
          id="inspector-help"
          label={t.formEditor.helpBase}
          base={helpText}
          localized={helpLocalized}
          multiline
          onChange={(base, loc) => {
            setHelpText(base)
            setHelpLocalized(loc)
          }}
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={saveHelp}
          className="mt-2"
        >
          {busy ? t.formEditor.saving : t.formEditor.save}
        </Button>
      </div>

      {/* ── required toggle ── */}
      <div className="flex items-center gap-3">
        <Switch
          checked={required}
          disabled={busy}
          onClick={toggleRequired}
          aria-label={t.formEditor.requiredLabel}
          data-testid="inspector-required"
        />
        <span className="text-sm">{t.formEditor.requiredLabel}</span>
      </div>

      {/* ── validation ── */}
      {(hasNumberValidation(ft) || hasTextValidation(ft)) && (
        <div>
          <p className="mb-2 text-xs font-medium">{t.formEditor.sectionValidation}</p>
          <div className="flex flex-col gap-2">
            {hasNumberValidation(ft) && (
              <div className="flex flex-wrap gap-3">
                <ValidationInput
                  label={t.formEditor.validationMin}
                  value={String(validation.min ?? '')}
                  onChange={(v) =>
                    saveValidation({ ...validation, min: v ? Number(v) : undefined })
                  }
                  type="number"
                />
                <ValidationInput
                  label={t.formEditor.validationMax}
                  value={String(validation.max ?? '')}
                  onChange={(v) =>
                    saveValidation({ ...validation, max: v ? Number(v) : undefined })
                  }
                  type="number"
                />
              </div>
            )}
            {hasTextValidation(ft) && (
              <>
                <div className="flex flex-wrap gap-3">
                  <ValidationInput
                    label={t.formEditor.validationMinLength}
                    value={String(validation.min_length ?? '')}
                    onChange={(v) =>
                      saveValidation({
                        ...validation,
                        min_length: v ? Number(v) : undefined,
                      })
                    }
                    type="number"
                  />
                  <ValidationInput
                    label={t.formEditor.validationMaxLength}
                    value={String(validation.max_length ?? '')}
                    onChange={(v) =>
                      saveValidation({
                        ...validation,
                        max_length: v ? Number(v) : undefined,
                      })
                    }
                    type="number"
                  />
                </div>
                <ValidationInput
                  label={t.formEditor.validationPattern}
                  value={validation.pattern ?? ''}
                  onChange={(v) =>
                    saveValidation({ ...validation, pattern: v || undefined })
                  }
                  type="text"
                  wide
                />
              </>
            )}
          </div>
        </div>
      )}

      {/* ── options editor ── */}
      {hasOptions(ft) && (
        <OptionsEditor options={options} onSave={saveOptions} busy={busy} />
      )}

      {/* ── visibility rule ── */}
      {precedingFields.length > 0 && (
        <VisibilityRuleEditor
          rule={visRule}
          precedingFields={precedingFields}
          onSave={saveVisRule}
          busy={busy}
        />
      )}
    </div>
  )
}

// ── validation input helper ───────────────────────────────────────────────────

function ValidationInput({
  label,
  value,
  onChange,
  type,
  wide = false,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  type: 'number' | 'text'
  wide?: boolean
}) {
  // Uncontrolled input initialised from `value` prop. If the parent
  // remounts with a new value (field switch), the caller should pass `key`.
  const [draft, setDraft] = useState(value)

  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs">{label}</label>
      <Input
        type={type}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(draft)}
        onKeyDown={(e) => { if (e.key === 'Enter') onChange(draft) }}
        className={cn('h-8 text-sm', wide ? 'w-full' : 'w-28')}
      />
    </div>
  )
}

// ── options editor ────────────────────────────────────────────────────────────

function OptionsEditor({
  options,
  onSave,
  busy,
}: {
  options: FieldOption[]
  onSave: (opts: FieldOption[]) => void
  busy: boolean
}) {
  // Local working copy — separated from the saved list so the user can edit
  // multiple rows before committing. FieldInspector remounts this via `key`
  // on field change, so initialisation from prop is correct (no sync effect).
  const [draft, setDraft] = useState<FieldOption[]>(options)

  function update(idx: number, patch: Partial<FieldOption>) {
    setDraft((prev) => prev.map((o, i) => (i === idx ? { ...o, ...patch } : o)))
  }

  function remove(idx: number) {
    setDraft((prev) => prev.filter((_, i) => i !== idx))
  }

  function add() {
    setDraft((prev) => [
      ...prev,
      { value: '', label: '', label_localized: null },
    ])
  }

  return (
    <div>
      <p className="mb-2 text-xs font-medium">{t.formEditor.sectionOptions}</p>
      <div className="flex flex-col gap-2">
        {draft.map((opt, idx) => (
          <div key={idx} className="flex flex-wrap items-start gap-2">
            <div className="flex flex-col gap-1">
              <label className="text-xs">{t.formEditor.optionValue}</label>
              <Input
                value={opt.value}
                onChange={(e) => update(idx, { value: e.target.value })}
                className="h-8 w-28 font-mono text-sm"
                placeholder="option_value"
              />
            </div>
            <div className="flex-1 flex-col gap-1" style={{ minWidth: 120 }}>
              <label className="text-xs">{t.formEditor.optionLabel}</label>
              <LocalizedTextField
                label={t.formEditor.optionLabel}
                base={opt.label}
                localized={opt.label_localized}
                onChange={(base, loc) => update(idx, { label: base, label_localized: loc })}
              />
            </div>
            <Button
              type="button"
              size="icon-sm"
              variant="ghost"
              aria-label={t.formEditor.removeOption}
              onClick={() => remove(idx)}
              className="mt-4"
            >
              <Trash2Icon className="size-3.5" />
            </Button>
          </div>
        ))}
        <div className="flex gap-2">
          <Button type="button" size="sm" variant="outline" onClick={add}>
            <PlusIcon className="size-3.5" />
            {t.formEditor.addOption}
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={busy}
            onClick={() => onSave(draft)}
          >
            {busy ? t.formEditor.saving : t.formEditor.save}
          </Button>
        </div>
      </div>
    </div>
  )
}

// ── visibility rule editor ────────────────────────────────────────────────────

const OP_LABELS: Record<NonNullable<VisibilityRule['op']>, string> = {
  eq: 'equals',
  neq: 'not equals',
  in: 'is one of (comma-separated)',
  truthy: 'is checked / non-empty',
}

function VisibilityRuleEditor({
  rule,
  precedingFields,
  onSave,
  busy,
}: {
  rule: VisibilityRule | null
  precedingFields: FormField[]
  onSave: (r: VisibilityRule | null) => void
  busy: boolean
}) {
  const [enabled, setEnabled] = useState(rule !== null)
  const [fieldKey, setFieldKey] = useState(rule?.field_key ?? precedingFields[0]?.key ?? '')
  const [op, setOp] = useState<VisibilityRule['op']>(rule?.op ?? 'eq')
  const [value, setValue] = useState(
    rule?.value ? (Array.isArray(rule.value) ? rule.value.join(', ') : String(rule.value)) : '',
  )

  function toggle(next: boolean) {
    setEnabled(next)
    if (!next) onSave(null)
  }

  function save() {
    if (!enabled) { onSave(null); return }
    if (!fieldKey) return
    const parsedValue: VisibilityRule['value'] =
      op === 'truthy'
        ? null
        : op === 'in'
          ? value.split(',').map((s) => s.trim()).filter(Boolean)
          : value.trim() || null
    onSave({ field_key: fieldKey, op, value: parsedValue })
  }

  return (
    <div>
      <div className="mb-2 flex items-center gap-3">
        <p className="text-xs font-medium">{t.formEditor.sectionVisibility}</p>
        <Switch
          checked={enabled}
          onClick={() => toggle(!enabled)}
          aria-label={t.formEditor.sectionVisibility}
          size="sm"
          disabled={busy}
        />
      </div>

      {enabled && (
        <div className="flex flex-col gap-2">
          <div className="flex flex-col gap-1">
            <label className="text-xs">{t.formEditor.visibilityFieldLabel}</label>
            <NativeSelect
              value={fieldKey}
              onChange={(e) => setFieldKey(e.target.value)}
              className="h-8 text-sm"
            >
              {precedingFields.map((f) => (
                <option key={f.key} value={f.key}>
                  {f.label} ({f.key})
                </option>
              ))}
            </NativeSelect>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs">{t.formEditor.visibilityOpLabel}</label>
            <NativeSelect
              value={op}
              onChange={(e) => setOp(e.target.value as VisibilityRule['op'])}
              className="h-8 text-sm"
            >
              {(Object.entries(OP_LABELS) as [VisibilityRule['op'], string][]).map(
                ([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ),
              )}
            </NativeSelect>
          </div>

          {op !== 'truthy' && (
            <div className="flex flex-col gap-1">
              <label className="text-xs">{t.formEditor.visibilityValueLabel}</label>
              <Input
                value={value}
                onChange={(e) => setValue(e.target.value)}
                className="h-8 text-sm"
                placeholder={op === 'in' ? 'val1, val2, val3' : 'value'}
              />
            </div>
          )}

          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={save}
          >
            {busy ? t.formEditor.saving : t.formEditor.save}
          </Button>
        </div>
      )}
    </div>
  )
}

// ── live preview renderer ─────────────────────────────────────────────────────
// Re-implements the widget renderer at small-scale here. No import from
// landr-booking-widget (cross-repo import prohibited). The isFieldVisible()
// helper from lib/forms.ts is the shared visibility contract — the widget
// worker (71kz.4) should mirror this exact logic.

type PreviewFieldProps = {
  field: FormField
  answers: Record<string, unknown>
  onAnswer: (key: string, value: unknown) => void
}

function PreviewField({ field, answers, onAnswer }: PreviewFieldProps) {
  const visible = isFieldVisible(field.visibility_rule, answers)
  if (!visible) return null

  const value = answers[field.key]
  const id = `preview-${field.id}`

  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium">
        {field.label}
        {field.required && (
          <span className="text-muted-foreground ml-1 text-xs">
            {t.formEditor.previewRequired}
          </span>
        )}
      </label>
      {field.help_text && (
        <p className="text-muted-foreground text-xs">{field.help_text}</p>
      )}
      <PreviewInput field={field} value={value} id={id} onAnswer={onAnswer} />
    </div>
  )
}

function PreviewInput({
  field,
  value,
  id,
  onAnswer,
}: {
  field: FormField
  value: unknown
  id: string
  onAnswer: (key: string, value: unknown) => void
}) {
  const ft = field.field_type

  if (ft === 'textarea') {
    return (
      <Textarea
        id={id}
        value={String(value ?? '')}
        onChange={(e) => onAnswer(field.key, e.target.value)}
        placeholder={t.formEditor.previewPlaceholderText}
        className="text-sm"
        rows={3}
      />
    )
  }

  if (ft === 'number') {
    return (
      <Input
        id={id}
        type="number"
        value={String(value ?? '')}
        onChange={(e) => onAnswer(field.key, e.target.value)}
        placeholder={t.formEditor.previewPlaceholderNumber}
        className="h-8 text-sm"
        min={field.validation?.min}
        max={field.validation?.max}
      />
    )
  }

  if (ft === 'checkbox') {
    return (
      <div className="flex items-center gap-2">
        <input
          id={id}
          type="checkbox"
          checked={Boolean(value)}
          onChange={(e) => onAnswer(field.key, e.target.checked)}
          className="h-4 w-4 rounded border"
        />
        <label htmlFor={id} className="text-sm">
          {t.formEditor.previewCheckboxLabel}
        </label>
      </div>
    )
  }

  if (ft === 'select' || ft === 'radio' || ft === 'multiselect') {
    const opts = field.options ?? []

    if (ft === 'radio') {
      return (
        <div className="flex flex-col gap-1">
          {opts.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name={id}
                value={opt.value}
                checked={value === opt.value}
                onChange={() => onAnswer(field.key, opt.value)}
                className="h-4 w-4"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )
    }

    if (ft === 'multiselect') {
      const selected = Array.isArray(value) ? (value as string[]) : []
      return (
        <div className="flex flex-col gap-1">
          {opts.map((opt) => (
            <label key={opt.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                value={opt.value}
                checked={selected.includes(opt.value)}
                onChange={(e) => {
                  const next = e.target.checked
                    ? [...selected, opt.value]
                    : selected.filter((v) => v !== opt.value)
                  onAnswer(field.key, next)
                }}
                className="h-4 w-4 rounded border"
              />
              {opt.label}
            </label>
          ))}
        </div>
      )
    }

    // select
    return (
      <NativeSelect
        id={id}
        value={String(value ?? '')}
        onChange={(e) => onAnswer(field.key, e.target.value)}
        className="h-8 text-sm"
      >
        <option value="">{t.formEditor.previewPlaceholderSelect}</option>
        {opts.map((opt) => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </NativeSelect>
    )
  }

  if (ft === 'language') {
    // Minimal language picker — same set the widget uses (en/de/es/fr).
    const LANGS = [
      { code: 'en', label: 'English' },
      { code: 'de', label: 'Deutsch' },
      { code: 'es', label: 'Español' },
      { code: 'fr', label: 'Français' },
    ]
    return (
      <NativeSelect
        id={id}
        value={String(value ?? '')}
        onChange={(e) => onAnswer(field.key, e.target.value)}
        className="h-8 text-sm"
      >
        <option value="">{t.formEditor.previewPlaceholderLanguage}</option>
        {LANGS.map((l) => (
          <option key={l.code} value={l.code}>
            {l.label}
          </option>
        ))}
      </NativeSelect>
    )
  }

  // default: text
  return (
    <Input
      id={id}
      type="text"
      value={String(value ?? '')}
      onChange={(e) => onAnswer(field.key, e.target.value)}
      placeholder={t.formEditor.previewPlaceholderText}
      className="h-8 text-sm"
      maxLength={
        field.validation?.max_length ?? undefined
      }
    />
  )
}

