// landr-sbhz.5 — staff tier/feature editor data layer.
//
// Reads + writes the tier/feature-entitlement foundation (landr-sbhz.1,
// migration 20260525160000_feature_entitlements):
//   - features            global Landr-managed module registry (read-only here)
//   - subscription_packages the tiers (read-only here)
//   - package_features    per-tier on/off (staff-writable via RLS)
//   - operator_features   per-operator override (staff-writable via RLS)
//   - operator_effective_features(operator_id) resolver RPC (read-only)
//
// All write paths here are STAFF-only at the RLS layer (see the migration's
// *_landr_staff policies). The dashboard surface that uses them
// (TierSettings) is itself gated to is_landr_staff in the sub-sidebar +
// route, but RLS is the real enforcement — these helpers do not re-check.
import { supabase } from '@/lib/supabase'

// ---- registry: features ------------------------------------------------------

export type FeatureStatus = 'ga' | 'beta' | 'wip'

export type ParamType = 'integer' | 'boolean' | 'string' | 'enum'

export type ParamDef = {
  key: string
  type: ParamType
  label: string
  min?: number | null
  default?: unknown
  options?: string[] | null  // for enum type
}

export type ValueSchema = { params: ParamDef[] }

export type Feature = {
  id: string
  key: string
  name: string
  description: string | null
  surface: string
  category: string | null
  status: FeatureStatus
  default_enabled: boolean
  sort_order: number
  value_schema: ValueSchema | null
  active: boolean
}

/**
 * Fetch every ACTIVE registry feature, ordered by sort_order. These are the
 * rows the editor groups by `category` into checklist sections.
 */
export async function fetchFeatures(): Promise<Feature[]> {
  const { data, error } = await supabase
    .from('features')
    .select(
      'id, key, name, description, surface, category, status, default_enabled, sort_order, value_schema, active',
    )
    .eq('active', true)
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Feature[]
}

/**
 * Fetch ALL registry features including inactive, ordered by sort_order.
 * Used by the Feature Catalog panel to show active + retired features.
 */
