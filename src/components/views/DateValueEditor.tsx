// Extracted from ViewFilterChips.tsx (landr-v9e4.9 — pure-helper extraction).
// DateValueEditor + DateLiteralInputs + inferInitialMode live here.

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  CUSTOM_N_DAYS_MAX,
  CUSTOM_N_DAYS_MIN,
  RELATIVE_PRESETS,
  buildCustomNDaysRange,
  detectCustomNDaysRange,
  findRangePreset,
  findSinglePreset,
  isRelativeToken,
  validateCustomNDays,
  type RelativePreset,
} from '@/lib/views-relative-dates'
import { t } from '@/lib/strings'
import type { FilterOp, FilterValue } from '@/lib/views-filters'

export type DateMode = 'date' | 'relative'

// eslint-disable-next-line react-refresh/only-export-components
export function inferInitialMode(values: FilterValue[]): DateMode {
  if (values.length === 0) return 'date'
  return values.some((v) => isRelativeToken(v)) ? 'relative' : 'date'
}

type CustomKind = 'next' | 'last'

type DateValueEditorProps = {
  op: FilterOp
  values: FilterValue[]
  onChange: (next: FilterValue[]) => void
}

export function DateValueEditor({ op, values, onChange }: DateValueEditorProps) {
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

export function DateLiteralInputs({ op, values, onChange }: DateLiteralInputsProps) {
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

