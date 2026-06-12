import type { QueryClient } from '@tanstack/react-query'

import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api-client'
import { getCurrencyFormatter } from '@/lib/format-currency'
import { formatDateTime } from '@/lib/time-format'
// landr-g2m5 — single source of truth for the product_kind enum lives in
// lib/products.ts. Re-export here so existing `from '@/lib/bookings'`
// consumers keep compiling without changes.
import type { ProductKind } from '@/lib/products'

export type { ProductKind }

export type BookingSemanticState =
  | 'pending'
  | 'confirmed'
  | 'finalised'
  | 'cancelled'
  | 'no_show'

// landr-a4pl.3 — derived per-booking Holded transfer status for Views.
// Maps the latest external_sync_log.status for action='invoice_push' /
// external_target='holded' onto a UI-facing 5-value enum:
//   succeeded       → 'transferred'
//   pending         → 'pending'
//   in_flight       → 'pending'  (in transit; still counts as pending to the operator)
//   failed          → 'failed'
//   blocked_on_human→ 'blocked'
//   no row          → 'none'
export type HoldedStatus = 'transferred' | 'pending' | 'failed' | 'blocked' | 'none'

// Mirrors public.service_time_shape enum. NULL for non-service products.
export type ServiceTimeShape =
  | 'single_date'
  | 'days_range'
  | 'fixed_window'
  | 'time_slot'

// landr-lx7s — formerly `BookingItem`; renamed to `BookingProduct` to clear
// the name collision with views-bookings-data.ts's `BookingItem = BookingRow`
// alias. This shape is a single booking_products line (one product within a
// booking); the View layer's `BookingItem` is the row-level aggregate.
export type BookingProduct = {
  id: string
  date_range_start: string | null
  date_range_end: string | null
  selected_days: string[] | null
  products: {
    id: string
    name: string
    // landr-1lj — surface kind + time shape so the filter bar can match
    // booking rows. Both columns are NOT NULL / nullable per the
    // product_kinds_refactor migration (landr-glx).
    product_kind: ProductKind
    service_time_shape: ServiceTimeShape | null
  } | null
}

// landr-1lj — booking_participants brings the pickup_location_id for the
// pickup-location filter. We hydrate the location id+name via the FK join.
export type BookingParticipant = {
  id: string
  pickup_location: { id: string; name: string } | null
}

// landr-aqn4 — approval_trace shape mirrored from the FastAPI router
// (`app/routers/public_bookings.py::_serialize_capacity_verdict`) and the
// pure-Python evaluator (`app/services/approval.py::FiredRule`). The
// dashboard only reads the fields it needs for filtering / display; the
// real column is `jsonb` so unknown keys are tolerated.
export type ApprovalAppliedRule = {
  rule_id?: string
  rule_kind?: string
  rule_code?: string
  outcome?: string
  detail?: Record<string, unknown>
}

export type ApprovalTrace = {
  outcome?: string
  applied_rules?: ApprovalAppliedRule[]
  // Tolerated freeform keys (e.g. capacity_verdict, has_hotel_products):
  [key: string]: unknown
}

// landr-iz58 — operator-scoped tag projected through booking_tags JOIN
// operator_tags. Soft-deleted tags fall out via the operator_tags
// deleted_at IS NULL filter inside the embed.
export type BookingTagRef = {
  id: string
  name: string
  color: string
}

export type BookingRow = {
  id: string
  created_at: string
  current_semantic_state: BookingSemanticState
  current_stage: { code: string } | null
  gross_total: number | string
  // landr-okxm — outstanding balance, surfaced so the Mark-as-paid sheet
  // can prefill the amount input with the remaining due. Optional on the
  // type so existing fixtures / mocks don't have to populate it; SELECT
  // adds the column unconditionally.
  balance_due?: number | string | null
  // landr-39he — operator-collected subtotal (excludes paid_to=hotel lines).
  // Stamped at booking submit by the API. For pure-operator bookings this
  // equals gross_total. For mixed operator+hotel bookings this is the
  // operator-side slice that balance_due is derived from (server trigger
  // uses COALESCE(override, operator_gross_total, gross_total)). Optional
  // on the type so legacy fixtures / mocks don't have to populate it;
  // balanceDueOf falls back gracefully when null/absent.
  operator_gross_total?: number | string | null
  // landr-puix — manual price override applied by an operator via
  // POST /api/staff/operators/{op}/bookings/{id}/price-override. When
  // non-null the dashboard surfaces it in place of gross_total (italic +
  // amber affordance via priceDisplay) and balance_due is derived from
  // it server-side. Cleared via the DELETE on the same path. Optional
  // on the type so legacy fixtures / mocks don't have to populate the
  // fields; SELECT projects them unconditionally.
  override_gross_total?: number | string | null
  override_reason?: string | null
  override_applied_at?: string | null
  currency: string
  // landr-aqn4 — surfaced for the Approvals queue (reason / capacity /
  // first-time-customer signals). Nullable for legacy bookings; optional
  // on the type because existing callers (BookingsTable / Calendar /
  // reporting) don't depend on it and their fixtures omit the field.
  approval_trace?: ApprovalTrace | null
  customer: {
    id: string
    first_name: string | null
    last_name: string | null
    email: string | null
    phone: string | null
  } | null
  items: BookingProduct[]
  participants?: BookingParticipant[]
  // landr-iz58 — chips on the row + picker pre-fill on the detail sheet.
  // Optional on the type so legacy fixtures / mocks don't have to populate
  // it. The Supabase embed filters out soft-deleted parent tags so this
  // array only ever contains active labels.
  tags?: BookingTagRef[]
  // landr-a4pl.3 — derived from the latest external_sync_log row for this
  // booking (action='invoice_push', external_target='holded'). Optional so
  // existing fixtures / mocks don't have to populate it; extractors default
  // to 'none' when absent.
  holded_status?: HoldedStatus
}

// landr-iz58 — `tags` embed projects operator_tags through booking_tags.
// We can't filter inside the nested embed for soft-deleted parent tags via
// PostgREST without an inner-join; instead we map the result client-side
// in fetchBookings + drop rows where the operator_tags side is null
// (which happens when the tag was soft-deleted or hard-deleted).
//
// landr-a4pl.3 — `holded_sync:external_sync_log` embeds the latest
// invoice_push rows so we can derive holded_status client-side.
// PostgREST embeds don't support LIMIT 1 per-row; we embed up to 5 rows
// (Holded retries up to max_attempts times) ordered by created_at desc
// and pick the first in normaliseBookingRow.
const SELECT = `
  id,
  created_at,
  current_semantic_state,
  current_stage:booking_lifecycle_stages!current_stage_id ( code ),
  gross_total,
  balance_due,
  override_gross_total,
  override_reason,
  override_applied_at,
  currency,
  approval_trace,
  customer:contacts!inner ( id, first_name, last_name, email, phone ),
  items:booking_products ( id, date_range_start, date_range_end, selected_days, products ( id, name, product_kind, service_time_shape ) ),
  participants:booking_participants ( id, pickup_location:locations!pickup_location_id ( id, name ) ),
  booking_tags ( operator_tags ( id, name, color, deleted_at ) ),
  holded_sync:external_sync_log ( status, created_at )
`

type RawBookingTagEmbed = {
  operator_tags: { id: string; name: string; color: string; deleted_at: string | null } | null
}

// landr-a4pl.3 — raw shape of the external_sync_log embed rows.
// status mirrors public.external_sync_status enum values.
type RawHoldedSyncRow = {
  status: 'pending' | 'in_flight' | 'succeeded' | 'failed' | 'blocked_on_human'
  created_at: string
}

