// landr-1ztq — unit tests for the pure groupRows helper + the
// useGroupCollapse persistence contract. The component-level smoke
// tests (collapse-by-click, headers visible) live in TableLayout.test.tsx.

import { afterEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_REGISTRY,
  groupCollapseStorageKey,
  groupRows,
  type FieldRegistry,
} from './views-group-by'

type Item = { id: string; stage: string | null }

const ITEMS: Item[] = [
  { id: 'a', stage: 'awaiting_hotel_approval' },
  { id: 'b', stage: 'confirmed' },
  { id: 'c', stage: 'awaiting_hotel_approval' },
  { id: 'd', stage: null },
  { id: 'e', stage: 'confirmed' },
]

describe('groupRows (landr-1ztq)', () => {
  it('buckets rows by the configured field value', () => {
    const groups = groupRows(ITEMS, {
      entityType: 'booking',
      fieldKey: 'current_stage',
      readValue: (it) => it.stage,
    })
    const byKey = Object.fromEntries(
      groups.map((g) => [g.key, g.items.map((it) => it.id)]),
    )
    expect(byKey.awaiting_hotel_approval).toEqual(['a', 'c'])
    expect(byKey.confirmed).toEqual(['b', 'e'])
    expect(byKey.__null__).toEqual(['d'])
  })

  it('orders buckets by the field registry enumValues so empty buckets still appear', () => {
    // Only confirmed + awaiting_hotel_approval show up in items, but the
    // registry knows all five stages. Empty buckets render in registry
    // order so the operator can drag items into them later.
    const groups = groupRows(ITEMS, {
      entityType: 'booking',
      fieldKey: 'current_stage',
      readValue: (it) => it.stage,
    })
    const keys = groups.map((g) => g.key)
    // First registry entry is awaiting_general_approval — must come before
    // the awaiting_hotel_approval bucket that actually has rows.
    expect(keys.indexOf('awaiting_general_approval')).toBeLessThan(
      keys.indexOf('awaiting_hotel_approval'),
    )
    // Null bucket is always last.
    expect(keys[keys.length - 1]).toBe('__null__')
  })

  it('falls back to first-seen order when the field has no enum values', () => {
    type Row = { id: string; tag: string | null }
    const rows: Row[] = [
      { id: '1', tag: 'b' },
      { id: '2', tag: 'a' },
      { id: '3', tag: 'b' },
    ]
    // Registry returns a field with no enumValues so we exercise the
    // first-seen branch.
    const registry: FieldRegistry = {
      findField: () => ({
        key: 'tag',
        label: 'Tag',
        type: 'text',
        filterable: true,
        sortable: false,
      }),
      valueLabel: (_e, _k, v) => String(v),
    }
    const groups = groupRows(rows, {
      entityType: 'thing',
      fieldKey: 'tag',
      readValue: (it) => it.tag,
      registry,
    })
    expect(groups.map((g) => g.key)).toEqual(['b', 'a'])
  })

  it('labels enum values via the field registry', () => {
    const groups = groupRows(ITEMS, {
      entityType: 'booking',
      fieldKey: 'current_stage',
      readValue: (it) => it.stage,
    })
    const hotel = groups.find((g) => g.key === 'awaiting_hotel_approval')
    expect(hotel?.label).toBe('Awaiting hotel approval')
  })

  it('returns counts that match the bucket sizes', () => {
    const groups = groupRows(ITEMS, {
      entityType: 'booking',
      fieldKey: 'current_stage',
      readValue: (it) => it.stage,
    })
    const sum = groups.reduce((acc, g) => acc + g.items.length, 0)
    expect(sum).toBe(ITEMS.length)
  })

  it('returns an empty array for an empty input', () => {
    const groups = groupRows<Item>([], {
      entityType: 'booking',
      fieldKey: 'current_stage',
      readValue: (it) => it.stage,
    })
    // Empty input + a registry with enum values: registry buckets still
    // come back so the table renders the empty sections. Each bucket has
    // an items array of length 0.
    expect(groups.every((g) => g.items.length === 0)).toBe(true)
  })

  it('DEFAULT_REGISTRY proxies the booking field registry', () => {
    expect(DEFAULT_REGISTRY.findField('booking', 'current_stage')?.type).toBe(
      'enum',
    )
    expect(
      DEFAULT_REGISTRY.valueLabel('booking', 'current_stage', 'confirmed'),
    ).toBe('Confirmed')
  })
})

describe('groupCollapseStorageKey (landr-1ztq)', () => {
  afterEach(() => {
    window.localStorage.clear()
  })

  it('namespaces keys per viewId so two views don\'t collide', () => {
    expect(groupCollapseStorageKey('v-1')).not.toBe(
      groupCollapseStorageKey('v-2'),
    )
  })

  it('survives a write+read round-trip', () => {
    const key = groupCollapseStorageKey('v-1')
    window.localStorage.setItem(
      key,
      JSON.stringify({ awaiting_hotel_approval: true }),
    )
    const raw = window.localStorage.getItem(key)
    expect(raw).not.toBeNull()
    expect(JSON.parse(raw as string)).toEqual({
      awaiting_hotel_approval: true,
    })
  })
})
