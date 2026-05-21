// landr-panu — customer segments (tag-based saved groups).
//
// A "segment" is a named combinatorial AND over operator tag ids:
//   { id, name, tagIds: [...], color, createdAt }
//
// "Has tags A AND B" is the only filter primitive in v1. Render the
// saved segments as quick-filter chips above the /contacts table so
// the operator can flip from "show all" to "show VIP customers" in one
// click without re-picking tags.
//
// Storage shape (v1, single JSON blob per operator):
//
//   landr.dashboard.contactSegments.<operatorId> = {
//     v: 1,
//     segments: [ { id, name, tagIds, color, createdAt }, … ],
//   }
//
// Why per-operator (not per-user): segments reference tag ids from
// operator_tags, which are operator-scoped. A segment from operator A
// would dangle if surfaced under operator B because the tag ids would
// resolve to nothing. Keep them next to the data they reference.
//
// Why localStorage (not server-backed) in v1: ticket scope. Saved Views
// (landr-v0xg) is the long-term home for cross-device segments; this
// ships the operator-facing UX first and lets the v2 migration map
// each localStorage segment to a saved-view row.
//
// Filter semantics: AND-of-tags. A contact passes the segment iff it
// has EVERY tagId in the segment's list. Empty `tagIds` matches every
// contact (defensive — UI should disallow creating one, but the filter
// stays a safe identity in that case).

import { useCallback, useEffect, useMemo, useState } from 'react'

/** Versioned localStorage envelope so a future shape migration can
 *  distinguish v1 blobs from later versions without losing data. */
export const SEGMENT_STORAGE_VERSION = 1

/** Same hex palette as operator tags — keeps the chip language
 *  consistent. Importing from tags.ts would create a circular dep risk
 *  later (segments is leaf-level), so we mirror the values here. */
export const SEGMENT_PALETTE: readonly string[] = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
] as const

export type Segment = {
  /** Stable id (uuid v4-ish via crypto.randomUUID when available, else
   *  a timestamped fallback so test envs without webcrypto still work). */
  id: string
  name: string
  /** AND-of-tags membership predicate. Empty list = match every row. */
  tagIds: string[]
  /** Hex '#RRGGBB' chip background; deterministic fallback in defaultColorFor. */
  color: string
  /** ISO-8601 timestamp; recorded once on create. */
  createdAt: string
}

export type SegmentInput = {
  name: string
  tagIds: string[]
  color?: string
}

export type SegmentPatch = Partial<{
  name: string
  tagIds: string[]
  color: string
}>

/** Stored blob shape. Kept tiny on purpose — operators with thousands
 *  of segments are not a v1 scenario. */
type StoredEnvelope = {
  v: number
  segments: Segment[]
}

/** Custom event fired on same-tab writes so `useSegments` re-reads.
 *  Mirrors recently-viewed (landr-ne58) — native `storage` events only
 *  fire in OTHER tabs, so same-tab observers need their own signal. */
const SAME_TAB_EVENT = 'landr:segments-changed'

export function storageKey(operatorId: string): string {
  return `landr.dashboard.contactSegments.${operatorId}`
}

// ---- color helpers ---------------------------------------------------

/** Deterministic palette pick from a name. FNV-1a-ish 32-bit hash so the
 *  same name always lands on the same color across reloads / devices.
 *  Matches the `defaultColorFor` shape in lib/tags.ts. */
export function defaultColorFor(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return SEGMENT_PALETTE[hash % SEGMENT_PALETTE.length]
}

// ---- id helpers ------------------------------------------------------

/** crypto.randomUUID when present (jsdom + modern browsers), fallback to
 *  a timestamp + counter so old/exotic envs still produce unique ids. */
let _counter = 0
function newId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID()
  }
  _counter += 1
  return `seg-${Date.now()}-${_counter}`
}

// ---- guards ----------------------------------------------------------

function isStringArray(v: unknown): v is string[] {
  return Array.isArray(v) && v.every((x) => typeof x === 'string')
}