type RawBookingRow = Omit<BookingRow, 'tags' | 'holded_status'> & {
  booking_tags?: RawBookingTagEmbed[] | null
  // landr-a4pl.3 — all embed rows returned by PostgREST; empty array when
  // the booking has no external_sync_log entry.
  holded_sync?: RawHoldedSyncRow[] | null
}

/** landr-a4pl.3 — derive HoldedStatus from the latest external_sync_log row.
 *  PostgREST returns the embed rows in insertion order; we find the most
 *  recent one by created_at then map the DB status to the UI enum. */
function deriveHoldedStatus(rows: RawHoldedSyncRow[] | null | undefined): HoldedStatus {
  if (!rows || rows.length === 0) return 'none'
  // Find the latest row by created_at (lexicographic ISO string compare is safe).
  let latest = rows[0]
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].created_at > latest.created_at) latest = rows[i]
  }
  switch (latest.status) {
    case 'succeeded':
      return 'transferred'
    case 'pending':
    case 'in_flight':
      return 'pending'
    case 'failed':
      return 'failed'
    case 'blocked_on_human':
      return 'blocked'
    default:
      return 'none'
  }
}

function normaliseBookingRow(raw: RawBookingRow): BookingRow {
  const tags: BookingTagRef[] = []
  for (const wrapper of raw.booking_tags ?? []) {
    const ot = wrapper.operator_tags
    if (!ot) continue // tag was hard-deleted
    if (ot.deleted_at) continue // tag was soft-deleted
    tags.push({ id: ot.id, name: ot.name, color: ot.color })
  }
  const holded_status = deriveHoldedStatus(raw.holded_sync)
  const { booking_tags: _omitTags, holded_sync: _omitSync, ...rest } = raw
  return { ...rest, tags, holded_status }
}

// Keep backward-compatible alias — previously callers inside this file used
// flattenTags. All internal call sites updated to normaliseBookingRow below.
const flattenTags = normaliseBookingRow

/** Convenience helper — falls back to null safely. */
export function stageCode(row: BookingRow): string | null {
  return row.current_stage?.code ?? null
}

// landr-399m — shared cache-invalidation helper. Bookings are read through
// two query-key prefixes that DO NOT match each other:
//   - ['bookings']        → fetchBookings / fetchPendingGeneralApprovals
//   - ['views-bookings']  → lib/views-bookings-data.ts:useViewBookings
// Any write that mutates a booking (edit, cancel, approve/reject, contact
// patch on the customer FK) must invalidate BOTH so the Views layer
// (Bookings/Reporting/ViewPage) doesn't go stale until a manual refresh.
// landr-parv fixed BookingDetailSheet; this helper makes the contract a
// single source of truth so CustomerDetailSheet + GeneralApprovals (and
// any future caller) can't drift again.
export function invalidateBookingCaches(qc: QueryClient): Promise<void> {
  return Promise.all([
    qc.invalidateQueries({ queryKey: ['bookings'] }),
    qc.invalidateQueries({ queryKey: ['views-bookings'] }),
  ]).then(() => undefined)
}

// landr-rcmy — when `query` is a non-empty string we add a server-side
// ILIKE against bookings.search_text (denormalised customer name + email
// + product names, backed by a pg_trgm GIN index). The dashboard's old
// global-search filter ran client-side over the first 500 rows; with the
// indexed column we can keep the same 500-row cap but actually find
// matches further down the tail (and large operators no longer silently
// miss matches past row 500). Trims + lower-cases the input — the column
// is already lower-cased by the migration's trigger — and escapes the
// three PostgREST LIKE wildcards (`%`, `_`, `\`) so a literal "50%" in
// the search input doesn't degenerate into "match anything".
//
// Client-side filtering still applies on top via BookingsTable's
// globalFilter (which also covers fields NOT in search_text — status,
// dates, tags — keeping the existing UX of typing a status word like
// "pending" and seeing matches).
function escapeLikePattern(s: string): string {
  return s.replace(/[\\%_]/g, (ch) => `\\${ch}`)
}

export async function fetchBookings(
  operatorId: string,
  query?: string,
): Promise<BookingRow[]> {
  let req = supabase
    .from('bookings')
    .select(SELECT)
    .eq('operator_id', operatorId)
    .is('deleted_at', null)

  const trimmed = query?.trim().toLowerCase() ?? ''
  if (trimmed) {
    req = req.ilike('search_text', `%${escapeLikePattern(trimmed)}%`)
  }

  const { data, error } = await req
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as RawBookingRow[]).map(flattenTags)
}

// landr-7o2a — Customer 360 "Bookings" tab in CustomerDetailSheet. Scopes
// the standard SELECT by customer_contact_id so the sheet can render every
// booking (past + upcoming) the contact has placed. Mirrors fetchBookings
// in shape so all existing display helpers (priceDisplay, productDisplay,
// stageCode, earliestServiceDate, …) work without translation. Ordered
// most-recent-first so the operator sees the latest activity at a glance.
export async function fetchBookingsForContact(
  contactId: string,
): Promise<BookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(SELECT)
    .eq('customer_contact_id', contactId)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as RawBookingRow[]).map(flattenTags)
}

export function customerDisplay(row: BookingRow): string {
  const c = row.customer
  if (!c) return '—'
  const name = [c.first_name, c.last_name].filter(Boolean).join(' ').trim()
  return name || c.email || '—'
}

export function productDisplay(row: BookingRow): string {
  const named = row.items
    .map((item) => item.products?.name)
    .filter((n): n is string => !!n)
  if (named.length === 0) return '—'
  if (named.length === 1) return named[0]
  return `${named[0]} +${named.length - 1}`
}

/**
 * Returns a cached `Intl.NumberFormat` for the given currency.
 * Re-exported from `@/lib/format-currency` for backward compatibility with
 * call sites that need the formatter object directly (e.g. BookingPayments).
 * New call sites should prefer `formatCurrency` from `@/lib/format-currency`.
 */
export function numberFormatter(currency: string): Intl.NumberFormat {
  return getCurrencyFormatter(currency)
}

export function priceDisplay(row: BookingRow): string {
  // landr-puix — when an operator override is set it supersedes the
  // engine-computed gross_total. Server-side, balance_due is already
  // derived from COALESCE(override_gross_total, gross_total), so this
  // keeps the visible figure in lock-step with what the customer is
  // billed.
  const raw = effectiveGrossOf(row)
  if (!Number.isFinite(raw)) return '—'
  return getCurrencyFormatter(row.currency || 'EUR').format(raw)
}

/** Numeric "effective gross" — the override when set, else gross_total.
 *  Returns NaN when neither parses (caller surfaces "—"). Used by
 *  priceDisplay + the BookingsTable price column accessor so sorts and
 *  exports also see the override-aware value. */
export function effectiveGrossOf(row: BookingRow): number {
  const o = row.override_gross_total
  if (o != null) {
    const n = typeof o === 'number' ? o : Number(o)
    if (Number.isFinite(n)) return n
  }
  const g =
    typeof row.gross_total === 'number' ? row.gross_total : Number(row.gross_total)
  return g
}

/** True when an operator-set override is currently in effect for this
 *  booking. Drives the italic + amber affordance in the table cell and
 *  the "Clear override" footer button visibility in BookingDetailSheet. */
export function hasPriceOverride(row: BookingRow): boolean {
  return row.override_gross_total != null
}

// landr-f1s — date + time-of-day display. Hour cycle follows the operator's
/**
 * Format a booking ISO timestamp as a localised date+time string.
 * Re-exported from `@/lib/time-format` (formatDateTime) — consolidated as
 * part of landr-v9e4.4. The signature is unchanged for backward compat.
 */
