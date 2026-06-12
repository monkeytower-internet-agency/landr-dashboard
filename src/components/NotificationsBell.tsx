// landr-wwhn.15 — Notification bell (v2, ticket-system).
//
// Replaces the v1 booking-based bell (landr-8whx) with the full ticket-system
// notification feed backed by the `notifications` table (landr-wwhn.7 schema).
//
// Contract (the source-of-truth surface):
//   * Unread badge: red dot when any notification has read_at = NULL.
//   * History dropdown: scrollable list of up to 50 recent notifications,
//     newest first. Each row shows the title, relative time, and a visual
//     read/unread indicator.
//   * Mark-read on click: clicking an item calls markNotificationRead → sets
//     read_at; the badge re-evaluates automatically via the query invalidation.
//   * Mark-all-read: footer button marks every unread notification as read.
//   * Click-through: if the notification has a ticket_id, clicking it navigates
//     to /tickets?open=<ticket_id> and closes the dropdown. TicketBoard reads
//     that param and auto-opens the detail sheet.
//   * Realtime: postgres_changes subscription on `notifications` for own rows,
//     via useRealtimeQuery — badge and history stay live without polling.
//   * Read-state sync: because read_at is set server-side and realtime fires on
//     the update, reading on web automatically clears the mobile badge and vice
//     versa (mobile .18 mirrors this side).
//
// Why own-user realtime filter works: Supabase postgres_changes with a
// `user_id=eq.<uuid>` filter is server-side so only rows belonging to the
// current user arrive in the channel — no client-side filtering needed.
// The user_id (public.users.id) is resolved once from auth.uid via the users
// table and memoised; the subscription is re-registered whenever it changes.

import { useCallback, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellIcon, CheckCheckIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import { useAuth } from '@/lib/auth'
import { useEntitlements } from '@/lib/entitlements'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationRow,
} from '@/lib/notifications'
import { fetchCurrentPublicUser } from '@/lib/tickets'
import { TICKET_SYSTEM_PATH } from '@/lib/app-mode'
import { t } from '@/lib/strings'

// ---- helpers ----------------------------------------------------------------

/**
 * Returns a human-readable relative time string (e.g. "3 minutes ago",
 * "2 days ago") without a third-party library. Precision is intentionally
 * coarse — notification timestamps don't need sub-minute accuracy.
 */
function relativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin} minute${diffMin === 1 ? '' : 's'} ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH} hour${diffH === 1 ? '' : 's'} ago`
    const diffD = Math.floor(diffH / 24)
    if (diffD < 30) return `${diffD} day${diffD === 1 ? '' : 's'} ago`
    const diffMo = Math.floor(diffD / 30)
    return `${diffMo} month${diffMo === 1 ? '' : 's'} ago`
  } catch {
    return ''
  }
}

// ---- component --------------------------------------------------------------

export function NotificationsBell() {
  const { user } = useAuth()
  const { effectiveIsStaff } = useEntitlements()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  // Resolve auth.uid → public.users.id once (needed for the realtime filter).
  // Shared query key with TicketDetailSheet so the two share the cache entry.
  const { data: publicUser } = useQuery({
    queryKey: ['current-public-user', user?.id ?? 'anon'],
    queryFn: () => fetchCurrentPublicUser(user!.id),
    enabled: !!user?.id,
    staleTime: 5 * 60 * 1000,
  })
  const publicUserId = publicUser?.id ?? null

  // Realtime-backed query. The filter is `user_id=eq.<publicUserId>` so the
  // channel only fires for THIS user's rows — own-row RLS matches too.
  const query = useRealtimeQuery<NotificationRow[]>({
    queryKey: ['notifications', publicUserId ?? 'none'],
    queryFn: fetchNotifications,
    enabled: !!publicUserId,
    realtime: publicUserId
      ? {
          table: 'notifications',
          event: '*',
          filter: `user_id=eq.${publicUserId}`,
        }
      : null,
  })

  const notifications = useMemo(() => query.data ?? [], [query.data])
  const unreadCount = useMemo(
    () => notifications.filter((n) => n.read_at === null).length,
    [notifications],
  )

  // ---- mark single read -------------------------------------------------------

  const markReadMutation = useMutation({
    mutationFn: markNotificationRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['notifications', publicUserId ?? 'none'],
      })
    },
    onError: () => {
      toast.error('Could not mark notification as read.')
    },
  })

  // ---- mark all read ----------------------------------------------------------

  const markAllMutation = useMutation({
    mutationFn: markAllNotificationsRead,
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: ['notifications', publicUserId ?? 'none'],
      })
    },
    onError: () => {
      toast.error('Could not mark all notifications as read.')
    },
  })

  // ---- item click (mark read + navigate) --------------------------------------
  //
  // landr-7dya.6: staff are deep-linked into the app-view inbox
  // (/staff/tickets?open=<ticketId>) which opens TicketDetailSheet directly.
  // Operators land on the operator board (/tickets?open=<ticketId>) as before.
  //
  // landr-agiw.1: ticket_id takes precedence. When a notification has no ticket
  // (system/promotion events) but carries a `link`, navigate there instead so the
  // bell no longer dead-ends (previously it only marked-as-read). `link` is always
  // an in-app path written by the backend; we still guard against protocol-relative
  // ('//evil.com') and absolute URLs as defense-in-depth.

  const handleItemClick = useCallback(
    (notification: NotificationRow) => {
      if (notification.read_at === null) {
        markReadMutation.mutate(notification.id)
      }
      if (notification.ticket_id) {
        setOpen(false)
        if (effectiveIsStaff) {
          navigate(
            `${TICKET_SYSTEM_PATH}?open=${encodeURIComponent(notification.ticket_id)}`,
          )
        } else {
          navigate(
            `/tickets?open=${encodeURIComponent(notification.ticket_id)}`,
          )
        }
      } else if (
        notification.link &&
        notification.link.startsWith('/') &&
        !notification.link.startsWith('//')
      ) {
        setOpen(false)
        navigate(notification.link)
      }
    },
    [effectiveIsStaff, markReadMutation, navigate],
  )

  // ---- render -----------------------------------------------------------------

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="icon"
          aria-label={
            unreadCount > 0
              ? t.notifications.badge(unreadCount)
              : t.notifications.open
          }
          className="relative"
          data-testid="notifications-bell-trigger"
        >
          <BellIcon className="size-4" />
          {unreadCount > 0 ? (
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
        <div className="flex items-center justify-between px-2 py-1.5">
          <DropdownMenuLabel className="p-0 text-xs font-medium">
            {t.notifications.heading}
          </DropdownMenuLabel>
          {unreadCount > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="text-muted-foreground h-auto px-1 py-0 text-xs"
              onClick={(e) => {
                // Prevent the DropdownMenu from interpreting this as a close.
                e.stopPropagation()
                markAllMutation.mutate()
              }}
              disabled={markAllMutation.isPending}
              data-testid="notifications-bell-mark-all-read"
            >
              <CheckCheckIcon className="mr-1 size-3" />
              {t.notifications.markAllRead}
            </Button>
          ) : null}
        </div>
        <DropdownMenuSeparator />

        {/* Error state */}
        {query.isError ? (
          <div
            className="text-muted-foreground px-2 py-3 text-center text-xs"
            data-testid="notifications-bell-error"
          >
            {t.notifications.loadError}
          </div>
        ) : null}

        {/* Empty state */}
        {!query.isError && notifications.length === 0 && !query.isPending ? (
          <div
            className="text-muted-foreground px-2 py-3 text-center text-xs"
            data-testid="notifications-bell-empty"
          >
            {t.notifications.empty}
          </div>
        ) : null}

        {/* Notification list — scrollable, max-h keeps the dropdown from
            overflowing the viewport on screens with many unread items. */}
        {notifications.length > 0 ? (
          <div
            className="max-h-96 overflow-y-auto"
            data-testid="notifications-bell-list"
          >
            {notifications.map((n) => (
              <DropdownMenuItem
                key={n.id}
                onSelect={() => handleItemClick(n)}
                data-testid={`notification-item-${n.id}`}
                className="flex cursor-pointer flex-col items-start gap-0.5 px-3 py-2"
              >
                <div className="flex w-full items-start gap-2">
                  {/* Unread dot indicator */}
                  <span
                    aria-hidden
                    className={
                      n.read_at === null
                        ? 'bg-primary mt-1.5 size-1.5 shrink-0 rounded-full'
                        : 'mt-1.5 size-1.5 shrink-0 rounded-full'
                    }
                    data-testid={
                      n.read_at === null
                        ? `notification-unread-dot-${n.id}`
                        : undefined
                    }
                  />
                  <div className="min-w-0 flex-1">
                    <p
                      className={
                        n.read_at === null
                          ? 'truncate text-sm font-medium'
                          : 'text-muted-foreground truncate text-sm'
                      }
                      data-testid={`notification-title-${n.id}`}
                    >
                      {n.title}
                    </p>
                    {n.body ? (
                      <p
                        className="text-muted-foreground line-clamp-2 text-xs"
                        data-testid={`notification-body-${n.id}`}
                      >
                        {n.body}
                      </p>
                    ) : null}
                    <p className="text-muted-foreground mt-0.5 text-xs">
                      {relativeTime(n.created_at)}
                    </p>
                  </div>
                </div>
              </DropdownMenuItem>
            ))}
          </div>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
