// landr-9kbl / -7w3s / -kjls — shared data source for the Views v1 layouts.
//
// A View's "Item" (CONTEXT.md term) for entity_type='booking' is a BookingRow.
// All three layout renderers (Table / Board / Calendar) need the same pipe:
//   fetch operator bookings → apply View filters → apply View sort → render.
//
// The helpers live here (not in BookingsLayout / TableLayout / etc) so the
// three siblings share one implementation and don't drift on filter semantics.
// Filter matching mirrors `bookings-filter-match.ts` but is driven by the
// generic `Filter[]` shape stored in saved_views.config (see views-filters.ts)
// rather than the hardcoded BookingsFilters dimensions.

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import {
  fetchBookings,
  stageCode,
  type BookingRow,
} from '@/lib/bookings'
import {
  readFilters,
  type Filter,
  type FilterOp,
  type FilterValue,
} from '@/lib/views-filters'
import { findField } from '@/lib/views-entity-fields'
import {
  isRelativeToken,
  resolveRelativeDate,
} from '@/lib/views-relative-dates'

// Alias matching CONTEXT.md "Item" language so the layout components can read
// `items: BookingItem[]` rather than `rows: BookingRow[]`. Different name,
// same shape — keeps the View layer's vocabulary consistent.
// landr-lx7s — `BookingItem` is the View-layer item (= one row = one
// booking). The booking_products line shape was renamed to `BookingProduct`
// in bookings.ts so the two names no longer collide.
export type BookingItem = BookingRow

// ---------------------------------------------------------------------------
// Field extraction — maps a system-field key to a comparable JS value on the
// booking row. Multi-item / multi-participant traversal is field-specific
// (an item-level field matches if ANY item satisfies it).

type FieldExtract =
  | { kind: 'scalar'; get: (row: BookingRow) => FilterValue | null | undefined }
  | { kind: 'multi'; get: (row: BookingRow) => Array<FilterValue | null | undefined> }

function extractor(fieldKey: string): FieldExtract | null {
  switch (fieldKey) {
    case 'customer_first_name':
      return { kind: 'scalar', get: (r) => r.customer?.first_name ?? null }
    case 'customer_last_name':
      return { kind: 'scalar', get: (r) => r.customer?.last_name ?? null }
    case 'customer_email':
      return { kind: 'scalar', get: (r) => r.customer?.email ?? null }
    case 'product_name':
      return {
        kind: 'multi',
        get: (r) => r.items.map((it) => it.products?.name ?? null),
      }
    case 'current_stage':
      return { kind: 'scalar', get: (r) => stageCode(r) }
    case 'date_range_start':
      return {
        kind: 'multi',
        get: (r) => r.items.map((it) => it.date_range_start ?? null),
      }
    case 'date_range_end':
      return {
        kind: 'multi',
        get: (r) => r.items.map((it) => it.date_range_end ?? null),
      }
    case 'booking_total':
      return {
        kind: 'scalar',
        get: (r) => {
          const n =
            typeof r.gross_total === 'number'
              ? r.gross_total
              : Number(r.gross_total)
          return Number.isFinite(n) ? n : null
        },
      }
    case 'tag':
      // landr-iz58 — tag membership. Returns the row's tag ids as a
      // multi-value extract so 'eq' / 'in' against the picker's tag ids
      // match via compareScalar's same-value semantics, and the
      // is_null / is_not_null ops collapse correctly (no tags vs at
      // least one).
      return {
        kind: 'multi',
        get: (r) => (r.tags ?? []).map((tag) => tag.id),
      }
    default:
      return null
  }
}

// ---------------------------------------------------------------------------
// Operator predicates over a single comparable value.

function compareScalar(
  op: FilterOp,
  actual: FilterValue | null | undefined,
  values: ReadonlyArray<FilterValue>,
): boolean {
  if (op === 'is_null') return actual === null || actual === undefined
  if (op === 'is_not_null') return actual !== null && actual !== undefined
  if (actual === null || actual === undefined) return false

  switch (op) {
    case 'eq':
      return values.some((v) => v === actual)
    case 'in':
      return values.includes(actual)
    case 'contains': {
      const needle = String(values[0] ?? '').toLowerCase()
      if (!needle) return true
      return String(actual).toLowerCase().includes(needle)
    }
    case 'gt':
      return values.some((v) => actual > v)
    case 'lt':
      return values.some((v) => actual < v)
    case 'gte':
      return values.some((v) => actual >= v)
    case 'lte':
      return values.some((v) => actual <= v)
    case 'within': {
      // [from, to] inclusive — value count tolerant of either or both bounds.
      const from = values[0]
      const to = values[1]
      if (from !== undefined && actual < from) return false
      if (to !== undefined && actual > to) return false
      return true
    }
    default:
      return false
  }
}

/**
 * Resolve any relative-date tokens in the filter's values to ISO dates,
 * using a stable `now`. Non-token values pass through unchanged.
 * landr-1zxt — keeps saved Views live without rewriting filter shape.
 * landr-m4zq — `weekStartsOn` is forwarded to the resolver so the
 * start_of_week / end_of_week anchors honour the operator's setting.
 */