function isSegment(v: unknown): v is Segment {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<Segment>
  return (
    typeof s.id === 'string' &&
    typeof s.name === 'string' &&
    isStringArray(s.tagIds) &&
    typeof s.color === 'string' &&
    typeof s.createdAt === 'string'
  )
}

// ---- storage helpers (pure) -----------------------------------------

/** Parse the raw localStorage blob into a Segment[]. Defensive: corrupt
 *  payloads, wrong shapes, or unknown future versions degrade to []. */
export function readStored(operatorId: string): Segment[] {
  if (typeof window === 'undefined' || !operatorId) return []
  try {
    const raw = window.localStorage.getItem(storageKey(operatorId))
    if (!raw) return []
    const parsed = JSON.parse(raw) as Partial<StoredEnvelope>
    if (!parsed || typeof parsed !== 'object') return []
    if (parsed.v !== SEGMENT_STORAGE_VERSION) return []
    const list = Array.isArray(parsed.segments) ? parsed.segments : []
    return list.filter(isSegment)
  } catch {
    return []
  }
}

function writeStored(operatorId: string, segments: Segment[]): void {
  if (typeof window === 'undefined' || !operatorId) return
  try {
    const envelope: StoredEnvelope = {
      v: SEGMENT_STORAGE_VERSION,
      segments,
    }
    window.localStorage.setItem(storageKey(operatorId), JSON.stringify(envelope))
    window.dispatchEvent(
      new CustomEvent(SAME_TAB_EVENT, { detail: operatorId }),
    )
  } catch {
    /* quota / disabled storage — fail silently. */
  }
}

// ---- CRUD (pure, operate against localStorage) ----------------------

/** Read every segment for this operator. Returns [] when operatorId is
 *  falsy or the slot is empty / corrupt. */
export function getSegments(operatorId: string | null): Segment[] {
  if (!operatorId) return []
  return readStored(operatorId)
}

/** Create + persist a new segment. Returns the stored row so callers can
 *  immediately reflect it in the UI without re-reading storage. */
export function createSegment(
  operatorId: string | null,
  input: SegmentInput,
): Segment | null {
  if (!operatorId) return null
  const name = input.name.trim()
  if (!name) return null
  const segment: Segment = {
    id: newId(),
    name,
    tagIds: [...new Set(input.tagIds)],
    color: input.color ?? defaultColorFor(name),
    createdAt: new Date().toISOString(),
  }
  const next = [...readStored(operatorId), segment]
  writeStored(operatorId, next)
  return segment
}

/** Patch a segment in place. No-ops when the id isn't found so callers
 *  don't need to pre-check. Returns the updated row (or null on miss). */
export function updateSegment(
  operatorId: string | null,
  id: string,
  patch: SegmentPatch,
): Segment | null {
  if (!operatorId) return null
  const current = readStored(operatorId)
  const idx = current.findIndex((s) => s.id === id)
  if (idx < 0) return null
  const existing = current[idx]
  const next: Segment = {
    ...existing,
    name: patch.name?.trim() || existing.name,
    tagIds:
      patch.tagIds !== undefined
        ? [...new Set(patch.tagIds)]
        : existing.tagIds,
    color: patch.color ?? existing.color,
  }
  const merged = [...current]
  merged[idx] = next
  writeStored(operatorId, merged)
  return next
}

/** Remove a segment by id. Returns true when something was removed. */
export function deleteSegment(operatorId: string | null, id: string): boolean {
  if (!operatorId) return false
  const current = readStored(operatorId)
  const next = current.filter((s) => s.id !== id)
  if (next.length === current.length) return false
  writeStored(operatorId, next)
  return true
}

/** Reset the operator's slot. Used by tests; no UI affordance in v1. */
export function clearSegments(operatorId: string | null): void {
  if (!operatorId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey(operatorId))
    window.dispatchEvent(
      new CustomEvent(SAME_TAB_EVENT, { detail: operatorId }),
    )
  } catch {
    /* ignore */
  }
}

