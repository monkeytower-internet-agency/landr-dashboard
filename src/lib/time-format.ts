/**
 * Time-of-day, date, and date+time formatting helpers.
 *
 * Single source of truth for rendering times, dates, and datetimes in the
 * dashboard (landr-f1s, landr-v9e4.4).
 *
 * All call sites should go through the helpers exported here rather than
 * constructing ad-hoc `Intl.DateTimeFormat` / `toLocaleTimeString` instances.
 */

export type TimeFormatOpts = {
  /**
   * `true` = 24h ('h23'), `false` = 12h with AM/PM ('h12').
   * Caller passes the operator setting; we don't fetch it here so the helper
   * stays pure / SSR-safe / trivially testable.
   */
  hour12: boolean
  /** BCP-47 locale tag. Defaults to 'en-IE' to match dashboard conventions. */
  locale?: string
}

/**
 * Accepts:
 *   - a `Date`
 *   - an ISO timestamp string ('2026-05-19T08:30:00Z')
 *   - an `HH:mm` or `HH:mm:ss` time-of-day string (interpreted in local time)
 *
 * Returns a localized hour:minute string. Returns the input verbatim if it
 * can't be parsed (matches the resilient pattern used elsewhere in the app,
 * e.g. `contactDate`).
 */
export function formatTime(value: Date | string, opts: TimeFormatOpts): string {
  const date = toDate(value)
  if (!date) return typeof value === 'string' ? value : ''

  const fmt = new Intl.DateTimeFormat(opts.locale ?? 'en-IE', {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: opts.hour12 ? 'h12' : 'h23',
  })
  return fmt.format(date)
}

export function formatTimeRange(
  start: Date | string,
  end: Date | string,
  opts: TimeFormatOpts,
): string {
  return `${formatTime(start, opts)}–${formatTime(end, opts)}`
}

// ---------------------------------------------------------------------------
// Date-only formatter (landr-v9e4.4)
// ---------------------------------------------------------------------------

const _dateFormatter = new Intl.DateTimeFormat('en-IE', { dateStyle: 'medium' })

/**
 * Format an ISO date/timestamp string as a medium-style date (e.g. "10 May 2026").
 * Returns `fallback` (default `'—'`) for null/undefined input, and the
 * original string verbatim when it can't be parsed as a valid date.
 *
 * Consolidated from the byte-identical `contactDate` (contacts.ts) and
 * `staffDate` (staff.ts) helpers.
 */
export function formatDate(
  iso: string | null | undefined,
  fallback = '—',
): string {
  if (!iso) return fallback
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return _dateFormatter.format(d)
}

// ---------------------------------------------------------------------------
// Date+time formatter — h12/h23 pair (landr-v9e4.4)
// ---------------------------------------------------------------------------

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

/**
 * Format an ISO timestamp as a localised date+time string.
 *
 * `opts.hour12 = true`  → 12h with AM/PM ('h12')
 * `opts.hour12 = false` → 24h ('h23')  ← default
 *
 * Returns the original string verbatim when it can't be parsed.
 * Returns `'—'` for null/undefined input.
 *
 * Consolidated from the char-for-char identical `dateDisplay` (bookings.ts)
 * and `contactDateTime` (contacts.ts) helpers.
 */
export function formatDateTime(
  iso: string | null | undefined,
  opts?: { hour12?: boolean },
): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return _dateTimeFormatters[opts?.hour12 ? 'h12' : 'h23'].format(d)
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function toDate(value: Date | string): Date | null {
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value
  }
  // Detect bare time-of-day strings ('08:30', '08:30:00'). Treat as today's
  // local time so the helper is symmetric: caller passes 'HH:mm', gets back
  // the same wall-clock time in the requested hourCycle.
  const timeOnly = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(value)
  if (timeOnly) {
    const [, hStr, mStr, sStr] = timeOnly
    const h = Number(hStr)
    const m = Number(mStr)
    const s = sStr ? Number(sStr) : 0
    if (h < 0 || h > 23 || m < 0 || m > 59 || s < 0 || s > 59) return null
    const d = new Date()
    d.setHours(h, m, s, 0)
    return d
  }

  const parsed = new Date(value)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
