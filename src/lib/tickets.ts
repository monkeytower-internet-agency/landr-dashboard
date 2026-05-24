// landr-wwhn.11 — ticket data layer.
//
// Supabase `tickets` is the customer-facing system of record. bd is the
// engineering execution engine (Trillian-only, NOT reachable from this
// client). They are bridged, not merged.
//
// RLS matrix:
//   * Operators: SELECT on public columns for own-org rows (operator_id match
//     via membership). INSERT/UPDATE on public writable columns.
//   * Staff (is_landr_staff): full cross-tenant read + internal fields via
//     the tickets_staff SECURITY DEFINER view (SELECT only — writes to internal
//     fields go through FastAPI service-role routers).
//
// Column-level visibility: internal columns (severity, linked_bd_id,
// promotion_prompt, sync_status, …) are REVOKE-d from `authenticated`.
// This layer ONLY reads/writes the public surface. Staff detail reads
// go through fetchTicketsStaff() which queries tickets_staff.

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

// ---- column definitions for the board ---------------------------------------

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