export function dateDisplay(iso: string, opts?: { hour12?: boolean }): string {
  return formatDateTime(iso, opts)
}

// ----- Service date helpers (landr-04ec) ----------------------------------
// Used by BookingsTable's "Service date" column. The booking row itself
// stores no scheduled date — schedule lives on booking_products. For the
// table we surface the EARLIEST item.date_range_start; multi-item bookings
// with mixed dates collapse to the min (matches calendar / earliest-event
// semantics in bookingsToCalendarEvents above).

/** Earliest item.date_range_start across a booking's items, or null. */
export function earliestServiceDate(row: BookingRow): string | null {
  let best: string | null = null
  for (const item of row.items) {
    const start = item.date_range_start
    if (!start) continue
    if (best === null || start < best) best = start
  }
  return best
}

/** Date_range_end paired with the given start (so single-day bookings
 *  collapse to one date and multi-day ranges still render with an end). */
export function matchingServiceEnd(
  row: BookingRow,
  start: string,
): string | null {
  for (const item of row.items) {
    if (item.date_range_start === start) {
      return item.date_range_end
    }
  }
  return null
}

const _serviceDateFormatter = new Intl.DateTimeFormat('en-IE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

function _formatServiceDay(iso: string): string {
  // Accepts either a bare date ('YYYY-MM-DD') or an ISO timestamp; only the
  // date portion is used for the weekday/day/month label. Anchor at UTC noon
  // so the weekday stays stable across TZs.
  const dateOnly = _isoDatePart(iso)
  if (!dateOnly) return iso
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateOnly)
  if (!m) return iso
  const [, y, mo, d] = m
  const date = new Date(Date.UTC(Number(y), Number(mo) - 1, Number(d), 12))
  if (Number.isNaN(date.getTime())) return iso
  return _serviceDateFormatter.format(date)
}

/** Returns the leading 'YYYY-MM-DD' from a date-only or ISO-timestamp string,
 *  or null if the input doesn't start with a parseable date. */
function _isoDatePart(iso: string): string | null {
  const m = /^(\d{4}-\d{2}-\d{2})/.exec(iso)
  return m ? m[1] : null
}

/** Returns the 'HH:MM:SS(.fff)?(Z|±HH:MM)?' time-of-day portion if the input
 *  is a full ISO timestamp with a T separator, else null. */
function _isoTimePart(iso: string): string | null {
  const m = /^\d{4}-\d{2}-\d{2}T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)/.exec(iso)
  return m ? m[1] : null
}

/** True when the time portion of `iso` is midnight UTC (00:00:00...Z) — i.e.
 *  what we treat as "all-day, no meaningful time-of-day". A bare date string
 *  (no T) also counts as midnight/all-day. */
function _isMidnightUtc(iso: string): boolean {
  const time = _isoTimePart(iso)
  if (time === null) return true // no time component at all
  // Match '00:00' or '00:00:00(.0+)?'; we only treat the UTC anchor ('Z') as
  // all-day. A local '00:00:00+02:00' is technically a chosen wall-clock
  // midnight and we leave it formatted so the operator can spot it.
  if (!/^00:00(?::00(?:\.0+)?)?$/.test(time)) return false
  // Must end in Z (or have no offset suffix) to be treated as UTC midnight.
  const suffix = iso.slice(iso.indexOf('T') + 1 + time.length)
  return suffix === '' || suffix === 'Z'
}

/**
 * Renders the service date for a bookings-table row.
 *
 * Date-only inputs (the current `booking_products.date_range_start` SQL
 * shape — a Postgres `date`) collapse to:
 *   - "Tue 8 Jul"                          (single day, start === end or no end)
 *   - "Tue 8 Jul – Sat 12 Jul"             (multi-day range)
 *
 * landr-jx4s — when callers eventually pass an ISO timestamp with a
 * meaningful time-of-day AND the booking is intra-day (start === end on the
 * calendar AND not all-day midnight UTC), we append the formatted time:
 *   - "Wed 22 May, 2:30 PM"                (intra-day, opts.hour12=true)
 *   - "Wed 22 May, 14:30"                  (intra-day, opts.hour12=false)
 * Multi-day timestamps still render date-only on both ends. Midnight-UTC
 * timestamps are treated as all-day and render without a time. If `opts` is
 * omitted the helper preserves the legacy date-only output regardless of any
 * time component in the input.
 */
export function formatServiceDateRange(
  start: string,
  end: string | null,
  opts?: { hour12: boolean },
): string {
  const startDate = _isoDatePart(start)
  const endDate = end ? _isoDatePart(end) : null
  const sLabel = _formatServiceDay(start)
  const sameDay =
    startDate !== null && (endDate === null || endDate === startDate)

  if (!sameDay) {
    // Multi-day — render date range only on both ends, matching pre-jx4s
    // behavior. The `end!` is safe because !sameDay implies end is set and
    // its date differs from start.
    return `${sLabel} – ${_formatServiceDay(end!)}`
  }

  // Single day. Append the time-of-day only when the caller opted in AND
  // start carries a non-midnight-UTC time component.
  if (opts && !_isMidnightUtc(start)) {
    const timePart = _isoTimePart(start)
    if (timePart) {
      const timeLabel = _formatServiceTime(timePart, opts.hour12)
      if (timeLabel) return `${sLabel}, ${timeLabel}`
    }
  }
  return sLabel
}

