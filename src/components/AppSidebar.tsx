import {
  ChartColumnIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ChartAreaIcon,
  CheckCircleIcon,
  FlagIcon,
  LayersIcon,
  LayoutDashboardIcon,
  MessageSquareIcon,
  MousePointerClickIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ScrollTextIcon,
  SettingsIcon,
  Trash2Icon,
  UserCircleIcon,
  UsersIcon,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip'
import { cn } from '@/lib/utils'
import { groupForPath, landingPathFor } from '@/components/settings/sections'
import { useSidebarModeContext } from '@/lib/sidebar-mode-context-shared'
import type { SidebarMode } from '@/lib/sidebar-mode'
import { t } from '@/lib/strings'
// landr-c58d — Views sub-list (star + hide) rendered under the
// top-level "Views" primary nav entry.
import { ViewsSidebar } from '@/components/views/ViewsSidebar'
// landr-ne58 — "Recently viewed" collapsible section rendered under the
// primary nav, before the footer.
import { RecentlyViewedList } from '@/components/RecentlyViewedList'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  // exact: render isActive only on URL equality (vs. prefix match).
  exact: boolean
  // landr-fzcg — for Account/Settings we need to highlight based on the
  // URL group (account vs settings) rather than the literal `to` path,
  // because both groups share /settings/* leaf URLs. Optional override.
  matchGroup?: 'account' | 'settings'
}

// Primary nav — daily-use items. Order chosen per landr-wjd briefing:
// Bookings, Schedule, Calendar, Contacts. Dashboard stays at the top of
// the list so the home route has a visible anchor; the rest follow the
// briefing order.
//
// landr-sydf — Products moved into Settings → Products. Operators edit
// products rarely (weekly at most) rather than daily, so the top-level
// slot is reclaimed for the daily-use cluster per Kole's rarely-used →
// settings pattern from the recent sidebar reorg.
//
// landr-e8jf — Schedule moved into Settings → Schedule. Now that the
// landr-3uai capacity pills live on the main Calendar, the Schedule
// page is a setup/management surface (define windows, edit capacity)
// rather than a daily-ops view. Same rarely-used → settings pattern.
const primaryItems: NavItem[] = [
  { to: '/', label: t.nav.dashboard, icon: LayoutDashboardIcon, exact: true },
  // landr-v0xg — Views (saved-view system, Phase 1). Position-A per
  // ADR-0001: between Dashboard and Bookings, so the new top-level
  // section sits next to the existing daily-use cluster without
  // displacing Bookings. Icon: LayersIcon (distinct from the
  // LayoutDashboardIcon already used for Dashboard).
  {
    to: '/views',
    label: t.app.views,
    icon: LayersIcon,
    exact: false,
  },
  {
    to: '/bookings',
    label: t.nav.bookings,
    icon: CalendarRangeIcon,
    exact: false,
  },
  {
    to: '/calendar',
    label: t.nav.calendar,
    icon: CalendarIcon,
    exact: false,
  },
  // landr-af6c — Analytics surface (operational insight dashboard).
  // Sits between Calendar and Contacts per the briefing: keeps the
  // daily-use cluster intact while putting the insight surface next to
  // the data the operator just scanned.
  {
    to: '/analytics',
    label: t.nav.analytics,
    icon: ChartColumnIcon,
    exact: false,
  },
  {
    to: '/contacts',
    label: t.nav.contacts,
    icon: UsersIcon,
    exact: false,
  },
  {
    to: '/reporting',
    label: t.nav.reporting,
    icon: ChartAreaIcon,
    exact: false,
  },
  {
    to: '/approvals/general',
    label: t.nav.generalApprovals,
    icon: CheckCircleIcon,
    exact: false,
  },
  // landr-wwhn.11 — Ticket board. Customer support / feedback tracking.
  {
    to: '/tickets',
    label: t.nav.tickets,
    icon: MessageSquareIcon,
    exact: true,
  },
  // landr-wwhn.23 — MoSCoW release-planning overlay.
  {
    to: '/tickets/planning',
    label: t.nav.ticketPlanning,
    icon: FlagIcon,
    exact: false,
  },
  // landr-aref — Audit log viewer. Sits at the end of the primary nav
  // (compliance/forensics surface, used less than the daily-ops items).
  {
    to: '/audit',
    label: t.nav.audit,
    icon: ScrollTextIcon,
    exact: false,
  },
  // landr-4pn1 — Recently-deleted bin. Same rare-use cluster as Audit;
  // operators visit only to undo an accidental delete.
  {
    to: '/trash',
    label: t.nav.trash,
    icon: Trash2Icon,
    exact: false,
  },
]

