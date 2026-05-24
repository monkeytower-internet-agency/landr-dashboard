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
