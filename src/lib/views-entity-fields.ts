// landr-hgtv — minimal entity-field registry for Views v1.
// landr-7w3s — extended with `type:'id'`, `default_visible_in_table`, and
// the full Table-layout field set (~12 fields).
//
// Each entity type has a small set of system fields that the View filter
// chips, sort dropdown, and Table column picker reference. v1 only covers
// entity_type='booking'.
//
// Why a registry vs. derived metadata? ADR-0002 keeps the View config
// agnostic of any particular entity — the registry is the one place the
// UI translates a stored `field` string into a typed picker (enum vs text
// vs date vs number). v2's custom-field machinery will hang additional
// entries off the same registry with `source: 'custom'`.

import type { FilterOp } from '@/lib/views-filters'

export type ViewFieldType =
  | 'text'
  | 'enum'
  | 'date'
  | 'number'
  | 'boolean'
  // landr-7w3s — 'id' is a foreign-key reference. Cells render the
  // linked record's display name (e.g. product_id → product_name from a
  // PostgREST embed). Filters compare the id itself.
  | 'id'
  // landr-iz58 — operator-scoped tag. The filter expects tag id values
  // ('eq' / 'in'); the filter-match layer checks BookingRow.tags for
  // membership. Cells / sort intentionally unsupported (chips render via
  // the dedicated Tags column on the table layout).
  | 'tag'

export type ViewField = {
  key: string
  label: string
  type: ViewFieldType
  filterable: boolean
  sortable: boolean
  /** Whether the field appears in the default Table column set. landr-7w3s. */
  default_visible_in_table?: boolean
  /**
   * landr-1ztq — whether this field can be used to group rows in the Table
   * layout. Defaults to true for enum + date types via `isGroupableField`;
   * set explicitly to override. Free-text fields (names, emails) are NOT
   * groupable by default because every row tends to be its own bucket.
   */
  groupable?: boolean
  /** For type='enum' only — fixed list of allowed values. */
  enumValues?: readonly string[]
  /** Optional friendly labels for enum values. */
  enumLabels?: Readonly<Record<string, string>>
}

export const BOOKING_FIELDS: readonly ViewField[] = [
  {
    key: 'customer_first_name',
    label: 'First name',
    type: 'text',
    filterable: true,
    sortable: true,
    default_visible_in_table: true,
  },
  {
    key: 'customer_last_name',
    label: 'Last name',
    type: 'text',
    filterable: true,
    sortable: true,
  },
  {
    key: 'customer_email',
    label: 'Email',
    type: 'text',
    filterable: true,
    sortable: true,
    default_visible_in_table: true,
  },
  {
    key: 'product_id',
    label: 'Product',
    type: 'id',
    filterable: true,
    sortable: false,
    default_visible_in_table: true,
  },
  {
    key: 'product_name',
    label: 'Product',
    type: 'text',
    filterable: true,
    sortable: true,
  },
  {
    key: 'current_stage',
    label: 'Stage',
    type: 'enum',
    filterable: true,
    sortable: true,
    default_visible_in_table: true,
    enumValues: [
      'awaiting_general_approval',
      'awaiting_secondary_approval',
      'awaiting_hotel_approval',
      'confirmed',
      'cancelled',
    ],
    enumLabels: {
      awaiting_general_approval: 'Awaiting general approval',
      awaiting_secondary_approval: 'Awaiting secondary approval',
      awaiting_hotel_approval: 'Awaiting hotel approval',
      confirmed: 'Confirmed',
      cancelled: 'Cancelled',
    },
  },
  {
    key: 'date_range_start',
    label: 'Start date',
    type: 'date',
    filterable: true,
    sortable: true,
    default_visible_in_table: true,
  },
  {
    key: 'date_range_end',
    label: 'End date',
    type: 'date',
    filterable: true,
    sortable: true,
  },
  {
    key: 'booking_total',
    label: 'Total',
    type: 'number',
    filterable: true,
    sortable: true,
    default_visible_in_table: true,
  },
  {
    key: 'pickup_location_id',
    label: 'Pickup location',
    type: 'id',
    filterable: true,
    sortable: false,
  },
  {
    key: 'created_at',
    label: 'Created',
    type: 'date',
    filterable: true,
    sortable: true,
  },
  {
    key: 'current_semantic_state',
    label: 'Status',
    type: 'enum',
    filterable: true,
    sortable: true,
    enumValues: [
      'pending',
      'confirmed',
      'finalised',
      'cancelled',
      'no_show',
    ],
    enumLabels: {
      pending: 'Pending',
      confirmed: 'Confirmed',
      finalised: 'Finalised',
      cancelled: 'Cancelled',
      no_show: 'No show',
    },
  },
  {
    key: 'currency',
    label: 'Currency',
    type: 'text',
    filterable: true,
    sortable: false,
  },
  // landr-iz58 — operator-applied tag membership ("has tag X"). Values
  // are tag uuids; the picker hydrates labels + colors via fetchTags.
  {
    key: 'tag',
    label: 'Tag',
    type: 'tag',
    filterable: true,
    sortable: false,
  },
  // landr-a4pl.3 — Holded invoice transfer state. Derived from the latest
  // external_sync_log row per booking (fetched in bookings.ts SELECT). The
  // field is an enum so operators can filter "show me all failed transfers"
  // or group by transfer state in a single click.
  {
    key: 'holded_status',
    label: 'Holded status',
    type: 'enum',
    filterable: true,
    sortable: true,
    groupable: true,
    enumValues: ['transferred', 'pending', 'failed', 'blocked', 'none'],
    enumLabels: {
      transferred: 'Transferred',
      pending: 'Pending',
      failed: 'Failed',
      blocked: 'Blocked',
      none: 'None',
    },
  },
  // landr-a4pl.3 — outstanding balance on the booking. The balance_due
  // column is already fetched in the bookings SELECT; this entry registers
  // it in the Views registry so operators can filter (e.g. balance_due > 0)
  // and sort by outstanding amount. Numeric operators: gt, lt, gte, lte.
  {
    key: 'balance_due',
    label: 'Balance due',
    type: 'number',
    filterable: true,
    sortable: true,
  },
] as const

