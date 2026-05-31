// landr-wwhn.28 — Feedback INBOX data layer.
//
// Staff-only cross-operator triage surface. All functions gate on
// is_landr_staff at the DB layer (views/RLS), so calling them from a
// non-staff session returns empty data rather than an error.
//
// Three data shapes:
//   1. OperatorInboxSummary   — left-rail rows (per-operator unread/awaiting counts)
//   2. InboxThread            — combined ticket+comment timeline for one operator
//   3. (reuses TicketRowStaff + TicketComment from tickets.ts)
//
// Write routing: all reads here; replies posted via createComment() from
// tickets.ts (same path as TicketDetailSheet). No new write paths needed.

import { supabase } from '@/lib/supabase'
import {
  type TicketComment,
  type TicketRowStaff,
  type TicketPerceivedImpact,
  type TicketStatus,
} from '@/lib/tickets'

// ---- left-rail summary (feedback_inbox_operator_summary view) ---------------

export type OperatorInboxSummary = {
  operator_id: string
  operator_name: string | null
  operator_slug: string | null
  ticket_count: number
  /** ISO timestamp of the most recent ticket/comment activity, may be null. */
  last_activity_at: string | null
  /** Unread notification count for the calling staff user. */
  unread_count: number
  /** Tickets whose last comment is from the operator side (awaiting staff reply). */
  awaiting_reply_count: number
}

/**
 * Fetch the per-operator inbox summary rows (left rail).
 * Backed by the `feedback_inbox_operator_summary` SECURITY DEFINER view.
 * Returns [] for non-staff (view WHERE gate).
 */
export async function fetchOperatorInboxSummaries(): Promise<OperatorInboxSummary[]> {
  const { data, error } = await supabase
    .from('feedback_inbox_operator_summary')
    .select(
      'operator_id, operator_name, operator_slug, ticket_count, last_activity_at, unread_count, awaiting_reply_count',
    )
    // default order from the view: awaiting-reply first, then oldest-activity first
  if (error) throw new Error(error.message)
  return (data ?? []) as OperatorInboxSummary[]
}

// ---- inbox thread (combined ticket+comment timeline for one operator) -------

/**
 * A single event in the combined message timeline.
 *
 * `kind = 'ticket'`: the ticket creation event (body is ticket.body).
 * `kind = 'comment'`: a comment (body is comment.body).
 */
export type InboxTimelineEvent =
  | {
      kind: 'ticket'
      id: string
      ticket_id: string
      operator_id: string
      author_id: string | null
      title: string
      body: string | null
      status: TicketStatus
      perceived_impact: TicketPerceivedImpact
      assignee_id: string | null
      is_internal: false
      created_at: string
    }
  | {
      kind: 'comment'
      id: string
      ticket_id: string
      operator_id: string
      author_id: string | null
      title: string
      body: string
      status: TicketStatus
      perceived_impact: TicketPerceivedImpact
      assignee_id: string | null
      is_internal: boolean
      created_at: string
    }

/**
 * A thread: one ticket + its merged timeline (ticket creation + all comments).
 */
export type InboxTicketThread = {
  ticket: TicketRowStaff
  timeline: InboxTimelineEvent[]
}

/**
 * Fetch all staff-visible tickets for an operator (via tickets_staff) plus
 * their comments, and return them as a flat list of threads ordered by
 * most-recent activity first.
 *
 * Each thread contains the ticket's merged timeline (ticket open event +
 * comments), oldest-first within the thread. Threads themselves are ordered
 * newest-activity-first so the most recent conversation appears at the top.
 */
