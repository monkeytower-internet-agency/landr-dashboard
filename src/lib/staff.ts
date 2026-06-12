import { supabase } from '@/lib/supabase'
import { formatDate } from '@/lib/time-format'

// Mirrors public.operator_memberships from
// landr-api/supabase/migrations/20260511222454_operator_memberships.sql.
//
// Roles are stored as free-text in `role`; we surface a curated list in the
// UI but the DB does not enforce an enum. Permissions is `jsonb` (nullable);
// shape is operator-controlled — for now we store a flat string-keyed map.
export type StaffPermissions = Record<string, unknown>

export type StaffRow = {
  id: string
  operator_id: string
  user_id: string
  contact_id: string | null
  role: string
  permissions: StaffPermissions | null
  created_at: string
  updated_at: string
  contact: {
    id: string
    first_name: string | null
    last_name: string | null
  } | null
  user: {
    id: string
    email: string | null
    is_landr_staff: boolean
  } | null
}

// Built-in role suggestions. Free-text in DB; the select is `<datalist>`-style
// (NativeSelect with a fallback "Custom…" option would be overkill for a
// dashboard with one operator). Keep the list short and meaningful.
export const STAFF_ROLE_OPTIONS = [
  'owner',
  'admin',
  'staff',
  'provider',
  'finance',
  'readonly',
] as const

const STAFF_SELECT = `
  id,
  operator_id,
  user_id,
  contact_id,
  role,
  permissions,
  created_at,
  updated_at,
  user:users ( id, email, is_landr_staff ),
  contact:contacts ( id, first_name, last_name )
`

export async function fetchStaff(operatorId: string): Promise<StaffRow[]> {
  const { data, error } = await supabase
    .from('operator_memberships')
    .select(STAFF_SELECT)
    .eq('operator_id', operatorId)
    .order('created_at', { ascending: true })
    .limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as StaffRow[]
}

// Look up a public.users row by email (case-insensitive). Used by the
// invite-by-email flow to find an existing global identity to link.
//
// Returns null if no user has signed up with that email yet (the dashboard
// cannot create auth.users rows from the client — that would require the
// service role or a server-side endpoint, which the Gmail-OAuth slice
// landr-m05.15 is meant to provide).
export async function findUserByEmail(email: string): Promise<{
  id: string
  email: string | null
} | null> {
  const trimmed = email.trim().toLowerCase()
  if (!trimmed) return null

  const { data, error } = await supabase
    .from('users')
    .select('id, email')
    .ilike('email', trimmed)
    .limit(1)
    .maybeSingle()

  if (error) throw new Error(error.message)
  return data ?? null
}

export type CreateMembershipPayload = {
  operator_id: string
  user_id: string
  role: string
  permissions: StaffPermissions | null
}

export async function createMembership(
  payload: CreateMembershipPayload,
): Promise<StaffRow> {
  const { data, error } = await supabase
    .from('operator_memberships')
    .insert(payload)
    .select(STAFF_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as StaffRow
}

export type UpdateMembershipPayload = {
  role?: string
  permissions?: StaffPermissions | null
}

export async function updateMembership(
  id: string,
  payload: UpdateMembershipPayload,
): Promise<StaffRow> {
  const { data, error } = await supabase
    .from('operator_memberships')
    .update(payload)
    .eq('id', id)
    .select(STAFF_SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as StaffRow
}

// operator_memberships has no `deleted_at` column (Decision #53 — it's a
// join table, not a domain entity). Use a hard delete here.
export async function deleteMembership(id: string): Promise<void> {
  const { error } = await supabase
    .from('operator_memberships')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

// ---- Permissions JSON helpers ---------------------------------------------

// Pretty-print permissions for the textarea editor. We keep this stable so
// re-opening the sheet on the same row produces deterministic text (and so
// the round-trip JSON.parse(JSON.stringify(x)) is identity).
export function permissionsToText(p: StaffPermissions | null): string {
  if (p === null || p === undefined) return ''
  try {
    return JSON.stringify(p, null, 2)
  } catch {
    return ''
  }
}

// Parse a permissions JSON blob from the editor. Returns:
//   - { ok: true, value: null }  for empty / blank input
//   - { ok: true, value: <obj> } for a valid JSON object
//   - { ok: false, error: '…' }  for invalid JSON or non-object payloads
export type ParsePermissionsResult =
  | { ok: true; value: StaffPermissions | null }
  | { ok: false; error: string }

export function parsePermissions(text: string): ParsePermissionsResult {
  const trimmed = text.trim()
  if (!trimmed) return { ok: true, value: null }
  let parsed: unknown
  try {
    parsed = JSON.parse(trimmed)
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Invalid JSON'
    return { ok: false, error: msg }
  }
  if (
    parsed === null ||
    typeof parsed !== 'object' ||
    Array.isArray(parsed)
  ) {
    return {
      ok: false,
      error: 'Permissions must be a JSON object (e.g. { "manage_bookings": true }).',
    }
  }
  return { ok: true, value: parsed as StaffPermissions }
}

// ---- Display helpers -------------------------------------------------------

/**
 * Format an ISO date string as a medium-style date.
 * Thin wrapper over `formatDate` from `@/lib/time-format` (landr-v9e4.4).
 */
export function staffDate(iso: string | null): string {
  return formatDate(iso)
}

export function staffEmailDisplay(row: StaffRow): string {
  return row.user?.email ?? '—'
}

export function staffNameDisplay(row: StaffRow): string {
  const name = [row.contact?.first_name, row.contact?.last_name]
    .filter(Boolean)
    .join(' ')
    .trim()
  return name || staffEmailDisplay(row)
}

export function permissionsSummary(p: StaffPermissions | null): string {
  if (!p) return '—'
  const keys = Object.keys(p)
  if (keys.length === 0) return '—'
  return `${keys.length} key${keys.length === 1 ? '' : 's'}`
}
