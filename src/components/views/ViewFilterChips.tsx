// landr-hgtv — Filter chips for a View's config.filters.
//
// Chip pattern mirrors BookingsFilters / ApprovalsFilters:
//   - Each chip renders 'Field op values' and opens a popover on click.
//   - The popover steps through field → op → values, then commits via
//     onChange. Removing a chip drops it from the array.
//   - A leading '+ Filter' button opens the same popover in 'add' mode.
//
// Multi-value within a single chip = OR; multiple chips = AND (matches the
// agreed v1 from the grilling).

import { useState } from 'react'
import { Plus, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { Checkbox } from '@/components/ui/checkbox'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  FILTER_OP_LABELS,
  MULTI_VALUE_OPS,
  VALUELESS_OPS,
  type Filter,
  type FilterOp,
  type FilterValue,
} from '@/lib/views-filters'
import {
  fieldLabel,
  fieldsFor,
  findField,
  opsFor,
  valueLabel,
  type ViewField,
} from '@/lib/views-entity-fields'
import {
  CUSTOM_N_DAYS_MAX,
  CUSTOM_N_DAYS_MIN,
  RELATIVE_PRESETS,
  buildCustomNDaysRange,
  describeCustomNDaysRange,
  describeRelativeToken,
  detectCustomNDaysRange,
  findRangePreset,
  findSinglePreset,
  isRelativeToken,
  validateCustomNDays,
  type RelativePreset,
} from '@/lib/views-relative-dates'
import { t } from '@/lib/strings'
// landr-iz58 — tag-typed filter values resolve through the operator's tag list.
import { useQuery } from '@tanstack/react-query'
import { fetchTags, type Tag } from '@/lib/tags'
import { useOperator } from '@/lib/operator'

type Props = {
  entityType: string
  filters: Filter[]
  onChange: (next: Filter[]) => void
  testIdPrefix?: string
}

