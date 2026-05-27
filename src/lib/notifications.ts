// landr-wwhn.15 — Notification bell data layer.
//
// Wraps the `notifications` table (migration 20260524100000_ticket_notifications.sql,
// ticket landr-wwhn.7). This table is the RELIABLE SOURCE OF TRUTH for the
// dashboard bell — every watched-ticket event the dispatcher (landr-wwhn.8)
// decides to deliver produces exactly one row here, which lights the badge
// live via Supabase Realtime.
//
// RLS: own-row only. A user sees and writes ONLY their own notification rows
// (user_id IN (SELECT id FROM public.users WHERE supabase_auth_id = auth.uid())).
// The dispatcher inserts rows server-side via service_role (bypasses RLS).
//
// Read-state: `read_at` is the canonical "read" flag. NULL = unread; any
// timestamp = read. Setting it on web is immediately visible on mobile (and
// vice-versa) because both surfaces subscribe to realtime on this table —
// that is the "in sync" contract (landr-wwhn.18 mirrors the mobile side).
//
// Write routing:
//   * markNotificationRead / markAllNotificationsRead = plain UPDATE on own
//     rows, RLS + audit trigger already cover it → direct Supabase REST.
//   * Inserts = dispatcher via FastAPI service_role, NOT from this client.

import { supabase } from '@/lib/supabase'

// ---- types ------------------------------------------------------------------

export type NotificationRow = {
  id: string
  user_id: string
  /** Nullable — non-ticket notifications (system/announcement) allowed. */
  ticket_id: string | null
  event_type: string
  title: string
  body: string | null
  /** NULL = unread. */
  read_at: string | null
  created_at: string
}

// ---- fetch ------------------------------------------------------------------

const NOTIFICATION_SELECT = `
  id,
  user_id,
  ticket_id,
  event_type,
  title,
  body,
  read_at,
  created_at
`

/**
 * Fetch the current user's notification feed, newest-first.
 * Capped at 50 rows — the bell history is a preview, not a full archive.
 */
export async function fetchNotifications(): Promise<NotificationRow[]> {
  const { data, error } = await supabase
    .from('notifications')
    .select(NOTIFICATION_SELECT)
    .order('created_at', { ascending: false })
    .limit(50)
  if (error) throw new Error(error.message)
  return (data ?? []) as NotificationRow[]
}

// ---- write ------------------------------------------------------------------

/** Mark a single notification as read (sets read_at = now). Idempotent. */
export async function markNotificationRead(
  notificationId: string,
): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .eq('id', notificationId)
    .is('read_at', null) // no-op if already read — avoids a pointless write
  if (error) throw new Error(error.message)
}

/**
 * Mark ALL of the current user's unread notifications as read in one shot.
 * RLS ensures only own rows are updated.
 */
export async function markAllNotificationsRead(): Promise<void> {
  const { error } = await supabase
    .from('notifications')
    .update({ read_at: new Date().toISOString() })
    .is('read_at', null)
  if (error) throw new Error(error.message)
}
