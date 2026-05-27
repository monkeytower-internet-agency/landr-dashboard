// landr-7dya.10 — full-screen TICKET-SYSTEM app-view chrome.
//
// ADR 0005: the ops feedback inbox is the staff's primary workspace. Mode 3
// (ticket system) REPLACES the operator chrome with this dedicated surface —
// it does NOT live inside the operator sidebar. The shell owns its own header
// (workspace title + sub-surface tabs + exit-to-dashboard + the global topbar
// cluster) and an <Outlet /> that hosts the UNIFIED ticket surfaces:
//
//   Inbox     (/staff/tickets)            — per-operator triage threads (the
//                                            existing FeedbackInbox).
//   Board     (/staff/tickets/board)      — the kanban TicketBoard.
//   Planning  (/staff/tickets/planning)   — the MoSCoW TicketPlanning overlay.
//
// These are the EXISTING route components — this shell unifies/hosts them under
// one workspace rather than creating a parallel ticket UI. The board reuses
// TicketDetailSheet + TicketTriageCard internally; this shell does not
// duplicate them.
//
// Staff gate: the route is staff-only (the parent route + each surface's own
// guard enforce it; FeedbackInbox redirects non-staff to home). A non-staff
// user reaching the path is bounced by the parent route guard in App.tsx.
//
// EXTENSION POINTS for the sibling tickets (left intentionally as TODOs so the
// follow-on tickets have clean seams — no premature build here):
//   - landr-7dya.11 — filters (operator / time / type+urgency / assigned-to-me
//     / new / watching / mentioned / unassigned): a shared filter bar belongs
//     at this shell level (above the <Outlet />) so it spans inbox + board.
//   - landr-7dya.2  — origin-tier chip (PROD vs STAGING) on cards: rendered by
//     TicketTriageCard / the inbox thread cards, not here.
//   - landr-7dya.3  — Trello-style card status icons: same — card-level.
//   - landr-7dya.4  — inline attachment preview + lightbox: card/detail-level.
//   - landr-7dya.6  — bell → ticket-detail deep-link: route a deep-link into
//     this app-view (e.g. /staff/tickets/board?open=<id> opens TicketDetailSheet)
//     and point NotificationsBell at it.

import type { ReactNode } from 'react'
import { Link, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { ArrowLeftIcon, InboxIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { NotificationsBell } from '@/components/NotificationsBell'
import { ThemeToggle } from '@/components/ThemeToggle'
import { AppModeSwitcher } from '@/components/AppModeSwitcher'
import { useAppMode } from '@/lib/app-mode-context'
import {
  TICKET_SURFACES,
  surfaceForPath,
  type TicketSurfaceKey,
} from '@/lib/app-mode'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

const SURFACE_LABEL: Record<TicketSurfaceKey, string> = {
  inbox: t.appMode.surfaceInbox,
  board: t.appMode.surfaceBoard,
  planning: t.appMode.surfacePlanning,
}

function SurfaceTabs() {
  const { pathname } = useLocation()
  const activeKey = surfaceForPath(pathname) ?? 'inbox'
  return (
    <nav
      className="flex items-center gap-1"
      aria-label={t.appMode.ticketSystemTitle}
      data-testid="ticket-system-surface-tabs"
    >
      {TICKET_SURFACES.map((surface) => {
        const active = surface.key === activeKey
        return (
          <Button
            key={surface.key}
            asChild
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-3 text-sm',
              active
                ? 'bg-accent text-accent-foreground font-medium'
                : 'text-muted-foreground',
            )}
          >
            <Link
              to={surface.path}
              aria-current={active ? 'page' : undefined}
              data-testid={`ticket-system-tab-${surface.key}`}
            >
              {SURFACE_LABEL[surface.key]}
            </Link>
          </Button>
        )
      })}
    </nav>
  )
}

/**
 * The full-screen ticket-system chrome. Rendered as the layout element of the
 * /staff/tickets route tree (children render into <Outlet />).
 */
export function TicketSystemShell(): ReactNode {
  const navigate = useNavigate()
  const { enterOperatorMode } = useAppMode()

  function handleExit() {
    enterOperatorMode()
    // enterOperatorMode navigates home when inside the app-view, but guard with
    // an explicit fallback so the exit is reliable even if the derivation race
    // (mode just changed) hasn't settled.
    navigate('/')
  }

  return (
    <div
      className="bg-background flex h-dvh min-h-0 w-full flex-col"
      data-testid="ticket-system-shell"
    >
      {/* Dedicated header — REPLACES the operator topbar/sidebar. */}
      <header className="bg-background sticky top-0 z-10 flex h-14 shrink-0 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleExit}
          aria-label={t.appMode.exitToOperatorAria}
          data-testid="ticket-system-exit"
          className="gap-1.5"
        >
          <ArrowLeftIcon className="size-4" aria-hidden />
          <span className="hidden sm:inline">{t.appMode.exitToOperator}</span>
        </Button>

        <div className="bg-border h-5 w-px" aria-hidden />

        <div className="flex min-w-0 items-center gap-2">
          <InboxIcon className="size-4 shrink-0 opacity-70" aria-hidden />
          <span className="truncate text-sm font-semibold">
            {t.appMode.ticketSystemTitle}
          </span>
        </div>

        {/* Sub-surface tabs (Inbox · Board · Planning). */}
        <div className="ml-2 hidden md:flex">
          <SurfaceTabs />
        </div>

        <div className="flex flex-1 items-center justify-end gap-0.5 sm:gap-1">
          {/* The top-level mode switch stays reachable so staff can hop back to
              operator / view-as without first exiting. */}
          <AppModeSwitcher />
          <NotificationsBell />
          <ThemeToggle />
        </div>
      </header>

      {/* Mobile surface tabs row (header is too tight on phones). */}
      <div className="flex shrink-0 items-center border-b px-3 py-1.5 md:hidden">
        <SurfaceTabs />
      </div>

      {/*
        landr-7dya.11 — EXTENSION POINT: a shared filter bar (operator / time /
        type+urgency / assigned-to-me / new / watching / mentioned / unassigned)
        belongs here, spanning every surface below. Left out per scope — wire it
        in .11 between this comment and the <main>.
      */}

      {/* Surface host — the active ticket surface streams in here. Each
          surface manages its OWN scroll/padding: the inbox is a full-height
          split-pane (it needs a sized, non-scrolling parent), while the board
          and planning surfaces wrap themselves in a padded scroll container
          (TicketSurfacePane in App.tsx). So this host is a bare sized box. */}
      <main
        className="min-h-0 flex-1 overflow-hidden"
        data-testid="ticket-system-surface"
      >
        <Outlet />
      </main>
    </div>
  )
}

export default TicketSystemShell
