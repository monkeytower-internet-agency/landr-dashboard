// landr-hgtv — Filter expression shape used inside View configs.
//
// Mirrors the agreed v1 chip-only filter model from the Views grilling:
//   - Each chip = one Filter.
//   - Multi-value within a chip = OR (e.g. stage in {a, b}).
//   - Multiple chips = AND.
//
// Stored inside saved_views.config.filters as JSON. ADR-0002 reserves a
// `source` discriminator on field references for v2 custom fields; v1 only
// ever emits `source: 'system'` so we don't carry it here yet — the entity
// field registry (views-entity-fields.ts) is the source of system labels.

export const FILTER_OPS = [
  'eq',
  'in',
  'gt',
  'lt',
  'gte',
  'lte',
  'contains',
  'is_null',
  'is_not_null',
  'within',
] as const

export type FilterOp = (typeof FILTER_OPS)[number]

export type FilterValue = string | number | boolean

export type Filter = {
  field: string
  op: FilterOp
  values: FilterValue[]
}

/** Ops that do not require any values (chip renders without a value part). */
export const VALUELESS_OPS: ReadonlySet<FilterOp> = new Set(['is_null', 'is_not_null'])

/** Ops that accept multiple values (chip can show "field op v1, v2, …"). */
export const MULTI_VALUE_OPS: ReadonlySet<FilterOp> = new Set(['in', 'within'])

export function isFilter(input: unknown): input is Filter {
  if (!input || typeof input !== 'object') return false
  const f = input as Partial<Filter>
  if (typeof f.field !== 'string') return false
  if (typeof f.op !== 'string' || !FILTER_OPS.includes(f.op as FilterOp)) {
    return false
  }
  if (!Array.isArray(f.values)) return false
  return f.values.every(
    (v) => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean',
  )
}

/**
 * Extract the filters array out of a view's config blob. Tolerates missing
 * / malformed entries — anything that isn't a valid Filter is dropped so the
 * UI never crashes on an old or partially-migrated config.
 */
export function readFilters(config: Record<string, unknown> | undefined | null): Filter[] {
  if (!config) return []
  const raw = (config as { filters?: unknown }).filters
  if (!Array.isArray(raw)) return []
  return raw.filter(isFilter)
}

/** Human-readable label for an operator (used in chip rendering). */
export const FILTER_OP_LABELS: Record<FilterOp, string> = {
  eq: 'is',
  in: 'is any of',
  gt: '>',
  lt: '<',
  gte: '≥',
  lte: '≤',
  contains: 'contains',
  is_null: 'is empty',
  is_not_null: 'is set',
  within: 'within',
}