const _serviceTimeFormatter12 = new Intl.DateTimeFormat('en-IE', {
  hour: 'numeric',
  minute: '2-digit',
  hourCycle: 'h12',
})
const _serviceTimeFormatter24 = new Intl.DateTimeFormat('en-IE', {
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function _formatServiceTime(timeHHmmss: string, hour12: boolean): string | null {
  // timeHHmmss is the H:M(:S)? portion already extracted from the ISO.
  const m = /^(\d{2}):(\d{2})(?::(\d{2}))?/.exec(timeHHmmss)
  if (!m) return null
  const [, hStr, mStr, sStr] = m
  const h = Number(hStr)
  const min = Number(mStr)
  const s = sStr ? Number(sStr) : 0
  if (h > 23 || min > 59 || s > 59) return null
  // Anchor on a stable arbitrary date — only the time portion is rendered.
  const d = new Date(Date.UTC(2000, 0, 1, h, min, s))
  if (Number.isNaN(d.getTime())) return null
  const fmt = hour12 ? _serviceTimeFormatter12 : _serviceTimeFormatter24
  // Force UTC interpretation so the wall-clock matches the input regardless
  // of the host machine's timezone.
  return fmt.format(
    new Date(
      d.getUTCFullYear(),
      d.getUTCMonth(),
      d.getUTCDate(),
      d.getUTCHours(),
      d.getUTCMinutes(),
      d.getUTCSeconds(),
    ),
  )
}

// ----- Calendar helpers --------------------------------------------------
// The bookings table itself stores no scheduled timestamp; the schedule
// lives on booking_products (date_range_start / date_range_end /
// selected_days). For the calendar we surface ONE event per booking using
// the earliest item with a date_range_start. If no item has scheduling
// info we fall back to created_at (so the booking still appears).

export type BookingCalendarEvent = {
  id: string
  bookingId: string
  itemId: string | null
  title: string
  start: string
  end: string | null
  allDay: boolean
  state: BookingSemanticState
  productName: string | null
  customerName: string
  raw: BookingRow
}

export function earliestScheduledItem(row: BookingRow): BookingProduct | null {
  let best: BookingProduct | null = null
  for (const item of row.items) {
    if (!item.date_range_start) continue
    if (!best || item.date_range_start < best.date_range_start!) {
      best = item
    }
  }
  return best
}

export function bookingsToCalendarEvents(
  rows: BookingRow[],
): BookingCalendarEvent[] {
  const out: BookingCalendarEvent[] = []
  for (const row of rows) {
    const item = earliestScheduledItem(row)
    if (item && item.date_range_start) {
      out.push({
        id: row.id,
        bookingId: row.id,
        itemId: item.id,
        title: `${customerDisplay(row)} — ${item.products?.name ?? productDisplay(row)}`,
        start: item.date_range_start,
        end: item.date_range_end,
        allDay: true,
        state: row.current_semantic_state,
        productName: item.products?.name ?? null,
        customerName: customerDisplay(row),
        raw: row,
      })
    } else {
      // No scheduling info — show on created_at so the booking is still
      // visible but flagged. allDay=false keeps it as a time-pinned event.
      out.push({
        id: row.id,
        bookingId: row.id,
        itemId: null,
        title: `${customerDisplay(row)} — ${productDisplay(row)}`,
        start: row.created_at,
        end: null,
        allDay: false,
        state: row.current_semantic_state,
        productName: null,
        customerName: customerDisplay(row),
        raw: row,
      })
    }
  }
  return out
}

// Persist a calendar drag-to-reschedule. Routes through FastAPI's
// PATCH /bookings/{id}/products/{lineId} because date changes re-run
// the pricing engine (see write-routing-convention memory). Callers
// must hold a bookingId — the calendar event's `bookingId` field.
// If the booking had no scheduled item (`itemId === null`), the caller
// guards and skips this entirely (no-op).
export async function rescheduleBookingItem(args: {
  bookingId: string
  itemId: string
  startDate: string // ISO date YYYY-MM-DD
  endDate: string | null // ISO date YYYY-MM-DD or null
}): Promise<void> {
  await patchBookingProduct(args.bookingId, args.itemId, {
    date_range_start: args.startDate,
    date_range_end: args.endDate,
  })
}

// Helper: format a Date back to YYYY-MM-DD for postgres `date` columns.
export function toDateOnlyIso(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

// ----- Past-booking helper (landr-qhi0) -----------------------------------
// A booking is "past" when its latest activity date is strictly before today.
// Activity date per item is max(date_range_end, last(selected_days[])); the
// booking-level activity date is the MAX across items. Bookings with NO
// dates at all (rare — direct stub bookings) are treated as future ("not
// past") so they never silently disappear from the operator's queue.
//
// All comparisons happen on ISO YYYY-MM-DD strings, which sort
// lexicographically. We anchor "today" in the operator's LOCAL timezone via
// toDateOnlyIso(new Date()) so the cut-off rolls over at the operator's
// midnight, not UTC midnight.

/** Latest activity date across a booking's items as YYYY-MM-DD, or null. */
function latestActivityDate(row: BookingRow): string | null {
  let best: string | null = null
  for (const item of row.items) {
    const end = item.date_range_end
    if (end && (best === null || end > best)) best = end
    const days = item.selected_days
    if (days && days.length > 0) {
      // selected_days[] is not guaranteed sorted — scan for max.
      for (const d of days) {
        if (d && (best === null || d > best)) best = d
      }
    }
  }
  return best
}

/**
 * True when the booking's latest activity date is strictly before `now`
 * (operator-local date). Bookings without any item-level dates are
 * treated as NOT past, so they remain visible by default.
 */
export function isPastBooking(row: BookingRow, now: Date = new Date()): boolean {
  const latest = latestActivityDate(row)
  if (!latest) return false
  return latest < toDateOnlyIso(now)
}

// ----- Open / Past partition (landr-ajb4) ---------------------------------
// Used by CustomerBookings to split the Customer 360 "Bookings" tab into
// two sections. Lives here next to isPastBooking so the same "what counts
// as a past booking?" logic stays in one module — but the rule is stricter
// here: a row must ALSO be in a terminal semantic state to land in Past.
// That mirrors operator intent ("Past = nothing more will happen to this
// booking") and keeps confirmed-but-stale rows visible in Open until the
// operator finalises or cancels them.

/** Semantic states that mean "no further changes expected". */
export const TERMINAL_BOOKING_STATES: ReadonlySet<BookingSemanticState> =
  new Set(['finalised', 'cancelled', 'no_show'])

export function isTerminalBookingState(row: BookingRow): boolean {
  return TERMINAL_BOOKING_STATES.has(row.current_semantic_state)
}

/**
 * Split a contact's bookings into "open" (current / upcoming) and
 * "past" (terminal AND service-date < today) lists. Rows without any
 * scheduled item.date_range_start fall into Open so undated drafts
 * remain visible to the operator (same fall-through as isPastBooking).
 *
 * `today` is the YYYY-MM-DD anchor in the operator's local timezone —
 * callers compute it via `toDateOnlyIso(new Date())`.
 */
export function partitionBookingsByLifecycle(
  rows: BookingRow[],
  today: string,
): { open: BookingRow[]; past: BookingRow[] } {
  const open: BookingRow[] = []
  const past: BookingRow[] = []
  for (const row of rows) {
    const start = earliestServiceDate(row)
    if (isTerminalBookingState(row) && start && start < today) {
      past.push(row)
    } else {
      open.push(row)
    }
  }
  return { open, past }
}

// ----- General approval queue ---------------------------------------------

/** Fetch all bookings awaiting_general_approval for an operator. */
export async function fetchPendingGeneralApprovals(
  operatorId: string,
): Promise<BookingRow[]> {
  const { data, error } = await supabase
    .from('bookings')
    .select(SELECT)
    .eq('operator_id', operatorId)
    .filter('current_stage.code', 'eq', 'awaiting_general_approval')
    .is('deleted_at', null)
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return ((data ?? []) as unknown as RawBookingRow[]).map(flattenTags)
}

export type ApprovalDecision = 'approve' | 'reject'

/** POST /api/staff/bookings/{id}/approval with branch=general. */
export async function postGeneralApprovalDecision(args: {
  bookingId: string
  decision: ApprovalDecision
  notes?: string
}): Promise<void> {
  await postApprovalDecision({ ...args, branch: 'general' })
}

/** POST /api/staff/bookings/{id}/approval with branch=secondary
 *  (covers awaiting_hotel_approval — the "hotel confirmed → unblock" flow). */
export async function postHotelApprovalDecision(args: {
  bookingId: string
  decision: ApprovalDecision
  notes?: string
}): Promise<void> {
  await postApprovalDecision({ ...args, branch: 'secondary' })
}

async function postApprovalDecision(args: {
  bookingId: string
  branch: 'general' | 'secondary'
  decision: ApprovalDecision
  notes?: string
}): Promise<void> {
  await api<unknown>('POST', `/api/staff/bookings/${args.bookingId}/approval`, {
    branch: args.branch,
    decision: args.decision,
    notes: args.notes ?? null,
  })
}

// ----- Edit / cancel mutations --------------------------------------------

export type BookingProductPatch = {
  date_range_start?: string | null
  date_range_end?: string | null
  selected_days?: string[]
  quantity?: number
}

/** PATCH /api/staff/bookings/{id}/products/{lineId} — re-runs pricing. */
export async function patchBookingProduct(
  bookingId: string,
  bookingProductId: string,
  patch: BookingProductPatch,
): Promise<void> {
  await api<unknown>(
    'PATCH',
    `/api/staff/bookings/${bookingId}/products/${bookingProductId}`,
    patch,
  )
}

/** DELETE /api/staff/bookings/{id} — soft-cancel with required reason. */
export async function cancelBooking(
  bookingId: string,
  reason: string,
): Promise<void> {
  // DELETE-with-body: the wrapper attaches Content-Type when a body is
  // present, so the FastAPI handler sees the JSON payload.
  await api<unknown>('DELETE', `/api/staff/bookings/${bookingId}`, { reason })
}

// ----- Bulk reminder (landr-vaob) -----------------------------------------
// Backs the Send-reminder action in BulkActionToolbar. The endpoint
// landed in landr-s0wo:
//   POST /api/staff/operators/{operator_id}/bookings/bulk-reminder
//   { booking_ids: string[] }  ->  { sent: number, failed: string[] }
// The endpoint is best-effort per booking — cross-tenant ids and email
// enqueue/template failures both surface in `failed` rather than aborting
// the batch. Empty input is rejected by the server (422); callers should
// not invoke this with an empty list.

export type BulkReminderResult = {
  sent: number
  failed: string[]
}

export async function bulkSendReminder(
  operatorId: string,
  bookingIds: string[],
): Promise<BulkReminderResult> {
  return api<BulkReminderResult>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/bulk-reminder`,
    { booking_ids: bookingIds },
  )
}

// ----- Mark as no-show (landr-ng3m) ---------------------------------------
// Backs the Mark-as-no-show action in BookingDetailSheet. The endpoint
// landed alongside in the api worktree:
//   POST /api/staff/operators/{operator_id}/bookings/{booking_id}/no-show
//   { charge_cancellation_fee?: boolean }  ->  { booking_id, ... }
// charge_cancellation_fee is intent-only in v1 — recorded in audit_log
// for a future auto-charge job, no money moves now.

export type MarkAsNoShowResult = {
  booking_id: string
  previous_stage_code: string | null
  new_stage_code: string
  new_semantic_state: string
}

export async function markBookingAsNoShow(
  operatorId: string,
  bookingId: string,
  chargeCancellationFee: boolean,
): Promise<MarkAsNoShowResult> {
  return api<MarkAsNoShowResult>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/no-show`,
    { charge_cancellation_fee: chargeCancellationFee },
  )
}

/** UI-side eligibility — keep in sync with the server guards in
 *  app/routers/staff_bookings_no_show.py. The button is hidden when this
 *  returns false; the server re-checks defensively.
 *
 *  Eligible when:
 *    - Not already in the no_show terminal stage.
 *    - At least one item.date_range_start is on or before today
 *      (there's an event to have not shown up to).
 *    - Not a soft-cancelled booking (defensive — the list usually
 *      excludes those already).
 */
export function canMarkAsNoShow(row: BookingRow, today?: Date): boolean {
  if (stageCode(row) === 'no_show') return false
  if (row.current_semantic_state === 'cancelled') return false
  const todayIso = toDateOnlyIso(today ?? new Date())
  for (const item of row.items) {
    if (item.date_range_start && item.date_range_start <= todayIso) {
      return true
    }
  }
  return false
}

// ----- Mark-as-paid (landr-okxm) ------------------------------------------
// Operator records a manual payment (cash / bank transfer / other) taken
// outside Stripe. Hits POST /api/staff/operators/{op}/bookings/{id}/mark-paid
// which inserts a payments row and advances the booking out of
// awaiting_payment when the balance is covered.

export type MarkAsPaidMethod = 'cash' | 'bank_transfer' | 'other'

export type MarkAsPaidResult = {
  booking_id: string
  payment_id: string
  amount: string
  currency: string
  method: MarkAsPaidMethod
  provider: string
  previous_stage_code: string
  new_stage_code: string
  new_semantic_state: string | null
  advanced_to_confirmed: boolean
}

export async function markBookingAsPaid(
  operatorId: string,
  bookingId: string,
  body: { method: MarkAsPaidMethod; amount?: string | null; note?: string | null },
): Promise<MarkAsPaidResult> {
  const payload: Record<string, unknown> = { method: body.method }
  if (body.amount != null && body.amount !== '') payload.amount = body.amount
  if (body.note != null && body.note !== '') payload.note = body.note
  return api<MarkAsPaidResult>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/mark-paid`,
    payload,
  )
}

/** UI-side eligibility — keep in sync with the server guard in
 *  app/routers/staff_bookings_mark_paid.py. The button is hidden when this
 *  returns false; the server re-checks defensively. Eligible only when
 *  the booking is in the awaiting_payment lifecycle stage AND has a
 *  positive balance_due. */
export function canMarkAsPaid(row: BookingRow): boolean {
  if (stageCode(row) !== 'awaiting_payment') return false
  const due = balanceDueOf(row)
  return due === null ? true : due > 0
}

// ----- Refund (landr-uzup) ------------------------------------------------
// Operator records a manual refund (cash / bank transfer / other) returned
// outside Stripe against a previously succeeded payment. Hits POST
// /api/staff/operators/{op}/bookings/{bid}/payments/{pid}/refund which
// inserts a payment_refunds row at status='succeeded'. The existing
// payments.refunded_amount + bookings.balance_due triggers recompute
// automatically, so the dashboard just has to invalidate caches on success.

export type RefundPaymentResult = {
  booking_id: string
  payment_id: string
  refund_id: string
  refund_amount: string
  currency: string
  refundable_remaining_after: string
  payment_status_after: string
  booking_balance_due_after: string
  reason: string | null
}

export async function refundPayment(
  operatorId: string,
  bookingId: string,
  paymentId: string,
  body: { amount?: string | null; reason?: string | null },
): Promise<RefundPaymentResult> {
  const payload: Record<string, unknown> = {}
  if (body.amount != null && body.amount !== '') payload.amount = body.amount
  if (body.reason != null && body.reason !== '') payload.reason = body.reason
  return api<RefundPaymentResult>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/payments/${paymentId}/refund`,
    payload,
  )
}

// ----- Payments + refunds list (landr-uzup) -------------------------------
// Plain row reads via Supabase REST (no side effects → no need for a
// FastAPI endpoint per the hybrid write-routing convention). RLS already
// scopes both tables to the caller's operator_memberships, so a stray
// row id from another tenant returns an empty list rather than leaking.

export type BookingPaymentRow = {
  id: string
  amount: string
  currency: string
  provider: string
  status: string
  refunded_amount: string
  paid_at: string | null
  created_at: string
}

export type BookingRefundRow = {
  id: string
  payment_id: string
  refund_amount: string
  currency: string
  reason: string | null
  status: string
  initiated_at: string
  completed_at: string | null
}

export type BookingPaymentsView = {
  payments: BookingPaymentRow[]
  refunds: BookingRefundRow[]
}

export async function fetchBookingPayments(
  bookingId: string,
): Promise<BookingPaymentsView> {
  const [paymentsRes, refundsRes] = await Promise.all([
    supabase
      .from('payments')
      .select(
        'id, amount, currency, provider, status, refunded_amount, paid_at, created_at',
      )
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true }),
    supabase
      .from('payment_refunds')
      .select(
        'id, payment_id, refund_amount, currency, reason, status, initiated_at, completed_at',
      )
      .eq('booking_id', bookingId)
      .order('initiated_at', { ascending: true }),
  ])
  if (paymentsRes.error) throw new Error(paymentsRes.error.message)
  if (refundsRes.error) throw new Error(refundsRes.error.message)
  return {
    payments: (paymentsRes.data ?? []) as BookingPaymentRow[],
    refunds: (refundsRes.data ?? []) as BookingRefundRow[],
  }
}

