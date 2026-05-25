// landr-znzz.2 — API client for the customer-facing booking briefing
// ("event") page editor. Backend foundation shipped in landr-znzz.1.
//
// All endpoints are staff-JWT-auth and operator-scoped under
//   /api/staff/operators/{operator_id}/bookings/{booking_id}/briefing
// and go through the shared `api()` wrapper (attaches the bearer token).
//
// The briefing row carries the customer-facing CONTENT (title / welcome /
// tone / publish / review nudge) plus a per-day list of "day cards" — the
// guide's nightly update (conditions verdict + plan + meeting point).
//
// NOTE: per-participant pickup times/locations are NOT edited here — they
// live in booking_day_attendance and have their own UI. This tab only
// edits the briefing content + the per-day conditions/plan/meeting point.

import { api } from '@/lib/api-client'

// The four possible "conditions verdict" values for a day card. Mirrors the
// briefing_conditions_status enum in the 20260525120000 migration.
export const BRIEFING_CONDITIONS = [
  'pending',
  'go',
  'marginal',
  'no_go',
] as const
export type BriefingConditionsStatus = (typeof BRIEFING_CONDITIONS)[number]

// The tone presets offered in the editor. The column is free text with a
// 'playful' default; we constrain the editor UI to these three.
export const BRIEFING_TONES = ['playful', 'calm', 'minimal'] as const
export type BriefingTone = (typeof BRIEFING_TONES)[number]

export type BriefingDay = {
  id: string
  briefing_id: string
  booking_id: string
  operator_id: string
  day_date: string // YYYY-MM-DD
  conditions_status: BriefingConditionsStatus
  conditions_note: string | null
  plan_headline: string | null
  plan_detail: string | null
  meeting_point_text: string | null
  content: Record<string, unknown>
  is_published: boolean
  published_at: string | null
  created_at: string
  updated_at: string
}

export type Briefing = {
  id: string
  operator_id: string
  booking_id: string
  public_token: string
  public_url: string
  token_expires_at: string
  is_published: boolean
  title: string | null
  welcome_note: string | null
  tone: string
  content: Record<string, unknown>
  show_reviews: boolean
  review_url: string | null
  created_at: string
  updated_at: string
  days: BriefingDay[]
}

// The briefing row as returned by rotate-token (no `days` array). We merge
// the existing days back in on the client so the cache stays whole.
export type BriefingRow = Omit<Briefing, 'days'>

export type BriefingPatch = {
  title?: string | null
  welcome_note?: string | null
  tone?: string
  content?: Record<string, unknown>
  is_published?: boolean
  show_reviews?: boolean
  review_url?: string | null
}

export type BriefingDayPatch = {
  conditions_status?: BriefingConditionsStatus
  conditions_note?: string | null
  plan_headline?: string | null
  plan_detail?: string | null
  meeting_point_text?: string | null
  content?: Record<string, unknown>
  is_published?: boolean
}

function briefingPath(operatorId: string, bookingId: string): string {
  return `/api/staff/operators/${operatorId}/bookings/${bookingId}/briefing`
}

/**
 * GET the briefing for a booking. Returns the row + day cards, or `null`
 * when none exists yet (the API 404s with detail "briefing_not_found").
 * Any other error propagates.
 */
export async function fetchBriefing(
  operatorId: string,
  bookingId: string,
): Promise<Briefing | null> {
  try {
    return await api<Briefing>('GET', briefingPath(operatorId, bookingId))
  } catch (err) {
    if (isBriefingNotFound(err)) return null
    throw err
  }
}

/** True when the error is the API's "no briefing yet" 404. */
function isBriefingNotFound(err: unknown): boolean {
  if (err instanceof Error) {
    return err.message.includes('briefing_not_found')
  }
  return false
}

/**
 * POST to ensure-create the briefing (idempotent). Returns the row + days
 * — a second call returns the existing row rather than minting a new token.
 */
export async function createBriefing(
  operatorId: string,
  bookingId: string,
): Promise<Briefing> {
  return api<Briefing>('POST', briefingPath(operatorId, bookingId))
}

/** PATCH the briefing content/publish/review fields. Returns the row + days. */
export async function patchBriefing(
  operatorId: string,
  bookingId: string,
  patch: BriefingPatch,
): Promise<Briefing> {
  return api<Briefing>('PATCH', briefingPath(operatorId, bookingId), patch)
}

/**
 * PUT one day card — the guide's "tonight's update". Upserts; returns the
 * single day row (NOT the full briefing), so callers should invalidate /
 * refetch the briefing query to fold it back in.
 */
export async function putBriefingDay(
  operatorId: string,
  bookingId: string,
  dayDate: string,
  patch: BriefingDayPatch,
): Promise<BriefingDay> {
  return api<BriefingDay>(
    'PUT',
    `${briefingPath(operatorId, bookingId)}/days/${dayDate}`,
    patch,
  )
}

/**
 * POST rotate-token — revoke the current public link and mint a new one.
 * Returns the briefing row (without `days`).
 */
export async function rotateBriefingToken(
  operatorId: string,
  bookingId: string,
): Promise<BriefingRow> {
  return api<BriefingRow>(
    'POST',
    `${briefingPath(operatorId, bookingId)}/rotate-token`,
  )
}

// ---- display helpers -------------------------------------------------------

/** Look up a day card by its ISO date, or null when not yet created. */
export function findDay(
  briefing: Briefing | null | undefined,
  dayDate: string,
): BriefingDay | null {
  if (!briefing) return null
  return briefing.days.find((d) => d.day_date === dayDate) ?? null
}

/**
 * Build the WhatsApp share deep-link. When a customer phone is supplied (and
 * non-blank) we target that chat directly (`wa.me/{digits}`); otherwise we
 * open the generic share sheet. The phone is reduced to digits — wa.me
 * rejects '+', spaces and punctuation.
 */
export function whatsappShareUrl(
  publicUrl: string,
  greeting: string,
  phone?: string | null,
): string {
  const text = encodeURIComponent(`${greeting} ${publicUrl}`.trim())
  const digits = (phone ?? '').replace(/\D/g, '')
  if (digits) return `https://wa.me/${digits}?text=${text}`
  return `https://wa.me/?text=${text}`
}
