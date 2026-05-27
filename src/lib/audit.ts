// landr-aref — fetcher + helpers for the /audit route.
//
// audit_log is partitioned by month and RLS-scoped by operator_id (see
// landr-api/supabase/migrations/20260511222146_audit_log.sql). The
// dashboard reads the live partition stack directly via Supabase REST;
// FastAPI is not required because the policy on the parent table already
// scopes rows to (operator_id IS NOT NULL AND is_tenant_visible(operator_id)).
//
// Scope of this viewer:
//   - Show every row the policy allows (tenant-visible to the current
//     operator). Staff with is_landr_staff=true can also see cross-tenant
//     rows via the same policy (memory `audit-log-staff-bypass`), so this
//     viewer doubles as a cross-tenant tool for landr staff without any
//     special-casing on the dashboard side.
//   - Optional filters: table_name (entity_type), user_id (actor staff
//     user), and a [from, to] occurred_at window.
//   - Pagination: cursor-less keyset using occurred_at + id descending,
//     PAGE_SIZE rows at a time. This avoids reading the entire partition
//     stack on every filter change.

import { supabase } from '@/lib/supabase'

/** Column subset surfaced in the /audit route. */
export type AuditRow = {
  id: string
  occurred_at: string
  operator_id: string | null
  table_name: string
  row_id: string | null
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  actor_kind: string
  actor_subkind: string | null
  user_id: string | null
  external_correlation_id: string | null
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
}

/** Page size for /audit. Conservative default; can be tuned later. */
export const AUDIT_PAGE_SIZE = 50

/** Distinct-table list used to populate the entity_type filter dropdown. */
export const AUDIT_TABLE_OPTIONS = [
  'bookings',
  'contacts',
  'operators',
  'locations',
  'location_role_types',
  'products',
  'payments',
  'outbound_emails',
  'operator_memberships',
] as const

export type AuditTableOption = (typeof AUDIT_TABLE_OPTIONS)[number]

export const AUDIT_OPERATION_OPTIONS = [
  'INSERT',
  'UPDATE',
  'DELETE',
] as const

export type AuditOperation = (typeof AUDIT_OPERATION_OPTIONS)[number]

const AUDIT_SELECT = `
  id,
  occurred_at,
  operator_id,
  table_name,
  row_id,
  operation,
  actor_kind,
  actor_subkind,
  user_id,
  external_correlation_id,
  old_row,
  new_row
`

export type AuditFilters = {
  /** Limit to rows for a specific audited table (e.g. 'bookings'). */
  tableName?: string | null
  /** Limit to rows whose user_id matches (staff user UUID). */
  userId?: string | null
  /** Limit to rows whose operation matches. */
  operation?: AuditOperation | null
  /** Inclusive lower bound on occurred_at — accepts 'YYYY-MM-DD'. */
  from?: string | null
  /** Inclusive upper bound on occurred_at — accepts 'YYYY-MM-DD'. */
  to?: string | null
  /** Page index, 0-based. PAGE_SIZE rows per page. */
  page?: number
}

/**
 * Build the [from, to] range bounds as ISO timestamps. A bare date like
 * '2026-05-21' is interpreted as the full UTC day (00:00:00 → 23:59:59.999).
 *
 * Exported so the route can preview what range will be applied (and the
 * test suite can pin the semantics).
 */
export function dateBoundsToTimestamps(
  from: string | null | undefined,
  to: string | null | undefined,
): { fromIso: string | null; toIso: string | null } {
  const fromIso = from ? `${from}T00:00:00.000Z` : null
  const toIso = to ? `${to}T23:59:59.999Z` : null
  return { fromIso, toIso }
}

/**
 * Fetch a page of audit rows for the current operator, applying optional
 * filters. Order: occurred_at DESC, id DESC (stable within a single
 * timestamp). Returns at most {@link AUDIT_PAGE_SIZE} rows.
 *
 * NOTE: we do not pass operator_id to the query — the RLS policy enforces
 * tenant scoping. Adding an `.eq('operator_id', …)` here would silently
 * hide cross-tenant rows that landr staff are entitled to see.
 */
export async function fetchAuditPage(
  filters: AuditFilters = {},
): Promise<AuditRow[]> {
  const page = filters.page ?? 0
  const { fromIso, toIso } = dateBoundsToTimestamps(filters.from, filters.to)

  let query = supabase
    .from('audit_log')
    .select(AUDIT_SELECT)
    .order('occurred_at', { ascending: false })
    .order('id', { ascending: false })
    .range(page * AUDIT_PAGE_SIZE, (page + 1) * AUDIT_PAGE_SIZE - 1)

  if (filters.tableName) {
    query = query.eq('table_name', filters.tableName)
  }
  if (filters.userId) {
    query = query.eq('user_id', filters.userId)
  }
  if (filters.operation) {
    query = query.eq('operation', filters.operation)
  }
  if (fromIso) {
    query = query.gte('occurred_at', fromIso)
  }
  if (toIso) {
    query = query.lte('occurred_at', toIso)
  }

  const { data, error } = await query
  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as AuditRow[]
}

// ---- display helpers -------------------------------------------------------

const dateTimeFormatter = new Intl.DateTimeFormat('en-IE', {
  dateStyle: 'medium',
  timeStyle: 'medium',
})

export function auditDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dateTimeFormatter.format(d)
}

/**
 * Build an "actor" display string from a row. Prefers a user_id-derived
 * label when available (the /audit route does not join auth.users — that
 * would require a separate RLS-allowed view; for now we surface the raw
 * UUID alongside actor_kind).
 */
export function auditActorDisplay(row: AuditRow): string {
  const parts: string[] = [row.actor_kind]
  if (row.actor_subkind) parts.push(row.actor_subkind)
  if (row.user_id) parts.push(row.user_id.slice(0, 8))
  return parts.join(' · ')
}

/** Pretty-print the row's old_row / new_row payload for the drawer. */
export function auditPayloadJson(row: AuditRow): string {
  const payload = {
    old_row: row.old_row ?? null,
    new_row: row.new_row ?? null,
  }
  try {
    return JSON.stringify(payload, null, 2)
  } catch {
    return '{}'
  }
}
