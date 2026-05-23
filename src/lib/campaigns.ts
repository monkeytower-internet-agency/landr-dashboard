/**
 * Operator-scoped campaigns — CRUD wrappers (landr-sp4r).
 *
 * Campaigns are the marketing-attribution carrier referenced by
 * bookings.campaign_id. An operator mints campaign codes here; the
 * booking pipeline then attributes individual bookings against them.
 *
 * Write routing (per CLAUDE.md write-routing convention):
 *   - Campaign CRUD funnels through the FastAPI staff_campaigns router.
 *     A per-operator partial-unique index on `code` means a duplicate
 *     surfaces as a clean 409 via the server-side error catch (PostgREST
 *     would otherwise return an opaque unique-violation). Same rationale
 *     as tags.ts.
 *   - DELETE is a soft delete server-side (deleted_at + audit fields);
 *     the FK from bookings is ON DELETE SET NULL, so historical
 *     attribution survives.
 */

import { api } from '@/lib/api-client'

/** Marketing-campaign kind — mirrors the Postgres campaign_kind enum. */
export type CampaignKind =
  | 'marketing'
  | 'agent_promo'
  | 'partner_referral'
  | 'voucher_linked'
  | 'launch'

/** What the campaign can attribute — mirrors the campaign_scope enum. */
export type CampaignScope = 'booking' | 'subscription' | 'any'

/** A campaign row from public.campaigns. */
export type Campaign = {
  id: string
  operator_id: string
  /** Unique per operator among non-deleted rows. */
  code: string
  label: string
  label_localized: Record<string, string> | null
  description: string | null
  description_localized: Record<string, string> | null
  kind: CampaignKind
  scope: CampaignScope
  /** ISO date (YYYY-MM-DD). */
  start_date: string
  /** ISO date, or null for an open-ended campaign. */
  end_date: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type CampaignInput = {
  code: string
  label: string
  kind: CampaignKind
  scope?: CampaignScope
  /** ISO date (YYYY-MM-DD). */
  start_date: string
  /** ISO date, or omitted for open-ended. */
  end_date?: string | null
  description?: string | null
  active?: boolean
  sort_order?: number
}

export type CampaignPatch = {
  code?: string
  label?: string
  kind?: CampaignKind
  scope?: CampaignScope
  start_date?: string
  end_date?: string | null
  description?: string | null
  active?: boolean
  sort_order?: number
}

/** Human-readable labels for each campaign kind, for selects + chips. */
export const CAMPAIGN_KIND_LABELS: Record<CampaignKind, string> = {
  marketing: 'Marketing',
  agent_promo: 'Agent promo',
  partner_referral: 'Partner referral',
  voucher_linked: 'Voucher-linked',
  launch: 'Launch',
}

export const CAMPAIGN_KINDS: readonly CampaignKind[] = [
  'marketing',
  'agent_promo',
  'partner_referral',
  'voucher_linked',
  'launch',
] as const

// ---- CRUD ------------------------------------------------------------

/** List active campaigns for an operator (soft-deleted rows excluded
 *  server-side, ordered by sort_order then code). */
export async function fetchCampaigns(operatorId: string): Promise<Campaign[]> {
  return await api<Campaign[]>(
    'GET',
    `/api/staff/operators/${operatorId}/campaigns`,
  )
}

/** Create a campaign. Throws if the code is already taken on this operator. */
export async function createCampaign(
  operatorId: string,
  input: CampaignInput,
): Promise<Campaign> {
  return await api<Campaign>(
    'POST',
    `/api/staff/operators/${operatorId}/campaigns`,
    input,
  )
}

export async function patchCampaign(
  operatorId: string,
  campaignId: string,
  patch: CampaignPatch,
): Promise<Campaign> {
  return await api<Campaign>(
    'PATCH',
    `/api/staff/operators/${operatorId}/campaigns/${campaignId}`,
    patch,
  )
}

/** Soft-delete (deactivate + retire) a campaign. Historical bookings keep
 *  their attribution; the code becomes reusable. */
export async function deleteCampaign(
  operatorId: string,
  campaignId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/campaigns/${campaignId}`,
  )
}