export async function fetchAllFeatures(): Promise<Feature[]> {
  const { data, error } = await supabase
    .from('features')
    .select(
      'id, key, name, description, surface, category, status, default_enabled, sort_order, value_schema, active',
    )
    .order('sort_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as Feature[]
}

// ---- tiers: subscription_packages -------------------------------------------

export type SubscriptionPackage = {
  id: string
  slug: string
  name: string
  display_order: number
  active: boolean
}

/**
 * Fetch every subscription package (tier), ordered by display_order. Includes
 * inactive tiers so staff can still inspect/manage a retired or hidden tier
 * (e.g. a Para42 custom tier).
 */
export async function fetchPackages(): Promise<SubscriptionPackage[]> {
  const { data, error } = await supabase
    .from('subscription_packages')
    .select('id, slug, name, display_order, active')
    .order('display_order', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as SubscriptionPackage[]
}

// ---- package_features: per-tier on/off --------------------------------------

export type PackageFeature = {
  package_id: string
  feature_id: string
  enabled: boolean
  config: Record<string, unknown> | null
}

/**
 * Fetch the package_features rows for one tier. A feature ABSENT from the
 * result has no explicit tier setting, so the resolver falls through to
 * features.default_enabled — the editor reflects that distinction.
 */
export async function fetchPackageFeatures(
  packageId: string,
): Promise<PackageFeature[]> {
  const { data, error } = await supabase
    .from('package_features')
    .select('package_id, feature_id, enabled, config')
    .eq('package_id', packageId)
  if (error) throw new Error(error.message)
  return (data ?? []) as PackageFeature[]
}

/**
 * Upsert a per-tier feature toggle. Primary key is (package_id, feature_id),
 * so on-conflict updates the existing row in place.
 */
export async function setPackageFeature(args: {
  packageId: string
  featureId: string
  enabled: boolean
}): Promise<void> {
  const { error } = await supabase.from('package_features').upsert(
    {
      package_id: args.packageId,
      feature_id: args.featureId,
      enabled: args.enabled,
    },
    { onConflict: 'package_id,feature_id' },
  )
  if (error) throw new Error(error.message)
}

/**
 * Upsert the config blob for a package_features row. Also persists the
 * resolved `enabled` value so that upserting config on a feature with no
 * explicit package_features row (i.e. one that is default-ON in the registry)
 * does NOT silently insert a row with enabled=false/DB-default.
 *
 * Callers MUST pass the currently-effective enabled state:
 *   setting?.enabled ?? feature.default_enabled
 *
 * For existing rows the round-trip is safe: the upsert overwrites enabled with
 * the same value that is already stored (existing-row setting?.enabled).
 * For new rows it preserves the registry default (feature.default_enabled).
 */
export async function setPackageFeatureConfig(args: {
  packageId: string
  featureId: string
  config: Record<string, unknown>
  enabled: boolean
}): Promise<void> {
  const { error } = await supabase.from('package_features').upsert(
    {
      package_id: args.packageId,
      feature_id: args.featureId,
      enabled: args.enabled,
      config: args.config,
    },
    { onConflict: 'package_id,feature_id' },
  )
  if (error) throw new Error(error.message)
}

/**
 * Clear the config blob on a package_features row (set to null), reverting
 * that feature's params to the registry defaults.
 */
export async function clearPackageFeatureConfig(args: {
  packageId: string
  featureId: string
}): Promise<void> {
  const { error } = await supabase
    .from('package_features')
    .update({ config: null })
    .eq('package_id', args.packageId)
    .eq('feature_id', args.featureId)
  if (error) throw new Error(error.message)
}

// ---- operators (staff-visible list) -----------------------------------------

export type OperatorSummary = {
  id: string
  slug: string
  name: string | null
  subscription_package_id: string
}

/**
 * Fetch all operators visible to the caller. For Landr staff the RLS bypass
 * returns every operator (the cross-tenant unlock lever needs the full list);
 * for non-staff RLS scopes this to their own operators — but this surface is
 * staff-gated upstream, so in practice this is the full roster.
 */
export async function fetchOperators(): Promise<OperatorSummary[]> {
  const { data, error } = await supabase
    .from('operators')
    .select('id, slug, name, subscription_package_id')
    .order('slug', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as OperatorSummary[]
}

// ---- operator_features: per-operator override -------------------------------

export type OperatorFeature = {
  operator_id: string
  feature_id: string
  enabled: boolean
  note: string | null
  config: Record<string, unknown> | null
}

/**
 * Fetch the operator_features OVERRIDE rows for one operator. A feature absent
 * from the result has NO override, so the resolver falls through to the
 * operator's tier (package_features) then the registry default. The editor
 * surfaces three override states per feature: unset / forced-on / forced-off.
 */
export async function fetchOperatorFeatures(
  operatorId: string,
): Promise<OperatorFeature[]> {
  const { data, error } = await supabase
    .from('operator_features')
    .select('operator_id, feature_id, enabled, note, config')
    .eq('operator_id', operatorId)
  if (error) throw new Error(error.message)
  return (data ?? []) as OperatorFeature[]
}

/**
 * Upsert a per-operator override (the "unlock one feature at a time" lever).
 * Stamps enabled_by_user_id with the acting staff user's public.users id for
 * the audit trail; enabled_at defaults at the DB. Primary key
 * (operator_id, feature_id) means on-conflict updates in place.
 */
export async function setOperatorFeature(args: {
  operatorId: string
  featureId: string
  enabled: boolean
  note: string | null
  enabledByUserId: string | null
}): Promise<void> {
  const { error } = await supabase.from('operator_features').upsert(
    {
      operator_id: args.operatorId,
      feature_id: args.featureId,
      enabled: args.enabled,
      note: args.note,
      enabled_by_user_id: args.enabledByUserId,
    },
    { onConflict: 'operator_id,feature_id' },
  )
  if (error) throw new Error(error.message)
}

/**
 * Delete a per-operator override, reverting that feature to "unset" so the
 * operator falls back to their tier default. Used by the "Clear override"
 * action — the override model is presence/absence, not a soft-deleted row.
 */
export async function clearOperatorFeature(args: {
  operatorId: string
  featureId: string
}): Promise<void> {
  const { error } = await supabase
    .from('operator_features')
    .delete()
    .eq('operator_id', args.operatorId)
    .eq('feature_id', args.featureId)
  if (error) throw new Error(error.message)
}

/**
 * Upsert the config blob for an operator_features row. Creates the row if it
 * does not exist yet (e.g. staff sets params before forcing the toggle).
 *
 * landr-7hac: also persists the resolved `enabled` value, mirroring
 * setPackageFeatureConfig (landr-cpcd). operator_features.enabled is
 * NOT NULL DEFAULT false, so a params-only upsert that omits it would
 * silently INSERT a forced-OFF override when none existed yet — inverting
 * the gate for any operator that was relying on the tier/registry default
 * being ON. Callers MUST pass the currently-effective enabled state:
 *   override?.enabled ?? eff?.enabled ?? false
 *
 * For existing rows the round-trip is safe: the upsert overwrites enabled
 * with the same value already stored (existing override's enabled). For new
 * rows it seeds the row with the resolved effective state instead of the
 * enabled column's false default.
 */
export async function setOperatorFeatureConfig(args: {
  operatorId: string
  featureId: string
  config: Record<string, unknown>
  enabled: boolean
  enabledByUserId: string | null
}): Promise<void> {
  const { error } = await supabase.from('operator_features').upsert(
    {
      operator_id: args.operatorId,
      feature_id: args.featureId,
      config: args.config,
      enabled: args.enabled,
      enabled_by_user_id: args.enabledByUserId,
    },
    { onConflict: 'operator_id,feature_id' },
  )
  if (error) throw new Error(error.message)
}

/**
 * Clear the config blob on an operator_features row (set to null), reverting
 * that feature's params to inherit from the tier.
 */
export async function clearOperatorFeatureConfig(args: {
  operatorId: string
  featureId: string
}): Promise<void> {
  const { error } = await supabase
    .from('operator_features')
    .update({ config: null })
    .eq('operator_id', args.operatorId)
    .eq('feature_id', args.featureId)
  if (error) throw new Error(error.message)
}

// ---- effective resolution (display) -----------------------------------------

export type EffectiveFeature = { feature_key: string; enabled: boolean }

/**
 * Resolve an operator's EFFECTIVE entitlements via the OLD resolver RPC
 * (operator_effective_features), returning a key→enabled map (override > tier
 * > default). Kept for backward compat — mobile still calls it.
 * For the richer config-aware resolution use fetchEffectiveEntitlements.
 */
export async function fetchEffectiveFeatures(
  operatorId: string,
): Promise<Map<string, boolean>> {
  const { data, error } = await supabase.rpc('operator_effective_features', {
    p_operator_id: operatorId,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as EffectiveFeature[]
  const m = new Map<string, boolean>()
  for (const row of rows) m.set(row.feature_key, row.enabled)
  return m
}

export type EffectiveEntitlement = {
  feature_key: string
  enabled: boolean
  config: Record<string, unknown>
}

/**
 * Resolve an operator's EFFECTIVE entitlements via the NEW RPC
 * (operator_effective_entitlements), returning a key→{enabled, config} map.
 * Precedence: operator_features > package_features > registry default.
 */
export async function fetchEffectiveEntitlements(
  operatorId: string,
): Promise<Map<string, EffectiveEntitlement>> {
  const { data, error } = await supabase.rpc('operator_effective_entitlements', {
    p_operator_id: operatorId,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as EffectiveEntitlement[]
  const m = new Map<string, EffectiveEntitlement>()
  for (const row of rows) m.set(row.feature_key, row)
  return m
}

// ---- grouping helper ---------------------------------------------------------

export type FeatureGroup = { category: string; features: Feature[] }

/**
 * Group features by `category` (null → 'other'), preserving the sort_order
 * the registry already encodes. Groups appear in first-seen order, which —
 * because features arrive sort_order-ascending — keeps the ON-set categories
 * above the OFF-set ones.
 */
export function groupFeaturesByCategory(features: Feature[]): FeatureGroup[] {
  const order: string[] = []
  const byCat = new Map<string, Feature[]>()
  for (const f of features) {
    const cat = f.category ?? 'other'
    if (!byCat.has(cat)) {
      byCat.set(cat, [])
      order.push(cat)
    }
    byCat.get(cat)!.push(f)
  }
  return order.map((category) => ({
    category,
    features: byCat.get(category)!,
  }))
}
