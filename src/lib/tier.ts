// landr-7dya.19 / landr-7dya.21 — deploy-tier detection for the dashboard.
//
// One source of truth for "which deploy tier is this build serving?" — dev,
// staging, or prod. Returns null if unset/unknown so callers can decide
// whether to render a fallback or gate cautiously.
//
// PRECEDENCE (intentional):
//   1. server-reported `viewer.tier` from GET /api/landr-staff/promotions/status
//      (only the /release console has this; the server knows the API's actual
//      ENVIRONMENT and is the authoritative answer)
//   2. VITE_DEPLOY_TIER (build-time env, set per Cloudflare Pages project)
//   3. null  (unknown — callers must fall back / gate cautiously)
//
// VITE_DEPLOY_TIER is injected per-branch in .github/workflows/deploy.yml:
//   dev branch     → 'dev'
//   staging branch → 'staging'
//   main branch    → 'prod'

/** The deploy tier of the currently-served build. */
export type DeployTier = 'dev' | 'staging' | 'prod'

/**
 * Back-compat alias for early consumers (TierBadge). Includes `null` for the
 * unknown state. Prefer `DeployTier | null` in new code.
 */
export type Tier = DeployTier | null

/**
 * Read the deploy tier from VITE_DEPLOY_TIER. Unknown values (or unset) return
 * null — callers should treat null as "unknown" and either fall back to a
 * server-reported tier or refuse to render tier-gated actions.
 */
export function getTier(): DeployTier | null {
  const raw = (import.meta.env.VITE_DEPLOY_TIER as string | undefined)?.trim()
  if (raw === 'dev' || raw === 'staging' || raw === 'prod') return raw
  return null
}

/**
 * Resolve the effective tier given an optional server-reported override.
 * Prefer the server answer (it knows the actual ENVIRONMENT the API runs in);
 * fall back to the static build env. Either argument may be null/undefined.
 */
export function resolveTier(
  serverTier: DeployTier | null | undefined,
): DeployTier | null {
  if (serverTier === 'dev' || serverTier === 'staging' || serverTier === 'prod') {
    return serverTier
  }
  return getTier()
}
