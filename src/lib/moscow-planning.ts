// landr-wwhn.23 — MoSCoW release-planning helpers.
//
// Pure logic extracted from the .tsx route so the component file exports only
// components (react-refresh/only-export-components rule). Tests can import
// these functions directly without mounting any component.

import type { TicketRow } from '@/lib/tickets'
import { MOSCOW_VALUES, type TicketMoscow } from '@/lib/tickets'

// ---- Types ------------------------------------------------------------------

export type MoscowBucket = {
  key: TicketMoscow | null
  label: string
  tickets: TicketRow[]
}

// ---- Bucket builder ---------------------------------------------------------

/**
 * Group an array of tickets into MoSCoW buckets in canonical order:
 * Must → Should → Could → Won't → Unplanned (null).
 *
 * Buckets are always returned in full (even when empty) so the UI renders
 * a stable set of sections and the "empty" placeholder is always visible.
 *
 * @param tickets   All tickets to bucket.
 * @param typeFilter  When 'feature', only feature tickets are included.
 *                    When 'all', all types are included.
 */
export function buildMoscowBuckets(
  tickets: TicketRow[],
  typeFilter: 'feature' | 'all',
): MoscowBucket[] {
  const filtered =
    typeFilter === 'feature'
      ? tickets.filter((t) => t.type === 'feature')
      : tickets

  const LABEL: Record<TicketMoscow, string> = {
    must: 'Must have',
    should: 'Should have',
    could: 'Could have',
    wont: "Won't have",
  }

  const planned: MoscowBucket[] = MOSCOW_VALUES.map((key) => ({
    key,
    label: LABEL[key],
    tickets: filtered.filter((t) => t.moscow === key),
  }))

  const unplanned: MoscowBucket = {
    key: null,
    label: 'Unplanned',
    tickets: filtered.filter((t) => t.moscow === null || t.moscow === undefined),
  }

  return [...planned, unplanned]
}

// ---- Stats ------------------------------------------------------------------

export type MoscowStats = {
  total: number
  planned: number
  unplanned: number
  byTag: Record<TicketMoscow, number>
}

/**
 * Compute summary statistics for a set of tickets for the planning header.
 */
export function computeMoscowStats(tickets: TicketRow[]): MoscowStats {
  const byTag: Record<TicketMoscow, number> = {
    must: 0,
    should: 0,
    could: 0,
    wont: 0,
  }

  let unplanned = 0
  for (const t of tickets) {
    if (t.moscow && t.moscow in byTag) {
      byTag[t.moscow as TicketMoscow]++
    } else {
      unplanned++
    }
  }

  const planned = tickets.length - unplanned

  return {
    total: tickets.length,
    planned,
    unplanned,
    byTag,
  }
}
