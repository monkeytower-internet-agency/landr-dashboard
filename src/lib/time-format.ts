/**
 * Time-of-day formatting helpers (landr-f1s).
 *
 * Single source of truth for rendering times in the dashboard. Reads the
 * operator's `time_format_24h` preference and produces 24h ('h23') or 12h
 * with AM/PM ('h12') output via `Intl.DateTimeFormat`.
 *
 * All call sites in this app should go through `formatTime` / `formatTimeRange`
 * rather than ad-hoc `toLocaleTimeString` or hard-coded `HH:mm` strings.
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
