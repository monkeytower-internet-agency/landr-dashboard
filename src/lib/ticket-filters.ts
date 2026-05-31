// landr-7dya.11 — Shell-level ticket filter model (pure, no React / no I/O).
//
// The ticket-system app-view (TicketSystemShell) owns a single shared filter
// bar that spans BOTH the Inbox and the Board surfaces. This module is the pure
// core of that filter: the filter shape, its defaults, URL (de)serialization
// for deep-linking, the chip-count helper, and the per-ticket match predicate.
//
// DESIGN — server-side where possible (PostgREST), client-side for derived:
//   The filters split into two classes:
//
//   1. ROW-INTRINSIC filters — columns on tickets_staff. These are pushed to
//      the server (PostgREST `.eq`/`.in`/`.gte`/`.lte`) by ticket-filter-data.ts
//      so the queue stays snappy at 30-40 customers:
//        operator_id, status, type, severity, priority, moscow,
//        perceived_impact, blocked, unassigned, origin_tier,
//        created/updated time range.
//
//   2. DERIVED-STATE filters — depend on the calling staff user's relationship
//      to a ticket (notifications + watchers tables). These are resolved into
//      ticket-id Sets once (ticket-filter-data.ts) and applied as O(1) set
//      membership here:
//        assignedToMe, unread, watching, mentionedMe.
//
//   `assignedToMe` is technically row-intrinsic (assignee_id = me) but we model
//   it as a flag (rather than reusing `assigneeId`) because the quick-chip UX
//   needs a one-tap toggle that resolves "me" at apply time without the UI
//   knowing the current user's id. ticket-filter-data.ts pushes it server-side
//   when the current user id is known.
//
// All filters combine with AND. An empty filter (DEFAULT) matches everything.

import type {
  TicketMoscow,
  TicketPerceivedImpact,
  TicketPriority,
  TicketStatus,
  TicketType,
} from '@/lib/tickets'

// ---- severity (mirrors public.ticket_severity enum) -------------------------
//
// Not previously surfaced as a TS union in tickets.ts (it lived as `string` on
// the staff fields). We declare the canonical union here for the filter picker;
// it matches the migration enum exactly (20260524070041_tickets.sql).

export const TICKET_SEVERITIES = [
  'blocker',
  'critical',
  'major',
  'minor',
  'trivial',
] as const
export type TicketSeverity = (typeof TICKET_SEVERITIES)[number]

export const SEVERITY_LABEL: Record<TicketSeverity, string> = {
  blocker: 'Blocker',
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  trivial: 'Trivial',
}

// ---- origin tier (mirrors tickets.origin_tier — ADR 0005) -------------------

export const ORIGIN_TIERS = ['prod', 'staging'] as const
export type OriginTier = (typeof ORIGIN_TIERS)[number]

export const ORIGIN_TIER_LABEL: Record<OriginTier, string> = {
  prod: 'Production',
  staging: 'Staging',
}

// ---- time range -------------------------------------------------------------
//
// A relative window keeps the URL compact and human-readable (?since=7d) and is
// resolved to an absolute ISO timestamp at fetch time (so a deep-link stays
// meaningful tomorrow). The `field` decides whether the window applies to
// created_at or updated_at.

export const TIME_RANGES = ['24h', '7d', '30d', '90d'] as const
export type TimeRange = (typeof TIME_RANGES)[number]

export const TIME_RANGE_LABEL: Record<TimeRange, string> = {
  '24h': 'Last 24 hours',
  '7d': 'Last 7 days',
  '30d': 'Last 30 days',
  '90d': 'Last 90 days',
}

export const TIME_RANGE_MS: Record<TimeRange, number> = {
  '24h': 24 * 60 * 60 * 1000,
  '7d': 7 * 24 * 60 * 60 * 1000,
  '30d': 30 * 24 * 60 * 60 * 1000,
  '90d': 90 * 24 * 60 * 60 * 1000,
}

export type TimeField = 'created' | 'updated'

/**
 * Resolve a relative time range to an absolute ISO lower-bound timestamp,
 * relative to `now` (injectable for deterministic tests). Returns null when
 * there is no range set (no lower bound = match everything).
 */
