// landr-lp9t — helpers for the Schedule list view. The List view groups
// consecutive days of identical (capacity, slot config) into a single
// "Mon Jun 1 → Mon Jun 30: 6 seats/day" row so a long uniform season
// renders as one line instead of thirty calendar cells.

import type { AvailabilityRow } from '@/lib/availability'

export type CompactedRange = {
  /** ISO date (YYYY-MM-DD) of the first day in the range. */
  startDate: string
  /** ISO date (YYYY-MM-DD) of the last day in the range (inclusive). */
  endDate: string
  /** Seats per day across the whole range (identical for every day). */
  capacity: number
  /** Sum of capacity_reserved across the range — usable for "X of Y booked". */
  reserved: number
  /** Length of the range in days (inclusive); single-day ranges report 1. */
  days: number
  /** Source rows that fed into this range, in date order. Useful for click→edit. */
  rows: AvailabilityRow[]
}

/**
 * Parse a YYYY-MM-DD ISO date as a UTC midnight Date. Using UTC sidesteps
 * DST boundary glitches when we ask "is the next row exactly +1 day?".
 */
function parseIsoUtc(iso: string): Date {
  return new Date(`${iso}T00:00:00Z`)
}

/**
 * Returns true when `next` is exactly one calendar day after `prev`.
 * Both inputs are YYYY-MM-DD ISO strings.
 */
function isNextDay(prev: string, next: string): boolean {
  const a = parseIsoUtc(prev)
  const b = parseIsoUtc(next)
  const deltaDays = (b.getTime() - a.getTime()) / 86_400_000
  return deltaDays === 1
}

/**
 * Stable JSON-ish signature for the slot configuration we use to decide
 * whether two adjacent days belong in the same compacted range. We pair
 * start_time + end_time so an open-day (null/null) and a 09:00–11:00 slot
 * sort into different ranges even at the same capacity.
 *
 * AvailabilityRow doesn't carry a structured slot_config field (slots are
 * implied by the start_time / end_time pair on each row), so we fingerprint
 * that pair. If multiple rows share a date (multi-slot day), upstream code
 * should pass a pre-aggregated per-date list — see compactRanges contract.
 */
function slotKey(row: AvailabilityRow): string {
  return `${row.start_time ?? ''}|${row.end_time ?? ''}`
}

/**
 * Walks `rows` sorted by date and groups runs of consecutive days where
 * capacity AND slot fingerprint are identical AND each row is exactly one
 * day after the previous. The first non-matching row starts a new range.
 *
 * Contract:
 *   - Input may be unsorted; we sort defensively by date.
 *   - Multiple rows on the same date (multi-slot day) are emitted as their
 *     own one-day range each — they don't fold into adjacent ranges since
 *     the day already has a non-trivial shape.
 *   - Empty input → empty output (acceptance criterion 4).
 */
export function compactRanges(rows: AvailabilityRow[]): CompactedRange[] {
  if (rows.length === 0) return []

  // Defensive sort — caller may hand us rows in fetch order, not by date.
  const sorted = [...rows].sort((a, b) => a.date.localeCompare(b.date))

  // Detect dates that appear multiple times (multi-slot days). Those days
  // can't compact with neighbours because their "shape" is the whole bundle
  // of slots, which doesn't generalise across days.
  const dateCounts = new Map<string, number>()
  for (const row of sorted) {
    dateCounts.set(row.date, (dateCounts.get(row.date) ?? 0) + 1)
  }

  const out: CompactedRange[] = []
  let current: CompactedRange | null = null
  let currentSlotKey: string | null = null

  for (const row of sorted) {
    const dayHasMultipleRows = (dateCounts.get(row.date) ?? 0) > 1
    const rowSlotKey = slotKey(row)

    // Same-date rows always coalesce into the current range (which is the
    // multi-slot bundle for that day) — they share startDate/endDate so the
    // range stays one calendar day, but reserved + rows accumulate.
    if (current && row.date === current.endDate) {
      current.reserved += row.capacity_reserved
      current.rows.push(row)
      // The capacity field on a multi-slot day is the sum of per-slot
      // capacities, matching the calendar's day-summary aggregation
      // (groupByDate in AvailabilityCalendar.tsx).
      current.capacity += row.capacity
      // Mark this date as a multi-slot bundle so it can't extend forward.
      currentSlotKey = `__multi_${row.date}__`
      continue
    }

    const canExtend =
      current !== null &&
      !dayHasMultipleRows &&
      isNextDay(current.endDate, row.date) &&
      current.capacity === row.capacity &&
      currentSlotKey === rowSlotKey

    if (canExtend && current) {
      current.endDate = row.date
      current.reserved += row.capacity_reserved
      current.days += 1
      current.rows.push(row)
      continue
    }

    // Either no current range, or this row doesn't continue it — emit + start.
    if (current) out.push(current)
    current = {
      startDate: row.date,
      endDate: row.date,
      capacity: row.capacity,
      reserved: row.capacity_reserved,
      days: 1,
      rows: [row],
    }
    // Multi-slot days are emitted alone so they never extend or get extended.
    currentSlotKey = dayHasMultipleRows ? `__multi_${row.date}__` : rowSlotKey
  }

  if (current) out.push(current)
  return out
}

/**
 * Locale-aware long-date formatter (e.g. "Mon Jun 1"). Used by the list
 * view; tests import this for snapshot stability.
 */
export function formatRangeDate(iso: string): string {
  // Build a UTC date so "2026-06-01" always renders as Jun 1 regardless of
  // the browser's timezone offset (avoids the classic "off-by-one" bug
  // where late-evening TZs render 2026-06-01 as May 31).
  const d = parseIsoUtc(iso)
  return d.toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  })
}
