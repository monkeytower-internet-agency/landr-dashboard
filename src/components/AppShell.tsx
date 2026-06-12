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
import { ConfigHealthBanners } from '@/components/ConfigHealthBanners'
import { OperatorSwitcher } from '@/components/OperatorSwitcher'
import { UserMenu } from '@/components/UserMenu'
import { ViewAsBanner } from '@/components/ViewAsBanner'
import { ViewAsOperatorPicker } from '@/components/ViewAsOperatorPicker'
import { ReportFab } from '@/components/ReportFab'
import { TierBadge } from '@/components/TierBadge'
import { ThemeToggle } from '@/components/ThemeToggle'
import { WidgetButton } from '@/components/WidgetButton'
import { PageTitleDisplay } from '@/components/topbar/PageTitleDisplay'
import { TopbarMoreMenu } from '@/components/topbar/TopbarMoreMenu'
import { CommandPaletteProvider } from '@/lib/command-palette-context'
import { KeyboardShortcutsHelpProvider } from '@/lib/keyboard-shortcuts-help-context'
import { PageTitleProvider } from '@/lib/page-title'
import { ReportFabProvider } from '@/lib/report-fab-context'
import { SidebarModeProvider } from '@/lib/sidebar-mode-context'
import { useSidebarModeContext } from '@/lib/sidebar-mode-context-shared'
import { openFor } from '@/lib/sidebar-mode'
import { useEntitlements } from '@/lib/entitlements'

// landr-fzcg — inner shell that bridges the mode state into the shadcn
// SidebarProvider's controlled `open` prop. Lives inside SidebarModeProvider
// so it can read the mode + hover state and drive open accordingly.
// AppSidebar itself attaches pointer handlers to the underlying Sidebar
// DOM element (so the hit area matches the actual visible rail) and
// toggles the shared `hovered` flag via the context's setHovered.

