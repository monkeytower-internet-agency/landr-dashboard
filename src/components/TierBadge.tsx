// landr-7dya.19 / landr-7dya.21 — single deploy-tier badge component.
//
// One source of truth for badge appearance so the chrome topbar (AppShell)
// and the /release console (which prefers the server-reported tier over
// getTier()) render the SAME colors + labels for the same tier. Prior state
// had two implementations with conflicting colors (DEV=amber in one, blue in
// the other; STAGING=sky-blue vs amber) — user reported the mismatch; this
// collapses to one component.
//
// Colors:
//   DEV     → blue
//   STAGING → amber
//   PROD    → emerald  (only rendered when `showProd` is true; AppShell omits it)
//
// Usage:
//   <TierBadge />              — reads VITE_DEPLOY_TIER via getTier().
//   <TierBadge tier={tier} />  — explicit override (the /release page passes
//                                its resolved server-or-static tier).
//   <TierBadge showProd />     — render the prod pill too.

import { cn } from '@/lib/utils'
import { getTier, type DeployTier } from '@/lib/tier'

type Props = {
  /** Optional explicit tier (overrides VITE_DEPLOY_TIER). */
  tier?: DeployTier | null
  /** When true, render the prod pill instead of nothing. Default false. */
  showProd?: boolean
}

const TIER_STYLE: Record<DeployTier, string> = {
  dev: 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300',
  staging: 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
  prod: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/60 dark:text-emerald-300',
}

const TIER_LABEL: Record<DeployTier, string> = {
  dev: 'DEV',
  staging: 'STAGING',
  prod: 'PROD',
}

export function TierBadge({ tier: tierProp, showProd = false }: Props = {}) {
  const tier = tierProp ?? getTier()
  if (tier === null) return null
  if (tier === 'prod' && !showProd) return null

  return (
    <span
      role="status"
      aria-label={`Deploy tier: ${TIER_LABEL[tier]}`}
      data-testid={`tier-badge-${tier}`}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold leading-none tracking-wide select-none',
        TIER_STYLE[tier],
      )}
    >
      {TIER_LABEL[tier]}
    </span>
  )
}
