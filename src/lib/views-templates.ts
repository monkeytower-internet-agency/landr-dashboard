// landr-v0xg — starter View templates.
//
// Four hardcoded templates the ViewsIndex empty-state offers as
// one-click materialisations. Each template defines `config` matching
// the jsonb shape from ADR-0002 (single jsonb blob; field refs carry a
// `source` discriminator so v2 custom fields land additively). v1 only
// emits `source: 'system'`.
//
// Templates are data-only — they are NOT seeded into the DB. The
// /views/new?from=template:<key> flow reads from this list and POSTs a
// new Personal View with the template's config.

export type ViewTemplate = {
  key: string
  name: string
  description: string
  entity_type: 'booking'
  config: Record<string, unknown>
}

export const VIEW_TEMPLATES: ViewTemplate[] = [
  {
    key: 'all-bookings',
    name: 'All bookings',
    description: 'Every booking, sortable table.',
    entity_type: 'booking',
    config: {
      layout: 'table',
      filters: [],
      sort: [{ source: 'system', key: 'created_at', dir: 'desc' }],
    },
  },
  {
    key: 'pending-approvals',
    name: 'Pending approvals',
    description: 'Bookings waiting for review, grouped by stage.',
    entity_type: 'booking',
    config: {
      layout: 'board',
      filters: [
        {
          field: 'current_stage',
          op: 'in',
          values: [
            'awaiting_general_approval',
            'awaiting_secondary_approval',
            'awaiting_hotel_approval',
          ],
        },
      ],
      sort: [],
      boardConfig: {
        columnBy: { source: 'system', key: 'current_stage' },
        swimlaneBy: null,
      },
    },
  },
  {
    key: 'this-week',
    name: 'This week',
    description: 'Bookings starting in the next 7 days, on a calendar.',
    entity_type: 'booking',
    config: {
      layout: 'calendar',
      filters: [
        {
          field: 'date_range_start',
          op: 'within',
          values: ['today', '+7d'],
        },
      ],
      sort: [],
      calendarConfig: {
        dateField: { source: 'system', key: 'date_range_start' },
      },
    },
  },
  {
    key: 'todays-pickups',
    name: "Today's pickups",
    description: 'Bookings starting today with a pickup location.',
    entity_type: 'booking',
    config: {
      layout: 'table',
      filters: [
        { field: 'date_range_start', op: 'eq', values: ['today'] },
        { field: 'pickup_location_id', op: 'is_not_null', values: [] },
      ],
      sort: [],
    },
  },
]

export function findTemplateByKey(key: string): ViewTemplate | undefined {
  return VIEW_TEMPLATES.find((t) => t.key === key)
}
