import { supabase } from '@/lib/supabase'
import { CONTACT_TYPES, type ContactType } from '@/lib/contacts-filters'
import type { ContactsSort } from '@/lib/contacts-sort'
import { currentPublicUserId } from '@/lib/user-bridge'

// landr-iz58 — operator-scoped tag projected through contact_tags JOIN
// operator_tags. Same shape as BookingTagRef in lib/bookings.ts.
export type ContactTagRef = {
  id: string
  name: string
  color: string
}

export type ContactRow = {
  id: string
  operator_id: string
  first_name: string | null
  last_name: string | null
  email: string | null
  phone: string | null
  preferred_locale: string | null
  preferred_timezone: string | null
  /**
   * landr-h46a — when true the API suppresses non-transactional
   * outbound emails (reminders, marketing) for this contact.
   * Transactional kinds (booking_received, booking_confirmation,
   * hotel_request, no_show*) ignore the flag.
   */
  do_not_contact: boolean
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
  /**
   * landr-iz58 — operator-scoped tags. Present on rows returned by
   * fetchContacts; optional so legacy fixtures don't have to populate it.
   * Filtered client-side to drop soft-deleted parent tags.
   */
  tags?: ContactTagRef[]
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
  do_not_contact,
  created_at,
  updated_at,
  deleted_at,
  gdpr_erased_at,
  gdpr_erased_by_user_id,
  gdpr_erasure_note
`

// landr-iz58 — append the tag embed to the with-types select so the contact
// list renders chips inline. Embed shape matches lib/bookings.ts flattening.
const CONTACT_WITH_TYPES_SELECT = `${CONTACT_SELECT.trim()},
  types,
  contact_tags ( operator_tags ( id, name, color, deleted_at ) )
`

type RawContactTagEmbed = {
  operator_tags: { id: string; name: string; color: string; deleted_at: string | null } | null
}
type RawContactRow = Omit<ContactRow, 'tags'> & {
  contact_tags?: RawContactTagEmbed[] | null
}

function flattenContactTags(raw: RawContactRow): ContactRow {
  const tags: ContactTagRef[] = []
  for (const wrapper of raw.contact_tags ?? []) {
    const ot = wrapper.operator_tags
    if (!ot) continue
    if (ot.deleted_at) continue
    tags.push({ id: ot.id, name: ot.name, color: ot.color })
  }
  const { contact_tags: _omit, ...rest } = raw
  return { ...rest, tags }
}

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
  return ((data ?? []) as unknown as RawContactRow[]).map(flattenContactTags)
}

export type ContactTypeCounts = Record<ContactType, number>

export type FetchContactTypeCountsOptions = {
  /**
   * Whether to include GDPR-erased rows in the count. Defaults to false
   * to match the visible contacts list (which excludes erased rows on
   * the active surface). Caller decides based on the current view.
   */
  includeErased?: boolean
}

/**
 * landr-knz3 — counts of contacts per derived type for an operator.
 *
 * Reads the `contacts_with_types` view (same view that powers fetchContacts)
 * and reduces the per-row `types[]` arrays into a Record<ContactType, number>.
 * Contacts can carry multiple types (e.g. customer + attendee), so the
 * counts sum to >= the row count.
 *
 * Soft-deleted rows (`deleted_at NOT NULL`) are always excluded; GDPR-erased
 * rows are excluded by default — pass `includeErased: true` to count them too.
 *
 * v1 client-side aggregation is fine for Para42 (~30-50 contacts). When an
 * operator's contact count grows past ~1000 a server-side aggregate RPC
 * would be more efficient (see ticket DESCRIPTION performance note).
 */
export async function fetchContactTypeCounts(
  operatorId: string,
  opts: FetchContactTypeCountsOptions = {},
): Promise<ContactTypeCounts> {
  const includeErased = opts.includeErased ?? false

  let query = supabase
    .from('contacts_with_types')
    .select('types')
    .eq('operator_id', operatorId)
    .is('deleted_at', null)

  if (!includeErased) {
    query = query.is('gdpr_erased_at', null)
  }

  const { data, error } = await query.limit(5000)
  if (error) throw new Error(error.message)

  const counts: ContactTypeCounts = {
    customer: 0,
    attendee: 0,
    employee: 0,
    agent: 0,
  }

  const rows = (data ?? []) as Array<{ types: string[] | null }>
  for (const row of rows) {
    const tags = row.types ?? []
    for (const tag of tags) {
      if ((CONTACT_TYPES as ReadonlyArray<string>).includes(tag)) {
        counts[tag as ContactType] += 1
      }
    }
  }
  return counts
}

// landr-iz58 — single-contact fetch embeds tags so the detail sheet can
// pre-fill the picker without a second round-trip.
const CONTACT_WITH_TAGS_SELECT = `${CONTACT_SELECT.trim()},
  contact_tags ( operator_tags ( id, name, color, deleted_at ) )
`

export async function fetchContact(contactId: string): Promise<ContactRow> {
  const { data, error } = await supabase
    .from('contacts')
    .select(CONTACT_WITH_TAGS_SELECT)
    .eq('id', contactId)
    .single()

  if (error) throw new Error(error.message)
  return flattenContactTags(data as unknown as RawContactRow)
}

export type ContactPatch = {
  first_name?: string | null
  last_name?: string | null
  email?: string | null
  phone?: string | null
  preferred_locale?: string | null
  /** landr-h46a — opt-out flag for non-transactional outbound emails. */
  do_not_contact?: boolean
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
  // Resolve via the supabase_auth_id bridge (see lib/user-bridge.ts and the
  // rls-bridge-supabase-auth-id memory).
  const publicUserId = await currentPublicUserId(args.requestedByUserId)

  const { error } = await supabase.rpc('gdpr_erase_contact', {
    p_contact_id: args.contactId,
    p_requested_by_user_id: publicUserId,
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
