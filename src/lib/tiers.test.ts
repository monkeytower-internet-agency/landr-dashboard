// Unit tests for tiers.ts.
// landr-v9e4.10 coverage pass; landr-cpcd bug-fix coverage added.

import { describe, expect, it, vi, beforeEach } from 'vitest'

// ---------------------------------------------------------------------------
// Supabase mock — must be declared before any tiers import so the module
// resolver picks up the mock when tiers.ts is loaded.
// ---------------------------------------------------------------------------

const mockUpsert = vi.fn().mockResolvedValue({ error: null })

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn(() => ({ upsert: mockUpsert })),
  },
}))

import { supabase } from '@/lib/supabase'
import {
  groupFeaturesByCategory,
  setOperatorFeatureConfig,
  setPackageFeatureConfig,
  type Feature,
} from '@/lib/tiers'

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

// ---------------------------------------------------------------------------
// setPackageFeatureConfig — landr-cpcd bug-fix regression test
// ---------------------------------------------------------------------------
//
// Bug: upserting config on a feature with no explicit package_features row
// (default-ON feature) omitted `enabled` from the payload, so the DB inserted
// a row with enabled=false/default and silently DISABLED the feature.
//
// Fix: the caller passes the resolved effective enabled state
//   (setting?.enabled ?? feature.default_enabled)
// and setPackageFeatureConfig includes it in the upsert so new rows are
// inserted with the correct enabled value.

describe('setPackageFeatureConfig (landr-cpcd)', () => {
  beforeEach(() => {
    mockUpsert.mockReset()
    mockUpsert.mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as unknown as ReturnType<typeof supabase.from>)
  })

  it('includes enabled=true in the upsert when the feature has no explicit row (default-ON)', async () => {
    // Simulates: feature.default_enabled = true, setting = undefined
    // Caller computes: setting?.enabled ?? feature.default_enabled = true
    await setPackageFeatureConfig({
      packageId: 'pkg-1',
      featureId: 'feat-1',
      config: { max_products: 50 },
      enabled: true,
    })

    expect(supabase.from).toHaveBeenCalledWith('package_features')
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        package_id: 'pkg-1',
        feature_id: 'feat-1',
        enabled: true,
        config: { max_products: 50 },
      }),
      expect.objectContaining({ onConflict: 'package_id,feature_id' }),
    )
  })

  it('preserves enabled=false for a feature that is explicitly disabled', async () => {
    // Simulates: existing row with enabled=false, caller passes that value
    await setPackageFeatureConfig({
      packageId: 'pkg-1',
      featureId: 'feat-disabled',
      config: {},
      enabled: false,
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
      expect.anything(),
    )
  })

  it('throws when supabase returns an error', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'RLS denied' } })

    await expect(
      setPackageFeatureConfig({
        packageId: 'pkg-1',
        featureId: 'feat-1',
        config: {},
        enabled: true,
      }),
    ).rejects.toThrow('RLS denied')
  })
})

// ---------------------------------------------------------------------------
// setOperatorFeatureConfig — landr-7hac
//
// operator_features.enabled is NOT NULL DEFAULT false. Before landr-7hac,
// setOperatorFeatureConfig's upsert omitted `enabled` entirely, so a
// params-only edit on a feature with NO existing override (i.e. inheriting
// an ON state from the tier/registry default) silently INSERTed a brand
// new operator_features row with enabled=false — a forced-OFF override the
// staff member never asked for. The caller (TierSettings.tsx) now passes
// the resolved effective state (`override?.enabled ?? eff?.enabled ?? false`)
// and setOperatorFeatureConfig includes it in the upsert so new rows are
// inserted with the correct enabled value, mirroring setPackageFeatureConfig.
// ---------------------------------------------------------------------------

describe('setOperatorFeatureConfig (landr-7hac)', () => {
  beforeEach(() => {
    mockUpsert.mockReset()
    mockUpsert.mockResolvedValue({ error: null })
    vi.mocked(supabase.from).mockReturnValue({ upsert: mockUpsert } as unknown as ReturnType<typeof supabase.from>)
  })

  it('includes enabled=true in the upsert when no override row exists yet (inherited ON)', async () => {
    // Simulates: no operator_features row yet, effective resolves to ON via
    // the tier/registry default. Caller computes:
    //   override?.enabled ?? eff?.enabled ?? false === true
    await setOperatorFeatureConfig({
      operatorId: 'op-1',
      featureId: 'feat-1',
      config: { max_products: 50 },
      enabled: true,
      enabledByUserId: 'user-1',
    })

    expect(supabase.from).toHaveBeenCalledWith('operator_features')
    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        operator_id: 'op-1',
        feature_id: 'feat-1',
        enabled: true,
        config: { max_products: 50 },
        enabled_by_user_id: 'user-1',
      }),
      expect.objectContaining({ onConflict: 'operator_id,feature_id' }),
    )
  })

  it('preserves enabled=false for an existing forced-OFF override', async () => {
    // Simulates: an existing override row with enabled=false; caller passes
    // that value straight through (override?.enabled took priority).
    await setOperatorFeatureConfig({
      operatorId: 'op-1',
      featureId: 'feat-disabled',
      config: {},
      enabled: false,
      enabledByUserId: 'user-1',
    })

    expect(mockUpsert).toHaveBeenCalledWith(
      expect.objectContaining({ enabled: false }),
      expect.anything(),
    )
  })

  it('throws when supabase returns an error', async () => {
    mockUpsert.mockResolvedValue({ error: { message: 'RLS denied' } })

    await expect(
      setOperatorFeatureConfig({
        operatorId: 'op-1',
        featureId: 'feat-1',
        config: {},
        enabled: true,
        enabledByUserId: 'user-1',
      }),
    ).rejects.toThrow('RLS denied')
  })
})
