// landr-wwhn — ticket data layer (shared by the create-flow landr-wwhn.12 and
// the kanban board landr-wwhn.11).
//
// Supabase `tickets` is the customer-facing system of record. bd is the
// engineering execution engine (Trillian-only, NOT reachable from this
// client). They are bridged, not merged.
//
// Per write-routing-convention, plain row writes that RLS + the audit trigger
// already cover go DIRECT to Supabase REST: a new ticket (single-row INSERT)
// and a board status drag (single-column UPDATE) are both exactly that shape.
// Side-effecting orchestration (triage, gateway promotion, notification
// dispatch) lives in FastAPI service-role routers, not here.
//
// Schema (migration 20260524070041_tickets.sql, ticket landr-wwhn.1):
//   context          ticket_context  NOT NULL DEFAULT 'operations'
//   type             ticket_type     NOT NULL  (bug | feature | annoyance | question)
//   title            text            NOT NULL
//   body             text
//   status           ticket_status   NOT NULL DEFAULT 'backlog'
//   priority         ticket_priority NOT NULL DEFAULT 'p2'  (internal — NOT set by reporter)
//   severity         ticket_severity            (bugs only — internal, NOT set by reporter)
//   perceived_impact ticket_perceived_impact NOT NULL DEFAULT 'idea'
//   reporter_id      uuid            (auth-resolved at INSERT time)
//   operator_id      uuid            NOT NULL
//
// Column-level grants (authenticated role):
//   INSERT: context, type, title, body, status, priority, perceived_impact,
//           reporter_id, operator_id, assignee_id, blocked
//   SELECT: id, context, type, title, body, status, priority, perceived_impact,
//           reporter_id, operator_id, assignee_id, blocked, created_at, updated_at
//   UPDATE: type, title, body, status, priority, perceived_impact, assignee_id, blocked
//
// Internal fields (severity, linked_bd_id, promotion_prompt, sync_status, …)
// are REVOKE-d from REST roles — reporters/operators MUST NOT set them. Staff
// read them through the tickets_staff SECURITY DEFINER view (fetchTicketsStaff).

import { supabase } from '@/lib/supabase'

// ---- enums (mirror public.ticket_* enums) -----------------------------------

export type TicketContext = 'operations' | 'community'
export type TicketType = 'bug' | 'feature' | 'annoyance' | 'question'
export type TicketStatus =
  | 'backlog'
  | 'ready'
  | 'in_progress'
  | 'in_review'
  | 'done'
export type TicketPriority = 'p0' | 'p1' | 'p2'
export type TicketPerceivedImpact = 'blocking' | 'annoying' | 'idea'

// ---- public ticket row (what `authenticated` role can read) -----------------

export type TicketRow = {
  id: string
  context: TicketContext
  type: TicketType
  title: string
  body: string | null
  status: TicketStatus
  priority: TicketPriority
  perceived_impact: TicketPerceivedImpact
  reporter_id: string | null
  operator_id: string
  assignee_id: string | null
  blocked: boolean
  created_at: string
  updated_at: string
}

// ---- staff-only extra fields (via tickets_staff view) -----------------------

export type TicketStaffFields = {
  severity: string | null
  linked_bd_id: string | null
  promotion_prompt: string | null
  promotion_requested_at: string | null
  sync_status: string | null
  last_synced_at: string | null
}

export type TicketRowStaff = TicketRow & TicketStaffFields

// ---- column definitions for the board (landr-wwhn.11) -----------------------

export type TicketColumn = {
  key: TicketStatus
  label: string
  /** Operators can drag INTO this column (Supabase-authoritative side). */
  draggable: boolean
  /** bd-authoritative: board reflects but doesn't drive state changes here. */
  readMostly: boolean
}

export const TICKET_COLUMNS: TicketColumn[] = [
  { key: 'backlog', label: 'Backlog', draggable: true, readMostly: false },
  { key: 'ready', label: 'Ready', draggable: true, readMostly: false },
  {
    key: 'in_progress',
    label: 'In progress',
    draggable: false,
    readMostly: true,
  },
  {
    key: 'in_review',
    label: 'In review',
    draggable: false,
    readMostly: true,
  },
  { key: 'done', label: 'Done', draggable: false, readMostly: true },
]

// Ordered status values for display / type guards
export const TICKET_STATUSES: TicketStatus[] = [
  'backlog',
  'ready',
  'in_progress',
  'in_review',
  'done',
]

