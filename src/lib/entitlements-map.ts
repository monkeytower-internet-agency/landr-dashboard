// landr-sbhz.6 — feature gating: pure key→surface maps + the resolver fetch.
//
// Kept in a plain .ts module (no JSX) so the React-refresh lint rule
// (only-export-components) stays happy: entitlements.tsx exports the Provider
// component + the useEntitlements hook, everything else lives here.
//
// The tier/feature-entitlement foundation (landr-sbhz.1) ships a resolver RPC
// `operator_effective_features(p_operator_id uuid)` returning one
// (feature_key, enabled) row per ACTIVE registry feature, with precedence
// override > tier > default. A key ABSENT from the result is treated as
// DISABLED. Gating is GENERIC — any feature whose effective `enabled` is false
// (or absent) is hidden; nothing here is hardcoded to Para42.
//
// Authoritative key list lives in the landr-api migration
// (20260525160000_feature_entitlements.sql). Below we map each GATEABLE
// dashboard feature key to the route path(s) and/or settings section id(s) it
// controls. A feature with no dashboard surface (e.g. `community`, mobile-only)
// has no entry here and therefore gates nothing on the dashboard.
import { supabase } from '@/lib/supabase'

// `FEATURE_ROUTES`   — top-level routes mounted in App.tsx + nav items in
//                      AppSidebar (path keys match the NavItem `to` / Route
//                      `path`, both rooted at `/`).
export const FEATURE_ROUTES: Record<string, string[]> = {
  // ON-set (shown when enabled)
  bookings: ['/bookings'],
  calendar: ['/calendar'],
  contacts: ['/contacts'],
  // OFF-set for Para42
  analytics: ['/analytics'],
  reporting: ['/reporting'],
  audit: ['/audit'],
  tickets: ['/tickets'],
  release_planning: ['/tickets/planning'],
}

// `FEATURE_SECTIONS` — settings sub-sidebar entries (the `to` field in
//                      sections.ts, rooted at `/settings/...`).
export const FEATURE_SECTIONS: Record<string, string[]> = {
  // ON-set (shown when enabled)
  schedule: ['/settings/schedule'],
  products: ['/settings/products'],
  categories: ['/settings/categories'],
  pricing: ['/settings/pricing'],
  pickup_locations: ['/settings/pickup-locations'],
  providers: ['/settings/providers'],
  embed: ['/settings/embed'],
  email_templates: ['/settings/email-templates'],
  email_log: ['/email-log'],
  commission: ['/settings/commissions'],
  company: ['/account/company'],
  branding: ['/settings/branding'],
  // landr-jb1k — Booking widget presentation (variant + category columns).
  // Gated alongside Branding: both are paid "make the embedded widget yours"
  // surfaces. The feature key mirrors the API registry (landr-jb1k.1).
  widget_config: ['/settings/widget'],
  // landr-71kz — form builder (library + field-builder editor) + product
  // Flow tab. Beta, default off; enabled for business/enterprise tiers.
  // (landr-71kz.5 added the /settings/forms library; landr-71kz.7 added the
  // product Flow tab — both gate on this single key.)
  form_builder: ['/settings/forms'],
  team: ['/settings/team'],
  // OFF-set for Para42
  vouchers: ['/settings/vouchers'],
  campaigns: ['/settings/campaigns'],
  tags: ['/settings/tags'],
  webhooks: ['/settings/webhooks'],
  // landr-ubqo — Gmail (sending mailbox) is intentionally UNGATED: connecting
  // your own Gmail to send branded booking emails is a prerequisite to
  // operate, not a paid upsell. Same rationale as the ungated Payments &
  // invoicing section (landr-1nwu.2). Must never be hidden by tier — a gated
  // Gmail section left operators unable to send ANY booking email. So it is
  // deliberately absent from this map (→ featureForSection returns null →
  // always visible). Do NOT re-add a `gmail:` entry here.
  calendar_feed: ['/account/integrations/calendar'],
  plan: ['/account/plan'],
}

// Reverse index: route path → owning feature key. Built once. A path absent
// from this map is UNGATED (always visible) — e.g. Dashboard `/`, Views,
// Approvals, Retrieve, Trash, Offers, Service Roles, Operations, the personal
// Account surfaces (connected-accounts, notifications, calendar-display,
// display-preferences). Those have no corresponding gateable feature key and
// must never be hidden by tier.
const ROUTE_TO_FEATURE: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const [key, paths] of Object.entries(FEATURE_ROUTES)) {
    for (const p of paths) m[p] = key
  }
  return m
})()

const SECTION_TO_FEATURE: Record<string, string> = (() => {
  const m: Record<string, string> = {}
  for (const [key, paths] of Object.entries(FEATURE_SECTIONS)) {
    for (const p of paths) m[p] = key
  }
  return m
})()

/**
 * The feature key that gates a given top-level route path, or null if the
 * route is ungated (always visible).
 */
export function featureForRoute(path: string): string | null {
  return ROUTE_TO_FEATURE[path] ?? null
}

/**
 * The feature key that gates a given settings section `to` path, or null if
 * the section is ungated (always visible).
 */
export function featureForSection(to: string): string | null {
  return SECTION_TO_FEATURE[to] ?? null
}

type EffectiveFeatureRow = { feature_key: string; enabled: boolean }

/**
 * Resolve the operator's effective feature entitlements via the
 * `operator_effective_features` RPC. Returns the SET of ENABLED feature keys
 * (absent keys / disabled rows are simply not in the set, so membership ===
 * enabled). Throws on RPC error so TanStack Query surfaces it.
 *
 * KEPT for backward compat — mobile and existing callers still use this.
 */
export async function fetchEnabledFeatures(
  operatorId: string,
): Promise<Set<string>> {
  const { data, error } = await supabase.rpc('operator_effective_features', {
    p_operator_id: operatorId,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as EffectiveFeatureRow[]
  const enabled = new Set<string>()
  for (const row of rows) {
    if (row.enabled) enabled.add(row.feature_key)
  }
  return enabled
}

type EffectiveEntitlementRow = {
  feature_key: string
  enabled: boolean
  config: Record<string, unknown>
}

/**
 * Resolve the operator's effective entitlements via the NEW
 * `operator_effective_entitlements` RPC. Returns a Map of feature key →
 * { enabled, config } so callers can read both the boolean gate and any
 * parametric config blob. Throws on RPC error.
 */
export async function fetchEnabledEntitlements(
  operatorId: string,
): Promise<Map<string, { enabled: boolean; config: Record<string, unknown> }>> {
  const { data, error } = await supabase.rpc('operator_effective_entitlements', {
    p_operator_id: operatorId,
  })
  if (error) throw new Error(error.message)
  const rows = (data ?? []) as EffectiveEntitlementRow[]
  const m = new Map<string, { enabled: boolean; config: Record<string, unknown> }>()
  for (const row of rows) {
    m.set(row.feature_key, { enabled: row.enabled, config: row.config ?? {} })
  }
  return m
}
