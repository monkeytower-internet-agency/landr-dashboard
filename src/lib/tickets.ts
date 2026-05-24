// landr-wwhn.12 — create-ticket client. Per write-routing-convention,
// plain row writes that RLS + the audit trigger already cover go DIRECT to
// Supabase REST. A new ticket is exactly that shape: a single row INSERT with
// no derived data, no email sends, no Holded sync, no cross-table orchestration.
// The tenant RLS policies enforce operator scoping on every path; the standard
// audit_trigger captures the change.
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
//
// Internal fields (severity, linked_bd_id, promotion_prompt, ...) are REVOKE-d
// from REST roles — reporters MUST NOT set them. Triage lives in FastAPI.

import { supabase } from '@/lib/supabase'

export type TicketType = 'bug' | 'feature' | 'annoyance' | 'question'
export type TicketPerceivedImpact = 'blocking' | 'annoying' | 'idea'
export type TicketStatus = 'backlog' | 'ready' | 'in_progress' | 'in_review' | 'done'
export type TicketPriority = 'p0' | 'p1' | 'p2'

export type TicketRow = {
  id: string
  context: 'operations' | 'community'
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

// ---- Reporter type-toggle mapping ------------------------------------------
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
