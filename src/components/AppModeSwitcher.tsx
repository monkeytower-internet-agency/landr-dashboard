// landr-7dya.10 / landr-7dya.13 — top-level WORKSPACE MODE SWITCH.
//
// A clear, topbar-level control that switches between the three first-class
// app modes (ADR 0005):
//   1. Operator dashboard   — the normal operator-scoped chrome.
//   2. View as operator     — staff preview of what a SaaS customer sees.
//                             Selecting this opens the ViewAsOperatorPicker
//                             dialog (landr-7dya.13) so the staff user can
//                             choose WHICH operator to view as.
//   3. Ticket system        — the full-screen support/feedback workspace.
//
// Staff-only: the whole control renders null unless `showSwitcher` (a Landr
// staff user with at least one staff-only capability). Non-staff therefore
// never see modes 2/3 — they stay implicitly in mode 1 with the switcher
// absent. Capability gating (per-mode) comes from the feature-detected staff
// capabilities (degrades gracefully when landr-7dya.14 is unmerged).

import { CheckIcon, ChevronsUpDownIcon, EyeIcon, InboxIcon, LayoutDashboardIcon } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { useAppMode } from '@/lib/app-mode-context'
import { canUseTicketSystem } from '@/lib/staff-capabilities'
import type { AppMode } from '@/lib/app-mode'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

type ModeRow = {
  mode: AppMode
  icon: LucideIcon
  label: string
  hint: string
}

export function AppModeSwitcher() {
  const {
    mode,
    capabilities,
    showSwitcher,
    enterOperatorMode,
    enterTicketSystem,
    enterViewAsMode,
  } = useAppMode()

  if (!showSwitcher) return null

  const rows: ModeRow[] = [
    {
      mode: 'operator',
      icon: LayoutDashboardIcon,
      label: t.appMode.operator,
      hint: t.appMode.operatorHint,
    },
  ]
  if (capabilities.can_view_as_operator) {
    rows.push({
      mode: 'view-as',
      icon: EyeIcon,
      label: t.appMode.viewAs,
      hint: t.appMode.viewAsHint,
    })
  }
  if (canUseTicketSystem(capabilities)) {
    rows.push({
      mode: 'tickets',
      icon: InboxIcon,
      label: t.appMode.tickets,
      hint: t.appMode.ticketsHint,
    })
  }

  const current = rows.find((r) => r.mode === mode) ?? rows[0]
  const CurrentIcon = current.icon

  function handleSelect(target: AppMode) {
    if (target === 'operator') {
      enterOperatorMode()
      return
    }
    if (target === 'tickets') {
      enterTicketSystem()
      return
    }
    // view-as: open the operator picker dialog (landr-7dya.13). The user picks
    // which operator to view as from there; no immediate enterViewAs call here.
    enterViewAsMode()
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          aria-label={t.appMode.switcherLabel}
          data-testid="app-mode-switcher-trigger"
          data-current-mode={mode}
          className="gap-2"
        >
          <CurrentIcon className="size-4 opacity-80" aria-hidden />
          <span className="max-w-[10rem] truncate">{current.label}</span>
          <ChevronsUpDownIcon className="size-4 opacity-60" aria-hidden />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="min-w-[16rem]">
        <DropdownMenuLabel>{t.appMode.menuLabel}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {rows.map((row) => {
          const Icon = row.icon
          const active = row.mode === mode
          return (
            <DropdownMenuItem
              key={row.mode}
              onSelect={() => handleSelect(row.mode)}
              aria-current={active ? 'true' : undefined}
              data-testid={`app-mode-option-${row.mode}`}
              className="gap-2"
            >
              <Icon className="mt-0.5 size-4 shrink-0 opacity-70" aria-hidden />
              <span className="flex min-w-0 flex-1 flex-col">
                <span className="truncate text-sm font-medium">{row.label}</span>
                <span className="text-muted-foreground truncate text-xs">
                  {row.hint}
                </span>
              </span>
              <CheckIcon
                className={cn(
                  'mt-0.5 size-4 shrink-0',
                  active ? 'opacity-100' : 'opacity-0',
                )}
                aria-hidden
              />
            </DropdownMenuItem>
          )
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
