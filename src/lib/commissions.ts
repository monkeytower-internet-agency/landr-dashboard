import { api } from '@/lib/api-client'

/**
 * CRUD wrappers for the staff commission API (landr-9n0l), backing the
 * Settings → Commissions editor + agent-earnings report.
 *
 * Mirrors src/lib/pricingSchemes.ts but against the commission_* tables
 * (Slice 9 / Decision #60). Key shape differences vs pricing:
 *   - schemes carry recipient_kind (platform|agent|provider) + a required
 *     currency; no allow_day_deselection / name_localized.
 *   - rules are keyed by scheme_id and carry rule_kind from a wider enum
 *     plus a polymorphic applies_to_contract_id.
 *   - tiers use numeric thresholds and a rate XOR fixed_amount value
 *     (no per-unit/total split, no per-tier currency).
 *
 * agent_earnings are READ-ONLY here: they accrue via server triggers/jobs.
 */

// ---- enums --------------------------------------------------------------

export type RecipientKind = 'platform' | 'agent' | 'provider'

export const RECIPIENT_KIND_LABELS: Record<RecipientKind, string> = {
  platform: 'Platform',
  agent: 'Agent',
  provider: 'Provider',
}

export type CommissionRuleKind =
  | 'base_percentage_of_net'
  | 'base_percentage_of_gross'
  | 'base_flat_per_booking'
  | 'base_flat_per_day'
  | 'product_override'
  | 'channel_override'
  | 'date_pattern_override'
  | 'participant_count_tier'
  | 'value_tier'
  | 'campaign_override'
  | 'monthly_volume_bonus'
  | 'effective_period'
  | 'manual_override'

export const COMMISSION_RULE_KIND_LABELS: Record<CommissionRuleKind, string> = {
  base_percentage_of_net: '% of net',
  base_percentage_of_gross: '% of gross',
  base_flat_per_booking: 'Flat per booking',
  base_flat_per_day: 'Flat per day',
  product_override: 'Product override',
  channel_override: 'Channel override',
  date_pattern_override: 'Date-pattern override',
  participant_count_tier: 'Participant-count tiers',
  value_tier: 'Value tiers',
  campaign_override: 'Campaign override',
  monthly_volume_bonus: 'Monthly volume bonus',
  effective_period: 'Effective period',
  manual_override: 'Manual override',
}

/** Rule kinds that drive a tier table (threshold_min/max + rate/fixed). */
export const TIERED_COMMISSION_RULE_KINDS: CommissionRuleKind[] = [
  'participant_count_tier',
  'value_tier',
  'monthly_volume_bonus',
]

export function isTieredCommissionKind(kind: CommissionRuleKind): boolean {
  return TIERED_COMMISSION_RULE_KINDS.includes(kind)
}

export type EarningStatus = 'accrued' | 'paid' | 'reversed'

// ---- tree types ---------------------------------------------------------

export type CommissionTier = {
  id: string
  operator_id: string
  commission_rule_id: string
  threshold_min: number
  threshold_max: number | null
  rate: number | null
  fixed_amount: number | null
  created_at: string
  updated_at: string
}

export type CommissionRule = {
  id: string
  operator_id: string
  scheme_id: string
  applies_to_contract_id: string | null
  rule_kind: CommissionRuleKind
  sort_order: number
  params: Record<string, unknown>
  conditions: Record<string, unknown> | null
  active: boolean
  tiers: CommissionTier[]
  created_at: string
  updated_at: string
}

export type CommissionScheme = {
  id: string
  operator_id: string
  name: string
  recipient_kind: RecipientKind
  currency: string
  notes: string | null
  active: boolean
  sort_order: number
  rules: CommissionRule[]
  created_at: string
  updated_at: string
}

/** Scheme list rows omit the rules tree (no ?include=tree). */
export type CommissionSchemeRef = Omit<CommissionScheme, 'rules'>

export type AgentEarning = {
  id: string
  operator_id: string
  agent_user_id: string
  booking_id: string
  earned_for_date: string
  base_amount: number
  commission_amount: number
  currency: string
  applied_rules: unknown[]
  status: EarningStatus
  payout_id: string | null
  notes: string | null
  earned_at: string
  created_at: string
}

export type AgentEarningSummary = {
  agent_user_id: string
  currency: string | null
  accrued_total: number
  paid_total: number
  reversed_total: number
  earning_count: number
}

// ---- write payloads -----------------------------------------------------

export type SchemeWritePayload = {
  name: string
  recipient_kind: RecipientKind
  currency: string
  notes?: string | null
  active?: boolean
  sort_order?: number
}

