// landr-1zxt — Relative-date token grammar for View filters.
//
// Why: saved-view configs persist filter values as JSON. Storing literal ISO
// dates ('2026-05-21') freezes the View — by next week the chip is stale.
// Storing tokens like 'today' / 'start_of_week' keeps the View live: the
// matcher resolves the token to an actual date on every render.
//
// Resolution happens at apply-time (per render), never at save-time.
//
// Grammar (v1):
//   Anchors:        today | now | tomorrow | yesterday
//   Period anchors: start_of_week | end_of_week
//                   start_of_month | end_of_month
//                   start_of_year | end_of_year
//   Pure offsets:   ±N(d|w|m|y)            e.g. +7d, -30d, +1w, -1m
//   Anchor+offset:  <anchor>±N(d|w|m|y)    e.g. today+7d, tomorrow-1d
//                                          start_of_week+2d, end_of_month-1d
//
// Week convention: configurable via the `weekStartsOn` parameter
// (0=Sunday..6=Saturday). Default 1 (Monday) preserves the original
// Europe-first behaviour — see landr-m4zq for the operator-level setting
// that drives this at the dashboard layer.
//
// Output is always YYYY-MM-DD ISO (date-only — no time, no tz). The matcher
// in views-bookings-data.ts compares as strings, which works because
// 'YYYY-MM-DD' is lexicographically date-ordered.

// ---------------------------------------------------------------------------
// Date helpers — local-time YYYY-MM-DD math. We deliberately stay in the
// local timezone: a user filtering for "today" means "today on the wall
// clock", not UTC.

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n)
}

