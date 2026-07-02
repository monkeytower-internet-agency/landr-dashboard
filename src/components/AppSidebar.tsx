import {
  BanknoteIcon,
  ChartColumnIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ChartAreaIcon,
  CheckCircleIcon,
  FlagIcon,
  InboxIcon,
  LayersIcon,
  LayoutDashboardIcon,
  MapPinnedIcon,
  MessageSquareIcon,
  MousePointerClickIcon,
  PanelLeftCloseIcon,
  PanelLeftOpenIcon,
  ReceiptTextIcon,
  RocketIcon,
  ScrollTextIcon,
  SettingsIcon,
  Trash2Icon,
  UserCircleIcon,
  UsersIcon,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import type { LucideIcon } from 'lucide-react'

import { fetchGoLiveEligibility } from '@/lib/release-promotion'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
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
import { useEntitlements } from '@/lib/entitlements'
import { featureForRoute } from '@/lib/entitlements-map'
import { useSidebarModeContext } from '@/lib/sidebar-mode-context-shared'
import type { SidebarMode } from '@/lib/sidebar-mode'
import { TICKET_SYSTEM_PATH } from '@/lib/app-mode'
import { t } from '@/lib/strings'
// landr-c58d — Views sub-list (star + hide) rendered under the
// top-level "Views" primary nav entry.
import { ViewsSidebar } from '@/components/views/ViewsSidebar'
// landr-ne58 — "Recently viewed" collapsible section rendered under the
// primary nav, before the footer.
import { RecentlyViewedList } from '@/components/RecentlyViewedList'

// landr-hxnb.2 — Section hue identifiers.
// Each maps to the --hue-<section>-* CSS tokens from the comic token
// foundation (C0). "neutral" uses the sidebar's standard accent (no hue).
type SectionHue =
  | 'bookings'
  | 'catalog'
  | 'finance'
  | 'people'
  | 'comms'
  | 'settings'
  | 'neutral'

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
  // landr-hxnb.2 — comic section hue for this nav item.
  hue?: SectionHue
}

// landr-hxnb.2 — Tailwind color classes per section hue.
// vivid: active pill background + border
// onColor: text on vivid background
// softBg: hover tint background
// iconActive: icon color when active
const HUE_CLASSES: Record<
  SectionHue,
  { vivid: string; onColor: string; softBg: string; iconActive: string }
