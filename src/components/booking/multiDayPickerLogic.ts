const MS_PER_DAY = 86_400_000

export function parseIso(iso: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso)
  if (!m) return null
  const [, y, mo, d] = m
  const year = Number(y)
  const month = Number(mo)
  const day = Number(d)

  // Validate month and day ranges before constructing the Date.
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null
  }

  const date = new Date(Date.UTC(year, month - 1, day))

  // Check for NaN (malformed Date).
  if (Number.isNaN(date.getTime())) {
    return null
  }

  // Round-trip check: verify the Date's UTC components match the parsed inputs.
  // This catches cases like '2025-02-30' where Date.UTC rolls the day over to
  // March 1, and we want to reject that as invalid.
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() + 1 !== month ||
    date.getUTCDate() !== day
  ) {
    return null
  }

  return date
}

export function toIso(date: Date): string {
  const y = date.getUTCFullYear().toString().padStart(4, '0')
  const m = (date.getUTCMonth() + 1).toString().padStart(2, '0')
  const d = date.getUTCDate().toString().padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function todayIso(): string {
  const now = new Date()
  return toIso(
    new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())),
  )
}

export function startOfMonth(date: Date): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1))
}

export function addMonths(date: Date, n: number): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + n, 1))
}

export function diffDays(aIso: string, bIso: string): number {
  const a = parseIso(aIso)
  const b = parseIso(bIso)
  if (!a || !b) return 0
  return Math.round((b.getTime() - a.getTime()) / MS_PER_DAY)
}

export function rangeIso(startIso: string, endIso: string): string[] {
  const start = parseIso(startIso)
  const end = parseIso(endIso)
  if (!start || !end) return []
  const out: string[] = []
  const lo = start.getTime() <= end.getTime() ? start : end
  const hi = start.getTime() <= end.getTime() ? end : start
  for (let t = lo.getTime(); t <= hi.getTime(); t += MS_PER_DAY) {
    out.push(toIso(new Date(t)))
  }
  return out
}

export function sortedUnique(days: string[]): string[] {
  return [...new Set(days)].sort()
}

export function isShiftish(e: {
  shiftKey: boolean
  ctrlKey: boolean
  metaKey: boolean
}): boolean {
  return e.shiftKey || e.ctrlKey || e.metaKey
}

/** Pure-function selection update for the picker. See MultiDayPicker.tsx for
 *  UX semantics. Lives in its own module so the component file only exports
 *  React components (keeps Fast Refresh happy).
 */
export function nextSelection(
  current: string[],
  anchor: string | null,
  day: string,
  toggle: boolean,
): { days: string[]; anchor: string | null } {
  if (toggle) {
    const has = current.includes(day)
    const next = has ? current.filter((d) => d !== day) : [...current, day]
    return { days: sortedUnique(next), anchor }
  }

  if (current.length === 0 || anchor === null) {
    return { days: [day], anchor: day }
  }

  if (day === anchor) {
    return { days: current, anchor }
  }

  const filled = rangeIso(anchor, day)
  return { days: sortedUnique([...current, ...filled]), anchor }
}

export const MS_PER_DAY_CONST = MS_PER_DAY