export function ViewFilterChips({
  entityType,
  filters,
  onChange,
  testIdPrefix = 'view-filters',
}: Props) {
  function removeAt(index: number) {
    const next = filters.slice()
    next.splice(index, 1)
    onChange(next)
  }

  function replaceAt(index: number, filter: Filter) {
    const next = filters.slice()
    next[index] = filter
    onChange(next)
  }

  function add(filter: Filter) {
    onChange([...filters, filter])
  }

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      data-testid={`${testIdPrefix}-bar`}
    >
      {filters.map((f, i) => (
        <FilterChip
          key={`${f.field}-${i}`}
          entityType={entityType}
          filter={f}
          onSave={(next) => replaceAt(i, next)}
          onRemove={() => removeAt(i)}
          testId={`${testIdPrefix}-chip-${i}`}
        />
      ))}
      <AddFilterButton
        entityType={entityType}
        onAdd={add}
        testId={`${testIdPrefix}-add`}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------

type FilterChipProps = {
  entityType: string
  filter: Filter
  onSave: (next: Filter) => void
  onRemove: () => void
  testId: string
}

function FilterChip({
  entityType,
  filter,
  onSave,
  onRemove,
  testId,
}: FilterChipProps) {
  const [open, setOpen] = useState(false)
  const field = findField(entityType, filter.field)
  const labelText = renderChipLabel(entityType, filter)

  return (
    <div className="inline-flex items-center" data-testid={testId}>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 rounded-r-none px-2 text-xs"
            data-testid={`${testId}-trigger`}
            aria-label={labelText}
          >
            {labelText}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          className="w-80 p-3"
          data-testid={`${testId}-popover`}
        >
          <FilterEditor
            entityType={entityType}
            initial={filter}
            onCommit={(next) => {
              onSave(next)
              setOpen(false)
            }}
            onCancel={() => setOpen(false)}
            disableFieldChange={!field}
          />
        </PopoverContent>
      </Popover>
      <Button
        type="button"
        size="sm"
        variant="outline"
        onClick={onRemove}
        className="border-input h-7 rounded-l-none border-l-0 px-1.5"
        aria-label={t.views.filters.remove}
        data-testid={`${testId}-remove`}
      >
        <X className="size-3" aria-hidden="true" />
      </Button>
    </div>
  )
}

function renderChipLabel(entityType: string, f: Filter): string {
  const label = fieldLabel(entityType, f.field)
  const op = FILTER_OP_LABELS[f.op]
  if (VALUELESS_OPS.has(f.op)) return `${label} ${op}`
  if (f.values.length === 0) return `${label} ${op} …`

  const field = findField(entityType, f.field)
  // landr-iz58 — tag chips render "Tag is N selected" rather than the
  // raw uuids, since labels live in operator_tags (not the registry).
  // The popover surface still shows colored names; this keeps the chip
  // bar compact + readable.
  if (field?.type === 'tag') {
    const count = f.values.length
    if (count === 1) return `${label} ${op} 1 tag`
    return `${label} ${op} ${count} tags`
  }
  // landr-1zxt — date fields with relative tokens show the human label
  // ("This week") instead of resolved dates. For 'within' with two
  // relative tokens that match a known preset pair, compress to that
  // preset's label ("Start date is in This week").
  if (field?.type === 'date') {
    const allRelative = f.values.every((v) => isRelativeToken(v))
    if (allRelative) {
      if (f.op === 'within' && f.values.length === 2) {
        const preset = findRangePreset(String(f.values[0]), String(f.values[1]))
        if (preset) return `${label} is in ${preset.label}`
        // landr-qc72 — compress custom Next/Last N days ranges.
        const custom = detectCustomNDaysRange(
          String(f.values[0]),
          String(f.values[1]),
        )
        if (custom) return `${label} is in ${describeCustomNDaysRange(custom)}`
        return `${label} is in ${describeRelativeToken(String(f.values[0]))} → ${describeRelativeToken(String(f.values[1]))}`
      }
      const tokens = f.values
        .slice(0, 3)
        .map((v) => describeRelativeToken(String(v)))
        .join(', ')
      const more = f.values.length > 3 ? ` +${f.values.length - 3}` : ''
      return `${label} ${op} ${tokens}${more}`
    }
  }

  const vals = f.values
    .slice(0, 3)
    .map((v) => valueLabel(entityType, f.field, v))
    .join(', ')
  const more = f.values.length > 3 ? ` +${f.values.length - 3}` : ''
  return `${label} ${op} ${vals}${more}`
}

// ---------------------------------------------------------------------------

type AddFilterButtonProps = {
  entityType: string
  onAdd: (filter: Filter) => void
  testId: string
}

function AddFilterButton({ entityType, onAdd, testId }: AddFilterButtonProps) {
  const [open, setOpen] = useState(false)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="text-muted-foreground h-7 gap-1 px-2 text-xs"
          data-testid={`${testId}-trigger`}
        >
          <Plus className="size-3" aria-hidden="true" />
          {t.views.filters.addFilter}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-80 p-3"
        data-testid={`${testId}-popover`}
      >
        <FilterEditor
          entityType={entityType}
          initial={null}
          onCommit={(next) => {
            onAdd(next)
            setOpen(false)
          }}
          onCancel={() => setOpen(false)}
        />
      </PopoverContent>
    </Popover>
  )
}

// ---------------------------------------------------------------------------

type FilterEditorProps = {
  entityType: string
  initial: Filter | null
  onCommit: (filter: Filter) => void
  onCancel: () => void
  /** When the chip's field is unknown (e.g. stale config), forbid switching. */
  disableFieldChange?: boolean
}

