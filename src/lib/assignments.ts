// landr-ce45 — per-day provider assignment fetchers for the analytics
// per-staff revenue card.
//
// Mirrors public.booking_day_provider_assignments + public.providers from
// landr-api migrations:
//   - 20260514080100_providers.sql
//   - 20260514080400_booking_day_provider_assignments.sql
//
// Both tables are tenant-scoped via RLS (apply_tenant_rls), so the dashboard
// just supplies operator_id and reads through the standard supabase client.
// We intentionally keep these helpers separate from `lib/staff.ts` because
// "providers" here are the operational delivery roster (the kayak instructor,
// the tandem pilot, the bus driver) — NOT the operator_memberships used by
// /settings/staff for dashboard sign-in. landr-genericity-northstar.

import { supabase } from '@/lib/supabase'

export type ProviderRow = {
  id: string
  operator_id: string
  display_name: string
  active: boolean
  sort_order: number
}

export type BookingDayProviderAssignmentRow = {
  id: string
  operator_id: string
  booking_id: string
  provider_id: string
  assignment_date: string
}

const PROVIDER_SELECT = `
  id,
  operator_id,
  display_name,
  active,
  sort_order
`

const ASSIGNMENT_SELECT = `
  id,
  operator_id,
  booking_id,
  provider_id,
  assignment_date
`

// Fetch the operator's provider roster. Includes soft-deleted=false (the
// .is('deleted_at', null) filter) so revenue attribution can still resolve
// the display_name for archived providers via the assignments fetch returning
// the provider_id as a key — but for the dropdown/listing case we only want
// active rows.
export async function fetchProviders(
  operatorId: string,
): Promise<ProviderRow[]> {
  const { data, error } = await supabase
    .from('providers')
    .select(PROVIDER_SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .order('sort_order', { ascending: true })
    .order('display_name', { ascending: true })
    .limit(500)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProviderRow[]
}

// Fetch the operator's per-day provider assignments inside [fromIso, toIso]
// (inclusive on both ends, YYYY-MM-DD strings to match the `assignment_date`
// column shape). Soft-deleted rows are excluded.
//
// The window mirrors the analytics range presets — the caller derives it
// from rangeWindowDays() / todayUtcIso() / daysAgoUtcIso() so per-staff
// revenue stays in lockstep with the rest of the page.
export async function fetchAssignments(
  operatorId: string,
  fromIso: string,
  toIso: string,
): Promise<BookingDayProviderAssignmentRow[]> {
  const { data, error } = await supabase
    .from('booking_day_provider_assignments')
    .select(ASSIGNMENT_SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)
    .gte('assignment_date', fromIso)
    .lte('assignment_date', toIso)
    .order('assignment_date', { ascending: true })
    .limit(5000)

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as BookingDayProviderAssignmentRow[]
}
