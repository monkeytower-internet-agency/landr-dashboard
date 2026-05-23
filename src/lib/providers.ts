// landr-funh — write helpers for the delivery roster + per-booking-day
// provider assignments. Extends the read-only analytics fetchers in
// lib/assignments.ts (fetchProviders / fetchAssignments) with the editor
// surface backed by the staff_providers FastAPI router.
//
// "Providers" here are the operational delivery roster — the kayak
// instructor, the tandem pilot, the bus driver — NOT operator_memberships
// (dashboard sign-in). landr-genericity-northstar.
//
// Reads of the roster + role taxonomy go through the FastAPI router (not the
// supabase client) because they live behind the same operator-membership
// auth gate as the writes, keeping one consistent error/permission surface.
// The analytics page keeps its direct-supabase fetchers in lib/assignments.ts
// for the realtime revenue card.

import { api } from '@/lib/api-client'

export type Provider = {
  id: string
  operator_id: string
  contact_id: string | null
  display_name: string
  default_role_id: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

export type ProviderRoleType = {
  id: string
  operator_id: string
  code: string
  label: string
  label_localized: Record<string, string> | null
  sort_order: number
  active: boolean
  created_at: string
  updated_at: string
}

export type ProviderAssignment = {
  id: string
  operator_id: string
  booking_id: string
  provider_id: string
  provider_role_id: string
  assignment_date: string
  notes: string | null
  created_at: string
  updated_at: string
}

export type ProviderCreate = {
  display_name: string
  default_role_id?: string | null
  active?: boolean
  sort_order?: number
}

export type ProviderPatch = {
  display_name?: string
  default_role_id?: string | null
  active?: boolean
  sort_order?: number
}

export type AssignmentCreate = {
  provider_id: string
  provider_role_id?: string | null
  assignment_date: string
  notes?: string | null
}

// ---- roster ---------------------------------------------------------------

export async function fetchProviderRoster(
  operatorId: string,
): Promise<Provider[]> {
  return api<Provider[]>(
    'GET',
    `/api/staff/operators/${operatorId}/providers`,
  )
}

export async function fetchProviderRoleTypes(
  operatorId: string,
): Promise<ProviderRoleType[]> {
  return api<ProviderRoleType[]>(
    'GET',
    `/api/staff/operators/${operatorId}/provider-role-types`,
  )
}

export async function createProvider(
  operatorId: string,
  body: ProviderCreate,
): Promise<Provider> {
  const payload: Record<string, unknown> = { display_name: body.display_name }
  if (body.default_role_id) payload.default_role_id = body.default_role_id
  if (body.active !== undefined) payload.active = body.active
  if (body.sort_order !== undefined) payload.sort_order = body.sort_order
  return api<Provider>(
    'POST',
    `/api/staff/operators/${operatorId}/providers`,
    payload,
  )
}

export async function updateProvider(
  operatorId: string,
  providerId: string,
  body: ProviderPatch,
): Promise<Provider> {
  const payload: Record<string, unknown> = {}
  if (body.display_name !== undefined) payload.display_name = body.display_name
  if (body.default_role_id !== undefined)
    payload.default_role_id = body.default_role_id
  if (body.active !== undefined) payload.active = body.active
  if (body.sort_order !== undefined) payload.sort_order = body.sort_order
  return api<Provider>(
    'PATCH',
    `/api/staff/operators/${operatorId}/providers/${providerId}`,
    payload,
  )
}

export async function deleteProvider(
  operatorId: string,
  providerId: string,
  reason?: string,
): Promise<void> {
  const qs = reason ? `?reason=${encodeURIComponent(reason)}` : ''
  await api(
    'DELETE',
    `/api/staff/operators/${operatorId}/providers/${providerId}${qs}`,
  )
}

// ---- per-booking-day assignments ------------------------------------------

export async function fetchBookingAssignments(
  operatorId: string,
  bookingId: string,
): Promise<ProviderAssignment[]> {
  return api<ProviderAssignment[]>(
    'GET',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/provider-assignments`,
  )
}

export async function createAssignment(
  operatorId: string,
  bookingId: string,
  body: AssignmentCreate,
): Promise<ProviderAssignment> {
  const payload: Record<string, unknown> = {
    provider_id: body.provider_id,
    assignment_date: body.assignment_date,
  }
  if (body.provider_role_id) payload.provider_role_id = body.provider_role_id
  if (body.notes) payload.notes = body.notes
  return api<ProviderAssignment>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/provider-assignments`,
    payload,
  )
}

export async function deleteAssignment(
  assignmentId: string,
): Promise<void> {
  await api('DELETE', `/api/staff/provider-assignments/${assignmentId}`)
}

// ---- helpers --------------------------------------------------------------

/** All distinct booking-days across a booking's line items, sorted asc.
 *
 * A booking_products row covers either a contiguous range
 * (date_range_start..date_range_end) or an explicit selected_days[] list. We
 * union both shapes so the per-day assignment picker offers exactly the days
 * the server's date-range guard will accept.
 */
export function bookingDayOptions(
  items: ReadonlyArray<{
    date_range_start: string | null
    date_range_end: string | null
    selected_days: string[] | null
  }>,
): string[] {
  const days = new Set<string>()
  for (const item of items) {
    if (item.selected_days && item.selected_days.length > 0) {
      for (const d of item.selected_days) days.add(d)
      continue
    }
    const { date_range_start: start, date_range_end: end } = item
    if (start && end) {
      let cursor = start
      // Iterate inclusive day-by-day. Dates are YYYY-MM-DD; build via Date in
      // UTC to avoid DST/timezone drift on the +1 day step.
      let guard = 0
      while (cursor <= end && guard < 1000) {
        days.add(cursor)
        cursor = addOneDay(cursor)
        guard += 1
      }
    } else if (start) {
      days.add(start)
    }
  }
  return Array.from(days).sort()
}

function addOneDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + 1)
  return d.toISOString().slice(0, 10)
}
