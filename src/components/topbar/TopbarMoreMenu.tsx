// landr-fd5m.2 — "More" overflow menu for the topbar right-cluster.
//
// This menu is now driven by the MEASURED fold set from useTopbarOverflow
// (landr-fd5m.2), not a static breakpoint. It renders the ⋯ (MoreHorizontal)
// DropdownMenu trigger ONLY while at least one item is folded, and surfaces
// exactly the folded items — theme, widget (new staff booking), tier (env
// switch links), report/feedback — so every action stays reachable in ≤1 tap.
//
// ErrorHistoryBell + NotificationsBell are intentionally NEVER folded and never
// appear here — each manages its own Radix DropdownMenu internally, and nesting
// two Radix menus via a portal is unreliable. UserMenu and the mode/operator
// switchers likewise stay inline. See use-topbar-overflow.ts for the full
// fold-order rationale (theme → widget → tier → report).
//
// Widget note: the folded WidgetButton stays MOUNTED (just `hidden`), so its
// StaffWidgetModal — a Radix Dialog portaled to <body> — keeps working. This
// menu therefore only needs to REQUEST opening it via `onOpenWidget`, which the
// shell wires to the lifted widget-modal state; it does not re-mount the modal.

import {
  MoreHorizontalIcon,
  MoonIcon,
  SunIcon,
  MessageSquarePlusIcon,
  PlusIcon,
  ExternalLinkIcon,
} from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/lib/theme'
import { useReportFab } from '@/lib/report-fab-context'
import { useEntitlements } from '@/lib/entitlements'
import { getTier, otherTiers, urlForTier, TIER_DISPLAY } from '@/lib/tier'
import { t } from '@/lib/strings'
import type { TopbarFoldable } from '@/hooks/use-topbar-overflow'

type Props = {
  /** The measured fold set from useTopbarOverflow. */
  folded: ReadonlySet<TopbarFoldable>
  /** Open the (lifted) staff booking-widget modal; the folded WidgetButton
   *  stays mounted so its portaled dialog renders regardless. */
  onOpenWidget: () => void
}

export function TopbarMoreMenu({ folded, onOpenWidget }: Props) {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const { setOpen: openReportFab } = useReportFab()
  // landr-p3b7 — mirror TierBadge: Dev is a jump target only for staff
  // (dashboard.dev.landr.de is Tailscale-only). effectiveIsStaff drops the
  // bypass while viewing-as, exactly like the inline switcher.
  const { effectiveIsStaff } = useEntitlements()

  // Nothing folded ⇒ the cluster fits inline ⇒ no ⋯ trigger at all.
  if (folded.size === 0) return null

  const tier = getTier()
  // Tier menu entries are plain links (no nested Radix dropdown) built from the
  // same otherTiers/urlForTier/TIER_DISPLAY source the inline TierBadge uses.
  const tierTargets =
    folded.has('tier') && tier
      ? otherTiers(tier).filter((x) => x !== 'dev' || effectiveIsStaff)
      : []
  const currentPath =
    typeof window !== 'undefined'
      ? window.location.pathname + window.location.search
      : '/'

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="More options"
          data-testid="topbar-more-menu-trigger"
        >
          <MoreHorizontalIcon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" data-testid="topbar-more-menu-content">
        {folded.has('widget') && (
          <DropdownMenuItem
            onClick={onOpenWidget}
            data-testid="topbar-more-menu-widget"
          >
            <PlusIcon className="size-4" aria-hidden />
            {t.staffWidget.openLabel}
          </DropdownMenuItem>
        )}
        {tierTargets.map((x) => (
          <DropdownMenuItem
            key={x}
            asChild
            data-testid={`topbar-more-menu-tier-${x}`}
          >
            <a
              href={urlForTier(x, currentPath)}
              rel="noopener noreferrer"
              className="flex cursor-pointer items-center gap-1.5"
            >
              <ExternalLinkIcon
                className="size-4 text-muted-foreground"
                aria-hidden
              />
              {TIER_DISPLAY[x]}
            </a>
          </DropdownMenuItem>
        ))}
        {folded.has('report') && (
          <DropdownMenuItem
            onClick={() => openReportFab(true)}
            data-testid="topbar-more-menu-report"
          >
            <MessageSquarePlusIcon className="size-4" aria-hidden />
            {t.reportButton.triggerText}
          </DropdownMenuItem>
        )}
        {folded.has('theme') && (
          <DropdownMenuItem
            onClick={toggleTheme}
            data-testid="topbar-more-menu-theme"
          >
            {isDark ? (
              <SunIcon className="size-4" aria-hidden />
            ) : (
              <MoonIcon className="size-4" aria-hidden />
            )}
            {isDark ? t.theme.switchToLight : t.theme.switchToDark}
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