export function resolveTimeFloorISO(
  range: TimeRange | null,
  now: number = Date.now(),
): string | null {
  if (range === null) return null
  return new Date(now - TIME_RANGE_MS[range]).toISOString()
}

// ---- the filter shape -------------------------------------------------------

export type TicketFilter = {
  // Row-intrinsic (server-pushable)
  operatorId: string | null
  status: TicketStatus | null
  type: TicketType | null
  severity: TicketSeverity | null
  priority: TicketPriority | null
  moscow: TicketMoscow | null
  perceivedImpact: TicketPerceivedImpact | null
  originTier: OriginTier | null
  /** true = blocked only. We model only the "blocked-only" direction (the
   *  common triage need); there is no "unblocked-only" chip. */
  blockedOnly: boolean
  /** true = unassigned only (assignee_id IS NULL). Mutually meaningful with
   *  assignedToMe — both true is an empty intersection, which is allowed. */
  unassignedOnly: boolean

  // Time window
  timeRange: TimeRange | null
  timeField: TimeField

  // Derived-state (client-side set membership, resolved against the caller)
  assignedToMe: boolean
  unreadOnly: boolean
  watchingOnly: boolean
  mentionedMeOnly: boolean
}

export const TICKET_FILTER_DEFAULTS: TicketFilter = {
  operatorId: null,
  status: null,
  type: null,
  severity: null,
  priority: null,
  moscow: null,
  perceivedImpact: null,
  originTier: null,
  blockedOnly: false,
  unassignedOnly: false,
  timeRange: null,
  timeField: 'updated',
  assignedToMe: false,
  unreadOnly: false,
  watchingOnly: false,
  mentionedMeOnly: false,
}

/** Count of distinct active filter facets (for the "Filters (N)" badge). */
export function activeFilterCount(f: TicketFilter): number {
  let n = 0
  if (f.operatorId !== null) n++
  if (f.status !== null) n++
  if (f.type !== null) n++
  if (f.severity !== null) n++
  if (f.priority !== null) n++
  if (f.moscow !== null) n++
  if (f.perceivedImpact !== null) n++
  if (f.originTier !== null) n++
  if (f.blockedOnly) n++
  if (f.unassignedOnly) n++
  if (f.timeRange !== null) n++
  if (f.assignedToMe) n++
  if (f.unreadOnly) n++
  if (f.watchingOnly) n++
  if (f.mentionedMeOnly) n++
  return n
}

/** True when no facet is active (DEFAULT state — matches everything). */
export function isFilterEmpty(f: TicketFilter): boolean {
  return activeFilterCount(f) === 0
}

// ---- URL (de)serialization --------------------------------------------------
//
// Deep-linkable: every active facet maps to a short, stable query-param key.
// The timeField default ('updated') is only written when a range is present AND
// the field is non-default, so the common case stays URL-clean. Unknown / stale
// values are dropped on parse (forward/backward compatible).

const PARAM = {
  operator: 'op',
  status: 'status',
  type: 'type',
  severity: 'sev',
  priority: 'prio',
  moscow: 'moscow',
  impact: 'impact',
  tier: 'tier',
  blocked: 'blocked',
  unassigned: 'unassigned',
  since: 'since',
  sinceField: 'sinceField',
  mine: 'mine',
  unread: 'unread',
  watching: 'watching',
  mentioned: 'mentioned',
} as const

const VALID_STATUS = new Set<string>([
  'backlog',
  'ready',
  'in_progress',
  'in_review',
  'done',
])
const VALID_TYPE = new Set<string>(['bug', 'feature', 'annoyance', 'question'])
const VALID_PRIORITY = new Set<string>(['p0', 'p1', 'p2'])
const VALID_MOSCOW = new Set<string>(['must', 'should', 'could', 'wont'])
const VALID_IMPACT = new Set<string>(['blocking', 'annoying', 'idea'])
const VALID_SEVERITY = new Set<string>(TICKET_SEVERITIES)
const VALID_TIER = new Set<string>(ORIGIN_TIERS)
const VALID_RANGE = new Set<string>(TIME_RANGES)