// Human-owned (Supabase-authoritative) statuses — drag allowed here.
export const DRAGGABLE_STATUSES: ReadonlySet<TicketStatus> = new Set([
  'backlog',
  'ready',
])

// ---- priority labels (Martin-readable, with plain-language tooltips) --------

export const PRIORITY_LABEL: Record<TicketPriority, string> = {
  p0: 'Critical',
  p1: 'High',
  p2: 'Normal',
}

export const PRIORITY_TOOLTIP: Record<TicketPriority, string> = {
  p0: 'Blocking — must fix immediately',
  p1: 'High priority — fix in current sprint',
  p2: 'Normal priority — fix when possible',
}

// ---- type labels ------------------------------------------------------------

export const TYPE_LABEL: Record<TicketType, string> = {
  bug: 'Bug',
  feature: 'Feature request',
  annoyance: 'Annoyance',
  question: 'Question',
}

// ---- perceived_impact labels ------------------------------------------------

export const PERCEIVED_IMPACT_LABEL: Record<TicketPerceivedImpact, string> = {
  blocking: 'Blocking',
  annoying: 'Annoying',
  idea: 'Idea',
}

// ---- create-ticket flow (landr-wwhn.12) -------------------------------------

export type TicketCreate = {
  operator_id: string
  reporter_id: string | null
  type: TicketType
  title: string
  body?: string | null
  perceived_impact: TicketPerceivedImpact
  // context defaults to 'operations' at the DB layer — callers SHOULD omit it
  // unless they have a specific reason to set 'community'.
  context?: 'operations' | 'community'
}

// The create-ticket form (ReportFab) shows the reporter a simplified two-option
// toggle (Problem | Idea) rather than the full four-value ticket_type enum.
// This helper maps that toggle + the reporter's perceived_impact onto the DB
// type. Lives here (not in the .tsx) so it can be unit-tested without mounting
// the component and so it doesn't trip react-refresh/only-export-components.

export type ReporterToggle = 'problem' | 'idea'

/**
 * Derive the DB ticket_type from the reporter's simplified two-option toggle
 * and their perceived_impact selection.
 *
 *   Problem + blocking or annoying → 'bug'  (something is broken)
 *   Problem + idea                 → 'annoyance'  (mild friction, not a crash)
 *   Idea                           → 'feature'
 */
export function resolveTicketType(
  toggle: ReporterToggle,
  impact: TicketPerceivedImpact,
): TicketType {
  if (toggle === 'idea') return 'feature'
  // problem branch
  return impact === 'idea' ? 'annoyance' : 'bug'
}

// ---- select strings ---------------------------------------------------------

const TICKET_SELECT = `
  id,
  context,
  type,
  title,
  body,
  status,
  priority,
  perceived_impact,
  reporter_id,
  operator_id,
  assignee_id,
  blocked,
  created_at,
  updated_at
`

const TICKET_STAFF_SELECT = `
  id,
  context,
  type,
  title,
  body,
  status,
  priority,
  perceived_impact,
  reporter_id,
  operator_id,
  assignee_id,
  blocked,
  severity,
  linked_bd_id,
  promotion_prompt,
  promotion_requested_at,
  sync_status,
  last_synced_at,
  created_at,
  updated_at
`

// ---- create -----------------------------------------------------------------

export async function createTicket(payload: TicketCreate): Promise<TicketRow> {
  const { data, error } = await supabase
    .from('tickets')
    .insert(payload)
    .select(
      'id, context, type, title, body, status, priority, perceived_impact, reporter_id, operator_id, assignee_id, blocked, created_at, updated_at',
    )
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as TicketRow
}

// ---- read -------------------------------------------------------------------

/**
 * Fetch tickets for an operator. Operators see own-org tickets; staff see
 * all (RLS handles the cross-tenant bypass). Results are ordered: priority
 * desc then created_at desc within each status.
 */
