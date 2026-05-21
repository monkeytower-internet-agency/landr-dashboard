// landr-8whx — Topbar notifications bell (v1 stub).
//
// Surfaces two event streams the operator already cares about:
//   1. Pending general approvals  (existing query: fetchPendingGeneralApprovals)
//   2. Recent bookings, last 24h  (existing query: fetchBookings, filtered)
//
// Both queries are ALREADY invalidated on every booking write via
// invalidateBookingCaches (lib/bookings.ts:134), so this dropdown stays
// fresh without its own realtime subscription. v2 will wire postgres
// changes via useRealtimeQuery once we agree on the per-event payload
// shape; for now the badge + list refresh whenever any other surface
// approves/edits/creates a booking.
//
// Lives in the topbar next to ThemeToggle (see AppShell.tsx). Clicking
// a notification navigates to the relevant page and closes the menu.

import { useEffect, useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BellIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  customerDisplay,
  fetchBookings,
  fetchPendingGeneralApprovals,
  type BookingRow,
} from '@/lib/bookings'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

const RECENT_WINDOW_MS = 24 * 60 * 60 * 1000
// Cap the dropdown so a noisy operator account doesn't render hundreds
// of items inside a popover; the "View all" footer links cover the rest.
const MAX_ITEMS_PER_SECTION = 5

function isRecent(row: BookingRow, now: number): boolean {
  const createdMs = Date.parse(row.created_at)
  if (!Number.isFinite(createdMs)) return false
  return now - createdMs <= RECENT_WINDOW_MS
}

export function NotificationsBell() {
  const { currentOperatorId } = useOperator()
  const navigate = useNavigate()
  const [open, setOpen] = useState(false)

  // Reuses the SAME query keys as GeneralApprovals + Bookings so we
  // share cache + invalidations for free — no extra round-trip when the
  // operator opens those pages, and approve/reject from any surface
  // refreshes both the badge and the dropdown.
  const approvalsQuery = useQuery<BookingRow[]>({
    queryKey: ['bookings', 'general-approvals', currentOperatorId ?? 'none'],
    queryFn: () => fetchPendingGeneralApprovals(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const bookingsQuery = useQuery<BookingRow[]>({
    queryKey: ['bookings', currentOperatorId ?? 'none'],
    queryFn: () => fetchBookings(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  // The "last 24h" window slides as the dropdown stays mounted, but we
  // don't want to call Date.now() inside the render body (the React
  // purity rule rightly flags it). Re-evaluate `now` once per minute via
  // an effect — fine-grained enough for a 24h cutoff, and stable across
  // renders that don't change either query.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])

  const pendingApprovals = approvalsQuery.data ?? []
  const recentBookings = useMemo(
    () => (bookingsQuery.data ?? []).filter((row) => isRecent(row, now)),
    [bookingsQuery.data, now],
  )

  // v1 badge count = pending approvals only. Recent-bookings is
  // informational; making it count toward unread would over-fire the
  // badge every time a booking comes in (which is the *normal* path,
  // not an exception). Operators want the bell to scream when something
  // is BLOCKED on them, not when business is humming along.
  const count = pendingApprovals.length

  function handleNavigate(to: string) {
    setOpen(false)
    navigate(to)
  }

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            count > 0 ? t.notifications.badge(count) : t.notifications.open
          }
          className="relative"
          data-testid="notifications-bell-trigger"
        >
          <BellIcon className="size-4" />
          {count > 0 ? (
            <span
              aria-hidden
              data-testid="notifications-bell-badge"
              className="bg-destructive absolute top-1.5 right-1.5 size-2 rounded-full"
            />
          ) : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="end"
        className="w-80"
        data-testid="notifications-bell-content"
      >
        <DropdownMenuLabel className="text-xs font-medium">
          {t.notifications.heading}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />

        {pendingApprovals.length === 0 && recentBookings.length === 0 ? (
          <div
            className="text-muted-foreground px-2 py-3 text-center text-xs"
            data-testid="notifications-bell-empty"
          >
            {t.notifications.empty}
          </div>
        ) : (
          <>
            {pendingApprovals.length > 0 ? (
              <>
                <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                  {t.notifications.sectionPending}
                </DropdownMenuLabel>
                {pendingApprovals
                  .slice(0, MAX_ITEMS_PER_SECTION)
                  .map((row) => (
                    <DropdownMenuItem
                      key={`pending-${row.id}`}
                      onSelect={() => handleNavigate('/approvals/general')}
                      data-testid={`notifications-bell-pending-${row.id}`}
                    >
                      <span className="truncate text-sm">
                        {t.notifications.pendingItem(customerDisplay(row))}
                      </span>
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuItem
                  onSelect={() => handleNavigate('/approvals/general')}
                  data-testid="notifications-bell-view-approvals"
                  className="text-muted-foreground text-xs"
                >
                  {t.notifications.viewAllApprovals}
                </DropdownMenuItem>
              </>
            ) : null}

            {pendingApprovals.length > 0 && recentBookings.length > 0 ? (
              <DropdownMenuSeparator />
            ) : null}

            {recentBookings.length > 0 ? (
              <>
                <DropdownMenuLabel className="text-muted-foreground text-xs font-normal">
                  {t.notifications.sectionRecent}
                </DropdownMenuLabel>
                {recentBookings
                  .slice(0, MAX_ITEMS_PER_SECTION)
                  .map((row) => (
                    <DropdownMenuItem
                      key={`recent-${row.id}`}
                      onSelect={() => handleNavigate('/bookings')}
                      data-testid={`notifications-bell-recent-${row.id}`}
                    >
                      <span className="truncate text-sm">
                        {t.notifications.recentItem(customerDisplay(row))}
                      </span>
                    </DropdownMenuItem>
                  ))}
                <DropdownMenuItem
                  onSelect={() => handleNavigate('/bookings')}
                  data-testid="notifications-bell-view-bookings"
                  className="text-muted-foreground text-xs"
                >
                  {t.notifications.viewAllBookings}
                </DropdownMenuItem>
              </>
            ) : null}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