function pick<T extends string>(
  raw: string | null,
  valid: ReadonlySet<string>,
): T | null {
  if (raw === null) return null
  return valid.has(raw) ? (raw as T) : null
}

function readBool(params: URLSearchParams, key: string): boolean {
  return params.get(key) === '1'
}

/**
 * Parse a TicketFilter out of URLSearchParams. Missing / invalid values fall
 * back to the default for that facet (so a partial or stale URL is always a
 * valid filter). Pure — does not mutate the input.
 */
export function filterFromParams(params: URLSearchParams): TicketFilter {
  const operatorId = params.get(PARAM.operator)
  const sinceField = params.get(PARAM.sinceField)
  return {
    operatorId: operatorId && operatorId.length > 0 ? operatorId : null,
    status: pick<TicketStatus>(params.get(PARAM.status), VALID_STATUS),
    type: pick<TicketType>(params.get(PARAM.type), VALID_TYPE),
    severity: pick<TicketSeverity>(params.get(PARAM.severity), VALID_SEVERITY),
    priority: pick<TicketPriority>(params.get(PARAM.priority), VALID_PRIORITY),
    moscow: pick<TicketMoscow>(params.get(PARAM.moscow), VALID_MOSCOW),
    perceivedImpact: pick<TicketPerceivedImpact>(
      params.get(PARAM.impact),
      VALID_IMPACT,
    ),
    originTier: pick<OriginTier>(params.get(PARAM.tier), VALID_TIER),
    blockedOnly: readBool(params, PARAM.blocked),
    unassignedOnly: readBool(params, PARAM.unassigned),
    timeRange: pick<TimeRange>(params.get(PARAM.since), VALID_RANGE),
    timeField: sinceField === 'created' ? 'created' : 'updated',
    assignedToMe: readBool(params, PARAM.mine),
    unreadOnly: readBool(params, PARAM.unread),
    watchingOnly: readBool(params, PARAM.watching),
    mentionedMeOnly: readBool(params, PARAM.mentioned),
  }
}

/**
 * Write a TicketFilter into a URLSearchParams, returning a NEW instance based
 * on `base` (so we preserve any unrelated params, e.g. ?open=<id>). Only active
 * facets are written; cleared facets are deleted. Pure w.r.t. `base`.
 */
export function filterToParams(
  filter: TicketFilter,
  base?: URLSearchParams,
): URLSearchParams {
  const p = new URLSearchParams(base ?? undefined)
  const set = (key: string, value: string | null) => {
    if (value === null || value === '') p.delete(key)
    else p.set(key, value)
  }
  const setBool = (key: string, value: boolean) => {
    if (value) p.set(key, '1')
    else p.delete(key)
  }

  set(PARAM.operator, filter.operatorId)
  set(PARAM.status, filter.status)
  set(PARAM.type, filter.type)
  set(PARAM.severity, filter.severity)
  set(PARAM.priority, filter.priority)
  set(PARAM.moscow, filter.moscow)
  set(PARAM.impact, filter.perceivedImpact)
  set(PARAM.tier, filter.originTier)
  setBool(PARAM.blocked, filter.blockedOnly)
  setBool(PARAM.unassigned, filter.unassignedOnly)
  set(PARAM.since, filter.timeRange)
  // Only persist a non-default time field, and only when a range is set.
  if (filter.timeRange !== null && filter.timeField === 'created') {
    p.set(PARAM.sinceField, 'created')
  } else {
    p.delete(PARAM.sinceField)
  }
  setBool(PARAM.mine, filter.assignedToMe)
  setBool(PARAM.unread, filter.unreadOnly)
  setBool(PARAM.watching, filter.watchingOnly)
  setBool(PARAM.mentioned, filter.mentionedMeOnly)

  return p
}

// ---- per-ticket match predicate (client-side fallback / belt-and-suspenders)-
//
// The server query already narrows the row-intrinsic facets, but BOTH surfaces
// (Inbox, Board) fetch their OWN row sets independently (operator-scoped),
// rather than re-querying through the shell. So the shell hands each surface a
// predicate it intersects with its already-loaded rows. The predicate therefore
// must re-check EVERY facet (row-intrinsic + derived) — it cannot assume the
// rows came from the filtered query.
//
// `ctx` carries the derived-state membership sets + the current user id, all
// precomputed once at the shell level.

