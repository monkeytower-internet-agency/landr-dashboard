// landr-wwhn.17 — View-layer data pipe for entity_type='ticket'.
//
// Mirrors the shape of views-bookings-data.ts so the ViewPage branch
// pattern stays consistent: fetch → filter → hand pure items to the layout.
//
// Filtering is intentionally minimal for v1 — the ticket board only needs:
//   - status   (for column assignment — not a filter chip, but used internally)
//   - area / label  (chip: label_area = 'dashboard' | 'booking-widget' | 'app' | 'api')
//
// More complex ticket filters (priority, type, perceived_impact, date range)
// are forward-compatible: the unknown-field pass-through means unrecognised
// filter field keys are silently skipped, so future filter chips won't break
// old view configs.
//
// The data fetch is direct Supabase REST (per write-routing-convention: plain
// SELECT with RLS is exactly the plain-row-read pattern).

import { useQuery, type UseQueryResult } from '@tanstack/react-query'
import { type TicketRow, type TicketStatus } from '@/lib/tickets'

// Re-export for callers that want to use the view-layer item vocabulary.
export type TicketItem = TicketRow

// ---- Area / label filter ---------------------------------------------------
//
// The filter chip uses the canonical area values from the labels migration
// (landr-wwhn.4). Tickets carry labels via the ticket_labels join table.
// In v1 we derive area-filter support from a ticketConfig.labelAreas key
// stored in the view config JSON rather than loading the full ticket_labels
// join (which would require a separate query per ticket). This keeps the
// board fast — the operator picks an area from the filter bar and the client
// filters locally.
//
// ticketConfig.labelAreas: string[]  (subset of TICKET_LABEL_AREAS)
// An empty array or absent key = no area filter = show all tickets.

export const TICKET_LABEL_AREAS = [
  'dashboard',
  'booking-widget',
  'app',
  'api',
  'other',
] as const
export type TicketLabelArea = (typeof TICKET_LABEL_AREAS)[number]

export function readTicketConfigLabelAreas(
  config: Record<string, unknown>,
): TicketLabelArea[] {
  const tc = (config as { ticketConfig?: unknown }).ticketConfig
  if (!tc || typeof tc !== 'object') return []
  const raw = (tc as { labelAreas?: unknown }).labelAreas
  if (!Array.isArray(raw)) return []
  return raw.filter(
    (v): v is TicketLabelArea =>
      typeof v === 'string' &&
      (TICKET_LABEL_AREAS as readonly string[]).includes(v),
  )
}

// ---- Status filter (for board views that want to pre-select columns) -------
//
// ticketConfig.statuses: TicketStatus[]  (subset)
// If absent / empty, all statuses are shown (the board renders all columns).

export function readTicketConfigStatuses(
  config: Record<string, unknown>,
): TicketStatus[] {
  const tc = (config as { ticketConfig?: unknown }).ticketConfig
  if (!tc || typeof tc !== 'object') return []
  const raw = (tc as { statuses?: unknown }).statuses
  if (!Array.isArray(raw)) return []
  const VALID_STATUSES: ReadonlySet<string> = new Set([
    'backlog', 'ready', 'in_progress', 'in_review', 'done',
  ])
  return raw.filter(
    (v): v is TicketStatus =>
      typeof v === 'string' && VALID_STATUSES.has(v),
  )
}

// ---- Filter application ----------------------------------------------------

/**
 * Apply view-level filters to a list of ticket rows. In v1 only the
 * ticketConfig.labelAreas filter is supported (client-side area filter).
 * Unknown filter keys pass through without dropping tickets (forward compat).
 *
 * NOTE: Because ticket_labels is a join table we cannot do true server-side
 * label filtering via the tickets REST endpoint without a custom Postgres view
 * or a FastAPI endpoint. For v1 we accept that the label filter is
 * cosmetic-only (we fetch all tickets then hide those with no matching area
 * label). The ticket count in the column header reflects the filtered count.
 * A true server-push label filter (embedding labels[] into the tickets SELECT
 * via Supabase's embedded select) is a straightforward v1.5 upgrade.
 */
export function applyTicketViewFilters(
  tickets: TicketRow[],
  config: Record<string, unknown>,
): TicketRow[] {
  const areas = readTicketConfigLabelAreas(config)
  if (areas.length === 0) return tickets
  // Area filter: keep tickets whose label areas overlap with the selected set.
  // We approximate this client-side by checking a `labels` field embedded
  // on the row (added in useViewTickets below). Tickets without any labels
  // are hidden when a filter is active.
  return tickets.filter((t) => {
    const embedded = (t as TicketRow & { labels?: { area: string }[] }).labels
    if (!embedded || embedded.length === 0) return false
    return embedded.some((l) => (areas as string[]).includes(l.area))
  })
}

// ---- React Query hook ------------------------------------------------------

/**
 * Fetch tickets for a view, embedding label areas so the client-side area
 * filter can work without a second round-trip. The join is expressed via
 * Supabase's embedded-select syntax: `ticket_labels(labels(area, color))`.
 *
 * Cache key is shared with the standalone board so a view-to-board switch
 * doesn't refetch.
 */
export function useViewTickets(
  operatorId: string | null | undefined,
): UseQueryResult<TicketRow[], Error> {
  return useQuery<TicketRow[], Error>({
    queryKey: ['view-tickets', operatorId ?? 'none'],
    queryFn: () => fetchTicketsWithLabels(operatorId as string),
    enabled: !!operatorId,
  })
}

// ---- Internal fetch with embedded labels -----------------------------------
//
// Adds a `labels` array to each TicketRow so the area filter can work
// client-side. The field is cast via unknown to avoid widening TicketRow's
// type (labels is a derived field, not part of the canonical schema).

import { supabase } from '@/lib/supabase'

async function fetchTicketsWithLabels(operatorId: string): Promise<TicketRow[]> {
  const { data, error } = await supabase
    .from('tickets')
    .select(
      `
      id,
      context,
      type,
      title,
      body,
      status,
      priority,
      perceived_impact,
      reporter_id,
      operator_id,
      assignee_id,
      blocked,
      created_at,
      updated_at,
      ticket_labels(
        labels(id, name, area, color)
      )
    `,
    )
    .eq('operator_id', operatorId)
    .order('priority', { ascending: true })
    .order('created_at', { ascending: false })
    .limit(500)

  if (error) throw new Error(error.message)

  // Flatten embedded ticket_labels → labels into a top-level `labels` array
  // for convenient area-filter access. The raw Supabase join returns an array
  // of `{ labels: { id, name, area, color } | null }` objects.
  const rows = (data ?? []) as Array<
    TicketRow & {
      ticket_labels?: Array<{ labels: { id: string; name: string; area: string; color: string | null } | null }>
    }
  >

  return rows.map((r) => {
    const labelArr = (r.ticket_labels ?? [])
      .map((tl) => tl.labels)
      .filter((l): l is { id: string; name: string; area: string; color: string | null } => l !== null)
    // Attach labels as a side-channel field (not part of TicketRow proper).
    const { ticket_labels: _drop, ...rest } = r as typeof r & { ticket_labels?: unknown }
    return { ...rest, labels: labelArr } as unknown as TicketRow
  })
}
