// landr-7dya.11 — data layer for the shell-level ticket filter.
//
// Two responsibilities:
//
//   1. fetchFilteredStaffTicketIds(filter, currentUserId) — push the
//      ROW-INTRINSIC facets to PostgREST against `tickets_staff` (the SAME
//      dataset the inbox/board read, cross-operator, staff-gated) and return
//      the matching ticket-id Set. Server-side narrowing keeps the queue snappy
//      at 30-40 customers — we never pull the full table to filter in JS.
//
//   2. fetchFilterDerivedSets() — resolve the per-user DERIVED-STATE sets
//      (assigned-to-me / unread / watching / mentioned-me) from the notifications
//      + ticket_watchers tables (own-row RLS), so the chips are O(1) set lookups.
//
// Both feed the shell's TicketFilterProvider, which combines them into a single
// predicate the Inbox and Board surfaces apply to their own rows.
//
// Write routing: reads only (plain SELECT, RLS-bounded) → direct Supabase REST,
// per write-routing-convention.

import { supabase } from '@/lib/supabase'
import {
  resolveTimeFloorISO,
  type TicketFilter,
} from '@/lib/ticket-filters'

// ---- (1) server-side filtered ticket-id set --------------------------------

/**
 * True iff `filter` has at least one ROW-INTRINSIC facet that PostgREST can
 * narrow on. When false the caller can skip the server round-trip entirely
 * (every row passes the intrinsic check, so the id set is "match everything",
 * represented by `null`).
 */
export function hasServerFilters(filter: TicketFilter): boolean {
  return (
    filter.operatorId !== null ||
    filter.status !== null ||
    filter.type !== null ||
    filter.severity !== null ||
    filter.priority !== null ||
    filter.moscow !== null ||
    filter.perceivedImpact !== null ||
    filter.originTier !== null ||
    filter.blockedOnly ||
    filter.unassignedOnly ||
    filter.timeRange !== null ||
    filter.assignedToMe
  )
}

/**
 * Fetch the ids of staff-visible tickets that pass the row-intrinsic facets,
 * applying them server-side via PostgREST. Returns:
 *   • a Set<string> of matching ids, OR
 *   • null when no row-intrinsic facet is active (caller treats null as
 *     "match every id" — no server query needed).
 *
 * `currentUserId` (public.users.id) resolves the assigned-to-me facet
 * server-side; when it is unknown we omit that filter (the client predicate
 * still enforces it via the assignedToMe set / direct compare).
 *
 * `now` is injectable for deterministic time-window tests.
 *
 * NOTE on origin_tier / severity: these live only on `tickets_staff`. If the
 * deployed view predates them (column missing in a lower env) PostgREST 42703s;
 * we degrade gracefully by retrying without those two facets (the client
 * predicate then skips them on the rows that lack the field).
 */
export async function fetchFilteredStaffTicketIds(
  filter: TicketFilter,
  currentUserId: string | null,
  now: number = Date.now(),
): Promise<Set<string> | null> {
  if (!hasServerFilters(filter)) return null

  const rows = await runFilteredQuery(filter, currentUserId, now, true)
  return new Set(rows.map((r) => r.id))
}

type IdRow = { id: string }

async function runFilteredQuery(
  filter: TicketFilter,
  currentUserId: string | null,
  now: number,
  allowStaffOnlyCols: boolean,
): Promise<IdRow[]> {
  let q = supabase.from('tickets_staff').select('id')

  if (filter.operatorId !== null) q = q.eq('operator_id', filter.operatorId)
  if (filter.status !== null) q = q.eq('status', filter.status)
  if (filter.type !== null) q = q.eq('type', filter.type)
  if (filter.priority !== null) q = q.eq('priority', filter.priority)
  if (filter.moscow !== null) q = q.eq('moscow', filter.moscow)
  if (filter.perceivedImpact !== null)
    q = q.eq('perceived_impact', filter.perceivedImpact)
  if (filter.blockedOnly) q = q.eq('blocked', true)
  if (filter.unassignedOnly) q = q.is('assignee_id', null)
  if (filter.assignedToMe && currentUserId !== null)
    q = q.eq('assignee_id', currentUserId)

  // Staff-only columns (added by ADR 0005 / landr-7dya.1).
  if (allowStaffOnlyCols) {
    if (filter.severity !== null) q = q.eq('severity', filter.severity)
    if (filter.originTier !== null) q = q.eq('origin_tier', filter.originTier)
  }

  // Time window.
  const floor = resolveTimeFloorISO(filter.timeRange, now)
  if (floor !== null) {
    const col = filter.timeField === 'created' ? 'created_at' : 'updated_at'
    q = q.gte(col, floor)
  }

  // Cap matches generous-but-bounded: at 30-40 customers a fully open queue is
  // low thousands of rows; 5000 ids is well clear of that and trivially small
  // to ship as a Set.
  const { data, error } = await q.limit(5000)

  if (error) {
    // 42703 = undefined_column — the deployed tickets_staff view predates
    // severity / origin_tier. Retry once without those two facets so the rest
    // of the filter still narrows server-side.
    const undefinedColumn =
      error.code === '42703' ||
      /column .*does not exist/i.test(error.message ?? '')
    if (
      undefinedColumn &&
      allowStaffOnlyCols &&
      (filter.severity !== null || filter.originTier !== null)
    ) {
      return runFilteredQuery(filter, currentUserId, now, false)
    }
    throw new Error(error.message)
  }
  return (data ?? []) as IdRow[]
}

