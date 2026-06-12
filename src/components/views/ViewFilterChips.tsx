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
  isRelativeToken,
  findRangePreset,
  detectCustomNDaysRange,
  describeCustomNDaysRange,
  describeRelativeToken,
} from '@/lib/views-relative-dates'
import { t } from '@/lib/strings'
// landr-iz58 — tag-typed filter values resolve through the operator's tag list.
import { DateValueEditor } from './DateValueEditor'
import { TagValueEditor } from './TagValueEditor'

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
  if (field?.type === 'tag') {
    const count = f.values.length
    if (count === 1) return `${label} ${op} 1 tag`
    return `${label} ${op} ${count} tags`
  }
  // landr-1zxt — date fields with relative tokens show the human label
  // ("This week") instead of resolved dates.
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
  // relative-token presets.
  if (field.type === 'date') {
    return <DateValueEditor op={op} values={values} onChange={onChange} />
  }

  // landr-iz58 — tag-typed fields render a checklist sourced from the
  // operator's tag list.
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