function resolveFilterValues(
  values: ReadonlyArray<FilterValue>,
  now: Date,
  weekStartsOn: number,
): FilterValue[] {
  return values.map((v) => {
    if (isRelativeToken(v)) {
      const iso = resolveRelativeDate(v, now, weekStartsOn)
      return iso ?? v
    }
    return v
  })
}

function matchesOneFilter(
  row: BookingRow,
  filter: Filter,
  now: Date,
  weekStartsOn: number,
): boolean {
  const ext = extractor(filter.field)
  if (!ext) return true // unknown field — don't filter (forward-compat)
  const resolvedValues = resolveFilterValues(filter.values, now, weekStartsOn)
  if (ext.kind === 'scalar') {
    return compareScalar(filter.op, ext.get(row), resolvedValues)
  }
  const vals = ext.get(row)
  if (vals.length === 0) {
    // No items contribute — null/not-null still answerable.
    return compareScalar(filter.op, null, resolvedValues)
  }
  return vals.some((v) => compareScalar(filter.op, v, resolvedValues))
}

/** AND across chips. Each chip is its own predicate; missing values short-
 *  circuit per `compareScalar`. `now` (default: new Date()) anchors any
 *  relative-date tokens (landr-1zxt). `weekStartsOn` (default 1 = Monday,
 *  landr-m4zq) drives the start_of_week / end_of_week anchors. */
export function matchesViewFilters(
  row: BookingRow,
  filters: Filter[],
  now: Date = new Date(),
  weekStartsOn: number = 1,
): boolean {
  for (const f of filters) {
    if (!matchesOneFilter(row, f, now, weekStartsOn)) return false
  }
  return true
}

// ---------------------------------------------------------------------------
// Sort — driven by config.sort, an ordered list of {key, dir}. Only system
// fields the registry knows about are sortable; unknown keys fall back to
// the input order.

type SortEntry = { source?: 'system' | 'custom'; key: string; dir: 'asc' | 'desc' }

function readSort(config: Record<string, unknown> | undefined | null): SortEntry[] {
  if (!config) return []
  const raw = (config as { sort?: unknown }).sort
  if (!Array.isArray(raw)) return []
  return raw.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') return []
    const e = entry as Partial<SortEntry>
    if (typeof e.key !== 'string') return []
    if (e.dir !== 'asc' && e.dir !== 'desc') return []
    return [{ source: e.source, key: e.key, dir: e.dir }]
  })
}

function compareForSort(
  a: BookingRow,
  b: BookingRow,
  entry: SortEntry,
  entityType: string,
): number {
  if (!findField(entityType, entry.key)) return 0
  const ext = extractor(entry.key)
  if (!ext) return 0
  const av = ext.kind === 'scalar' ? ext.get(a) : ext.get(a)[0] ?? null
  const bv = ext.kind === 'scalar' ? ext.get(b) : ext.get(b)[0] ?? null
  // Nulls last regardless of direction (UX convention).
  if (av === null || av === undefined) return bv === null || bv === undefined ? 0 : 1
  if (bv === null || bv === undefined) return -1
  const cmp = av < bv ? -1 : av > bv ? 1 : 0
  return entry.dir === 'asc' ? cmp : -cmp
}

/** Apply the view's sort entries in order. Items are not mutated. */
export function applyViewSort(
  rows: BookingRow[],
  config: Record<string, unknown> | undefined | null,
  entityType: string,
): BookingRow[] {
  const sort = readSort(config)
  if (sort.length === 0) return rows
  return [...rows].sort((a, b) => {
    for (const entry of sort) {
      const c = compareForSort(a, b, entry, entityType)
      if (c !== 0) return c
    }
    return 0
  })
}

/** Full pipe: filter + sort. Pure — safe to call inside useMemo. `now`
 *  (default: new Date()) anchors any relative-date tokens (landr-1zxt) so
 *  every comparison in a single render uses the same wall-clock instant.
 *  `weekStartsOn` (default 1 = Monday, landr-m4zq) drives the
 *  start_of_week / end_of_week anchors in the resolver. */
export function applyView(
  rows: BookingRow[],
  config: Record<string, unknown> | undefined | null,
  entityType: string,
  now: Date = new Date(),
  weekStartsOn: number = 1,
): BookingRow[] {
  const filters = readFilters(config)
  const filtered =
    filters.length === 0
      ? rows
      : rows.filter((r) => matchesViewFilters(r, filters, now, weekStartsOn))
  return applyViewSort(filtered, config, entityType)
}

// ---------------------------------------------------------------------------
// React Query hook — shared cache key so a Table → Board → Calendar layout
// switch on the same operator doesn't refetch.

export function useViewBookings(
  operatorId: string | null | undefined,
): UseQueryResult<BookingRow[], Error> {
  return useQuery<BookingRow[], Error>({
    queryKey: ['views-bookings', operatorId ?? 'none'],
    queryFn: () => fetchBookings(operatorId as string),
    enabled: !!operatorId,
  })
}
