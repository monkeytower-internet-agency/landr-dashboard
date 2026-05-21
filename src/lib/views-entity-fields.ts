// landr-hgtv — minimal entity-field registry for Views v1.
//
// Each entity type has a small set of system fields that the View filter
// chips, sort dropdown, and (eventually) column picker can reference. v1
// only covers entity_type='booking' with the handful of fields the Table
// layout (landr-7w3s) is expected to expand on.
//
// Why a registry vs. derived metadata? ADR-0002 keeps the View config
// agnostic of any particular entity — the registry is the one place the
// UI translates a stored `field` string into a typed picker (enum vs text
// vs date vs number). v2's custom-field machinery will hang additional
// entries off the same registry with `source: 'custom'`.

import type { FilterOp } from '@/lib/views-filters'

export type ViewFieldType = 'text' | 'enum' | 'date' | 'number' | 'boolean'

export type ViewField = {
  key: string
  label: string
  type: ViewFieldType
  filterable: boolean
  sortable: boolean
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
  },
  {
    key: 'current_stage',
    label: 'Stage',
    type: 'enum',
    filterable: true,
    sortable: true,
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
  }
}
