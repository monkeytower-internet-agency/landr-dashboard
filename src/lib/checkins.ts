// landr-znzz.8 — API client + helpers for the operator "retrieve board".
//
// Backend foundation shipped in landr-znzz.4 (the check-in + retrieve
// backbone). The board lists every check-in for one operator on one day and
// lets the operator drive the pickup workflow (retrieve_state / retrieve_note).
//
// Concrete driver (paragliding guided tour, but the model is generic): a guide
// drives a group up to a takeoff; flyers either land at the designated LZ
// (arrived_designated), fly cross-country and land elsewhere (arrived_elsewhere
// + dropped pin), or are still out (in_progress — the overdue-risk row the
// guide watches). The retrieve workflow is operator-defined free text, so a
// kayak / ski / climbing operator runs whatever pickup process they like.
//
// Both endpoints are staff-JWT-auth and operator-scoped under
//   /api/staff/operators/{operator_id}/checkins
// and go through the shared `api()` wrapper (attaches the bearer token).
// Mirrors the sibling client module booking-briefing.ts (landr-znzz.2).

import { api } from '@/lib/api-client'

// The customer-set activity status. Mirrors the briefing_checkin_status enum
// in the 20260525130000_booking_checkin migration. NOT settable from the
// board — the operator only drives retrieve_state / retrieve_note.
export const CHECKIN_STATUSES = [
  'in_progress', // not yet finished — still out (overdue risk)
  'arrived_elsewhere', // finished elsewhere; lat/lng carry the dropped pin
  'arrived_designated', // finished at the designated end point (LZ / meeting point)
] as const
export type CheckinStatus = (typeof CHECKIN_STATUSES)[number]

// Operator-set retrieve workflow chips. The column is free text by design
// (each operator runs their own pickup process), so the board offers these
// conventional values as one-tap chips but tolerates any string the API
// returns (e.g. a value set via the API directly).
export const RETRIEVE_STATES = [
  'pending',
  'driver_assigned',
  'collected',
] as const
export type RetrieveState = (typeof RETRIEVE_STATES)[number]

export type Checkin = {
  id: string
  booking_id: string
  booking_participant_id: string
  day_date: string // YYYY-MM-DD
  status: CheckinStatus
  // Dropped pin for arrived_elsewhere. Nullable: arrived_designated and
  // in_progress carry no pin.
  latitude: number | null
  longitude: number | null
  // Free-text customer note ("landed in a field by the church, all good").
  note: string | null
  // Operator-set retrieve workflow state — free text, NULL until touched.
  retrieve_state: string | null
  // Operator-set retrieve note ("Tom's on his way, 20 min").
  retrieve_note: string | null
  // Participant name, joined server-side through booking_participants ->
  // contacts. Either can be null (anonymous / incomplete contact).
  first_name: string | null
  last_name: string | null
  created_at: string
  updated_at: string
}

// The GET response wraps the list in an object alongside the echoed day_date.
export type CheckinBoard = {
  day_date: string
  checkins: Checkin[]
}

export type RetrievePatch = {
  retrieve_state?: string | null
  retrieve_note?: string | null
}

function boardPath(operatorId: string): string {
  return `/api/staff/operators/${operatorId}/checkins`
}

/**
 * GET the retrieve board for one operator + one day. Returns the (possibly
 * empty) list of check-ins, newest activity last (server orders by created_at).
 */
export async function fetchCheckins(
  operatorId: string,
  dayDate: string,
): Promise<Checkin[]> {
  const board = await api<CheckinBoard>(
    'GET',
    `${boardPath(operatorId)}?day_date=${encodeURIComponent(dayDate)}`,
  )
  return board?.checkins ?? []
}

/**
 * PATCH the operator-set retrieve fields on one check-in. Sends only the
 * supplied keys (the server writes only explicitly-set fields). Returns the
 * single updated check-in row.
 */