function AppShellInner({ children }: { children: ReactNode }) {
  const { mode, hovered } = useSidebarModeContext()
  const open = openFor(mode, hovered)
  // landr-p3b7 — staff flag for the TierBadge env-switcher: Dev is only
  // offered to staff (dashboard.dev.landr.de is Tailscale-only). Use
  // effectiveIsStaff so it mirrors view-as behaviour consistently (the same
  // flag AppModeSwitcher / feature-gating uses).
  const { effectiveIsStaff } = useEntitlements()

  return (
    <SidebarProvider open={open} onOpenChange={() => { /* mode-driven */ }}>
      <AppSidebar />
      {/* min-w-0 lets this flex item shrink to its parent's width so wide
          content inside (Tables, Cards, etc.) doesn't push the whole page
          past the viewport — without it, table/cell intrinsic widths win
          and the document gains a horizontal scrollbar on smaller screens. */}
      {/* landr-3qkr.1 — overflow-x-guard clips any over-wide child (wide
          table header, unbroken URL, mis-sized absolute element) so the
          document can never gain a horizontal scrollbar on a 360px phone.
          It's `overflow-x: clip` (not hidden) so it does NOT create a scroll
          container — keeping the sticky topbar + sticky table headers below
          working. min-w-0 still lets this flex item shrink to its parent. */}
      <SidebarInset className="min-w-0 overflow-x-guard">
        {/* landr-fx2i — topbar layout: OperatorSwitcher (collapses to a
            static label when the user only has 1 operator), then the
            current page title or breadcrumb (declared by each route via
            <PageTitle/> from src/lib/page-title), then the right-aligned
            ThemeToggle + UserMenu cluster.
            landr-3qkr.1 — pt-safe lifts the sticky bar out of the status-bar
            notch on phones; px-safe-3/4 keeps the left/right chrome clear of
            rounded-screen corners while preserving the design gutter. The bar
            height grows by the top inset (h-14 min) so the content row stays
            vertically centred below the notch. */}
        <header className="bg-background pt-safe px-safe-3 sm:px-safe-4 sticky top-0 z-10 flex min-h-14 items-center gap-2 border-b sm:gap-3">
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
          {/* landr-92mt — the action cluster must NEVER shrink or clip: the
              parent SidebarInset is overflow-x:clip, so without shrink-0 the
              icons got squished/cut off the right edge on portrait phones
              (UserMenu/bells disappeared; they reappeared in landscape where
              there's room). shrink-0 forces the flex-1 title to absorb all
              the shrinking instead, so every action stays on-screen. */}
          <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">
            {/* landr-hisw — deploy tier badge as env-switcher dropdown
                (DEV/STAGING/PROD pill; shows on prod too so you can jump
                back; nothing when VITE_DEPLOY_TIER is unset). Clicking the
                chip opens a menu to jump to the same path on another tier's
                dashboard. showProd ensures the chip is visible on prod;
                switcher enables the dropdown behavior. */}
            <TierBadge switcher showProd isStaff={effectiveIsStaff} />
            {/* landr-xen4 → landr-aoak.3 — "new booking (staff)" topbar
                action. Opens a modal embedding the booking widget in an
                iframe in STAFF mode (book on a customer's behalf; force-book
                + price override). Renders only when the embed feature is
                enabled AND the operator's widget_token has loaded. The iframe,
                the staff-init postMessage targetOrigin, and the completion
                origin-check all derive from the same env-matched widget host,
                so the wrong-env/token CORS incident cannot recur. */}
            <WidgetButton />
            {/* landr-3qkr.7 — overflow menu: below md, ThemeToggle + ReportFab
                collapse into this single ellipsis trigger to reclaim ~64px in
                the topbar right-cluster on 360px phones. ErrorHistoryBell stays
                in-line (icon-only, 32px) because it runs its own Radix
                DropdownMenu and cannot be nested inside another. */}
            <TopbarMoreMenu />
            {/* landr-wwhn.12 — persistent report/suggest button. Lives in
                the topbar right-cluster so it's reachable from every
                protected route without eating FAB real estate.
                landr-3qkr.7 — hidden below md; surfaced via TopbarMoreMenu. */}
            <ReportFab className="hidden min-[384px]:flex" />
            {/* landr-40x0 — recent-errors history. Badge shows capture count;
                dropdown lists errors with Copy + Report per row. Sits between
                the feedback button and the notifications bell so error-capture
                reads as part of the feedback-and-comms cluster. */}
            <ErrorHistoryBell />
            {/* landr-8whx — bell sits next to the theme toggle so the
                topbar reads left→right as: scope (operator) · title ·
                quick-actions (feedback · errors · notifications · theme · account). */}
            <NotificationsBell />
            {/* landr-3qkr.7 — hidden below md; surfaced via TopbarMoreMenu. */}
            <ThemeToggle className="hidden min-[384px]:flex" />
            <UserMenu />
          </div>
        </header>
        {/* landr-2soj — staff view-as banner. Sits directly under the topbar,
            above the onboarding banner, so it's the first thing visible on
            every page while view-as is active. Renders null otherwise. */}
        <ViewAsBanner />
        <OnboardingBanner />
        {/* landr-y5si — config-health banners. Operator misconfiguration
            warnings surfaced below the onboarding banner (errors above
            warnings). Dismissible for the session; reappears on reload
            while unresolved. Renders nothing when there are no issues. */}
        <ConfigHealthBanners />
        {/* min-w-0 mirrors the inset constraint so route content respects
            the available width; per-table overflow-x-auto (shadcn Table) then
            handles its own horizontal scroll inside the card.
            landr-3qkr.1 — px-safe-4/6 keeps the page gutter clear of rounded
            corners; pb-safe-6 = the base 1.5rem bottom gutter PLUS the
            home-indicator inset so the last row of content isn't tucked under
            the gesture bar. */}
        <main className="min-w-0 flex-1 px-safe-4 sm:px-safe-6 pt-6 pb-safe-6">
          {children}
        </main>
      </SidebarInset>
      {/* landr-aoak.3 — the Quick-capture FAB (landr-f18d) was removed; new
          bookings now go through the staff-mode booking-widget modal opened
          from the topbar WidgetButton above. */}
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