/** Numeric remaining-refundable for a payment row — same formula the
 *  server uses to gate the refund endpoint. Returns 0 when the math
 *  doesn't parse (defensive). */
export function refundableRemainingOf(p: BookingPaymentRow): number {
  const amt = Number(p.amount)
  const ref = Number(p.refunded_amount)
  if (!Number.isFinite(amt) || !Number.isFinite(ref)) return 0
  const remaining = amt - ref
  return remaining > 0 ? remaining : 0
}

/** UI-side eligibility for the Refund button on a payment row. Keep in
 *  sync with app/routers/staff_bookings_refund.py: only succeeded and
 *  partially_refunded payments with refundable_remaining > 0 qualify. */
export function canRefundPayment(p: BookingPaymentRow): boolean {
  if (p.status !== 'succeeded' && p.status !== 'partially_refunded') {
    return false
  }
  return refundableRemainingOf(p) > 0
}

/** Numeric balance_due, falling back through the operator subtotal then
 *  gross_total when the column is missing (legacy fixtures / mocks).
 *
 *  Fallback chain mirrors the server trigger (landr-39he):
 *    balance_due ?? operator_gross_total ?? gross_total
 *
 *  For hotel-branch mixed bookings operator_gross_total is the
 *  operator-collected slice; gross_total includes the hotel portion and
 *  must NOT be used as the balance fallback. Legacy rows where
 *  operator_gross_total is null/absent fall through safely to gross_total.
 *
 *  Returns null only when no field parses as a finite number. */