> = {
  bookings: {
    vivid: 'bg-hue-bookings-vivid border-hue-bookings-vivid',
    onColor: 'text-hue-bookings-on-color',
    softBg: 'hover:bg-hue-bookings-soft-bg',
    iconActive: 'text-hue-bookings-on-color',
  },
  catalog: {
    vivid: 'bg-hue-catalog-vivid border-hue-catalog-vivid',
    onColor: 'text-hue-catalog-on-color',
    softBg: 'hover:bg-hue-catalog-soft-bg',
    iconActive: 'text-hue-catalog-on-color',
  },
  finance: {
    vivid: 'bg-hue-finance-vivid border-hue-finance-vivid',
    onColor: 'text-hue-finance-on-color',
    softBg: 'hover:bg-hue-finance-soft-bg',
    iconActive: 'text-hue-finance-on-color',
  },
  people: {
    vivid: 'bg-hue-people-vivid border-hue-people-vivid',
    onColor: 'text-hue-people-on-color',
    softBg: 'hover:bg-hue-people-soft-bg',
    iconActive: 'text-hue-people-on-color',
  },
  comms: {
    vivid: 'bg-hue-comms-vivid border-hue-comms-vivid',
    onColor: 'text-hue-comms-on-color',
    softBg: 'hover:bg-hue-comms-soft-bg',
    iconActive: 'text-hue-comms-on-color',
  },
  settings: {
    vivid: 'bg-hue-settings-vivid border-hue-settings-vivid',
    onColor: 'text-hue-settings-on-color',
    softBg: 'hover:bg-hue-settings-soft-bg',
    iconActive: 'text-hue-settings-on-color',
  },
  neutral: {
    vivid: 'bg-sidebar-primary border-sidebar-primary',
    onColor: 'text-sidebar-primary-foreground',
    softBg: 'hover:bg-sidebar-accent',
    iconActive: 'text-sidebar-primary-foreground',
  },
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
//
// landr-hxnb.2 — each item gains a `hue` field that maps to the C0
// section color tokens. Route→hue assignments:
//   bookings/calendar/views/analytics → bookings (orange)
//   contacts → people (indigo)
//   reporting → finance (meadow)
//   invoicing → finance (meadow)
//   approvals/retrieve → bookings (orange — operational cluster)
//   tickets/ticket-planning → comms (magenta)
//   audit/trash → neutral (no section hue)
const primaryItems: NavItem[] = [
  {
    to: '/',
    label: t.nav.dashboard,
    icon: LayoutDashboardIcon,
    exact: true,
    hue: 'neutral',
  },
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
    hue: 'bookings',
  },
  {
    to: '/bookings',
    label: t.nav.bookings,
    icon: CalendarRangeIcon,
    exact: false,
    hue: 'bookings',
  },
  {
    to: '/calendar',
    label: t.nav.calendar,
    icon: CalendarIcon,
    exact: false,
    hue: 'bookings',
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
    hue: 'bookings',
  },
  {
    to: '/contacts',
    label: t.nav.contacts,
    icon: UsersIcon,
    exact: false,
    hue: 'people',
  },
  {
    to: '/reporting',
    label: t.nav.reporting,
    icon: ChartAreaIcon,
    exact: false,
    hue: 'finance',
  },
  // landr-a4pl.2 — Invoicing (Holded transfer status + manual Sync-now).
  // Finance surface; sits after Reporting in the primary cluster. Ungated
  // (featureForRoute returns null), like Audit/Trash.
  {
    to: '/invoicing',
    label: t.nav.invoicing,
    icon: ReceiptTextIcon,
    exact: false,
    hue: 'finance',
  },
  {
    to: '/approvals/general',
    label: t.nav.generalApprovals,
    icon: CheckCircleIcon,
    exact: false,
    hue: 'bookings',
  },
  // landr-znzz.8 — Retrieve board. Daily-ops field surface (a guide watches
  // who's down / still out for a given day), so it sits in the daily-use
  // cluster next to Approvals rather than the rarely-used admin tail.
  {
    to: '/retrieve',
    label: t.nav.retrieve,
    icon: MapPinnedIcon,
    exact: false,
    hue: 'bookings',
  },
  // landr-wwhn.11 — Ticket board. Customer support / feedback tracking.
  {
    to: '/tickets',
    label: t.nav.tickets,
    icon: MessageSquareIcon,
    exact: true,
    hue: 'comms',
  },
  // landr-wwhn.23 — MoSCoW release-planning overlay.
  {
    to: '/tickets/planning',
    label: t.nav.ticketPlanning,
    icon: FlagIcon,
    exact: false,
    hue: 'comms',
  },
  // landr-aref — Audit log viewer. Sits at the end of the primary nav
  // (compliance/forensics surface, used less than the daily-ops items).
  {
    to: '/audit',
    label: t.nav.audit,
    icon: ScrollTextIcon,
    exact: false,
    hue: 'neutral',
  },
  // landr-4pn1 — Recently-deleted bin. Same rare-use cluster as Audit;
  // operators visit only to undo an accidental delete.
  {
    to: '/trash',
    label: t.nav.trash,
    icon: Trash2Icon,
    exact: false,
    hue: 'neutral',
  },
  // Email log — a LOG, not a setting: lives in the main-nav Admin tail,
  // moved out of /settings (route /email-log). Gated by email_log via
  // featureForRoute.
  {
    to: '/email-log',
    label: t.settingsHub.sections.emailLog,
    icon: InboxIcon,
    exact: false,
    hue: 'neutral',
  },
]

// landr-sbhz.8 — STAFF-ONLY primary nav items. These are Landr owner tooling
// (not tenant modules in the feature registry), so they are gated on
// is_landr_staff rather than featureForRoute. Appended to the primary cluster
// only for staff; hidden entirely for operators (and the route + API enforce
// it server-side regardless).
const staffItems: NavItem[] = [
  {
    to: '/revenue',
    label: t.nav.revenue,
    icon: BanknoteIcon,
    exact: false,
    hue: 'finance',
  },
  // landr-wwhn.28 — cross-operator feedback triage inbox.
  // landr-7dya.10 — the inbox is now a FIRST-CLASS APP-VIEW (full-screen
  // ticket-system workspace), not an operator-chrome sidebar page. This launcher
  // points at the app-view (/staff/tickets) so staff enter the dedicated chrome
  // rather than embedding the inbox in the operator sidebar. The legacy
  // /feedback-inbox route still works (deep-links / bookmarks) — coexists.
  {
    to: TICKET_SYSTEM_PATH,
    label: t.nav.feedbackInbox,
    icon: InboxIcon,
    exact: false,
    hue: 'comms',
  },
  // landr-a99u.6 — release promotion console (dev → staging → main).
  {
    to: '/release',
    label: t.nav.release,
    icon: RocketIcon,
    exact: false,
    hue: 'neutral',
  },
]

