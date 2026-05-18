import {
  CalendarIcon,
  CalendarRangeIcon,
  LayoutDashboardIcon,
  UsersIcon,
  PackageIcon,
} from 'lucide-react'
import { Link, useLocation } from 'react-router-dom'
import type { LucideIcon } from 'lucide-react'
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { t } from '@/lib/strings'

type NavItem = {
  to: string
  label: string
  icon: LucideIcon
  exact: boolean
}

const items: NavItem[] = [
  { to: '/', label: t.nav.dashboard, icon: LayoutDashboardIcon, exact: true },
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
  {
    to: '/contacts',
    label: t.nav.contacts,
    icon: UsersIcon,
    to: '/products',
    label: t.nav.products,
    icon: PackageIcon,
    exact: false,
  },
]

function isMatch(pathname: string, item: NavItem): boolean {
  if (item.exact) return pathname === item.to
  return pathname === item.to || pathname.startsWith(`${item.to}/`)
}

export function AppSidebar() {
  const { pathname } = useLocation()
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="bg-sidebar-primary text-sidebar-primary-foreground flex aspect-square size-6 items-center justify-center rounded text-xs font-semibold">
            L
          </div>
          <span className="truncate text-sm font-semibold">{t.app.name}</span>
        </div>
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>{t.nav.sectionMain}</SidebarGroupLabel>
          <SidebarGroupContent>
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
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
    </Sidebar>
  )
}