export function balanceDueOf(row: BookingRow): number | null {
  const raw = row.balance_due
  if (raw != null) {
    const n = typeof raw === 'number' ? raw : Number(raw)
    if (Number.isFinite(n)) return n
  }
  // landr-gqq0 — prefer operator_gross_total over gross_total so hotel-branch
  // bookings don't overstate the balance due.
  const opRaw = row.operator_gross_total
  if (opRaw != null) {
    const n = typeof opRaw === 'number' ? opRaw : Number(opRaw)
    if (Number.isFinite(n)) return n
  }
  const gross =
    typeof row.gross_total === 'number' ? row.gross_total : Number(row.gross_total)
  return Number.isFinite(gross) ? gross : null
}

// ----- Price override (landr-puix) ----------------------------------------
// Operator-set manual override of a booking's gross_total. Reason is
// required by the server (min_length=1) so the dashboard prompts for it
// when committing the new price. POST sets, DELETE clears. The server
// recomputes balance_due against COALESCE(override_gross_total,
// gross_total) so this single round-trip is enough to keep the visible
// figure + outstanding-balance prompts in sync.

export type PriceOverrideResult = {
  booking_id: string
  override_gross_total: string | null
  override_reason: string | null
  override_applied_at: string | null
  gross_total: string
  balance_due: string
}

export async function setBookingPriceOverride(
  operatorId: string,
  bookingId: string,
  body: { override_gross_total: string | number; reason: string },
): Promise<PriceOverrideResult> {
  return api<PriceOverrideResult>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/price-override`,
    body,
  )
}

export async function clearBookingPriceOverride(
  operatorId: string,
  bookingId: string,
): Promise<PriceOverrideResult> {
  return api<PriceOverrideResult>(
    'DELETE',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/price-override`,
  )
}

// ----- Approval-queue helpers (landr-aqn4) --------------------------------
// Pure derivations off BookingRow used by the Approvals page filters +
// table. Kept here (rather than in src/components/approvals) so the
// filter-match layer (src/lib/approvals-filter-match.ts) can import them
// without dragging React in.

export type ApprovalReasonBucket =
  | 'capacity_warning'
  | 'new_customer'
  | 'voucher_invalid'
  | 'manual_override'
  | 'other'

export const APPROVAL_REASON_BUCKETS: ReadonlyArray<ApprovalReasonBucket> = [
  'capacity_warning',
  'new_customer',
  'voucher_invalid',
  'manual_override',
  'other',
]

/** Map a single rule_kind to a reason bucket. Unknown / "other" rules
 *  fall through to `'other'` so the chip still surfaces them. */
function ruleKindBucket(kind: string | undefined): ApprovalReasonBucket {
  switch (kind) {
    case 'capacity_threshold':
    case 'capacity_percentage':
      return 'capacity_warning'
    case 'first_time_customer':
      return 'new_customer'
    case 'date_override':
    case 'product_override':
      return 'manual_override'
    default:
      return 'other'
  }
}

/** All reason buckets a booking lands in. A booking can hit multiple
 *  (e.g. capacity + first-time customer), so we return a Set. If the
 *  approval_trace declares a `voucher_invalid` flag (jsonb tolerates
 *  unknown keys; landr-api may add this later) it is added too. */
export function approvalReasonsOf(row: BookingRow): Set<ApprovalReasonBucket> {
  const out = new Set<ApprovalReasonBucket>()
  const trace = row.approval_trace
  if (!trace) {
    out.add('other')
    return out
  }
  for (const rule of trace.applied_rules ?? []) {
    out.add(ruleKindBucket(rule.rule_kind))
  }
  // Tolerated freeform flags. Today the FastAPI router doesn't emit
  // `voucher_invalid`, but the column is jsonb — the bucket is documented
  // in the bd ticket and we let it light up if/when the router adds it.
  if ((trace as Record<string, unknown>).voucher_invalid === true) {
    out.add('voucher_invalid')
  }
  if (out.size === 0) out.add('other')
  return out
}

/** Was this booking flagged as a first-time customer? Derived from the
 *  `first_time_customer` rule firing in approval_trace.applied_rules.
 *  When the trace is missing we default to "returning" (treat older
 *  bookings as returning rather than mislabel them new). */
export function isNewCustomer(row: BookingRow): boolean {
  for (const rule of row.approval_trace?.applied_rules ?? []) {
    if (rule.rule_kind === 'first_time_customer') return true
  }
  return false
}

/** Earliest activity date across the booking's items. Considers both
 *  date_range_start AND the first entry in selected_days (for products
 *  that schedule via day-picker rather than a contiguous range). Returns
 *  an ISO 'YYYY-MM-DD' string or null. */
export function firstActivityDate(row: BookingRow): string | null {
  let best: string | null = null
  for (const item of row.items) {
    const candidates: string[] = []
    if (item.date_range_start) candidates.push(item.date_range_start)
    if (item.selected_days && item.selected_days.length > 0) {
      // selected_days come unsorted from the DB; sort defensively.
      const sorted = [...item.selected_days].sort()
      candidates.push(sorted[0])
    }
    for (const c of candidates) {
      if (best === null || c < best) best = c
    }
  }
  return best
}

export type UrgencyBucket = 'urgent' | 'soon' | 'later' | 'unknown'

export const URGENCY_BUCKETS: ReadonlyArray<UrgencyBucket> = [
  'urgent',
  'soon',
  'later',
  'unknown',
]

/** Bucket the booking by how soon its activity date falls.
 *  ≤3 days = urgent, 4-14 = soon, 15+ = later, no activity date = unknown. */
export function urgencyBucketOf(
  row: BookingRow,
  now: Date = new Date(),
): UrgencyBucket {
  const iso = firstActivityDate(row)
  if (!iso) return 'unknown'
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return 'unknown'
  const [, y, mo, d] = m
  const activity = Date.UTC(Number(y), Number(mo) - 1, Number(d))
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())
  const diffDays = Math.floor((activity - today) / 86400000)
  if (diffDays <= 3) return 'urgent'
  if (diffDays <= 14) return 'soon'
  return 'later'
}

export type PriceBucket = 'low' | 'mid' | 'high'

export const PRICE_BUCKETS: ReadonlyArray<PriceBucket> = ['low', 'mid', 'high']

