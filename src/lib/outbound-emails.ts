// landr-qg4q — Settings → Email log fetcher.
//
// Reads public.outbound_emails directly via the Supabase REST client. RLS
// (apply_tenant_rls in 20260510000000_rls_helpers.sql) restricts visibility
// to the JWT bearer's operator memberships, so we just pass the operator
// id as a defensive .eq() filter on top.
//
// Status enum matches the SQL type public.outbound_email_status defined in
// 20260518000100_outbound_emails.sql: queued | sending | sent | failed. The
// dashboard surfaces all four as a coloured badge; operators usually filter
// down to 'failed' to debug "why didn't the customer get the email".
//
// Schema-of-truth: see landr-api/supabase/migrations/20260518000100_outbound_emails.sql.

import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api-client'

export const OUTBOUND_EMAIL_STATUSES = [
  'queued',
  'sending',
  'sent',
  'failed',
] as const

export type OutboundEmailStatus = (typeof OUTBOUND_EMAIL_STATUSES)[number]

export type OutboundEmailSentVia = 'gmail' | 'dev_fallback'

export type OutboundEmailRow = {
  id: string
  operator_id: string
  template_kind: string
  locale: string
  to_address: string
  subject: string
  body_html: string
  body_text: string
  related_booking_id: string | null
  status: OutboundEmailStatus
  retries: number
  last_error: string | null
  created_at: string
  sent_at: string | null
  /** How the email was dispatched. null = queued/sending/never sent. */
  sent_via: OutboundEmailSentVia | null
  /** Id of the original email this was resent from. */
  resent_from_id: string | null
}

const OUTBOUND_EMAIL_SELECT = `
  id,
  operator_id,
  template_kind,
  locale,
  to_address,
  subject,
  body_html,
  body_text,
  related_booking_id,
  status,
  retries,
  last_error,
  created_at,
  sent_at,
  sent_via,
  resent_from_id
`

export type FetchOutboundEmailsOptions = {
  /** Filter to a subset of statuses (OR). Empty/undefined = all statuses. */
  statuses?: OutboundEmailStatus[]
  /** Filter to a subset of template_kinds (OR). Empty/undefined = all kinds. */
  templateKinds?: string[]
  /** Inclusive lower bound on created_at (ISO 8601). */
  sinceIso?: string
  /** Inclusive upper bound on created_at (ISO 8601). */
  untilIso?: string
  /** Row cap. Defaults to 200 — keeps the table responsive on busy operators. */
  limit?: number
}

/**
 * Fetch the operator's outbound_emails rows, newest first.
 *
 * The dashboard renders the queue as a recent-activity table — a deep
 * audit dive would page or open Supabase Studio directly, so the default
 * cap of 200 covers "what's happened today and yesterday" without paging.
 */
export async function fetchOutboundEmails(
  operatorId: string,
  opts: FetchOutboundEmailsOptions = {},
): Promise<OutboundEmailRow[]> {
  let query = supabase
    .from('outbound_emails')
    .select(OUTBOUND_EMAIL_SELECT)
    .eq('operator_id', operatorId)

  if (opts.statuses && opts.statuses.length > 0) {
    query = query.in('status', opts.statuses)
  }

  if (opts.templateKinds && opts.templateKinds.length > 0) {
    query = query.in('template_kind', opts.templateKinds)
  }

  if (opts.sinceIso) {
    query = query.gte('created_at', opts.sinceIso)
  }
  if (opts.untilIso) {
    query = query.lte('created_at', opts.untilIso)
  }

  const limit = opts.limit ?? 200
  const { data, error } = await query
    .order('created_at', { ascending: false })
    .limit(limit)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as OutboundEmailRow[]
}

// ----- Resend email (landr-0xo6) ------------------------------------------
// POST /api/operators/{operator_id}/emails/{email_id}/resend
// Only changed fields should be sent in the body — omit unchanged ones.

export type ResendEmailPayload = {
  to_address?: string
  subject?: string
  body_html?: string
  body_text?: string
}

export type ResendEmailResult = {
  id: string
  status: OutboundEmailStatus
  sent_via: OutboundEmailSentVia | null
}

export async function resendEmail(
  operatorId: string,
  emailId: string,
  payload: ResendEmailPayload,
): Promise<ResendEmailResult> {
  return api<ResendEmailResult>(
    'POST',
    `/api/operators/${operatorId}/emails/${emailId}/resend`,
    payload,
  )
}