// Secondary nav — rarely-used admin items in the bottom footer cluster.
// landr-fzcg — split Settings into Account + Settings:
//   Account  → company / connected accounts / gmail / plan
//   Settings → calendar / display / team / locations / products / emails /
//              pricing
// Both groups share /settings/* leaf URLs; the matchGroup field tells the
// active-highlight code to compare via groupForPath() instead of a path
// prefix check (otherwise /settings/* would always also highlight Settings
// when the user is on an Account subsection).
// landr-gka7 — `to` resolves to the first sub-section of each group via
// landingPathFor() so the click lands directly on a Settings (or Account)
// leaf URL. Previously these were the bare /account and /settings
// virtual paths, both of which resolved (via Route-level Navigate) to
// /settings/company — an ACCOUNT section. Clicking the bottom "Settings"
// gear would briefly render the Account sub-sidebar before the user
// re-navigated, and Account-group highlighting was wrong on first paint.
// landingPathFor() pulls from sections.ts so this stays in sync as the
// section lists are reordered.
const secondaryItems: NavItem[] = [
  {
    to: landingPathFor('account'),
    label: t.nav.account,
    icon: UserCircleIcon,
    exact: false,
    matchGroup: 'account',
  },
  {
    to: landingPathFor('settings'),
    label: t.nav.settings,
    icon: SettingsIcon,
    exact: false,
    matchGroup: 'settings',
  },
]