// ---- filter behaviour -----------------------------------------------

/** Row shape required to apply a segment. Both ContactRow and BookingRow
 *  expose `tags: Array<{id}>` so a structural type lets us stay decoupled
 *  from either module. */
export type Tagged = {
  tags?: ReadonlyArray<{ id: string }> | null
}

/** Does `row` carry every tag id in `tagIds` (AND semantics)?
 *  Empty `tagIds` matches every row — defensive identity so a segment
 *  with no tags doesn't surprise the caller by hiding the entire list. */
export function rowMatchesTagIds(row: Tagged, tagIds: string[]): boolean {
  if (tagIds.length === 0) return true
  const have = new Set((row.tags ?? []).map((t) => t.id))
  for (const id of tagIds) {
    if (!have.has(id)) return false
  }
  return true
}

/** Apply a segment to a list of tagged rows. Pure — handy for tests +
 *  table-side filtering. */
export function applySegment<T extends Tagged>(rows: T[], segment: Segment): T[] {
  return filterByTagIds(rows, segment.tagIds)
}

/** Apply an ad-hoc tag filter to a list of tagged rows. Used by the
 *  /contacts route when the operator has picked tags via the segment
 *  chip row but hasn't saved the combination as a segment yet. */
export function filterByTagIds<T extends Tagged>(
  rows: T[],
  tagIds: string[],
): T[] {
  if (tagIds.length === 0) return rows
  return rows.filter((r) => rowMatchesTagIds(r, tagIds))
}

/** Returns the id of the segment whose tagIds set-equals `selected`, or
 *  null when no saved segment matches. Set-equality (not order-sensitive)
 *  so flipping chip order in the picker still resolves to the segment.
 *  Empty `selected` yields null — the bare "no filter" state isn't a
 *  segment match. */
export function findActiveSegment(
  segments: Segment[],
  selected: string[],
): string | null {
  if (selected.length === 0) return null
  const want = new Set(selected)
  for (const segment of segments) {
    if (segment.tagIds.length !== want.size) continue
    let matched = true
    for (const id of segment.tagIds) {
      if (!want.has(id)) {
        matched = false
        break
      }
    }
    if (matched) return segment.id
  }
  return null
}

// ---- reactive hook ---------------------------------------------------

/** React hook that returns the current segments for an operator and
 *  re-renders on same-tab writes (custom event) AND cross-tab `storage`
 *  events. Returns [] until operatorId resolves. Same shape as
 *  useRecentlyViewed (landr-ne58). */
export function useSegments(operatorId: string | null): Segment[] {
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!operatorId || typeof window === 'undefined') return
    const ownKey = storageKey(operatorId)
    function onStorage(e: StorageEvent) {
      if (e.key === null || e.key === ownKey) bump()
    }
    function onSameTab(e: Event) {
      const detail = (e as CustomEvent<string>).detail
      if (!detail || detail === operatorId) bump()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(SAME_TAB_EVENT, onSameTab)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SAME_TAB_EVENT, onSameTab)
    }
  }, [operatorId, bump])

  return useMemo(
    () => getSegments(operatorId),
    // `tick` is in the dep list so write events trigger a re-read;
    // the value is never referenced inside the memo body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [operatorId, tick],
  )
}

// ---- display helpers -------------------------------------------------

/** Pick a readable text color (black or white) for a chip background.
 *  Mirrors readableTextOn in lib/tags.ts. Inlined here to keep this
 *  module dependency-free at the lib layer. */
export function readableTextOn(hex: string): '#000000' | '#ffffff' {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return '#ffffff'
  const r = parseInt(m[1].slice(0, 2), 16)
  const g = parseInt(m[1].slice(2, 4), 16)
  const b = parseInt(m[1].slice(4, 6), 16)
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return L > 0.5 ? '#000000' : '#ffffff'
}