function formatISO(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`
}

function startOfDayLocal(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

function addDays(d: Date, n: number): Date {
  // new Date(...) with day = current+n handles month/year rollover correctly.
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n)
}

function addMonths(d: Date, n: number): Date {
  // Clamp to month end (e.g. Jan 31 + 1m → Feb 28, not Mar 3).
  const targetYear = d.getFullYear()
  const targetMonthRaw = d.getMonth() + n
  // Probe a candidate; if the day rolled past month end, clamp to last day.
  const candidate = new Date(targetYear, targetMonthRaw, d.getDate())
  const finalMonth = ((targetMonthRaw % 12) + 12) % 12
  if (candidate.getMonth() !== finalMonth) {
    // Overflowed — back up to the last day of the intended month.
    return new Date(candidate.getFullYear(), candidate.getMonth(), 0)
  }
  return candidate
}

function addYears(d: Date, n: number): Date {
  return addMonths(d, n * 12)
}

/**
 * First day of the week containing d, configurable via weekStartsOn
 * (0=Sunday..6=Saturday). landr-m4zq — when weekStartsOn=1 the previous
 * Monday is returned (preserving the Europe-first convention); when
 * weekStartsOn=0 the previous Sunday is returned.
 */
function startOfWeek(d: Date, weekStartsOn: number): Date {
  const day = d.getDay() // 0=Sun, 1=Mon, ... 6=Sat
  // Distance back to the configured first day. (day - weekStartsOn) mod 7
  // gives the number of days to subtract; +7 keeps the result non-negative.
  const back = ((day - weekStartsOn) % 7 + 7) % 7
  return addDays(startOfDayLocal(d), -back)
}

function endOfWeek(d: Date, weekStartsOn: number): Date {
  return addDays(startOfWeek(d, weekStartsOn), 6)
}

function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1)
}

function endOfMonth(d: Date): Date {
  // Day 0 of next month = last day of this month.
  return new Date(d.getFullYear(), d.getMonth() + 1, 0)
}

function startOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 0, 1)
}

function endOfYear(d: Date): Date {
  return new Date(d.getFullYear(), 11, 31)
}

// ---------------------------------------------------------------------------
// Token parsing

// landr-m4zq — resolvers receive (now, weekStartsOn). Only the week-relative
// anchors actually read weekStartsOn; the others ignore it.
const ANCHOR_RESOLVERS: Record<string, (now: Date, weekStartsOn: number) => Date> = {
  today: (n) => startOfDayLocal(n),
  now: (n) => startOfDayLocal(n),
  tomorrow: (n) => addDays(startOfDayLocal(n), 1),
  yesterday: (n) => addDays(startOfDayLocal(n), -1),
  start_of_week: (n, w) => startOfWeek(n, w),
  end_of_week: (n, w) => endOfWeek(n, w),
  start_of_month: (n) => startOfMonth(n),
  end_of_month: (n) => endOfMonth(n),
  start_of_year: (n) => startOfYear(n),
  end_of_year: (n) => endOfYear(n),
}

const ANCHOR_LABELS: Record<string, string> = {
  today: 'Today',
  now: 'Today',
  tomorrow: 'Tomorrow',
  yesterday: 'Yesterday',
  start_of_week: 'Start of week',
  end_of_week: 'End of week',
  start_of_month: 'Start of month',
  end_of_month: 'End of month',
  start_of_year: 'Start of year',
  end_of_year: 'End of year',
}

const ANCHOR_KEYS = Object.keys(ANCHOR_RESOLVERS)
const ANCHOR_PATTERN = ANCHOR_KEYS.join('|')

// Pure offset: '+7d', '-30d', '+1w', '-1m', '+2y'
const OFFSET_ONLY_RE = /^([+-])(\d+)([dwmy])$/

// Anchor + optional offset: 'today', 'today+7d', 'start_of_week-2d'
const ANCHOR_WITH_OFFSET_RE = new RegExp(
  `^(${ANCHOR_PATTERN})(?:([+-])(\\d+)([dwmy]))?$`,
)

type Unit = 'd' | 'w' | 'm' | 'y'

function applyOffset(date: Date, sign: '+' | '-', n: number, unit: Unit): Date {
  const signed = sign === '+' ? n : -n
  switch (unit) {
    case 'd':
      return addDays(date, signed)
    case 'w':
      return addDays(date, signed * 7)
    case 'm':
      return addMonths(date, signed)
    case 'y':
      return addYears(date, signed)
  }
}

/**
 * Resolve a relative-date token to a YYYY-MM-DD ISO string in the local
 * timezone. Returns null if the token doesn't match the grammar.
 *
 * `weekStartsOn` (default 1 = Monday) drives the start_of_week /
 * end_of_week anchors. 0 = Sunday-first. landr-m4zq.
 *
 * Examples:
 *   resolveRelativeDate('today')                       -> '2026-05-21'
 *   resolveRelativeDate('+7d')                         -> '2026-05-28'
 *   resolveRelativeDate('today-1d')                    -> '2026-05-20'
 *   resolveRelativeDate('start_of_week')               -> previous Monday
 *   resolveRelativeDate('start_of_week', now, 0)       -> previous Sunday
 *   resolveRelativeDate('end_of_month')                -> last day of month
 *   resolveRelativeDate('not-a-token')                 -> null
 */
export function resolveRelativeDate(
  token: string,
  now: Date = new Date(),
  weekStartsOn: number = 1,
): string | null {
  if (typeof token !== 'string') return null

  const anchorMatch = ANCHOR_WITH_OFFSET_RE.exec(token)
  if (anchorMatch) {
    const [, anchor, sign, nStr, unit] = anchorMatch
    const resolver = ANCHOR_RESOLVERS[anchor!]
    if (!resolver) return null
    let date = resolver(now, weekStartsOn)
    if (sign && nStr && unit) {
      date = applyOffset(date, sign as '+' | '-', Number(nStr), unit as Unit)
    }
    return formatISO(date)
  }

  const offsetMatch = OFFSET_ONLY_RE.exec(token)
  if (offsetMatch) {
    const [, sign, nStr, unit] = offsetMatch
    const base = startOfDayLocal(now)
    const date = applyOffset(base, sign as '+' | '-', Number(nStr), unit as Unit)
    return formatISO(date)
  }

  return null
}

/** Cheap type guard — does this value parse as a relative-date token? */
export function isRelativeToken(value: unknown): value is string {
  if (typeof value !== 'string') return false
  // Use a constant `now` here — only the shape matters, not the result.
  // weekStartsOn doesn't matter for shape-only validation.
  return resolveRelativeDate(value, new Date(2026, 0, 1)) !== null
}

// ---------------------------------------------------------------------------
// Human-readable descriptions for chip labels.

function describeOffset(n: number, unit: Unit, sign: '+' | '-'): string {
  const unitWord = unit === 'd' ? 'day' : unit === 'w' ? 'week' : unit === 'm' ? 'month' : 'year'
  const plural = n === 1 ? unitWord : `${unitWord}s`
  return sign === '+' ? `In ${n} ${plural}` : `${n} ${plural} ago`
}

/**
 * Human-readable label for a relative token, used by filter chips.
 * Returns the raw token if it doesn't parse (so the UI never blanks out).
 */
export function describeRelativeToken(token: string): string {
  if (typeof token !== 'string') return String(token)

  const anchorMatch = ANCHOR_WITH_OFFSET_RE.exec(token)
  if (anchorMatch) {
    const [, anchor, sign, nStr, unit] = anchorMatch
    const anchorLabel = ANCHOR_LABELS[anchor!] ?? anchor!
    if (!sign) return anchorLabel
    const n = Number(nStr)
    const unitWord =
      unit === 'd' ? 'day' : unit === 'w' ? 'week' : unit === 'm' ? 'month' : 'year'
    const plural = n === 1 ? unitWord : `${unitWord}s`
    return sign === '+'
      ? `${anchorLabel} + ${n} ${plural}`
      : `${anchorLabel} − ${n} ${plural}`
  }

  const offsetMatch = OFFSET_ONLY_RE.exec(token)
  if (offsetMatch) {
    const [, sign, nStr, unit] = offsetMatch
    return describeOffset(Number(nStr), unit as Unit, sign as '+' | '-')
  }

  return token
}

// ---------------------------------------------------------------------------
// Named presets — used by the chip "Relative" tab and to compress
// two-token within() ranges into a friendly label ("This week" instead
// of "Start of week → End of week").

export type RelativePreset =
  | { kind: 'single'; key: string; label: string; token: string }
  | { kind: 'range'; key: string; label: string; from: string; to: string }

export const RELATIVE_PRESETS: readonly RelativePreset[] = [
  { kind: 'single', key: 'today', label: 'Today', token: 'today' },
  { kind: 'single', key: 'tomorrow', label: 'Tomorrow', token: 'tomorrow' },
  { kind: 'single', key: 'yesterday', label: 'Yesterday', token: 'yesterday' },
  {
    kind: 'range',
    key: 'this-week',
    label: 'This week',
    from: 'start_of_week',
    to: 'end_of_week',
  },
  {
    kind: 'range',
    key: 'next-week',
    label: 'Next week',
    from: 'start_of_week+1w',
    to: 'end_of_week+1w',
  },
  {
    kind: 'range',
    key: 'this-month',
    label: 'This month',
    from: 'start_of_month',
    to: 'end_of_month',
  },
  {
    kind: 'range',
    key: 'next-month',
    label: 'Next month',
    from: 'start_of_month+1m',
    to: 'end_of_month+1m',
  },
  {
    kind: 'range',
    key: 'last-7-days',
    label: 'Last 7 days',
    from: '-7d',
    to: 'today',
  },
  {
    kind: 'range',
    key: 'next-7-days',
    label: 'Next 7 days',
    from: 'today',
    to: '+7d',
  },
  {
    kind: 'range',
    key: 'next-30-days',
    label: 'Next 30 days',
    from: 'today',
    to: '+30d',
  },
] as const

/** Find a range preset whose from/to tokens match the given pair. */
export function findRangePreset(
  from: string,
  to: string,
): RelativePreset | undefined {
  return RELATIVE_PRESETS.find(
    (p) => p.kind === 'range' && p.from === from && p.to === to,
  )
}

/** Find a single-token preset whose token matches. */
export function findSinglePreset(token: string): RelativePreset | undefined {
  return RELATIVE_PRESETS.find(
    (p) => p.kind === 'single' && p.token === token,
  )
}

// ---------------------------------------------------------------------------
// landr-qc72 — Configurable Next/Last N days ranges.
//
// These compress ['today', 'today+14d'] → "Next 14 days" and ['today-30d',
// 'today'] → "Last 30 days" in chip labels, even when no static preset matches.

/** Inclusive lower bound for the custom-N picker. */
export const CUSTOM_N_DAYS_MIN = 1
/** Inclusive upper bound for the custom-N picker (UX guard). */
export const CUSTOM_N_DAYS_MAX = 365

/**
 * Validate a user-entered N (string or number). Returns the integer when
 * valid, or null otherwise. Mirrors the UI's inline-error gate.
 */
export function validateCustomNDays(input: unknown): number | null {
  const n =
    typeof input === 'number'
      ? input
      : typeof input === 'string' && input.trim() !== ''
        ? Number(input)
        : NaN
  if (!Number.isFinite(n)) return null
  if (!Number.isInteger(n)) return null
  if (n < CUSTOM_N_DAYS_MIN || n > CUSTOM_N_DAYS_MAX) return null
  return n
}

const NEXT_N_DAYS_TO_RE = /^today\+(\d+)d$/
const LAST_N_DAYS_FROM_RE = /^today-(\d+)d$/

export type CustomNDaysRange =
  | { kind: 'next'; n: number }
  | { kind: 'last'; n: number }

/**
 * Detect a "Next N days" / "Last N days" range pair. Returns null if the
 * tokens don't form such a pair or N is out of the supported bounds.
 */
export function detectCustomNDaysRange(
  from: string,
  to: string,
): CustomNDaysRange | null {
  // Next N: ['today', 'today+Nd']
  if (from === 'today') {
    const m = NEXT_N_DAYS_TO_RE.exec(to)
    if (m && m[1]) {
      const n = Number(m[1])
      if (n >= CUSTOM_N_DAYS_MIN && n <= CUSTOM_N_DAYS_MAX) {
        return { kind: 'next', n }
      }
    }
  }
  // Last N: ['today-Nd', 'today']
  if (to === 'today') {
    const m = LAST_N_DAYS_FROM_RE.exec(from)
    if (m && m[1]) {
      const n = Number(m[1])
      if (n >= CUSTOM_N_DAYS_MIN && n <= CUSTOM_N_DAYS_MAX) {
        return { kind: 'last', n }
      }
    }
  }
  return null
}

/** Build the token pair for a Next/Last N days range. */
export function buildCustomNDaysRange(
  kind: 'next' | 'last',
  n: number,
): [string, string] {
  return kind === 'next' ? ['today', `today+${n}d`] : [`today-${n}d`, 'today']
}

/** Friendly label for a custom Next/Last N days range. */
export function describeCustomNDaysRange(range: CustomNDaysRange): string {
  return range.kind === 'next' ? `Next ${range.n} days` : `Last ${range.n} days`
}