export async function fetchInboxThreads(
  operatorId: string,
): Promise<InboxTicketThread[]> {
  // 1. Load staff tickets for the operator
  const { data: ticketData, error: ticketErr } = await supabase
    .from('tickets_staff')
    .select(
      `id, context, type, title, body, status, priority, perceived_impact,
       reporter_id, operator_id, assignee_id, blocked, moscow,
       severity, linked_bd_id, promotion_prompt, promotion_requested_at,
       sync_status, last_synced_at, origin_tier, origin_operator_label,
       created_at, updated_at`,
    )
    .eq('operator_id', operatorId)
    .order('updated_at', { ascending: false })
    .limit(200)

  if (ticketErr) throw new Error(ticketErr.message)
  const tickets = (ticketData ?? []) as TicketRowStaff[]

  // 2. Load comments for all tickets in one query
  let allComments: TicketComment[] = []
  if (tickets.length > 0) {
    const ticketIds = tickets.map((t) => t.id)
    const { data: commentData, error: commentErr } = await supabase
      .from('ticket_comments_staff')
      .select(
        'id, ticket_id, operator_id, author_id, body, is_internal, created_at, updated_at',
      )
      .in('ticket_id', ticketIds)
      .order('created_at', { ascending: true })

    if (commentErr) throw new Error(commentErr.message)
    allComments = (commentData ?? []) as TicketComment[]
  }

  // 3. Group comments by ticket_id
  const commentsByTicket = new Map<string, TicketComment[]>()
  for (const c of allComments) {
    const arr = commentsByTicket.get(c.ticket_id) ?? []
    arr.push(c)
    commentsByTicket.set(c.ticket_id, arr)
  }

  // 4. Build threads with merged timeline
  const threads: InboxTicketThread[] = tickets.map((ticket) => {
    const comments = commentsByTicket.get(ticket.id) ?? []

    // Ticket-open event
    const openEvent: InboxTimelineEvent = {
      kind: 'ticket',
      id: `ticket-open-${ticket.id}`,
      ticket_id: ticket.id,
      operator_id: ticket.operator_id,
      author_id: ticket.reporter_id,
      title: ticket.title,
      body: ticket.body,
      status: ticket.status,
      perceived_impact: ticket.perceived_impact,
      assignee_id: ticket.assignee_id,
      is_internal: false,
      created_at: ticket.created_at,
    }

    // Comment events
    const commentEvents: InboxTimelineEvent[] = comments.map((c) => ({
      kind: 'comment',
      id: c.id,
      ticket_id: ticket.id,
      operator_id: ticket.operator_id,
      author_id: c.author_id,
      title: ticket.title,
      body: c.body,
      status: ticket.status,
      perceived_impact: ticket.perceived_impact,
      assignee_id: ticket.assignee_id,
      is_internal: c.is_internal,
      created_at: c.created_at,
    }))

    // Timeline: ticket open first, then comments oldest→newest
    const timeline: InboxTimelineEvent[] = [openEvent, ...commentEvents]

    return { ticket, timeline }
  })

  // 5. Sort threads by most recent activity (newest first)
  threads.sort((a, b) => {
    const lastA =
      a.timeline.length > 0
        ? a.timeline[a.timeline.length - 1]!.created_at
        : a.ticket.created_at
    const lastB =
      b.timeline.length > 0
        ? b.timeline[b.timeline.length - 1]!.created_at
        : b.ticket.created_at
    return lastB.localeCompare(lastA)
  })

  return threads
}

// ---- filter helpers ---------------------------------------------------------

export type InboxFilter = {
  status: import('@/lib/tickets').TicketStatus | null
  perceived_impact: TicketPerceivedImpact | null
  unreadOnly: boolean
  awaitingReplyOnly: boolean
  assigneeId: string | null
}

export const INBOX_FILTER_DEFAULTS: InboxFilter = {
  status: null,
  perceived_impact: null,
  unreadOnly: false,
  awaitingReplyOnly: false,
  assigneeId: null,
}

/**
 * Returns true if a thread matches the given filter set.
 * `unreadTicketIds` and `awaitingReplyTicketIds` are precomputed sets for O(1) lookup.
 */
export function threadMatchesFilter(
  thread: InboxTicketThread,
  filter: InboxFilter,
  unreadTicketIds: ReadonlySet<string>,
  awaitingReplyTicketIds: ReadonlySet<string>,
): boolean {
  const t = thread.ticket
  if (filter.status !== null && t.status !== filter.status) return false
  if (filter.perceived_impact !== null && t.perceived_impact !== filter.perceived_impact) return false
  if (filter.unreadOnly && !unreadTicketIds.has(t.id)) return false
  if (filter.awaitingReplyOnly && !awaitingReplyTicketIds.has(t.id)) return false
  if (filter.assigneeId !== null && t.assignee_id !== filter.assigneeId) return false
  return true
}