export type TicketLike = {
  id: string
  status: TicketStatus
  type: TicketType
  priority: TicketPriority
  perceived_impact: TicketPerceivedImpact
  moscow: TicketMoscow | null
  operator_id: string | null
  assignee_id: string | null
  blocked: boolean
  created_at: string
  updated_at: string
  // Optional staff/relay fields — present on TicketRowStaff, absent on the
  // public TicketRow the board loads. Treated as "unknown" (don't exclude) when
  // missing so the board isn't blanked by a severity/tier filter it can't see.
  severity?: string | null
  origin_tier?: string | null
}

export type FilterMatchContext = {
  /** public.users.id of the calling staff user (null until resolved). */
  currentUserId: string | null
  /** ticket ids assigned to the current user (server-derivable, but also here). */
  assignedToMeIds: ReadonlySet<string>
  /** ticket ids with an unread notification for the current user. */
  unreadIds: ReadonlySet<string>
  /** ticket ids the current user watches. */
  watchingIds: ReadonlySet<string>
  /** ticket ids where the current user was @mentioned. */
  mentionedMeIds: ReadonlySet<string>
  /** Resolved absolute lower-bound ISO for the time window (null = no bound). */
  timeFloorISO: string | null
}

/**
 * True iff `ticket` passes EVERY active facet of `filter` (AND semantics).
 *
 * Row-intrinsic facets that reference a field the row does not carry (e.g.
 * severity / origin_tier on a public board row) are treated as PASS — we cannot
 * exclude on data we don't have, and excluding would wrongly empty the board.
 */
export function ticketMatchesFilter(
  ticket: TicketLike,
  filter: TicketFilter,
  ctx: FilterMatchContext,
): boolean {
  // ---- row-intrinsic ----
  if (filter.operatorId !== null && ticket.operator_id !== filter.operatorId)
    return false
  if (filter.status !== null && ticket.status !== filter.status) return false
  if (filter.type !== null && ticket.type !== filter.type) return false
  if (filter.priority !== null && ticket.priority !== filter.priority)
    return false
  if (filter.moscow !== null && ticket.moscow !== filter.moscow) return false
  if (
    filter.perceivedImpact !== null &&
    ticket.perceived_impact !== filter.perceivedImpact
  )
    return false
  if (filter.blockedOnly && !ticket.blocked) return false
  if (filter.unassignedOnly && ticket.assignee_id !== null) return false

  // severity / origin_tier are only present on staff rows — skip the facet when
  // the field is absent (undefined), exclude only on a present mismatch.
  if (filter.severity !== null && ticket.severity !== undefined) {
    if (ticket.severity !== filter.severity) return false
  }
  if (filter.originTier !== null && ticket.origin_tier !== undefined) {
    if (ticket.origin_tier !== filter.originTier) return false
  }

  // ---- time window ----
  if (ctx.timeFloorISO !== null) {
    const stamp =
      filter.timeField === 'created' ? ticket.created_at : ticket.updated_at
    // ISO-8601 strings compare lexicographically in chronological order.
    if (stamp < ctx.timeFloorISO) return false
  }

  // ---- derived-state ----
  if (filter.assignedToMe) {
    // Prefer the precomputed set; fall back to a direct compare if the set is
    // empty but we know the user id (keeps the predicate correct even before
    // the assignedToMe set is populated).
    const byId =
      ctx.currentUserId !== null && ticket.assignee_id === ctx.currentUserId
    if (!byId && !ctx.assignedToMeIds.has(ticket.id)) return false
  }
  if (filter.unreadOnly && !ctx.unreadIds.has(ticket.id)) return false
  if (filter.watchingOnly && !ctx.watchingIds.has(ticket.id)) return false
  if (filter.mentionedMeOnly && !ctx.mentionedMeIds.has(ticket.id)) return false

  return true
}
