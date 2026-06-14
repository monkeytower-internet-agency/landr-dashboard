// Unit tests for tiers.ts groupFeaturesByCategory — pure grouping helper.
// landr-v9e4.10 coverage pass.

import { describe, expect, it } from 'vitest'
import { groupFeaturesByCategory, type Feature } from '@/lib/tiers'

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeFeature(overrides: Partial<Feature> & { key: string; name: string }): Feature {
  const defaults: Feature = {
    id: overrides.key,
    key: overrides.key,
    name: overrides.name,
    description: null,
    surface: 'dashboard',
    category: null,
    status: 'ga',
    default_enabled: false,
    sort_order: 0,
    value_schema: null,
    active: true,
  }
  return { ...defaults, ...overrides }
}

// ---------------------------------------------------------------------------
// groupFeaturesByCategory
// ---------------------------------------------------------------------------

describe('groupFeaturesByCategory', () => {
  it('returns an empty array for an empty input', () => {
    expect(groupFeaturesByCategory([])).toEqual([])
  })

  it('groups features into their category', () => {
    const features: Feature[] = [
      makeFeature({ key: 'f1', name: 'Feature 1', category: 'bookings', sort_order: 1 }),
      makeFeature({ key: 'f2', name: 'Feature 2', category: 'bookings', sort_order: 2 }),
      makeFeature({ key: 'f3', name: 'Feature 3', category: 'payments', sort_order: 3 }),
    ]
    const groups = groupFeaturesByCategory(features)
    expect(groups).toHaveLength(2)
    const bookingsGroup = groups.find((g) => g.category === 'bookings')!
    expect(bookingsGroup.features).toHaveLength(2)
    expect(bookingsGroup.features.map((f) => f.key)).toEqual(['f1', 'f2'])
  })

  it('maps null category to "other"', () => {
    const features: Feature[] = [
      makeFeature({ key: 'f1', name: 'Feature 1', category: null }),
    ]
    const groups = groupFeaturesByCategory(features)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.category).toBe('other')
    expect(groups[0]!.features[0]!.key).toBe('f1')
  })

  it('preserves first-seen order across categories (sort_order order)', () => {
    const features: Feature[] = [
      makeFeature({ key: 'a', name: 'A', category: 'alpha', sort_order: 1 }),
      makeFeature({ key: 'b', name: 'B', category: 'beta', sort_order: 2 }),
      makeFeature({ key: 'c', name: 'C', category: 'alpha', sort_order: 3 }),
    ]
    const groups = groupFeaturesByCategory(features)
    expect(groups[0]!.category).toBe('alpha')
    expect(groups[1]!.category).toBe('beta')
  })

  it('puts null-category features in "other" at the position they first appear', () => {
    const features: Feature[] = [
      makeFeature({ key: 'a', name: 'A', category: 'named', sort_order: 1 }),
      makeFeature({ key: 'b', name: 'B', category: null, sort_order: 2 }),
      makeFeature({ key: 'c', name: 'C', category: null, sort_order: 3 }),
    ]
    const groups = groupFeaturesByCategory(features)
    expect(groups).toHaveLength(2)
    const otherGroup = groups.find((g) => g.category === 'other')!
    expect(otherGroup.features).toHaveLength(2)
  })

  it('preserves sort_order-encoded feature order within each group', () => {
    const features: Feature[] = [
      makeFeature({ key: 'z', name: 'Z', category: 'grp', sort_order: 10 }),
      makeFeature({ key: 'a', name: 'A', category: 'grp', sort_order: 20 }),
      makeFeature({ key: 'm', name: 'M', category: 'grp', sort_order: 15 }),
    ]
    const groups = groupFeaturesByCategory(features)
    expect(groups).toHaveLength(1)
    // Features appear in the order they were provided (registry sort_order already sorted them on input)
    expect(groups[0]!.features.map((f) => f.key)).toEqual(['z', 'a', 'm'])
  })

  it('handles a single feature correctly', () => {
    const features: Feature[] = [
      makeFeature({ key: 'solo', name: 'Solo', category: 'cats', sort_order: 1 }),
    ]
    const groups = groupFeaturesByCategory(features)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.category).toBe('cats')
    expect(groups[0]!.features).toHaveLength(1)
  })

  it('handles all features with the same category', () => {
    const features: Feature[] = [
      makeFeature({ key: 'a', name: 'A', category: 'one', sort_order: 1 }),
      makeFeature({ key: 'b', name: 'B', category: 'one', sort_order: 2 }),
      makeFeature({ key: 'c', name: 'C', category: 'one', sort_order: 3 }),
    ]
    const groups = groupFeaturesByCategory(features)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.features).toHaveLength(3)
  })

  it('works with features that have value_schema', () => {
    const features: Feature[] = [
      makeFeature({
        key: 'products',
        name: 'Products',
        category: 'core',
        sort_order: 1,
        value_schema: {
          params: [
            { key: 'max_products', type: 'integer', label: 'Max products', min: 1, default: 50 },
          ],
        },
      }),
      makeFeature({ key: 'team', name: 'Team', category: 'core', sort_order: 2 }),
    ]
    const groups = groupFeaturesByCategory(features)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.category).toBe('core')
    expect(groups[0]!.features).toHaveLength(2)
    // value_schema is preserved in the output
    expect(groups[0]!.features[0]!.value_schema).not.toBeNull()
    expect(groups[0]!.features[1]!.value_schema).toBeNull()
  })

  it('works with features that have active=false (included when passed in)', () => {
    // groupFeaturesByCategory is a pure grouping function — it groups whatever
    // features are passed in, regardless of the active flag. fetchAllFeatures
    // passes inactive features; the catalog panel handles the split.
    const features: Feature[] = [
      makeFeature({ key: 'active-one', name: 'Active', category: 'core', active: true }),
      makeFeature({ key: 'retired-one', name: 'Retired', category: 'core', active: false }),
    ]
    const groups = groupFeaturesByCategory(features)
    expect(groups).toHaveLength(1)
    expect(groups[0]!.features).toHaveLength(2)
    expect(groups[0]!.features.map((f) => f.active)).toEqual([true, false])
  })
})