function FilterEditor({
  entityType,
  initial,
  onCommit,
  onCancel,
  disableFieldChange,
}: FilterEditorProps) {
  const fields = fieldsFor(entityType).filter((f) => f.filterable)
  const initialField =
    initial && findField(entityType, initial.field)
      ? findField(entityType, initial.field)!
      : fields[0]

  const [fieldKey, setFieldKey] = useState<string>(
    initial?.field ?? initialField?.key ?? '',
  )
  const currentField =
    findField(entityType, fieldKey) ?? initialField ?? fields[0]

  const allowedOps = currentField ? opsFor(currentField.type) : []
  const [op, setOp] = useState<FilterOp>(
    initial?.op && allowedOps.includes(initial.op) ? initial.op : allowedOps[0]!,
  )
  const [values, setValues] = useState<FilterValue[]>(initial?.values ?? [])

  function handleFieldChange(nextKey: string) {
    setFieldKey(nextKey)
    const f = findField(entityType, nextKey)
    if (!f) return
    const nextOps = opsFor(f.type)
    setOp(nextOps[0]!)
    setValues([])
  }

  function handleOpChange(next: FilterOp) {
    setOp(next)
    if (VALUELESS_OPS.has(next)) setValues([])
  }

  function canCommit(): boolean {
    if (!fieldKey) return false
    if (VALUELESS_OPS.has(op)) return true
    return values.length > 0
  }

  return (
    <div className="flex flex-col gap-2" data-testid="filter-editor">
      <label className="text-xs font-medium">
        {t.views.filters.fieldLabel}
        <NativeSelect
          value={fieldKey}
          onChange={(e) => handleFieldChange(e.target.value)}
          disabled={disableFieldChange}
          data-testid="filter-editor-field"
          className="mt-1 w-full"
        >
          {fields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </NativeSelect>
      </label>

      <label className="text-xs font-medium">
        {t.views.filters.opLabel}
        <NativeSelect
          value={op}
          onChange={(e) => handleOpChange(e.target.value as FilterOp)}
          data-testid="filter-editor-op"
          className="mt-1 w-full"
        >
          {allowedOps.map((o) => (
            <option key={o} value={o}>
              {FILTER_OP_LABELS[o]}
            </option>
          ))}
        </NativeSelect>
      </label>

      {!VALUELESS_OPS.has(op) && currentField ? (
        <ValueEditor
          field={currentField}
          op={op}
          values={values}
          onChange={setValues}
        />
      ) : null}

      <div className="mt-2 flex justify-end gap-2">
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onCancel}
          data-testid="filter-editor-cancel"
        >
          {t.views.filters.cancel}
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={!canCommit()}
          onClick={() => onCommit({ field: fieldKey, op, values })}
          data-testid="filter-editor-apply"
        >
          {t.views.filters.apply}
        </Button>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

type ValueEditorProps = {
  field: ViewField
  op: FilterOp
  values: FilterValue[]
  onChange: (next: FilterValue[]) => void
}

function ValueEditor({ field, op, values, onChange }: ValueEditorProps) {
  const allowMulti = MULTI_VALUE_OPS.has(op)

  if (field.type === 'enum' && field.enumValues) {
    return (
      <fieldset className="flex flex-col gap-1">
        <legend className="text-xs font-medium">
          {t.views.filters.valueLabel}
        </legend>
        {field.enumValues.map((v) => {
          const checked = values.includes(v)
          return (
            <label
              key={v}
              className="flex cursor-pointer items-center gap-2 text-xs"
            >
              <Checkbox
                checked={checked}
                onChange={(e) => {
                  const isChecked = e.target.checked
                  if (allowMulti) {
                    onChange(
                      isChecked
                        ? [...values, v]
                        : values.filter((x) => x !== v),
                    )
                  } else {
                    onChange(isChecked ? [v] : [])
                  }
                }}
                data-testid={`filter-editor-enum-${v}`}
              />
              {field.enumLabels?.[v] ?? v}
            </label>
          )
        })}
      </fieldset>
    )
  }

  // landr-1zxt — date fields get a two-tab editor: literal ISO date vs
  // relative-token presets. The Relative tab writes tokens like
  // 'today' or ['start_of_week','end_of_week'] depending on the op.
  if (field.type === 'date') {
    return <DateValueEditor op={op} values={values} onChange={onChange} />
  }

  // landr-iz58 — tag-typed fields render a checklist sourced from the
  // operator's tag list. Same eq/in semantics as enums but the labels live
  // in operator_tags rather than a hardcoded enum.
  if (field.type === 'tag') {
    return <TagValueEditor op={op} values={values} onChange={onChange} />
  }

  const inputType = field.type === 'number' ? 'number' : 'text'

  return (
    <label className="text-xs font-medium">
      {t.views.filters.valueLabel}
      <Input
        type={inputType}
        value={values[0] !== undefined ? String(values[0]) : ''}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange([])
            return
          }
          const parsed: FilterValue =
            field.type === 'number' ? Number(raw) : raw
          onChange([parsed])
        }}
        data-testid="filter-editor-value"
        className="mt-1 w-full"
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// landr-1zxt — date value editor with Date / Relative tabs.

type DateValueEditorProps = {
  op: FilterOp
  values: FilterValue[]
  onChange: (next: FilterValue[]) => void
}

type DateMode = 'date' | 'relative'

function inferInitialMode(values: FilterValue[]): DateMode {
  if (values.length === 0) return 'date'
  return values.some((v) => isRelativeToken(v)) ? 'relative' : 'date'
}

type CustomKind = 'next' | 'last'

function DateValueEditor({ op, values, onChange }: DateValueEditorProps) {
  const [mode, setMode] = useState<DateMode>(() => inferInitialMode(values))
  const isWithin = op === 'within'

  // landr-qc72 — inline Next/Last N days picker state.
  const initialCustom =
    isWithin && values.length === 2
      ? detectCustomNDaysRange(String(values[0]), String(values[1]))
      : null
  const [customKind, setCustomKind] = useState<CustomKind | null>(
    initialCustom ? initialCustom.kind : null,
  )
  const [customNInput, setCustomNInput] = useState<string>(
    initialCustom ? String(initialCustom.n) : '',
  )
  const customNValid = validateCustomNDays(customNInput)
  const customNError =
    customNInput.trim() === ''
      ? null
      : customNValid === null
        ? `Enter a whole number between ${CUSTOM_N_DAYS_MIN} and ${CUSTOM_N_DAYS_MAX}.`
        : null

  function selectPreset(preset: RelativePreset) {
    // Selecting a static preset clears any in-flight custom-N picker.
    setCustomKind(null)
    if (preset.kind === 'single') {
      // Single-token preset: works for any op. For 'within', mirror the
      // token to both bounds so a "Today" pick means just that day.
      onChange(isWithin ? [preset.token, preset.token] : [preset.token])
    } else {
      // Range preset: writes [from, to]. For non-within ops we apply the
      // 'from' end only (best-effort fallback — UI usually shows ranges
      // for 'within').
      onChange(isWithin ? [preset.from, preset.to] : [preset.from])
    }
  }

  function openCustom(kind: CustomKind) {
    setCustomKind(kind)
    // Seed the input from current values if they already encode this kind.
    if (initialCustom && initialCustom.kind === kind) {
      setCustomNInput(String(initialCustom.n))
    } else if (customNInput.trim() === '') {
      // Sensible default when the field is empty.
      setCustomNInput(kind === 'next' ? '14' : '14')
    }
  }

  function applyCustom() {
    if (customNValid === null || customKind === null) return
    if (!isWithin) {
      // Non-within ops can't express ranges; fall back to writing the
      // single offset endpoint (mirrors selectPreset's range fallback).
      const [from] = buildCustomNDaysRange(customKind, customNValid)
      onChange([from])
      return
    }
    const [from, to] = buildCustomNDaysRange(customKind, customNValid)
    onChange([from, to])
  }

  const currentPresetKey = (() => {
    if (values.length === 0) return null
    if (isWithin && values.length === 2) {
      const range = findRangePreset(String(values[0]), String(values[1]))
      if (range) return range.key
      // Single token mirrored to both bounds (e.g. ['today','today']).
      if (values[0] === values[1]) {
        const single = findSinglePreset(String(values[0]))
        if (single) return single.key
      }
      return null
    }
    if (values.length === 1) {
      const single = findSinglePreset(String(values[0]))
      if (single) return single.key
    }
    return null
  })()

  return (
    <div className="flex flex-col gap-2" data-testid="filter-editor-date">
      <Tabs value={mode} onValueChange={(next) => setMode(next as DateMode)}>
        <TabsList
          aria-label={t.views.filters.valueLabel}
          className="flex gap-1 border-0 bg-transparent p-0 text-xs"
        >
          <TabsTrigger
            value="date"
            data-testid="filter-editor-date-tab"
            className="data-[state=active]:bg-accent data-[state=active]:border-input rounded border border-transparent px-2 py-1 data-[state=active]:shadow-none"
          >
            Date
          </TabsTrigger>
          <TabsTrigger
            value="relative"
            data-testid="filter-editor-relative-tab"
            className="data-[state=active]:bg-accent data-[state=active]:border-input rounded border border-transparent px-2 py-1 data-[state=active]:shadow-none"
          >
            Relative
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {mode === 'date' ? (
        <DateLiteralInputs op={op} values={values} onChange={onChange} />
      ) : (
        <div className="flex flex-col gap-2">
          <fieldset
            className="flex flex-wrap gap-1"
            data-testid="filter-editor-relative-presets"
          >
            <legend className="sr-only">Relative presets</legend>
            {RELATIVE_PRESETS.map((preset) => {
              const selected = currentPresetKey === preset.key
              return (
                <button
                  key={preset.key}
                  type="button"
                  onClick={() => selectPreset(preset)}
                  className={`rounded border px-2 py-1 text-xs ${selected ? 'bg-accent border-input' : 'border-input bg-background'}`}
                  data-testid={`filter-editor-preset-${preset.key}`}
                  aria-pressed={selected}
                >
                  {preset.label}
                </button>
              )
            })}
            {/* landr-qc72 — configurable Next/Last N days picker. */}
            <button
              type="button"
              onClick={() => openCustom('next')}
              className={`rounded border px-2 py-1 text-xs ${customKind === 'next' ? 'bg-accent border-input' : 'border-input bg-background'}`}
              data-testid="filter-editor-preset-next-n-days"
              aria-pressed={customKind === 'next'}
            >
              Next N days
            </button>
            <button
              type="button"
              onClick={() => openCustom('last')}
              className={`rounded border px-2 py-1 text-xs ${customKind === 'last' ? 'bg-accent border-input' : 'border-input bg-background'}`}
              data-testid="filter-editor-preset-last-n-days"
              aria-pressed={customKind === 'last'}
            >
              Last N days
            </button>
          </fieldset>

          {customKind !== null ? (
            <div
              className="flex flex-col gap-1"
              data-testid="filter-editor-custom-n-days"
            >
              <div className="flex items-end gap-2">
                <label className="flex-1 text-xs font-medium">
                  N (days)
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={CUSTOM_N_DAYS_MIN}
                    max={CUSTOM_N_DAYS_MAX}
                    step={1}
                    value={customNInput}
                    onChange={(e) => setCustomNInput(e.target.value)}
                    data-testid="filter-editor-custom-n-input"
                    aria-invalid={customNError !== null}
                    aria-describedby={
                      customNError ? 'filter-editor-custom-n-error' : undefined
                    }
                    className="mt-1 w-full"
                  />
                </label>
                <Button
                  type="button"
                  size="sm"
                  disabled={customNValid === null}
                  onClick={applyCustom}
                  data-testid="filter-editor-custom-n-apply"
                >
                  {t.views.filters.apply}
                </Button>
              </div>
              {customNError ? (
                <p
                  id="filter-editor-custom-n-error"
                  className="text-destructive text-xs"
                  data-testid="filter-editor-custom-n-error"
                  role="alert"
                >
                  {customNError}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  )
}

type DateLiteralInputsProps = {
  op: FilterOp
  values: FilterValue[]
  onChange: (next: FilterValue[]) => void
}

function DateLiteralInputs({ op, values, onChange }: DateLiteralInputsProps) {
  const isWithin = op === 'within'
  // If any current value is a relative token, treat it as empty for the
  // literal input so the date picker doesn't render garbage.
  const literal = (v: FilterValue | undefined): string => {
    if (v === undefined || v === null) return ''
    if (typeof v === 'string' && isRelativeToken(v)) return ''
    return String(v)
  }

  if (isWithin) {
    return (
      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium">
          From
          <Input
            type="date"
            value={literal(values[0])}
            onChange={(e) => {
              const next = [...values]
              if (e.target.value === '') {
                next[0] = ''
              } else {
                next[0] = e.target.value
              }
              if (next[1] === undefined) next[1] = ''
              onChange(next.filter((_v, i) => i < 2))
            }}
            data-testid="filter-editor-value-from"
            className="mt-1 w-full"
          />
        </label>
        <label className="text-xs font-medium">
          To
          <Input
            type="date"
            value={literal(values[1])}
            onChange={(e) => {
              const next = [...values]
              if (next[0] === undefined) next[0] = ''
              if (e.target.value === '') {
                next[1] = ''
              } else {
                next[1] = e.target.value
              }
              onChange(next.filter((_v, i) => i < 2))
            }}
            data-testid="filter-editor-value-to"
            className="mt-1 w-full"
          />
        </label>
      </div>
    )
  }

  return (
    <label className="text-xs font-medium">
      {t.views.filters.valueLabel}
      <Input
        type="date"
        value={literal(values[0])}
        onChange={(e) => {
          const raw = e.target.value
          if (raw === '') {
            onChange([])
            return
          }
          onChange([raw])
        }}
        data-testid="filter-editor-value"
        className="mt-1 w-full"
      />
    </label>
  )
}

// ---------------------------------------------------------------------------
// landr-iz58 — TagValueEditor renders a checklist of the operator's tags.
// Values are tag uuids; the user picks one (eq) or many (in). Each row
// shows the tag's color swatch + name for fast scanning.

type TagValueEditorProps = {
  op: FilterOp
  values: FilterValue[]
  onChange: (next: FilterValue[]) => void
}

function TagValueEditor({ op, values, onChange }: TagValueEditorProps) {
  const allowMulti = MULTI_VALUE_OPS.has(op)
  const { currentOperatorId } = useOperator()
  const tagsQuery = useQuery<Tag[]>({
    queryKey: ['tags', currentOperatorId ?? 'none'],
    queryFn: () =>
      currentOperatorId ? fetchTags(currentOperatorId) : Promise.resolve([]),
    enabled: !!currentOperatorId,
    staleTime: 30_000,
  })

  if (tagsQuery.isPending) {
    return (
      <p className="text-muted-foreground py-1 text-xs">
        Loading tags…
      </p>
    )
  }
  if (tagsQuery.isError) {
    return (
      <p className="text-destructive py-1 text-xs" role="alert">
        Could not load tags.
      </p>
    )
  }
  const tags = tagsQuery.data ?? []
  if (tags.length === 0) {
    return (
      <p className="text-muted-foreground py-1 text-xs">
        No tags defined yet. Add tags in Settings → Tags.
      </p>
    )
  }

  return (
    <fieldset className="flex flex-col gap-1" data-testid="filter-editor-tags">
      <legend className="text-xs font-medium">{t.views.filters.valueLabel}</legend>
      {tags.map((tag) => {
        const checked = values.includes(tag.id)
        return (
          <label
            key={tag.id}
            className="flex cursor-pointer items-center gap-2 text-xs"
          >
            <Checkbox
              checked={checked}
              onChange={(e) => {
                const isChecked = e.target.checked
                if (allowMulti) {
                  onChange(
                    isChecked
                      ? [...values, tag.id]
                      : values.filter((x) => x !== tag.id),
                  )
                } else {
                  onChange(isChecked ? [tag.id] : [])
                }
              }}
              data-testid={`filter-editor-tag-${tag.id}`}
            />
            <span
              className="inline-block h-3 w-3 rounded-full"
              style={{ backgroundColor: tag.color }}
              aria-hidden="true"
            />
            {tag.name}
          </label>
        )
      })}
    </fieldset>
  )
}