export async function patchCheckinRetrieve(
  operatorId: string,
  checkinId: string,
  patch: RetrievePatch,
): Promise<Checkin> {
  return api<Checkin>(
    'PATCH',
    `${boardPath(operatorId)}/${checkinId}`,
    patch,
  )
}

// ---- display helpers -------------------------------------------------------

/**
 * Board sort order: still-out first (the overdue-risk rows the guide most
 * needs to see), then arrived-elsewhere (needs a pickup decision), then
 * arrived-designated (already home). Stable within a status by created_at.
 */
const STATUS_ORDER: Record<CheckinStatus, number> = {
  in_progress: 0,
  arrived_elsewhere: 1,
  arrived_designated: 2,
}

export function sortCheckinsForBoard(checkins: Checkin[]): Checkin[] {
  return [...checkins].sort((a, b) => {
    const byStatus =
      (STATUS_ORDER[a.status] ?? 99) - (STATUS_ORDER[b.status] ?? 99)
    if (byStatus !== 0) return byStatus
    return a.created_at.localeCompare(b.created_at)
  })
}

export type StatusMeta = {
  label: string
  // Tailwind utility classes for the status chip (bg + text).
  chipClass: string
  // True for the still-out / overdue-risk status, which the board highlights.
  isOverdueRisk: boolean
}

const STATUS_META: Record<CheckinStatus, StatusMeta> = {
  in_progress: {
    label: 'Still out',
    chipClass:
      'bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200',
    isOverdueRisk: true,
  },
  arrived_elsewhere: {
    label: 'Landed elsewhere',
    chipClass:
      'bg-sky-100 text-sky-900 dark:bg-sky-950 dark:text-sky-200',
    isOverdueRisk: false,
  },
  arrived_designated: {
    label: 'Landed at LZ',
    chipClass:
      'bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200',
    isOverdueRisk: false,
  },
}

/** Label + chip colour + overdue flag for a status (tolerant of unknowns). */
export function statusMeta(status: string): StatusMeta {
  return (
    STATUS_META[status as CheckinStatus] ?? {
      label: status,
      chipClass: 'bg-muted text-muted-foreground',
      isOverdueRisk: false,
    }
  )
}

/** Display name for a check-in row, falling back gracefully. */
export function checkinDisplayName(checkin: Checkin): string {
  const parts = [checkin.first_name, checkin.last_name].filter(
    (p): p is string => !!p && p.trim() !== '',
  )
  return parts.length > 0 ? parts.join(' ') : 'Unnamed participant'
}

/**
 * Whether a check-in carries a usable dropped pin (both coords present and
 * finite). arrived_elsewhere rows should; the others won't.
 */
export function hasPin(checkin: Checkin): boolean {
  return (
    typeof checkin.latitude === 'number' &&
    Number.isFinite(checkin.latitude) &&
    typeof checkin.longitude === 'number' &&
    Number.isFinite(checkin.longitude)
  )
}

/**
 * OpenStreetMap deep-link to the dropped pin (a marker + sensible zoom).
 * Returns null when the check-in has no usable coords. We use OSM rather than
 * Google Maps so it opens without a logged-in Google account and on any
 * device; the URL also degrades gracefully on desktop.
 */
export function mapUrl(checkin: Checkin): string | null {
  if (!hasPin(checkin)) return null
  const lat = checkin.latitude as number
  const lng = checkin.longitude as number
  return (
    `https://www.openstreetmap.org/?mlat=${lat}&mlon=${lng}` +
    `#map=16/${lat}/${lng}`
  )
}

/** Short, readable "lat, lng" label for the dropped pin (5 dp ≈ 1 m). */
export function coordsLabel(checkin: Checkin): string | null {
  if (!hasPin(checkin)) return null
  const lat = (checkin.latitude as number).toFixed(5)
  const lng = (checkin.longitude as number).toFixed(5)
  return `${lat}, ${lng}`
}

/** Local YYYY-MM-DD for today, for the day-picker default. */
export function todayIso(): string {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}
