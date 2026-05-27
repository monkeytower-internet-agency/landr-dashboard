// landr-1ztq — Table-layout group-by helpers.
//
// Why a separate module:
//   - `groupRows` is a pure function: passing the field registry in (rather
//     than reaching into views-entity-fields) keeps it trivially testable
//     and entity-agnostic for the eventual v2 custom-field machinery.
//   - `useGroupCollapse` is a React hook that persists the per-(viewId,
//     groupValue) collapse state in localStorage so the operator's
//     bucket-by-bucket triage survives reloads.

import { useCallback, useEffect, useRef, useState } from 'react'
import {
  findField,
  valueLabel,
  type ViewField,
} from '@/lib/views-entity-fields'

const NULL_GROUP_KEY = '__null__'
const STORAGE_PREFIX = 'landr.views.table.group-collapse'

export type RowGroup<T> = {
  /** Stable key used for React + localStorage. `__null__` when the field
   *  value is null/undefined so empty buckets don't collide with the
   *  literal string 'null'. */
  key: string
  /** Friendly label shown in the header row. */
  label: string
  /** Raw value as it came off the row (passed through `readValue`). Useful
   *  for callers that want to filter / drill in on the bucket. */
  value: string | null
  /** Rows in this bucket, in the input order (callers control sort). */
  items: T[]
}

export type FieldRegistry = {
  /** Look up a field by entity + key. Returns undefined if the field has
   *  been removed from the registry — caller bails to a flat group. */
  findField: (entityType: string, key: string) => ViewField | undefined
  /** Friendly label for an enum value. Falls back to the raw value. */
  valueLabel: (
    entityType: string,
    fieldKey: string,
    value: string | number | boolean,
  ) => string
}

/** Default registry that proxies the booking field registry. Tests can pass
 *  their own to keep the helper entity-agnostic. */
export const DEFAULT_REGISTRY: FieldRegistry = {
  findField,
  valueLabel,
}

/** Group rows by a single field. Buckets are returned in the field's
 *  enumValues order when present (so empty enum buckets still appear) and
 *  in first-seen order otherwise. Rows with null/undefined values go to
 *  one tail bucket. */
export function groupRows<T>(
  items: readonly T[],
  args: {
    entityType: string
    fieldKey: string
    /** Read the row's value for the group field. Null/undefined → tail. */
    readValue: (item: T) => string | number | boolean | null | undefined
    registry?: FieldRegistry
  },
): RowGroup<T>[] {
  const { entityType, fieldKey, readValue } = args
  const registry = args.registry ?? DEFAULT_REGISTRY
  const field = registry.findField(entityType, fieldKey)

  // Bucket the rows by their stringified value.
  const buckets = new Map<string, { value: string | null; items: T[] }>()
  const seenOrder: string[] = []
  for (const item of items) {
    const raw = readValue(item)
    const value: string | null =
      raw === null || raw === undefined ? null : String(raw)
    const key = value ?? NULL_GROUP_KEY
    let bucket = buckets.get(key)
    if (!bucket) {
      bucket = { value, items: [] }
      buckets.set(key, bucket)
      seenOrder.push(key)
    }
    bucket.items.push(item)
  }

  // Order: enumValues first (preserving the registry order, even for empty
  // buckets), then first-seen for anything else, then null tail.
  const orderedKeys: string[] = []
  const seenSet = new Set<string>()
  if (field?.type === 'enum' && field.enumValues) {
    for (const v of field.enumValues) {
      orderedKeys.push(v)
      seenSet.add(v)
    }
  }
  for (const k of seenOrder) {
    if (k === NULL_GROUP_KEY) continue
    if (seenSet.has(k)) continue
    orderedKeys.push(k)
    seenSet.add(k)
  }
  if (buckets.has(NULL_GROUP_KEY)) {
    orderedKeys.push(NULL_GROUP_KEY)
  }

  return orderedKeys.map((key) => {
    const bucket = buckets.get(key) ?? { value: key, items: [] as T[] }
    const value = key === NULL_GROUP_KEY ? null : bucket.value
    const label = labelFor(entityType, fieldKey, value, field, registry)
    return { key, label, value, items: bucket.items }
  })
}

function labelFor(
  entityType: string,
  fieldKey: string,
  value: string | null,
  field: ViewField | undefined,
  registry: FieldRegistry,
): string {
  if (value === null) return '—'
  if (field?.type === 'enum') {
    return registry.valueLabel(entityType, fieldKey, value)
  }
  return value
}

/** localStorage key for a given (viewId, groupValue). Exported for tests. */
export function groupCollapseStorageKey(viewId: string): string {
  return `${STORAGE_PREFIX}.${viewId}`
}

export type UseGroupCollapse = {
  /** True when the bucket should render its rows collapsed. */
  isCollapsed: (groupKey: string) => boolean
  /** Flip the collapsed state for a single bucket. */
  toggle: (groupKey: string) => void
  /** Collapse / expand every known bucket at once. Useful for "Collapse
   *  all" affordances we'll add later — wired now so the API is stable. */
  setAll: (groupKeys: readonly string[], collapsed: boolean) => void
}

/** Per-view collapse state, persisted in localStorage. `viewId` of null
 *  falls back to in-memory state (e.g. unsaved Views). */
export function useGroupCollapse(viewId: string | null): UseGroupCollapse {
  const [state, setState] = useState<Record<string, boolean>>(() =>
    viewId ? readStored(viewId) : {},
  )

  // Re-hydrate when the viewId changes so navigating between views doesn't
  // leak collapse state from the previous view.
  const lastViewIdRef = useRef<string | null>(viewId)
  useEffect(() => {
    if (lastViewIdRef.current === viewId) return
    lastViewIdRef.current = viewId
    setState(viewId ? readStored(viewId) : {})
  }, [viewId])

  // Persist on every change. Reads/writes are guarded for SSR / disabled
  // localStorage.
  useEffect(() => {
    if (!viewId) return
    writeStored(viewId, state)
  }, [viewId, state])

  const isCollapsed = useCallback(
    (groupKey: string) => state[groupKey] === true,
    [state],
  )
  const toggle = useCallback((groupKey: string) => {
    setState((prev) => ({ ...prev, [groupKey]: !prev[groupKey] }))
  }, [])
  const setAll = useCallback(
    (groupKeys: readonly string[], collapsed: boolean) => {
      setState((prev) => {
        const next = { ...prev }
        for (const k of groupKeys) next[k] = collapsed
        return next
      })
    },
    [],
  )

  return { isCollapsed, toggle, setAll }
}

function readStored(viewId: string): Record<string, boolean> {
  if (typeof window === 'undefined') return {}
  try {
    const raw = window.localStorage.getItem(groupCollapseStorageKey(viewId))
    if (!raw) return {}
    const parsed = JSON.parse(raw) as unknown
    if (!parsed || typeof parsed !== 'object') return {}
    const out: Record<string, boolean> = {}
    for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof v === 'boolean') out[k] = v
    }
    return out
  } catch {
    return {}
  }
}

function writeStored(viewId: string, value: Record<string, boolean>): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      groupCollapseStorageKey(viewId),
      JSON.stringify(value),
    )
  } catch {
    /* quota exceeded / disabled — fail silently, like the sibling
     * approvals-filters / contacts-filters hooks. */
  }
}