export type SchemePatch = {
  name?: string
  recipient_kind?: RecipientKind
  currency?: string
  notes?: string | null
  active?: boolean
  sort_order?: number
}

export type RuleWritePayload = {
  rule_kind: CommissionRuleKind
  sort_order?: number
  params?: Record<string, unknown>
  conditions?: Record<string, unknown> | null
  applies_to_contract_id?: string | null
  active?: boolean
  tiers?: TierWritePayload[]
}

export type RulePatch = {
  rule_kind?: CommissionRuleKind
  sort_order?: number
  params?: Record<string, unknown>
  conditions?: Record<string, unknown> | null
  applies_to_contract_id?: string | null
  active?: boolean
}

export type TierWritePayload = {
  threshold_min: number
  threshold_max?: number | null
  rate?: number | null
  fixed_amount?: number | null
}

export type TierPatch = {
  threshold_min?: number
  threshold_max?: number | null
  rate?: number | null
  fixed_amount?: number | null
}

// ---- scheme CRUD --------------------------------------------------------

export async function fetchCommissionSchemes(
  operatorId: string,
): Promise<CommissionSchemeRef[]> {
  return api<CommissionSchemeRef[]>(
    'GET',
    `/api/staff/operators/${operatorId}/commission-schemes`,
  )
}

export async function fetchCommissionSchemeTree(
  operatorId: string,
  schemeId: string,
): Promise<CommissionScheme> {
  return api<CommissionScheme>(
    'GET',
    `/api/staff/operators/${operatorId}/commission-schemes/${schemeId}`,
  )
}

export async function createCommissionScheme(
  operatorId: string,
  body: SchemeWritePayload,
): Promise<CommissionScheme> {
  return api<CommissionScheme>(
    'POST',
    `/api/staff/operators/${operatorId}/commission-schemes`,
    body,
  )
}

export async function patchCommissionScheme(
  operatorId: string,
  schemeId: string,
  body: SchemePatch,
): Promise<CommissionSchemeRef> {
  return api<CommissionSchemeRef>(
    'PATCH',
    `/api/staff/operators/${operatorId}/commission-schemes/${schemeId}`,
    body,
  )
}

// ---- rule CRUD ----------------------------------------------------------

export async function createCommissionRule(
  operatorId: string,
  schemeId: string,
  body: RuleWritePayload,
): Promise<CommissionRule> {
  return api<CommissionRule>(
    'POST',
    `/api/staff/operators/${operatorId}/commission-schemes/${schemeId}/rules`,
    body,
  )
}

export async function patchCommissionRule(
  operatorId: string,
  ruleId: string,
  body: RulePatch,
): Promise<CommissionRule> {
  return api<CommissionRule>(
    'PATCH',
    `/api/staff/operators/${operatorId}/commission-rules/${ruleId}`,
    body,
  )
}

export async function deleteCommissionRule(
  operatorId: string,
  ruleId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/commission-rules/${ruleId}`,
  )
}

// ---- tier CRUD ----------------------------------------------------------

export async function createCommissionTier(
  operatorId: string,
  ruleId: string,
  body: TierWritePayload,
): Promise<CommissionTier> {
  return api<CommissionTier>(
    'POST',
    `/api/staff/operators/${operatorId}/commission-rules/${ruleId}/tiers`,
    body,
  )
}

export async function patchCommissionTier(
  operatorId: string,
  tierId: string,
  body: TierPatch,
): Promise<CommissionTier> {
  return api<CommissionTier>(
    'PATCH',
    `/api/staff/operators/${operatorId}/commission-tiers/${tierId}`,
    body,
  )
}

export async function deleteCommissionTier(
  operatorId: string,
  tierId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/commission-tiers/${tierId}`,
  )
}

// ---- agent earnings (read-only) -----------------------------------------

export async function fetchAgentEarnings(
  operatorId: string,
  opts: { agentUserId?: string; status?: EarningStatus } = {},
): Promise<AgentEarning[]> {
  const params = new URLSearchParams()
  if (opts.agentUserId) params.set('agent_user_id', opts.agentUserId)
  if (opts.status) params.set('status_filter', opts.status)
  const qs = params.toString()
  return api<AgentEarning[]>(
    'GET',
    `/api/staff/operators/${operatorId}/agent-earnings${qs ? `?${qs}` : ''}`,
  )
}

export async function fetchAgentEarningsSummary(
  operatorId: string,
): Promise<AgentEarningSummary[]> {
  return api<AgentEarningSummary[]>(
    'GET',
    `/api/staff/operators/${operatorId}/agent-earnings/summary`,
  )
}
