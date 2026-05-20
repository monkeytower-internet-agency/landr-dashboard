import {
  CalendarDaysIcon,
  CalendarIcon,
  CalendarRangeIcon,
  ChartAreaIcon,
  CheckCircleIcon,
  LayoutDashboardIcon,
  UsersIcon,
  PanelLeftIcon,
  SettingsIcon,
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
  useSidebar,
} from '@/components/ui/sidebar'
import { t } from '@/lib/strings'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  exact: boolean
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
const primaryItems: NavItem[] = [
  { to: '/', label: t.nav.dashboard, icon: LayoutDashboardIcon, exact: true },
  {
    to: '/bookings',
    label: t.nav.bookings,
    icon: CalendarRangeIcon,
    exact: false,
  },
  {
    to: '/schedule',
    label: t.nav.schedule,
    icon: CalendarDaysIcon,
    exact: false,
  },
  {
    to: '/calendar',
    label: t.nav.calendar,
    icon: CalendarIcon,
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
]

// Secondary nav — rarely-used admin items go in a separated bottom group
// per landr-wjd / video-1 IA notes. Settings is the only item today; Help
// arrives once we have a docs route.
const secondaryItems: NavItem[] = [
  {
    to: '/settings',
    label: t.nav.settings,
    icon: SettingsIcon,
    exact: false,
  },
]

function isMatch(pathname: string, item: NavItem): boolean {
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
          </SidebarMenuItem>
        )
      })}
    </SidebarMenu>
  )
}

function CollapseMenuItem() {
  const { toggleSidebar, state } = useSidebar()
  const label = state === 'expanded' ? t.app.collapseMenu : t.app.expandMenu
  return (
    <SidebarMenuItem>
      <SidebarMenuButton tooltip={label} onClick={toggleSidebar}>
        <PanelLeftIcon className="size-4" />
        <span>{label}</span>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function AppSidebar() {
  const { pathname } = useLocation()
  return (
    <Sidebar collapsible="icon">
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
      </SidebarContent>
      <SidebarFooter>
        {/* Collapse trigger rendered as a sibling nav item so it aligns
            pixel-perfectly with the Settings gear below it (same
            SidebarMenuButton padding + icon column). */}
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <SidebarMenu>
              <CollapseMenuItem />
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
        <SidebarGroup className="p-0">
          <SidebarGroupContent>
            <NavMenu items={secondaryItems} pathname={pathname} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarFooter>
    </Sidebar>
  )
}