// ---- (2) per-user derived-state sets ---------------------------------------

export type FilterDerivedSets = {
  /** ticket ids assigned to the current user. */
  assignedToMeIds: Set<string>
  /** ticket ids with at least one unread notification for the current user. */
  unreadIds: Set<string>
  /** ticket ids the current user watches. */
  watchingIds: Set<string>
  /** ticket ids where the current user was @mentioned (event_type='mentioned'). */
  mentionedMeIds: Set<string>
}

export const EMPTY_DERIVED_SETS: FilterDerivedSets = {
  assignedToMeIds: new Set(),
  unreadIds: new Set(),
  watchingIds: new Set(),
  mentionedMeIds: new Set(),
}

/**
 * Resolve the per-user derived-state ticket-id sets for the filter chips.
 *
 * - assignedToMe : tickets_staff WHERE assignee_id = currentUserId.
 * - unread       : notifications WHERE read_at IS NULL (own-row RLS) → ticket_id.
 * - watching     : ticket_watchers WHERE user_id = currentUserId → ticket_id.
 * - mentionedMe  : notifications WHERE event_type='mentioned' (own-row RLS;
 *                  the @mention dispatcher writes one such row per mention,
 *                  landr-wwhn.24) → ticket_id.
 *
 * `notifications` + `ticket_watchers` are own-row-scoped by RLS, so the queries
 * implicitly resolve to the current session's rows. `currentUserId` is still
 * needed for the assigned-to-me query (tickets_staff is cross-user). Returns
 * empty sets when currentUserId is null (chips simply match nothing).
 */
export async function fetchFilterDerivedSets(
  currentUserId: string | null,
): Promise<FilterDerivedSets> {
  if (currentUserId === null) return EMPTY_DERIVED_SETS

  const [assigned, notifs, watchers] = await Promise.all([
    supabase
      .from('tickets_staff')
      .select('id')
      .eq('assignee_id', currentUserId)
      .limit(5000),
    // own-row RLS: only the current user's notifications come back.
    supabase
      .from('notifications')
      .select('ticket_id, event_type, read_at')
      .not('ticket_id', 'is', null)
      .limit(5000),
    // own-row RLS: only the current user's watch rows.
    supabase
      .from('ticket_watchers')
      .select('ticket_id')
      .eq('user_id', currentUserId)
      .limit(5000),
  ])

  if (assigned.error) throw new Error(assigned.error.message)
  if (notifs.error) throw new Error(notifs.error.message)
  if (watchers.error) throw new Error(watchers.error.message)

  const assignedToMeIds = new Set<string>(
    (assigned.data ?? []).map((r) => (r as { id: string }).id),
  )

  const unreadIds = new Set<string>()
  const mentionedMeIds = new Set<string>()
  for (const row of notifs.data ?? []) {
    const r = row as {
      ticket_id: string | null
      event_type: string
      read_at: string | null
    }
    if (r.ticket_id === null) continue
    if (r.read_at === null) unreadIds.add(r.ticket_id)
    if (r.event_type === 'mentioned') mentionedMeIds.add(r.ticket_id)
  }

  const watchingIds = new Set<string>(
    (watchers.data ?? []).map((r) => (r as { ticket_id: string }).ticket_id),
  )

  return { assignedToMeIds, unreadIds, watchingIds, mentionedMeIds }
}