function isMatch(pathname: string, item: NavItem): boolean {
  if (item.matchGroup) {
    // Only consider Account/Settings active when the user is actually
    // INSIDE the settings hub (or onthe Account redirect target). A user
    // on /bookings shouldn't see either bottom nav item highlighted.
    if (pathname !== '/account' && !pathname.startsWith('/settings')) {
      return false
    }
    return groupForPath(pathname) === item.matchGroup
  }
  if (item.exact) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

function NavMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isMatch(pathname, item)
        const Icon = item.icon
        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={item.label}
            >
              <Link to={item.to}>
                <Icon className="size-4" />
                <span>{item.label}</span>
              </Link>
            </SidebarMenuButton>
            {/* landr-c58d — render the Views sub-list directly under the
                top-level "Views" primary nav entry. Always shown (option
                (b) from the briefing) so users can jump straight to a
                saved view without first clicking through /views. The
                sub-list is hidden by SidebarMenuSub's own CSS when the
                sidebar collapses to the icon rail, matching the rest of
                the secondary nav. */}
            {item.to === '/views' ? <ViewsSidebar /> : null}
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

// landr-fzcg — 3-state collapse control rendered at the very bottom of
// the sidebar footer. In the expanded sidebar it shows as a segmented
// control with three labelled icon buttons (collapsed / expanded /
// hover-expand) so the user can pick a mode in one click. In the
// collapsed icon-rail variants it compresses to a single icon button
// that cycles through the modes on click — that's the only affordance
// that fits the narrow rail, matching how Supabase handles the same
// constraint.
type ModeOption = {
  mode: SidebarMode
  icon: LucideIcon
  label: string
}

const MODE_OPTIONS: ReadonlyArray<ModeOption> = [
  {
    mode: 'collapsed',
    icon: PanelLeftCloseIcon,
    label: t.app.sidebarMode.collapsed,
  },
  {
    mode: 'expanded',
    icon: PanelLeftOpenIcon,
    label: t.app.sidebarMode.expanded,
  },
  {
    mode: 'hover-expand',
    icon: MousePointerClickIcon,
    label: t.app.sidebarMode.hoverExpand,
  },
]

function SidebarModeControl() {
  const { mode, setMode, cycle } = useSidebarModeContext()
  const current = MODE_OPTIONS.find((o) => o.mode === mode) ?? MODE_OPTIONS[1]
  const CurrentIcon = current.icon

  return (
    <>
      {/* Expanded variant: segmented control (3 icon buttons). Hidden
          on the icon-rail collapse via group-data-[collapsible=icon]. */}
      <div
        role="radiogroup"
        aria-label={t.app.sidebarMode.groupLabel}
        className={cn(
          'flex items-center justify-center gap-1 rounded-md border bg-sidebar-accent/30 p-0.5',
          'group-data-[collapsible=icon]:hidden',
        )}
      >
        {MODE_OPTIONS.map((opt) => {
          const Icon = opt.icon
          const active = opt.mode === mode
          return (
            <Tooltip key={opt.mode}>
              <TooltipTrigger asChild>
                <button
                  type="button"
                  role="radio"
                  aria-checked={active}
                  aria-label={opt.label}
                  onClick={() => setMode(opt.mode)}
                  className={cn(
                    'flex h-7 flex-1 cursor-pointer items-center justify-center rounded-sm text-sidebar-foreground/70 transition-colors',
                    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                    'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
                    active &&
                      'bg-sidebar text-sidebar-accent-foreground shadow-s',
                  )}
                >
                  <Icon className="size-4" />
                </button>
              </TooltipTrigger>
              <TooltipContent side="top" align="center">
                {opt.label}
              </TooltipContent>
            </Tooltip>
          )
        })}
      </div>

      {/* Collapsed-rail variant: single cycling button showing the
          current mode's icon. Click cycles through the 3 modes. Hidden
          unless the sidebar is in icon-rail mode. */}
      <SidebarMenu className="hidden group-data-[collapsible=icon]:flex">
        <SidebarMenuItem>
          <SidebarMenuButton
            onClick={cycle}
            tooltip={`${current.label} (${t.app.sidebarMode.cycleHint})`}
            aria-label={t.app.sidebarMode.cycleHint}
          >
            <CurrentIcon className="size-4" />
            <span>{current.label}</span>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    </>
  )
}

export function AppSidebar() {
  const { pathname } = useLocation()
  const { mode, setHovered } = useSidebarModeContext()

  // landr-fzcg — hover-expand: only attach pointer handlers when the user
  // has opted into the hover mode. In collapsed/expanded modes the open
  // state is fully controlled by `mode`, so handlers would be no-ops
  // anyway, but skipping them keeps the DOM cleaner for screen readers.
  const hoverHandlers =
    mode === 'hover-expand'
      ? {
          onMouseEnter: () => setHovered(true),
          onMouseLeave: () => setHovered(false),
          // Pointer leave covers pen/touch too. Mouse handlers stay for
          // older browsers where pointer events haven't replaced them.
          onPointerLeave: () => setHovered(false),
        }
      : {}

  return (
    <Sidebar collapsible="icon" {...hoverHandlers}>
      <SidebarHeader>
        {/* Logo top-left. Expanded sidebar shows the full colored logo;
            collapsed (icon-only) sidebar shows a small square version
            so it doesn't get squished. Toggle via the sidebar's
            data-collapsible="icon" group state. */}
        <div className="flex items-center px-2 py-1.5 group-data-[collapsible=icon]:justify-center group-data-[collapsible=icon]:px-0">
          <img
            src="/logos/landr-logo.png"
            alt={t.app.name}
            className="block h-12 w-auto group-data-[collapsible=icon]:hidden"
          />
          <img
            src="/logos/landr-logo.png"
            alt=""
            aria-hidden
            className="hidden h-8 w-8 object-contain group-data-[collapsible=icon]:block"
          />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <NavMenu items={primaryItems} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
        {/* landr-ne58 — Recently viewed (last 5 detail surfaces the user
            opened). Sits under the primary nav cluster and before the
            footer (Account / Settings / mode control) per the ticket
            brief. The list hides itself entirely when there's no auth
            user or the sidebar is in the icon-only rail variant. */}
        <RecentlyViewedList />
      </SidebarContent>
      <SidebarFooter>
        {/* Account + Settings live above the mode control. They are
            sibling nav rows so they align pixel-perfectly with the
            primary nav above. */}
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <NavMenu items={secondaryItems} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
        {/* 3-state collapse control — VERY bottom of the sidebar
            (Supabase pattern). Rendered without SidebarGroup wrapper
            so the segmented control can size itself without inheriting
            the group's `p-2`. */}
        <div className="px-2 pb-1">
          <SidebarModeControl />
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