// landr-7dya.21 — non-staff customer signer (Martin) sidebar item. Surfaced
// when fetchGoLiveEligibility returns can_request_golive=true: i.e. on the
// staging build, for users with public.users.is_release_signer=true. Points at
// the same /release route — the route guard renders the customer console
// (Request go-live card) instead of the staff console for these users.
// Hidden on dev/prod tiers and for non-signers (the endpoint returns false).
const signerItem: NavItem = {
  to: '/release',
  label: t.nav.release,
  icon: RocketIcon,
  exact: false,
  hue: 'neutral',
}

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
// /account/company — an ACCOUNT section. Clicking the bottom "Settings"
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
    hue: 'settings',
  },
  {
    to: landingPathFor('settings'),
    label: t.nav.settings,
    icon: SettingsIcon,
    exact: false,
    matchGroup: 'settings',
    hue: 'settings',
  },
]

function isMatch(pathname: string, item: NavItem): boolean {
  if (item.matchGroup) {
    // Only consider Account/Settings active when the user is actually inside
    // one of the two hubs (/account/* or /settings/*). A user on /bookings
    // shouldn't see either bottom nav item highlighted.
    if (
      !pathname.startsWith('/account') &&
      !pathname.startsWith('/settings')
    ) {
      return false
    }
    return groupForPath(pathname) === item.matchGroup
  }
  if (item.exact) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

// landr-hxnb.2 — comic nav menu.
// Active item: filled pill in section vivid color with on-color text.
// Hover: playful pop-in scale + soft section tint background.
// Icon wiggles on hover (respects prefers-reduced-motion via the global
// kill switch in index.css).
function NavMenu({ items, pathname }: { items: NavItem[]; pathname: string }) {
  return (
    <SidebarMenu>
      {items.map((item) => {
        const active = isMatch(pathname, item)
        const Icon = item.icon
        const hue = item.hue ?? 'neutral'
        const hueClasses = HUE_CLASSES[hue]

        return (
          <SidebarMenuItem key={item.to}>
            <SidebarMenuButton
              asChild
              isActive={active}
              tooltip={item.label}
              className={cn(
                // Base: rounded pill shape, display font for labels.
                'group/nav-btn rounded-lg font-display text-sm font-medium transition-all duration-150',
                // Hover: soft section bg tint + subtle pop scale.
                'hover:scale-[1.02] hover:shadow-s',
                hueClasses.softBg,
                // Active: vivid filled pill with on-color text + comic border.
                active && [
                  hueClasses.vivid,
                  hueClasses.onColor,
                  'border border-solid shadow-cel',
                  'scale-[1.01]',
                ],
              )}
            >
              <Link to={item.to}>
                <Icon
                  className={cn(
                    'size-4 transition-transform duration-150',
                    // Wiggle on hover for playful feel (reduced-motion killed globally).
                    'group-hover/nav-btn:animate-wiggle',
                    active ? hueClasses.iconActive : 'text-sidebar-foreground/70',
                  )}
                />
                <span
                  className={cn(
                    active ? hueClasses.onColor : 'text-sidebar-foreground',
                  )}
                >
                  {item.label}
                </span>
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

// landr-hxnb.2 — section separator label (thin pill style, collapsed-rail
// hidden). Used to visually group nav clusters in the primary nav.
function SectionLabel({ label }: { label: string }) {
  return (
    <SidebarGroupLabel
      className={cn(
        'font-display text-[10px] font-semibold uppercase tracking-widest',
        'text-sidebar-foreground/40 px-2 pb-0.5 pt-2',
        'group-data-[collapsible=icon]:hidden',
      )}
    >
      {label}
    </SidebarGroupLabel>
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
          'flex items-center justify-center gap-1 rounded-lg border-comic bg-sidebar-accent/30 p-0.5',
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
                    'flex h-7 flex-1 cursor-pointer items-center justify-center rounded-md text-sidebar-foreground/70 transition-all duration-150',
                    'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:scale-110',
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
  const { isEnabled, effectiveIsStaff } = useEntitlements()

  // landr-7dya.21 — surface /release for non-staff customer signers (Martin).
  // Endpoint gates server-side on tier (staging only) AND is_release_signer, so
  // for staff / dev / prod / non-signers it returns false and the link stays
  // hidden. retry:false + silent error so a missing endpoint (older API) just
  // hides the link rather than surfacing a toast. The /release route guard
  // itself does the second-line check; this query just drives sidebar
  // visibility.
  const eligibilityQuery = useQuery({
    queryKey: ['operator', 'release', 'eligibility'] as const,
    queryFn: fetchGoLiveEligibility,
    staleTime: 1000 * 60 * 5,
    retry: false,
  })
  const canRequestGoLive =
    !effectiveIsStaff && eligibilityQuery.data?.can_request_golive === true

  // landr-sbhz.6 — hide primary nav items whose gating feature is DISABLED for
  // the current operator. Items without a gating feature (Dashboard, Views,
  // Approvals, Retrieve, Trash) have featureForRoute() === null and are always
  // shown. Staff bypass lives inside isEnabled (always true for staff).
  //
  // landr-sbhz.8 — staff-only items (Revenue) are appended only for staff.
  // landr-7dya.21 — non-staff signers see only /release (no other staff items).
  // landr-2soj — gate on EFFECTIVE staff so they vanish in view-as mode: a
  // staff user viewing as a (non-staff) operator should not see Landr owner
  // tooling. (Audit lives in primaryItems and is gated by featureForRoute →
  // the `audit` feature, so isEnabled already hides it for X's tier.)
  const visiblePrimaryItems = [
    ...primaryItems.filter((item) => {
      const feature = featureForRoute(item.to)
      return feature === null || isEnabled(feature)
    }),
    ...(effectiveIsStaff ? staffItems : canRequestGoLive ? [signerItem] : []),
  ]

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
      {/* landr-hxnb.2 — comic header: logo with a subtle comic border
          underline to visually anchor it from the nav below. */}
      <SidebarHeader className="border-b border-sidebar-border/60">
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
        {/* landr-hxnb.2 — primary nav split into logical section groups.
            Section labels are hidden on the collapsed icon rail
            (group-data-[collapsible=icon]:hidden). */}
        <SidebarGroup className="pt-2">
          {/* Home / cross-cutting */}
          <SidebarGroupContent>
            <NavMenu
              items={visiblePrimaryItems.filter((item) =>
                ['/', '/views'].includes(item.to),
              )}
              pathname={pathname}
            />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Hue sections — render a section (label + group) ONLY when it has
            at least one visible item, so entitlement-gated-empty sections
            (e.g. "Comms" for an operator with tickets/campaigns disabled)
            don't show an orphaned header. Mirrors the Admin-tail pattern. */}
        {(
          [
            {
              label: t.nav.sections.bookings,
              paths: [
                '/bookings',
                '/calendar',
                '/analytics',
                '/approvals/general',
                '/retrieve',
              ],
            },
            { label: t.nav.sections.people, paths: ['/contacts'] },
            {
              label: t.nav.sections.finance,
              paths: ['/reporting', '/invoicing', '/revenue'],
            },
            {
              label: t.nav.sections.comms,
              paths: ['/tickets', '/tickets/planning', TICKET_SYSTEM_PATH],
            },
          ] as { label: string; paths: string[] }[]
        ).map((section) => {
          const items = visiblePrimaryItems.filter((item) =>
            section.paths.includes(item.to),
          )
          if (items.length === 0) return null
          return (
            <SidebarGroup key={section.label} className="pt-0">
              <SectionLabel label={section.label} />
              <SidebarGroupContent>
                <NavMenu items={items} pathname={pathname} />
              </SidebarGroupContent>
            </SidebarGroup>
          )
        })}

        {/* Admin tail (Audit, Trash, Release) — neutral hue, no section label
            to keep it visually quiet. Only render if any items exist. */}
        {visiblePrimaryItems.some((item) =>
          ['/audit', '/trash', '/release', '/email-log'].includes(item.to),
        ) && (
          <SidebarGroup className="pt-0">
            <SectionLabel label={t.nav.sections.admin} />
            <SidebarGroupContent>
              <NavMenu
                items={visiblePrimaryItems.filter((item) =>
                  ['/audit', '/trash', '/release', '/email-log'].includes(item.to),
                )}
                pathname={pathname}
              />
            </SidebarGroupContent>
          </SidebarGroup>
        )}

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
        <SidebarGroup className="p-0 pt-1">
          <SectionLabel label={t.nav.sections.account} />
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
