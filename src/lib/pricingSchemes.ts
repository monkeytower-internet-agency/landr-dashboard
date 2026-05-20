import { api } from '@/lib/api-client'
import type { PricingSchemeRef } from '@/lib/products'

/**
 * Minimal CRUD for pricing schemes — surface used by the
 * EditTaxonomyButton next to the Discount-scheme dropdown on ProductForm
 * (landr-wto). Rules + tiers (the full pricing editor) are out of scope
 * for this slice; only name + currency are editable here.
 */

export type PricingSchemeWritePayload = {
  name: string
  currency: string
}

// ---- Full pricing tree types (landr-bcca) --------------------------------

export type RuleKind =
  | 'per_day_base'
  | 'per_streak_tier'
  | 'per_total_days_tier'
  | 'per_participant_tier'
  | 'fixed_total'
  | 'percentage_discount'
  | 'flat_discount'

/** Rule kinds that use a tier table (threshold_min/max + amount). */
export const TIERED_RULE_KINDS: RuleKind[] = [
  'per_day_base',
  'per_streak_tier',
  'per_total_days_tier',
  'per_participant_tier',
]

export function isTieredKind(kind: RuleKind): boolean {
  return TIERED_RULE_KINDS.includes(kind)
}

export const RULE_KIND_LABELS: Record<RuleKind, string> = {
  per_day_base: 'Base price / day',
  per_streak_tier: 'Consecutive-day tiers',
  per_total_days_tier: 'Total-days tiers',
  per_participant_tier: 'Per-participant tiers',
  percentage_discount: 'Percentage discount',
  flat_discount: 'Flat discount',
  fixed_total: 'Fixed total',
}

export type PricingTier = {
  id: string
  pricing_rule_id: string
  operator_id: string
  threshold_min: number
  threshold_max: number | null
  amount_per_unit: number | null
  amount_total: number | null
  currency: string | null
  created_at: string
  updated_at: string
}

export type PricingRule = {
  id: string
  pricing_scheme_id: string
  operator_id: string
  rule_kind: RuleKind
  sort_order: number
  params: Record<string, unknown>
  conditions: Record<string, unknown> | null
  active: boolean
  tiers: PricingTier[]
  created_at: string
  updated_at: string
}

export type PricingScheme = {
  id: string
  operator_id: string
  name: string
  currency: string
  allow_day_deselection: boolean
  notes: string | null
  active: boolean
  sort_order: number
  rules: PricingRule[]
  created_at: string
  updated_at: string
}

export type TierWritePayload = {
  threshold_min: number
  threshold_max?: number | null
  amount_per_unit?: number | null
  amount_total?: number | null
  currency?: string | null
}

export type RuleWritePayload = {
  rule_kind: RuleKind
  sort_order: number
  params?: Record<string, unknown>
  conditions?: Record<string, unknown> | null
  active?: boolean
  tiers?: TierWritePayload[]
}

// ---- Full scheme tree API ------------------------------------------------

export async function fetchPricingSchemeTree(
  operatorId: string,
  schemeId: string,
): Promise<PricingScheme> {
  return api<PricingScheme>(
    'GET',
    `/api/staff/operators/${operatorId}/pricing-schemes/${schemeId}`,
  )
}

// ---- Rule CRUD -----------------------------------------------------------

export async function createRule(
  operatorId: string,
  schemeId: string,
  body: RuleWritePayload,
): Promise<PricingRule> {
  return api<PricingRule>(
    'POST',
    `/api/staff/operators/${operatorId}/pricing-schemes/${schemeId}/rules`,
    body,
  )
}

export async function patchRule(
  operatorId: string,
  ruleId: string,
  body: Partial<Omit<RuleWritePayload, 'tiers'>>,
): Promise<PricingRule> {
  return api<PricingRule>(
    'PATCH',
    `/api/staff/operators/${operatorId}/pricing-rules/${ruleId}`,
    body,
  )
}

export async function deleteRule(
  operatorId: string,
  ruleId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/pricing-rules/${ruleId}`,
  )
}

// ---- Tier CRUD -----------------------------------------------------------

export async function createTier(
  operatorId: string,
  ruleId: string,
  body: TierWritePayload,
): Promise<PricingTier> {
  return api<PricingTier>(
    'POST',
    `/api/staff/operators/${operatorId}/pricing-rules/${ruleId}/tiers`,
    body,
  )
}

export async function patchTier(
  operatorId: string,
  tierId: string,
  body: Partial<TierWritePayload>,
): Promise<PricingTier> {
  return api<PricingTier>(
    'PATCH',
    `/api/staff/operators/${operatorId}/pricing-tiers/${tierId}`,
    body,
  )
}

export async function deleteTier(
  operatorId: string,
  tierId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/pricing-tiers/${tierId}`,
  )
}

export async function createPricingScheme(
  operatorId: string,
  body: PricingSchemeWritePayload,
): Promise<PricingSchemeRef> {
  return api<PricingSchemeRef>(
    'POST',
    `/api/staff/operators/${operatorId}/pricing-schemes`,
    body,
  )
}

export async function patchPricingScheme(
  operatorId: string,
  schemeId: string,
  body: Partial<PricingSchemeWritePayload>,
): Promise<PricingSchemeRef> {
  return api<PricingSchemeRef>(
    'PATCH',
    `/api/staff/operators/${operatorId}/pricing-schemes/${schemeId}`,
    body,
  )
}

export async function deletePricingScheme(
  operatorId: string,
  schemeId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/pricing-schemes/${schemeId}`,
  )
}