const FIELDS_BY_ENTITY: Record<string, readonly ViewField[]> = {
  booking: BOOKING_FIELDS,
}

export function fieldsFor(entityType: string): readonly ViewField[] {
  return FIELDS_BY_ENTITY[entityType] ?? []
}

export function findField(
  entityType: string,
  key: string,
): ViewField | undefined {
  return fieldsFor(entityType).find((f) => f.key === key)
}

/** Friendly label for a field key, falling back to the raw key. */
export function fieldLabel(entityType: string, key: string): string {
  return findField(entityType, key)?.label ?? key
}

/** Labelise an enum value if the field has a label map; else humanise. */
export function valueLabel(
  entityType: string,
  fieldKey: string,
  value: string | number | boolean,
): string {
  const field = findField(entityType, fieldKey)
  if (field?.type === 'enum' && field.enumLabels) {
    const lookup = field.enumLabels[String(value)]
    if (lookup) return lookup
  }
  return String(value)
}

/** Ops appropriate for a field type. Used by the filter-edit popover. */
export function opsFor(type: ViewFieldType): FilterOp[] {
  switch (type) {
    case 'enum':
      return ['eq', 'in', 'is_null', 'is_not_null']
    case 'text':
      return ['eq', 'contains', 'is_null', 'is_not_null']
    case 'number':
      return ['eq', 'gt', 'lt', 'gte', 'lte', 'is_null', 'is_not_null']
    case 'date':
      return ['eq', 'gt', 'lt', 'gte', 'lte', 'within', 'is_null', 'is_not_null']
    case 'boolean':
      return ['eq', 'is_null', 'is_not_null']
    case 'id':
      // landr-7w3s — FK columns: equality / membership only, no contains
      // (uuids aren't substring-meaningful) and no ordering.
      return ['eq', 'in', 'is_null', 'is_not_null']
    case 'tag':
      // landr-iz58 — tag membership: equality + multi-value membership only.
      // is_null / is_not_null map to "untagged" / "has any tag" which is
      // useful enough to expose; eq is "has THIS tag", in is "has any of".
      return ['eq', 'in', 'is_null', 'is_not_null']
  }
}

// landr-7w3s — column-list helpers used by the Table layout. Default columns
// are the fields explicitly tagged default_visible_in_table; everything
// filterable is offered in the picker.

export type ColumnRef = { source: 'system' | 'custom'; key: string }

/** Default columns for a freshly-created Table view on this entity. */
export function defaultColumnsFor(entityType: string): ColumnRef[] {
  return fieldsFor(entityType)
    .filter((f) => f.default_visible_in_table)
    .map((f) => ({ source: 'system', key: f.key }))
}

// landr-1ztq — group-by helpers for the Table layout.

/** Default rule: enums + dates are groupable; anything else opts in via the
 *  explicit `groupable` flag on the field. Free-text fields would each
 *  produce a single-row bucket, so we exclude them by default. */
export function isGroupableField(field: ViewField): boolean {
  if (field.groupable !== undefined) return field.groupable
  return field.type === 'enum' || field.type === 'date'
}

/** Fields offered in the Table layout's "Group by" dropdown. */
export function groupableFieldsFor(
  entityType: string,
): readonly ViewField[] {
  return fieldsFor(entityType).filter(isGroupableField)
}

/** Shape of view.config.groupBy. Mirrors ColumnRef so v2 custom fields land
 *  additively (source: 'custom'). null/undefined => flat (no grouping). */
export type GroupByRef = { source: 'system' | 'custom'; key: string }

/** Sanitise / parse a saved view's config.groupBy. Drops unknown system
 *  field keys so a removed-from-registry field doesn't break the table. */
export function readGroupBy(
  entityType: string,
  config: Record<string, unknown> | undefined | null,
): GroupByRef | null {
  if (!config) return null
  const raw = (config as { groupBy?: unknown }).groupBy
  if (!raw || typeof raw !== 'object') return null
  const r = raw as Partial<GroupByRef>
  if (r.source !== 'system' && r.source !== 'custom') return null
  if (typeof r.key !== 'string') return null
  if (r.source === 'system') {
    const field = findField(entityType, r.key)
    if (!field || !isGroupableField(field)) return null
  }
  return { source: r.source, key: r.key }
}

/** Sanitise / parse a saved view's config.columns. Tolerates the field
 *  being missing or malformed (drops bad entries). Falls back to the
 *  default column set when nothing usable is present. */
export function readColumns(
  entityType: string,
  config: Record<string, unknown> | undefined | null,
): ColumnRef[] {
  if (!config) return defaultColumnsFor(entityType)
  const raw = (config as { columns?: unknown }).columns
  if (!Array.isArray(raw)) return defaultColumnsFor(entityType)
  const valid: ColumnRef[] = []
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue
    const e = entry as Partial<ColumnRef>
    if (e.source !== 'system' && e.source !== 'custom') continue
    if (typeof e.key !== 'string') continue
    // v1: only system fields exist; drop unknown keys so removed fields
    // don't break the table.
    if (e.source === 'system' && !findField(entityType, e.key)) continue
    valid.push({ source: e.source, key: e.key })
  }
  return valid.length > 0 ? valid : defaultColumnsFor(entityType)
}