/** Bucket the booking's gross_total: <100 = low, 100-500 = mid, >500 = high. */
export function priceBucketOf(row: BookingRow): PriceBucket {
  const n =
    typeof row.gross_total === 'number'
      ? row.gross_total
      : Number(row.gross_total)
  if (!Number.isFinite(n) || n < 100) return 'low'
  if (n <= 500) return 'mid'
  return 'high'
}

// landr-qmdo — Approvals page "Awaiting" dimension. The booking_lifecycle
// stages.code column is operator-customisable free-text, but the Approvals
// queue only surfaces rows in one of three canonical states. We collapse
// the raw code into a small enum so the filter chip stays stable across
// operator-renamed stages (anything outside the three known codes lands
// in null and is filtered out of the dimension).
export type ApprovalStage = 'general' | 'secondary' | 'hotel'

export const APPROVAL_STAGE_BUCKETS: ReadonlyArray<ApprovalStage> = [
  'general',
  'secondary',
  'hotel',
]

/** Bucket the booking's current_stage.code into the three Approvals
 *  stages. Returns null when the code doesn't match any known stage
 *  (caller decides whether to show or hide such rows; the Approvals page
 *  itself only ever queries `awaiting_general_approval` today, so this
 *  mostly stays in the `general` bucket). */
export function stageOf(row: BookingRow): ApprovalStage | null {
  const code = row.current_stage?.code
  switch (code) {
    case 'awaiting_general_approval':
      return 'general'
    case 'awaiting_secondary_approval':
      return 'secondary'
    case 'awaiting_hotel_approval':
      return 'hotel'
    default:
      return null
  }
}

/** Format the firstActivityDate as 'Tue 8 Jul' (or null when unscheduled). */
export function activityDateDisplay(row: BookingRow): string | null {
  const iso = firstActivityDate(row)
  if (!iso) return null
  return _formatServiceDay(iso)
}

// --------------------------------------------------------------------------

/** Patch a customer contact directly (RLS-gated; supabase write).
 *  Used by the Bookings detail Sheet to keep payer info in sync. */
export async function patchCustomerContact(
  contactId: string,
  patch: {
    first_name?: string | null
    last_name?: string | null
    email?: string | null
    phone?: string | null
  },
): Promise<void> {
  const { error } = await supabase
    .from('contacts')
    .update(patch)
    .eq('id', contactId)
  if (error) throw new Error(error.message)
}

// ----- Timeline (landr-5f8q) ----------------------------------------------
// Source-of-truth for the BookingDetailSheet "Timeline" tab. The dashboard
// has three RLS-queryable sources of historical events tied to a booking:
//
//   1. audit_log      — every INSERT/UPDATE/DELETE on the bookings row (the
//                       audit_trigger added in 20260512215713_bookings.sql).
//                       We diff old_row.current_stage_id vs new_row to
//                       surface lifecycle transitions, and detect the
//                       INSERT row for "created". Soft-cancel surfaces as a
//                       deleted_at fill.
//   2. payments       — operator-scoped; presence of a `succeeded` row
//                       means the booking was paid. We surface
//                       payments.created_at / paid_at as a single event.
//   3. outbound_emails — operator-scoped; one event per related row keyed
//                        by template_kind + sent_at (falls back to
//                        created_at when still queued).
//
// All three tables are operator_id-scoped (audit_log via is_tenant_visible,
// the other two via apply_tenant_rls), so no extra operator_id filter is
// needed in the query — Supabase RLS handles tenant isolation.

export type TimelineEventKind =
  | 'created'
  | 'stage_changed'
  | 'approved'
  | 'rejected'
  | 'hotel_confirmed'
  | 'hotel_declined'
  | 'paid'
  | 'cancelled'
  | 'finalised'
  | 'rescheduled'
  | 'email_sent'

/** The outbound_emails row fields needed to preview + re-send an email
 *  directly from the timeline (landr-33r3). Only present on `email_sent`
 *  events whose source row is readable. */
export type TimelineEmail = {
  /** outbound_emails.id — the source row a resend copies/links to. */
  id: string
  operatorId: string
  toAddress: string
  subject: string
  bodyHtml: string
  bodyText: string
  templateKind: string
  locale: string
  /** Set when this email was itself a resend of another row. */
  resentFromId: string | null
}

export type TimelineEvent = {
  /** Stable id for React keys; not necessarily a uuid. */
  id: string
  occurredAt: string
  kind: TimelineEventKind
  /** Human-readable summary. The component renders this verbatim. */
  label: string
  /** Optional secondary line (operator name, stage code, error, …). */
  detail?: string | null
  /** Optional actor kind for badge colouring. */
  actorKind?: string | null
  /** Present on `email_sent` events: the source row for preview + resend. */
  email?: TimelineEmail | null
}

type AuditLogRowRaw = {
  id: string
  occurred_at: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  actor_kind: string | null
  actor_subkind: string | null
  user_id: string | null
  old_row: Record<string, unknown> | null
  new_row: Record<string, unknown> | null
}

type PaymentRowRaw = {
  id: string
  status: string
  paid_at: string | null
  created_at: string
}

type OutboundEmailRowRaw = {
  id: string
  operator_id: string
  template_kind: string
  locale: string | null
  status: string
  created_at: string
  sent_at: string | null
  to_address: string | null
  subject: string | null
  body_html: string | null
  body_text: string | null
  resent_from_id: string | null
}

type StageRow = { id: string; code: string; label: string | null }

function asString(v: unknown): string | null {
  return typeof v === 'string' ? v : null
}

/** Map a stage code to a Timeline event kind. Returns null for codes the
 *  timeline doesn't surface as a distinct event (those still emit a
 *  generic `stage_changed`). */
function kindFromStageCode(code: string | null): TimelineEventKind | null {
  if (!code) return null
  if (code === 'cancelled') return 'cancelled'
  if (code === 'finalised') return 'finalised'
  if (code === 'awaiting_payment') return 'approved'
  if (code === 'paid_pending_cutoff') return 'paid'
  // Hotel approval transitions: the booking leaving awaiting_hotel_approval
  // into awaiting_payment is the "hotel confirmed" event — handled by the
  // approved branch above. We can't cleanly distinguish confirmed vs
  // declined from forward-only stage changes; the stage_changed fallback
  // covers anything we don't recognise.
  return null
}

function eventForStageTransition(
  fromCode: string | null,
  toCode: string | null,
  occurredAt: string,
  actorLabel: string | null,
  auditId: string,
): TimelineEvent | null {
  if (!toCode || fromCode === toCode) return null

  // Hotel-flow heuristic: leaving awaiting_hotel_approval is a confirm.
  if (
    fromCode === 'awaiting_hotel_approval' &&
    toCode !== 'cancelled' &&
    toCode !== 'awaiting_hotel_approval'
  ) {
    return {
      id: `stage-${auditId}`,
      occurredAt,
      kind: 'hotel_confirmed',
      label: 'Hotel confirmed',
      detail: actorLabel,
    }
  }

  // General-approval heuristic: leaving awaiting_general_approval into a
  // non-cancelled stage is an approval.
  if (
    fromCode === 'awaiting_general_approval' &&
    toCode !== 'cancelled' &&
    toCode !== 'awaiting_general_approval'
  ) {
    return {
      id: `stage-${auditId}`,
      occurredAt,
      kind: 'approved',
      label: 'Approved',
      detail: actorLabel,
    }
  }

  const mapped = kindFromStageCode(toCode)
  return {
    id: `stage-${auditId}`,
    occurredAt,
    kind: mapped ?? 'stage_changed',
    label: mapped === 'cancelled'
      ? 'Cancelled'
      : mapped === 'finalised'
        ? 'Finalised'
        : mapped === 'paid'
          ? 'Marked paid'
          : mapped === 'approved'
            ? 'Approved'
            : `Stage → ${toCode}`,
    detail: actorLabel,
  }
}

