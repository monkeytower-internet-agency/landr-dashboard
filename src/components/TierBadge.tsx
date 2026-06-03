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
// landr-hisw — when `switcher` is true, the chip becomes a
// DropdownMenuTrigger that lets staff jump to the same path on another
// tier's dashboard. The plain badge (switcher=false, the default) is fully
// backward-compatible — used by the /release console and tests that don't
// need the switcher affordance.
//
// landr-p3b7 — `isStaff` gates the Dev option in the switcher. The
// dashboard.dev.landr.de origin is Tailscale-only; non-staff operators
// cannot reach it, so we omit 'dev' from their jump-target list. Staff see
// the full set. When filtering leaves zero targets the dropdown collapses
// back to a plain badge (no empty menu).
//
// Usage:
//   <TierBadge />                     — reads VITE_DEPLOY_TIER via getTier().
//   <TierBadge tier={tier} />         — explicit override (the /release page
//                                       passes its resolved server-or-static tier).
//   <TierBadge showProd />            — render the prod pill too.
//   <TierBadge switcher showProd />   — topbar variant; chip is a dropdown.
//   <TierBadge switcher showProd isStaff={false} />  — non-staff: Dev omitted.

import { cn } from '@/lib/utils'
import { getTier, otherTiers, urlForTier, type DeployTier } from '@/lib/tier'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { ExternalLinkIcon } from 'lucide-react'

type Props = {
  /** Optional explicit tier (overrides VITE_DEPLOY_TIER). */
  tier?: DeployTier | null
  /** When true, render the prod pill instead of nothing. Default false. */
  showProd?: boolean
  /**
   * landr-hisw — when true, the chip is a DropdownMenuTrigger; the menu
   * lists jump links to other tiers. Only shown when tier is known
   * (non-null) so the dropdown always has an anchor. Default false.
   */
  switcher?: boolean
  /**
   * landr-p3b7 — when true (Landr staff), the switcher includes Dev as a
   * jump target. When false/undefined (non-staff operator), Dev is omitted
   * because dashboard.dev.landr.de is Tailscale-only and unreachable for
   * them. If filtering leaves zero targets the dropdown collapses to a
   * plain badge. Has no effect when `switcher` is false.
   */
  isStaff?: boolean
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

const TIER_DISPLAY: Record<DeployTier, string> = {
  dev: 'Dev',
  staging: 'Staging',
  prod: 'Prod',
}

const chipClass = (tier: DeployTier) =>
  cn(
    'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold leading-none tracking-wide select-none',
    TIER_STYLE[tier],
  )

export function TierBadge({ tier: tierProp, showProd = false, switcher = false, isStaff = false }: Props = {}) {
  const tier = tierProp ?? getTier()
  if (tier === null) return null
  if (tier === 'prod' && !showProd) return null

  const chip = (
    <span
      role="status"
      aria-label={`Deploy tier: ${TIER_LABEL[tier]}`}
      data-testid={`tier-badge-${tier}`}
      className={chipClass(tier)}
    >
      {TIER_LABEL[tier]}
    </span>
  )

  // Without switcher prop (or when tier is null — already handled above),
  // render the plain static chip. This keeps the /release console and any
  // other caller that passes only `tier` fully backward-compatible.
  if (!switcher) return chip

  // landr-p3b7 — non-staff cannot reach dashboard.dev.landr.de (Tailscale-
  // only), so exclude 'dev' from their jump-target list. If filtering leaves
  // zero targets, fall back to a plain badge rather than rendering an empty
  // dropdown menu.
  const others = otherTiers(tier).filter((t) => t !== 'dev' || isStaff)
  if (others.length === 0) return chip

  const currentPath =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '/'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="cursor-pointer rounded-full outline-none focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:ring-offset-background"
          aria-label={`Deploy tier: ${TIER_LABEL[tier]}. Click to switch dashboard tier.`}
          data-testid={`tier-badge-switcher-${tier}`}
        >
          {chip}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[10rem]">
        {/* Current tier — disabled row showing where you are */}
        <DropdownMenuItem
          disabled
          className="font-medium opacity-60"
          data-testid={`tier-switch-current-${tier}`}
        >
          <span className={cn('mr-1.5 inline-block size-2 rounded-full', {
            'bg-blue-500': tier === 'dev',
            'bg-amber-500': tier === 'staging',
            'bg-emerald-500': tier === 'prod',
          })} />
          {TIER_DISPLAY[tier]}
          <span className="ml-1 text-xs text-muted-foreground">(current)</span>
        </DropdownMenuItem>
        {others.length > 0 && <DropdownMenuSeparator />}
        {others.map((t) => (
          <DropdownMenuItem key={t} asChild data-testid={`tier-switch-to-${t}`}>
            <a
              href={urlForTier(t, currentPath)}
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center gap-1.5"
            >
              <ExternalLinkIcon className="size-3 text-muted-foreground" />
              {TIER_DISPLAY[t]}
            </a>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
