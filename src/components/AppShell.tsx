import type { ReactNode } from 'react'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { AppSidebar } from '@/components/AppSidebar'
import { AppModeSwitcher } from '@/components/AppModeSwitcher'
import { CommandPalette } from '@/components/CommandPalette'
import { GlobalErrorCapture } from '@/components/GlobalErrorCapture'
import { KeyboardShortcutsHelp } from '@/components/KeyboardShortcutsHelp'
import { ErrorHistoryBell } from '@/components/ErrorHistoryBell'
import { NotificationsBell } from '@/components/NotificationsBell'
import { OnboardingBanner } from '@/components/OnboardingBanner'
import { OperatorSwitcher } from '@/components/OperatorSwitcher'
import { UserMenu } from '@/components/UserMenu'
import { ViewAsBanner } from '@/components/ViewAsBanner'
import { ViewAsOperatorPicker } from '@/components/ViewAsOperatorPicker'
import { QuickCaptureFab } from '@/components/QuickCaptureFab'
import { ReportFab } from '@/components/ReportFab'
import { TierBadge } from '@/components/TierBadge'
import { ThemeToggle } from '@/components/ThemeToggle'
import { PageTitleDisplay } from '@/components/topbar/PageTitleDisplay'
import { CommandPaletteProvider } from '@/lib/command-palette-context'
import { KeyboardShortcutsHelpProvider } from '@/lib/keyboard-shortcuts-help-context'
import { PageTitleProvider } from '@/lib/page-title'
import { ReportFabProvider } from '@/lib/report-fab-context'
import { SidebarModeProvider } from '@/lib/sidebar-mode-context'
import { useSidebarModeContext } from '@/lib/sidebar-mode-context-shared'
import { openFor } from '@/lib/sidebar-mode'

// landr-fzcg — inner shell that bridges the mode state into the shadcn
// SidebarProvider's controlled `open` prop. Lives inside SidebarModeProvider
// so it can read the mode + hover state and drive open accordingly.
// AppSidebar itself attaches pointer handlers to the underlying Sidebar
// DOM element (so the hit area matches the actual visible rail) and
// toggles the shared `hovered` flag via the context's setHovered.

function AppShellInner({ children }: { children: ReactNode }) {
  const { mode, hovered } = useSidebarModeContext()
  const open = openFor(mode, hovered)

  return (
    <SidebarProvider open={open} onOpenChange={() => { /* mode-driven */ }}>
      <AppSidebar />
      {/* min-w-0 lets this flex item shrink to its parent's width so wide
          content inside (Tables, Cards, etc.) doesn't push the whole page
          past the viewport — without it, table/cell intrinsic widths win
          and the document gains a horizontal scrollbar on smaller screens. */}
      <SidebarInset className="min-w-0">
        {/* landr-fx2i — topbar layout: OperatorSwitcher (collapses to a
            static label when the user only has 1 operator), then the
            current page title or breadcrumb (declared by each route via
            <PageTitle/> from src/lib/page-title), then the right-aligned
            ThemeToggle + UserMenu cluster. */}
        <header className="bg-background sticky top-0 z-10 flex h-14 items-center gap-2 border-b px-3 sm:gap-3 sm:px-4">
          {/* landr-gu14 — mobile-only sidebar opener. The shadcn Sidebar
              renders as a slide-in Sheet on viewports below md (768px);
              without this trigger the operator has no way to reach the
              nav on a phone (the desktop rail is hidden via md:block in
              the Sidebar component). md:hidden keeps the topbar clean on
              desktop, where the persistent rail is always visible. */}
          <SidebarTrigger className="md:hidden" />
          {/* landr-7dya.10 — top-level workspace mode switch (single-operator ·
              view-as · ticket-system). Staff-only; renders null for non-staff
              and for staff without any staff-only capability, so the topbar is
              unchanged for ordinary operators. Sits left of the operator
              scope so it reads as the outermost level of context. */}
          <AppModeSwitcher />
          <OperatorSwitcher />
          <div className="min-w-0 flex-1">
            <PageTitleDisplay />
          </div>
          <div className="flex items-center gap-0.5 sm:gap-1">
            {/* landr-7dya.19 — deploy tier badge (DEV/STAGING pill; nothing
                on prod or when VITE_DEPLOY_TIER is unset). Mounted once at
                the shell level so every route sees it. */}
            <TierBadge />
            {/* landr-wwhn.12 — persistent report/suggest button. Lives in
                the topbar right-cluster so it's reachable from every
                protected route without eating FAB real estate. */}
            <ReportFab />
            {/* landr-40x0 — recent-errors history. Badge shows capture count;
                dropdown lists errors with Copy + Report per row. Sits between
                the feedback button and the notifications bell so error-capture
                reads as part of the feedback-and-comms cluster. */}
            <ErrorHistoryBell />
            {/* landr-8whx — bell sits next to the theme toggle so the
                topbar reads left→right as: scope (operator) · title ·
                quick-actions (feedback · errors · notifications · theme · account). */}
            <NotificationsBell />
            <ThemeToggle />
            <UserMenu />
          </div>
        </header>
        {/* landr-2soj — staff view-as banner. Sits directly under the topbar,
            above the onboarding banner, so it's the first thing visible on
            every page while view-as is active. Renders null otherwise. */}
        <ViewAsBanner />
        <OnboardingBanner />
        {/* min-w-0 mirrors the inset constraint so route content respects
            the available width; per-table overflow-x-auto (shadcn Table) then
            handles its own horizontal scroll inside the card. */}
        <main className="min-w-0 flex-1 px-4 py-6 sm:px-6">{children}</main>
      </SidebarInset>
      {/* landr-f18d — Quick capture FAB. Bottom-right, mounted at the
          shell level so it's reachable from every protected route (the
          common operator use case is "phone rings while I'm on /calendar"). */}
      <QuickCaptureFab />
      {/* landr-wmsc — global Cmd/Ctrl+K palette. Mounted once at the
          shell level so the hot-key listener (installed by the
          CommandPaletteProvider) covers every protected route. */}
      <CommandPalette />
      {/* landr-kwu9 — global '?' keyboard shortcuts cheat sheet. Same
          pattern as the palette: provider installs the keydown listener,
          this component renders the dialog wherever in the shell. */}
      <KeyboardShortcutsHelp />
      {/* landr-7dya.13 — "View as operator" picker dialog. Mounted once at the
          shell level. Open state lives in AppModeContext (above the chrome
          split); only visible after staff selects "View as operator" from the
          AppModeSwitcher. Non-staff: picker is a no-op (staffOperators empty,
          can_view_as_operator false). */}
      <ViewAsOperatorPicker />
      {/* landr-40x0 — global window error/unhandledrejection capture. */}
      <GlobalErrorCapture />
    </SidebarProvider>
  )
}

export function AppShell({ children }: { children: ReactNode }) {
  return (
    <ReportFabProvider>
      <SidebarModeProvider>
        <PageTitleProvider>
          <CommandPaletteProvider>
            <KeyboardShortcutsHelpProvider>
              <AppShellInner>{children}</AppShellInner>
            </KeyboardShortcutsHelpProvider>
          </CommandPaletteProvider>
        </PageTitleProvider>
      </SidebarModeProvider>
    </ReportFabProvider>
  )
}