function actorDisplay(row: AuditLogRowRaw): string | null {
  const subkind = row.actor_subkind
  const kind = row.actor_kind
  if (subkind && kind) return `${kind}/${subkind}`
  return kind ?? null
}

const EMAIL_TEMPLATE_LABEL: Record<string, string> = {
  booking_confirmation: 'Confirmation email sent',
  payment_request: 'Payment request email sent',
  booking_rejected: 'Rejection email sent',
  booking_cancelled: 'Cancellation email sent',
  hotel_request: 'Hotel request email sent',
  refund_notice: 'Refund notice email sent',
  reminder: 'Reminder email sent',
}

function labelForEmail(template: string): string {
  return (
    EMAIL_TEMPLATE_LABEL[template] ??
    `Email sent (${template.replace(/_/g, ' ')})`
  )
}

/**
 * Fetch the chronological timeline for a single booking.
 *
 * Returns events ordered oldest → newest. Safe on partial RLS: if any of
 * the three data sources errors (e.g. audit_log unreadable on a future
 * partition cutover) the helper synthesises a minimal timeline from the
 * BookingRow itself (created event + current stage).
 */
export async function fetchBookingTimeline(
  bookingId: string,
  fallback: BookingRow,
): Promise<TimelineEvent[]> {
  // Run the three reads in parallel — none of them depends on the others.
  const [auditRes, paymentsRes, emailsRes, stagesRes] = await Promise.all([
    supabase
      .from('audit_log')
      .select(
        'id, occurred_at, operation, actor_kind, actor_subkind, user_id, old_row, new_row',
      )
      .eq('table_name', 'bookings')
      .eq('row_id', bookingId)
      .order('occurred_at', { ascending: true })
      .limit(200),
    supabase
      .from('payments')
      .select('id, status, paid_at, created_at')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })
      .limit(20),
    supabase
      .from('outbound_emails')
      .select(
        'id, operator_id, template_kind, locale, status, created_at, sent_at, ' +
          'to_address, subject, body_html, body_text, resent_from_id',
      )
      .eq('related_booking_id', bookingId)
      .order('created_at', { ascending: true })
      .limit(50),
    // Resolve stage_id → code so audit_log diffs can label transitions.
    supabase
      .from('booking_lifecycle_stages')
      .select('id, code, label')
      .limit(200),
  ])

  const events: TimelineEvent[] = []
  const stageById = new Map<string, StageRow>()
  if (!stagesRes.error && stagesRes.data) {
    for (const s of stagesRes.data as StageRow[]) stageById.set(s.id, s)
  }
  const codeFor = (id: string | null): string | null =>
    id ? stageById.get(id)?.code ?? null : null

  // 1) audit_log: emit created + stage transitions + cancel
  if (!auditRes.error && auditRes.data) {
    for (const raw of auditRes.data as AuditLogRowRaw[]) {
      if (raw.operation === 'INSERT') {
        const actor = actorDisplay(raw)
        events.push({
          id: `created-${raw.id}`,
          occurredAt: raw.occurred_at,
          kind: 'created',
          label: 'Booking created',
          detail: actor,
          actorKind: raw.actor_kind,
        })
        continue
      }
      if (raw.operation === 'UPDATE') {
        const oldStageId = asString(raw.old_row?.current_stage_id ?? null)
        const newStageId = asString(raw.new_row?.current_stage_id ?? null)
        if (newStageId !== oldStageId) {
          const evt = eventForStageTransition(
            codeFor(oldStageId),
            codeFor(newStageId),
            raw.occurred_at,
            actorDisplay(raw),
            raw.id,
          )
          if (evt) events.push({ ...evt, actorKind: raw.actor_kind })
        }
        // Soft-cancel: deleted_at flips from null → timestamp.
        const oldDeleted = asString(raw.old_row?.deleted_at ?? null)
        const newDeleted = asString(raw.new_row?.deleted_at ?? null)
        if (!oldDeleted && newDeleted) {
          events.push({
            id: `cancel-${raw.id}`,
            occurredAt: raw.occurred_at,
            kind: 'cancelled',
            label: 'Booking cancelled',
            detail: actorDisplay(raw),
            actorKind: raw.actor_kind,
          })
        }
      }
    }
  }

  // 2) payments → paid event (only when succeeded)
  if (!paymentsRes.error && paymentsRes.data) {
    for (const p of paymentsRes.data as PaymentRowRaw[]) {
      if (p.status === 'succeeded' || p.status === 'paid') {
        events.push({
          id: `paid-${p.id}`,
          occurredAt: p.paid_at ?? p.created_at,
          kind: 'paid',
          label: 'Payment received',
          detail: null,
        })
      }
    }
  }

  // 3) outbound_emails → email_sent event. Carries the row payload so the
  // timeline can preview the body and re-send it in place (landr-33r3).
  if (!emailsRes.error && emailsRes.data) {
    for (const e of emailsRes.data as unknown as OutboundEmailRowRaw[]) {
      const occurredAt = e.sent_at ?? e.created_at
      events.push({
        id: `email-${e.id}`,
        occurredAt,
        kind: 'email_sent',
        label: labelForEmail(e.template_kind),
        detail:
          e.status === 'sent'
            ? (e.to_address ?? null)
            : e.status === 'failed'
              ? 'Failed to send'
              : 'Queued',
        email: {
          id: e.id,
          operatorId: e.operator_id,
          toAddress: e.to_address ?? '',
          subject: e.subject ?? '',
          bodyHtml: e.body_html ?? '',
          bodyText: e.body_text ?? '',
          templateKind: e.template_kind,
          locale: e.locale ?? '',
          resentFromId: e.resent_from_id ?? null,
        },
      })
    }
  }

  // Fallback floor: if audit_log returned nothing (e.g. RLS or retention),
  // synthesise a "created" event from the booking row so the timeline is
  // never empty for a real booking.
  if (!events.some((e) => e.kind === 'created')) {
    events.unshift({
      id: `created-fallback-${fallback.id}`,
      occurredAt: fallback.created_at,
      kind: 'created',
      label: 'Booking created',
      detail: fallback.approval_trace?.outcome
        ? `Approval outcome: ${String(fallback.approval_trace.outcome)}`
        : null,
    })
  }

  events.sort((a, b) => (a.occurredAt < b.occurredAt ? -1 : 1))
  return events
}

// ----- Resend confirmation (landr-6629) -----------------------------------
// POST /api/staff/operators/{op}/bookings/{id}/resend-confirmation
// Diffs current booking state against the last sent confirmation; sends a
// booking_confirmation with is_update=true + changes list; returns the diff.

export type ConfirmationChange = {
  label: string
  old: string
  new: string
}

export type ResendConfirmationResult = {
  changes_detected: boolean
  changes: ConfirmationChange[]
}

export async function resendConfirmation(
  operatorId: string,
  bookingId: string,
): Promise<ResendConfirmationResult> {
  return api<ResendConfirmationResult>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/resend-confirmation`,
  )
}

export type ConfirmationStatus = {
  last_sent_at: string | null
  has_material_changes: boolean
  /** True once a real booking_confirmation has gone out for this booking.
   *  Drives the Resend-Confirmation button visibility (landr-tf39). */
  has_prior_confirmation: boolean
}

export async function getConfirmationStatus(
  operatorId: string,
  bookingId: string,
): Promise<ConfirmationStatus> {
  return api<ConfirmationStatus>(
    'GET',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/confirmation-status`,
  )
}

