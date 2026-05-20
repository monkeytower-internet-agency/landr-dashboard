import { supabase } from '@/lib/supabase'
import type { ContactType } from '@/lib/contacts-filters'
import type { ContactsSort } from '@/lib/contacts-sort'

export type ContactRow = {
  id: string
  operator_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  preferred_locale: string | null
  preferred_timezone: string | null
  created_at: string
  updated_at: string
  deleted_at: string | null
  gdpr_erased_at: string | null
  gdpr_erased_by_user_id: string | null
  gdpr_erasure_note: string | null
  /**
   * landr-pqk — derived type tags from the contacts_with_types view.
   * Present on rows returned by fetchContacts; optional so callers that
   * fetch a bare contact (fetchContact) don't have to populate it.
   */
  types?: ContactType[]
}

const CONTACT_SELECT = `
  id,
  operator_id,
  first_name,
  last_name,
  email,
  phone,
  preferred_locale,
  preferred_timezone,
  created_at,
  updated_at,
  deleted_at,
  gdpr_erased_at,
  gdpr_erased_by_user_id,
  gdpr_erasure_note
`

const CONTACT_WITH_TYPES_SELECT = `${CONTACT_SELECT.trim()},\n  types`

export type FetchContactsOptions = {
  sort?: ContactsSort
  /** OR-within-dimension: rows matching ANY of the listed types. Empty = all. */
  types?: ContactType[]
  /**
   * landr-dp45 — include GDPR-erased tombstones in the result.
   * Default `false` hides rows where `gdpr_erased_at IS NOT NULL`; the
   * `deleted_at IS NULL` filter is a separate concern and always applies.
   */
  includeErased?: boolean
}

/**
 * landr-pqk — fetch the contacts list with optional sort + type filter
 * applied server-side via the contacts_with_types view.
 *
 * Sort modes map to ORDER BY:
 *   created_at_desc — Recently added (default)
 *   updated_at_desc — Recently changed
 *   name_asc        — Alphabetical (last_name, then first_name)
 *
 * Type filter is OR-of-tags: a contact passes if its `types` array
 * overlaps ANY of the requested types (PostgREST `ov` / SQL `&&`).
 *
 * landr-dp45 — when `opts.includeErased` is omitted/false, also filters
 * out GDPR-erased tombstones (`gdpr_erased_at IS NULL`). The toggle on
 * ContactsFilters flips this on so operators can audit-verify an erase
 * without digging into audit_log.
 */
export async function fetchContacts(
  operatorId: string,
  opts: FetchContactsOptions = {},
): Promise<ContactRow[]> {
  const sort = opts.sort ?? 'created_at_desc'
  let query = supabase
    .from('contacts_with_types')
    .select(CONTACT_WITH_TYPES_SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)

  if (!opts.includeErased) {
    query = query.is('gdpr_erased_at', null)
  }

  if (opts.types && opts.types.length > 0) {
    // PostgREST overlap operator on a text[] column: at least one tag matches.
    query = query.overlaps('types', opts.types)
  }

  if (sort === 'created_at_desc') {
    query = query.order('created_at', { ascending: false })
  } else if (sort === 'updated_at_desc') {
    query = query.order('updated_at', { ascending: false })
  } else {
    // Alphabetical — nulls last so '—'/anonymous contacts don't lead.
    query = query
      .order('last_name', { ascending: true, nullsFirst: false })
      .order('first_name', { ascending: true, nullsFirst: false })
  }

  const { data, error } = await query.limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ContactRow[]
}

export async function fetchContact(contactId: string): Promise<ContactRow> {
  const { data, error } = await supabase
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('id', contactId)
    .single()

  if (error) throw new Error(error.message)
  return data as unknown as ContactRow
}

export type ContactPatch = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  preferred_locale?: string | null
}

/** PATCH a contact row via Supabase REST direct (RLS-gated, no side effects). */
export async function patchContact(
  contactId: string,
  patch: ContactPatch,
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', contactId)
  if (error) throw new Error(error.message)
}

export type AuditLogRow = {
  id: string
  occurred_at: string
  table_name: string
  row_id: string | null
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  actor_kind: string
  actor_subkind: string | null
  user_id: string | null
}

export async function fetchContactAuditLog(
  contactId: string,
): Promise<AuditLogRow[]> {
  const { data, error } = await supabase
    .from('audit_log')
    .select(
      'id, occurred_at, table_name, row_id, operation, actor_kind, actor_subkind, user_id',
    )
    .eq('table_name', 'contacts')
    .eq('row_id', contactId)
    .order('occurred_at', { ascending: false })
    .limit(100)

  if (error) throw new Error(error.message)
  return (data ?? []) as AuditLogRow[]
}

/**
 * Trigger the server-side GDPR erase procedure for a contact.
 * Wraps the `gdpr_erase_contact(p_contact_id, p_requested_by_user_id,
 * p_jurisdiction_note)` plpgsql function (Decision #69, 5-step PII scrub).
 *
 * Idempotent server-side: a second call is a no-op once gdpr_erased_at is set.
 */
export async function gdprEraseContact(args: {
  contactId: string
  /** Caller passes the supabase auth.uid; we bridge to public.users.id here. */
  requestedByUserId: string
  jurisdictionNote: string
}): Promise<void> {
  // contacts.gdpr_erased_by_user_id FKs public.users(id), not auth.users(id).
  // Resolve via the supabase_auth_id bridge (rls-bridge-supabase-auth-id memory).
  const { data: userRow, error: userErr } = await supabase
    .from('users')
    .select('id')
    .eq('supabase_auth_id', args.requestedByUserId)
    .maybeSingle()
  if (userErr) throw new Error(userErr.message)
  if (!userRow) throw new Error('public.users row not found for current session')

  const { error } = await supabase.rpc('gdpr_erase_contact', {
    p_contact_id: args.contactId,
    p_requested_by_user_id: userRow.id,
    p_jurisdiction_note: args.jurisdictionNote,
  })
  if (error) throw new Error(error.message)
}

// ----- Display helpers ----------------------------------------------------

export function contactNameDisplay(row: ContactRow): string {
  const name = [row.first_name, row.last_name]
    .filter((s): s is string => !!s && s.trim().length > 0)
    .join(' ')
    .trim()
  if (name) return name
  return row.email ?? row.phone ?? '—'
}

export function contactIsErased(row: ContactRow): boolean {
  return row.gdpr_erased_at !== null
}

const dateFormatter = new Intl.DateTimeFormat('en-IE', {
  dateStyle: 'medium',
})

// landr-f1s — date + time-of-day display. Hour cycle follows the operator's
// time_format_24h preference (passed by the caller via opts.hour12).
// NOTE: Intl.DateTimeFormat forbids mixing dateStyle/timeStyle with the
// per-component options (year, hour, minute, …); we use the per-component
// form so hourCycle takes effect.
const _dateTimeFormatters: Record<'h12' | 'h23', Intl.DateTimeFormat> = {
  h12: new Intl.DateTimeFormat('en-IE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h12',
  }),
  h23: new Intl.DateTimeFormat('en-IE', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }),
}

export function contactDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dateFormatter.format(d)
}

export function contactDateTime(
  iso: string | null,
  opts?: { hour12?: boolean },
): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return _dateTimeFormatters[opts?.hour12 ? 'h12' : 'h23'].format(d)
}