export async function fetchTickets(operatorId: string): Promise<TicketRow[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('operator_id', operatorId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as TicketRow[]
}

/**
 * Fetch tickets via the tickets_staff SECURITY DEFINER view — exposes
 * internal fields (severity, linked_bd_id, etc.) but only returns rows when
 * is_landr_staff is true (the view's WHERE clause). Safe to call from
 * non-staff sessions: returns [].
 */
export async function fetchTicketsStaff(): Promise<TicketRowStaff[]> {
  const { data, error } = await supabase
    .from('tickets_staff')
    .select(TICKET_STAFF_SELECT)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(1000)

  if (error) throw new Error(error.message)
  return (data ?? []) as TicketRowStaff[]
}

// ---- write ------------------------------------------------------------------

/**
 * Update a ticket's status (operator → Supabase REST for the public, human-
 * owned columns per write-routing-convention). Only allowed for statuses in
 * DRAGGABLE_STATUSES (backlog, ready); callers MUST gate before calling.
 */
export async function patchTicketStatus(
  ticketId: string,
  status: TicketStatus,
): Promise<void> {
  const { error } = await supabase
    .from('tickets')
    .update({ status })
    .eq('id', ticketId)

  if (error) throw new Error(error.message)
}

// ---- single ticket fetch (for detail sheet) ---------------------------------

/**
 * Fetch a single ticket by id. Operators see own-org tickets; staff see all
 * (RLS). Returns null if not found (rather than throwing for a missing row —
 * callers render an error state rather than an unhandled rejection).
 */
export async function fetchTicket(ticketId: string): Promise<TicketRow | null> {
  const { data, error } = await supabase
    .from('tickets')
    .select(TICKET_SELECT)
    .eq('id', ticketId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as TicketRow | null
}

/**
 * Fetch a single ticket via the staff view (returns internal fields).
 * Returns null for non-staff or if not found.
 */
export async function fetchTicketStaff(
  ticketId: string,
): Promise<TicketRowStaff | null> {
  const { data, error } = await supabase
    .from('tickets_staff')
    .select(TICKET_STAFF_SELECT)
    .eq('id', ticketId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as TicketRowStaff | null
}

// ---- assignable users (landr-wwhn.22) ---------------------------------------
//
// Assignees on tickets can be a human (is_landr_staff = true) or a Claude
// agent (is_claude_agent = true). Both live in public.users; neither is a
// plain operator account.
//
// The assignable_users SECURITY DEFINER view (migration
// 20260524140000_users_is_claude_agent.sql) exposes the picker payload.
// It is readable by authenticated role: staff populate the picker, operators
// see the resolved display name for their assigned tickets (read-only).
//
// Agent-assignment bridge hook: when a Claude agent is set as assignee and the
// ticket already has a linked_bd_id, the bridge worker (ticket_bridge.py)
// interprets this as a bd-claim signal — it stamps `bd claim <linked_bd_id>`.
// That wiring lives entirely in the bridge worker; this client just writes
// assignee_id to tickets (plain REST UPDATE, no side effects here).

export type AssignableUser = {
  id: string
  email: string | null
  /** True for the vendor Olaf user (can triage + assign). */
  is_landr_staff: boolean
  /** True for Claude agent accounts (no supabase_auth_id; claim signal to bridge). */
  is_claude_agent: boolean
}

/**
 * Fetch all users that can be assigned to a ticket.
 * Returns staff and Claude agent accounts from the assignable_users SECURITY
 * DEFINER view. Returns [] for non-staff (the view filters them out — safe to
 * call from operator sessions for display purposes).
 */
export async function fetchAssignableUsers(): Promise<AssignableUser[]> {
  const { data, error } = await supabase
    .from('assignable_users')
    .select('id, email, is_landr_staff, is_claude_agent')
    .order('email', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as AssignableUser[]
}

/**
 * Set (or clear) the assignee on a ticket.
 * Direct Supabase REST UPDATE — assignee_id is in the authenticated UPDATE
 * grant. Pass null to unassign. Callers should gate on isStaff before calling
 * (operators may not reassign tickets; this is a staff action in the UI but
 * the RLS lets any operator write their own tickets' assignee_id).
 */
export async function patchTicketAssignee(
  ticketId: string,
  assigneeId: string | null,
): Promise<void> {
  const { error } = await supabase
    .from('tickets')
    .update({ assignee_id: assigneeId })
    .eq('id', ticketId)
  if (error) throw new Error(error.message)
}

// ---- current public user ----------------------------------------------------

export type PublicUser = {
  id: string
  email: string | null
  is_landr_staff: boolean
}

/**
 * Fetch the public.users row for the current auth session (used to gate
 * is_landr_staff features). Pass the Supabase auth uid (session.user.id).
 * Returns null if no public.users row exists (broken signup flow).
 */
export async function fetchCurrentPublicUser(
  authUid: string,
): Promise<PublicUser | null> {
  const { data, error } = await supabase
    .from('users')
    .select('id, email, is_landr_staff')
    .eq('supabase_auth_id', authUid)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as PublicUser | null
}

// ---- comments ---------------------------------------------------------------

export type TicketComment = {
  id: string
  ticket_id: string
  operator_id: string
  author_id: string | null
  body: string
  is_internal: boolean
  created_at: string
  updated_at: string
}

const COMMENT_SELECT = `
  id,
  ticket_id,
  operator_id,
  author_id,
  body,
  is_internal,
  created_at,
  updated_at
`

/**
 * Fetch public comments for a ticket.
 * Operators get non-internal rows only (RLS enforces); staff get all.
 */
export async function fetchTicketComments(
  ticketId: string,
): Promise<TicketComment[]> {
  const { data, error } = await supabase
    .from('ticket_comments')
    .select(COMMENT_SELECT)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as TicketComment[]
}

/**
 * Fetch ALL comments (incl. internal) via the staff view.
 * Returns [] for non-staff (view WHERE gate).
 */
export async function fetchTicketCommentsStaff(
  ticketId: string,
): Promise<TicketComment[]> {
  const { data, error } = await supabase
    .from('ticket_comments_staff')
    .select(COMMENT_SELECT)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as TicketComment[]
}

export type CommentCreate = {
  ticket_id: string
  body: string
  is_internal?: boolean
}

/** Insert a comment. is_internal defaults to false. */
export async function createComment(
  payload: CommentCreate,
): Promise<TicketComment> {
  const { data, error } = await supabase
    .from('ticket_comments')
    .insert(payload)
    .select(COMMENT_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as TicketComment
}

// ---- watchers ---------------------------------------------------------------

export type TicketWatcher = {
  ticket_id: string
  user_id: string
  created_at: string
}

/** Check if a specific public.users.id is watching a ticket. */
export async function fetchTicketWatcher(
  ticketId: string,
  userId: string,
): Promise<TicketWatcher | null> {
  const { data, error } = await supabase
    .from('ticket_watchers')
    .select('ticket_id, user_id, created_at')
    .eq('ticket_id', ticketId)
    .eq('user_id', userId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  return data as TicketWatcher | null
}

/** Add a watch row (upsert-safe: ON CONFLICT DO NOTHING at DB level). */
export async function watchTicket(
  ticketId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('ticket_watchers')
    .insert({ ticket_id: ticketId, user_id: userId })
  // 23505 = unique_violation — row already exists; idempotent.
  if (error && error.code !== '23505') throw new Error(error.message)
}

/** Remove a watch row (unwatch). */
export async function unwatchTicket(
  ticketId: string,
  userId: string,
): Promise<void> {
  const { error } = await supabase
    .from('ticket_watchers')
    .delete()
    .eq('ticket_id', ticketId)
    .eq('user_id', userId)
  if (error) throw new Error(error.message)
}

// ---- attachments ------------------------------------------------------------

export type TicketAttachment = {
  id: string
  ticket_id: string
  uploader_id: string | null
  storage_path: string
  filename: string
  content_type: string
  size_bytes: number
  created_at: string
}

const ATTACHMENT_SELECT = `
  id,
  ticket_id,
  uploader_id,
  storage_path,
  filename,
  content_type,
  size_bytes,
  created_at
`

export async function fetchTicketAttachments(
  ticketId: string,
): Promise<TicketAttachment[]> {
  const { data, error } = await supabase
    .from('ticket_attachments')
    .select(ATTACHMENT_SELECT)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as TicketAttachment[]
}

/**
 * Upload a file to the ticket-attachments bucket, then insert a metadata row.
 * Returns the signed URL for immediate preview (TTL 3600s).
 */
export async function uploadTicketAttachment(
  ticketId: string,
  file: File,
  uploaderId: string | null,
): Promise<{ attachment: TicketAttachment; signedUrl: string }> {
  const attachmentId = crypto.randomUUID()
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
  const storagePath = `ticket-attachments/${ticketId}/${attachmentId}/${safeName}`

  // 1. Upload the object
  const { error: uploadError } = await supabase.storage
    .from('ticket-attachments')
    .upload(storagePath, file, { contentType: file.type, upsert: false })
  if (uploadError) throw new Error(uploadError.message)

  // 2. Insert the metadata row
  const payload = {
    id: attachmentId,
    ticket_id: ticketId,
    uploader_id: uploaderId,
    storage_path: storagePath,
    filename: safeName,
    content_type: file.type || 'application/octet-stream',
    size_bytes: file.size,
  }
  const { data, error: rowError } = await supabase
    .from('ticket_attachments')
    .insert(payload)
    .select(ATTACHMENT_SELECT)
    .single()
  if (rowError) throw new Error(rowError.message)

  // 3. Create a signed URL for immediate display
  const { data: signed, error: signError } = await supabase.storage
    .from('ticket-attachments')
    .createSignedUrl(storagePath, 3600)
  if (signError || !signed) throw new Error(signError?.message ?? 'signed URL failed')

  return { attachment: data as unknown as TicketAttachment, signedUrl: signed.signedUrl }
}

/** Create a signed download URL for an existing attachment (TTL 3600s). */
export async function getAttachmentSignedUrl(
  storagePath: string,
): Promise<string> {
  const { data, error } = await supabase.storage
    .from('ticket-attachments')
    .createSignedUrl(storagePath, 3600)
  if (error || !data) throw new Error(error?.message ?? 'signed URL failed')
  return data.signedUrl
}

// ---- events (activity timeline) ---------------------------------------------

export type TicketEvent = {
  id: string
  ticket_id: string
  actor_id: string | null
  event_type:
    | 'created'
    | 'status_changed'
    | 'assigned'
    | 'unassigned'
    | 'blocked'
    | 'unblocked'
    | 'comment_added'
    | 'label_added'
    | 'label_removed'
    | 'promoted'
    | 'shipped'
  payload: Record<string, unknown>
  is_internal: boolean
  created_at: string
}

const EVENT_SELECT = `
  id,
  ticket_id,
  actor_id,
  event_type,
  payload,
  is_internal,
  created_at
`

/**
 * Fetch the activity timeline for a ticket, oldest-first.
 * Operators see non-internal events only (RLS); staff see all.
 */
export async function fetchTicketEvents(
  ticketId: string,
): Promise<TicketEvent[]> {
  const { data, error } = await supabase
    .from('ticket_events')
    .select(EVENT_SELECT)
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: true })
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as TicketEvent[]
}

// ---- gateway promotion (landr-wwhn.14) --------------------------------------

export type PromoteTicketResult = {
  linked_bd_id: string
  promotion_requested_at: string
}

// ---- @mentions (landr-wwhn.24) -----------------------------------------------
//
// @mention parsing + user-search autocomplete + mention notification dispatch.
//
// Mention tokens are `@<handle>` where handle = one or more non-whitespace,
// non-@ chars.  We parse them from a raw comment body to determine which users
// were mentioned so we can call the server-side override-quiet notify path.
//
// User search returns a minimal shape (id + email) so the autocomplete can
// resolve handles (email local-parts) to public.users.id values for the
// notification fan-out.  RLS restricts the users table to own-operator rows for
// operators; staff see all (cross-tenant) — callers rely on RLS for access.
//
// Dispatch is FastAPI-routed (side-effecting: notify override-quiet → bell even
// when the ticket is silenced) per write-routing-convention.

export type MentionUser = {
  id: string
  email: string
}

/** Parse @handle tokens from a raw comment body.
 *
 * Returns the set of lower-cased handle strings (local-parts from email), NOT
 * UUIDs — callers must resolve handles → user IDs via searchMentionUsers.
 * A handle is everything after @ up to the next whitespace or end of string.
 */
export function parseMentionHandles(body: string): Set<string> {
  const matches = body.matchAll(/@([^\s@]+)/g)
  const handles = new Set<string>()
  for (const m of matches) {
    handles.add(m[1].toLowerCase())
  }
  return handles
}

/**
 * Search users by email prefix for @mention autocomplete.
 *
 * Returns up to 10 rows matching `query` (case-insensitive prefix on email).
 * RLS applies: operators see own-operator users; staff see all.
 */
export async function searchMentionUsers(query: string): Promise<MentionUser[]> {
  if (!query.trim()) return []
  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .ilike('email', `${query}%`)
    .limit(10)
  if (error) throw new Error(error.message)
  return (data ?? []) as MentionUser[]
}

/**
 * Resolve a set of handles (email local-parts) to user IDs.
 *
 * Returns a map of handle → MentionUser for those handles that matched.
 * Unresolved handles (typos, non-existent users) are silently dropped.
 */
export async function resolveMentionHandles(
  handles: Set<string>,
): Promise<Map<string, MentionUser>> {
  if (handles.size === 0) return new Map()
  // Fetch all users whose email starts with any of the handles.
  // We do a single OR query then filter locally (avoids N queries).
  const handleArr = Array.from(handles)
  // Build `email.ilike.handle%,email.ilike.handle2%` filter
  const filters = handleArr.map((h) => `email.ilike.${encodeURIComponent(h)}%`).join(',')
  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .or(filters)
    .limit(50)
  if (error) throw new Error(error.message)
  const result = new Map<string, MentionUser>()
  for (const row of data ?? []) {
    const user = row as MentionUser
    if (!user.email) continue
    const localPart = user.email.split('@')[0]?.toLowerCase()
    if (localPart && handles.has(localPart)) {
      result.set(localPart, user)
    }
  }
  return result
}

/**
 * Notify mentioned users about a comment, overriding quiet/unwatched settings.
 *
 * Calls POST /api/tickets/{ticket_id}/notify-mentions (FastAPI — side-effecting:
 * dispatches bell records + push/email echoes even for users with bell=false or
 * who aren't watching the ticket).
 *
 * Per the EPIC design, being @mentioned is the ONE event allowed to override a
 * quiet ticket.  This is deliberately a FastAPI call (not direct Supabase REST):
 * it requires service-role access to write bell records for arbitrary users.
 *
 * Does nothing if mentionedUserIds is empty.
 */
export async function notifyMentions(
  ticketId: string,
  commentId: string,
  mentionedUserIds: string[],
  commentBody: string,
): Promise<void> {
  if (mentionedUserIds.length === 0) return
  const { api } = await import('@/lib/api-client')
  await api<void>(
    'POST',
    `/api/tickets/${ticketId}/notify-mentions`,
    { comment_id: commentId, mentioned_user_ids: mentionedUserIds, body: commentBody },
  )
}

/**
 * Send a ticket to development.
 *
 * Calls POST /api/landr-staff/tickets/{ticket_id}/promote with the engineering
 * prompt written by Olaf. Returns the newly linked_bd_id and timestamp on
 * success. Per write-routing-convention this is a FastAPI call (side-effecting
 * orchestration — bd create + stamp back) not a direct Supabase write.
 *
 * Throws if the user is not landr_staff (403), the ticket is already promoted,
 * or the request otherwise fails.
 */
export async function promoteTicket(
  ticketId: string,
  prompt: string,
): Promise<PromoteTicketResult> {
  const { api } = await import('@/lib/api-client')
  return api<PromoteTicketResult>(
    'POST',
    `/api/landr-staff/tickets/${ticketId}/promote`,
    { prompt },
  )
}

// ---- drop resolution --------------------------------------------------------

/**
 * Pure drop resolver for the kanban board's DnD — extracted here (a .ts
 * module) rather than the .tsx route so the route can satisfy
 * react-refresh/only-export-components (component files export only
 * components). Imported by both TicketBoard.tsx and the tests.
 *
 * Returns null when the drop should be ignored (same column, no source item,
 * or the target column is not in DRAGGABLE_STATUSES — i.e. bd-authoritative).
 * Otherwise returns { ticketId, newStatus }.
 */
export function resolveTicketDrop(args: {
  activeId: string
  overId: string | null
  tickets: TicketRow[]
}): { ticketId: string; newStatus: TicketStatus } | null {
  const { activeId, overId, tickets } = args
  if (!overId) return null

  const dragged = tickets.find((t) => t.id === activeId)
  if (!dragged) return null

  // Resolve target column key from:
  //   - a column droppable id: `column:<status>`
  //   - a sortable card id: look up the card's current status
  const targetStatus: TicketStatus | null = overId.startsWith('column:')
    ? (overId.slice('column:'.length) as TicketStatus)
    : (tickets.find((t) => t.id === overId)?.status ?? null)

  if (!targetStatus) return null
  if (targetStatus === dragged.status) return null

  // Guard: only allow drops into human-owned (DRAGGABLE_STATUSES) columns.
  if (!DRAGGABLE_STATUSES.has(targetStatus)) return null

  // Guard: only allow drags FROM human-owned columns (shouldn't happen since
  // those cards have disabled:true on useSortable, but belt-and-suspenders).
  if (!DRAGGABLE_STATUSES.has(dragged.status)) return null

  return { ticketId: activeId, newStatus: targetStatus }
}
