// landr-3qkr.7 — "More" overflow menu for the topbar right-cluster.
//
// Below the md breakpoint (768px), the lowest-priority topbar utilities
// (theme toggle + report/feedback button) are collapsed into a single ellipsis
// (MoreHorizontal) DropdownMenu trigger to free ~64px of horizontal space.
// Above md, those items render normally in the cluster and this component is
// hidden (md:hidden on the trigger).
//
// ErrorHistoryBell is intentionally left in the normal cluster — it manages
// its own Radix DropdownMenu internally, and nesting two Radix menus via a
// portal is unreliable. The bell is icon-only at all breakpoints so it takes
// up only ~32px and is not the primary overflow culprit.
//
// Usage: rendered by AppShell.tsx BEFORE the individual ThemeToggle and
// ReportFab in the cluster. Those siblings carry `hidden md:flex` so they
// disappear below md while this component becomes the single tap target.

import { MoreHorizontalIcon, MoonIcon, SunIcon, MessageSquarePlusIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useTheme } from '@/lib/theme'
import { useReportFab } from '@/lib/report-fab-context'
import { t } from '@/lib/strings'

export function TopbarMoreMenu() {
  const { resolvedTheme, toggleTheme } = useTheme()
  const isDark = resolvedTheme === 'dark'
  const { setOpen: openReportFab } = useReportFab()

  return (
    // landr-92mt — only rendered on the NARROWEST phones (<384px). Above that
    // the topbar fits every action inline, so ThemeToggle + ReportFab show
    // directly (they carry `hidden min-[384px]:flex`) and this overflow menu
    // hides. Previously this collapsed everything below md (768px), so even
    // roomy 390-430px phones hid icons behind the ⋯ — the user wants them
    // visible. Only sub-384 (SE/older) still folds them in here.
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label="More options"
          className="min-[384px]:hidden"
          data-testid="topbar-more-menu-trigger"
        >
          <MoreHorizontalIcon className="size-4" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        data-testid="topbar-more-menu-content"
      >
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
        <DropdownMenuItem
          onClick={() => openReportFab(true)}
          data-testid="topbar-more-menu-report"
        >
          <MessageSquarePlusIcon className="size-4" aria-hidden />
          {t.reportButton.triggerText}
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
