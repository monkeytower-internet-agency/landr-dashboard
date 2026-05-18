import { supabase } from '@/lib/supabase'

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

export async function fetchContacts(operatorId: string): Promise<ContactRow[]> {
  const { data, error } = await supabase
    .from('contacts')
    .select(CONTACT_SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ContactRow[]
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
  requestedByUserId: string
  jurisdictionNote: string
}): Promise<void> {
  const { error } = await supabase.rpc('gdpr_erase_contact', {
    p_contact_id: args.contactId,
    p_requested_by_user_id: args.requestedByUserId,
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
const dateTimeFormatter = new Intl.DateTimeFormat('en-IE', {
  dateStyle: 'medium',
  timeStyle: 'short',
})

export function contactDate(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dateFormatter.format(d)
}

export function contactDateTime(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return dateTimeFormatter.format(d)
}
