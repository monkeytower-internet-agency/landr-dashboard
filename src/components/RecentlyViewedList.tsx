// landr-ne58 — Recently-viewed section in the app sidebar.
//
// Surfaces the last N (=5) detail surfaces the operator opened:
// bookings, contacts, products, views. Click → re-opens.
//
// Persistence + tracking lives in `@/lib/recently-viewed`. This file is
// the renderer only: it reads the trail through the reactive hook and
// renders one row per entry under a collapsible group header. Empty
// state shows a single hint row — the section header is hidden entirely
// when the icon-only sidebar variant is active (matches the group-label
// CSS used by the rest of the sidebar).
//
// Why a "Recent" section instead of inlining into each top-level item:
// the trail spans four entity types, so per-type sub-lists would scatter
// it across the sidebar and lose the most useful property (one place to
// see what you were last doing). We mount under the existing nav cluster,
// before the footer, which is the slot the briefing called for.

import { useState } from 'react'
import { Link } from 'react-router-dom'
import {
  CalendarRangeIcon,
  ChevronDownIcon,
  ChevronRightIcon,
  ClockIcon,
  LayersIcon,
  PackageIcon,
  UsersIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import { useAuth } from '@/lib/auth'
import {
  useRecentlyViewed,
  type RecentlyViewedEntry,
  type RecentlyViewedType,
} from '@/lib/recently-viewed'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

const TYPE_ICONS: Record<RecentlyViewedType, LucideIcon> = {
  booking: CalendarRangeIcon,
  contact: UsersIcon,
  product: PackageIcon,
  view: LayersIcon,
}

function typeLabel(type: RecentlyViewedType): string {
  switch (type) {
    case 'booking':
      return t.recentlyViewed.typeBooking
    case 'contact':
      return t.recentlyViewed.typeContact
    case 'product':
      return t.recentlyViewed.typeProduct
    case 'view':
      return t.recentlyViewed.typeView
  }
}

function RecentRow({ entry }: { entry: RecentlyViewedEntry }) {
  const Icon = TYPE_ICONS[entry.type]
  const aria = `${typeLabel(entry.type)}: ${entry.label}`
  return (
    <SidebarMenuItem>
      <SidebarMenuButton
        asChild
        size="sm"
        tooltip={aria}
      >
        <Link to={entry.href} aria-label={aria}>
          <Icon className="size-3.5" aria-hidden />
          <span className="truncate">{entry.label}</span>
        </Link>
      </SidebarMenuButton>
    </SidebarMenuItem>
  )
}

export function RecentlyViewedList() {
  const { user } = useAuth()
  const entries = useRecentlyViewed(user?.id ?? null)
  // Default expanded — the whole point of the section is at-a-glance recall.
  // Collapsing is a release valve when the trail isn't useful right now.
  const [open, setOpen] = useState(true)

  // No user yet → don't even render the header. Keeps the sidebar tidy
  // during the brief AuthProvider boot window before the session resolves.
  if (!user) return null

  return (
    <SidebarGroup
      // landr-ne58 — hide the whole group when the sidebar collapses to
      // the icon-only rail. Each per-row icon would still be clickable,
      // but the trail without labels is meaningless (a wall of identical
      // booking icons), so we collapse the section entirely. Matches how
      // SidebarGroupLabel auto-hides via group-data-[collapsible=icon].
      className="group-data-[collapsible=icon]:hidden"
    >
      <button
        type="button"
        aria-expanded={open}
        aria-controls="recently-viewed-content"
        aria-label={
          open ? t.recentlyViewed.collapse : t.recentlyViewed.expand
        }
        onClick={() => setOpen((v) => !v)}
        className={cn(
          'flex h-8 w-full cursor-pointer items-center gap-1.5 rounded-md px-2 text-xs font-medium',
          'text-sidebar-foreground/70 ring-sidebar-ring outline-hidden transition-colors',
          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          'focus-visible:ring-2',
        )}
      >
        {open ? (
          <ChevronDownIcon className="size-3.5" aria-hidden />
        ) : (
          <ChevronRightIcon className="size-3.5" aria-hidden />
        )}
        <ClockIcon className="size-3.5" aria-hidden />
        <span className="truncate">{t.recentlyViewed.heading}</span>
        {entries.length > 0 ? (
          <span className="ml-auto tabular-nums opacity-60">
            {entries.length}
          </span>
        ) : null}
      </button>
      {open ? (
        <SidebarGroupContent id="recently-viewed-content">
          {entries.length === 0 ? (
            <p
              className="text-muted-foreground px-2 py-1.5 text-xs italic"
              data-testid="recently-viewed-empty"
            >
              {t.recentlyViewed.empty}
            </p>
          ) : (
            <SidebarMenu>
              {entries.map((entry) => (
                <RecentRow key={`${entry.type}:${entry.id}`} entry={entry} />
              ))}
            </SidebarMenu>
          )}
        </SidebarGroupContent>
      ) : null}
    </SidebarGroup>
  )
}
