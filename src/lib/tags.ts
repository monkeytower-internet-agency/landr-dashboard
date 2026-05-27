/**
 * Operator-scoped tags — CRUD wrappers + assignment helpers (landr-iz58).
 *
 * Tags are operator-scoped free-text labels with a color. Operators
 * apply them to bookings and contacts. v1 is intentionally simple:
 * text + color (hex), no hierarchy, no per-tag permissions.
 *
 * Write routing (per CLAUDE.md write-routing convention):
 *   - Tag CRUD itself is a plain row update with RLS + audit triggers
 *     already covering side effects → could go either way. We funnel
 *     through the FastAPI router because the per-operator-name unique
 *     index makes a 409 nicer with a server-side error catch (PostgREST
 *     surfaces unique violations as opaque errors).
 *   - Assignment (full-replace tag_ids on a booking / contact) goes
 *     through FastAPI so the diff-based update can validate tag ids
 *     against the operator first (defence-in-depth on the JOIN-based
 *     RLS the junction tables enforce).
 *   - Reads of attached tags on bookings + contacts go via Supabase
 *     REST embeds (operator_tags via booking_tags/contact_tags) — same
 *     pattern as approval_trace + customer (RLS + select).
 */

import { api } from '@/lib/api-client'
import { supabase } from '@/lib/supabase'

/** A tag definition row from operator_tags. */
export type Tag = {
  id: string
  operator_id: string
  name: string
  /** 7-char hex string '#RRGGBB'. Matches the operator_tags_color_format_chk
   *  CHECK on the api-side migration. */
  color: string
  created_at: string
  updated_at: string
}

export type TagInput = {
  name: string
  /** Hex color string '#RRGGBB' (case-insensitive). */
  color: string
}

export type TagPatch = {
  name?: string
  color?: string
}

// ---- defaults --------------------------------------------------------

/** Tailwind-aligned palette used when the operator does not pick a colour
 *  themselves. Kept short and high-contrast on both light and dark
 *  backgrounds so chips stay legible. The order matters: TagPicker's
 *  create-on-the-fly path rotates through this list deterministically by
 *  hashing the tag name, so the same name always lands on the same colour. */
export const TAG_PALETTE: readonly string[] = [
  '#ef4444', // red-500
  '#f97316', // orange-500
  '#eab308', // yellow-500
  '#22c55e', // green-500
  '#06b6d4', // cyan-500
  '#3b82f6', // blue-500
  '#8b5cf6', // violet-500
  '#ec4899', // pink-500
] as const

/** Deterministic colour pick for a freshly-typed tag name. Stable across
 *  reloads — operators see "Returning" always come up green, etc. */
export function defaultColorFor(name: string): string {
  // FNV-1a-ish 32-bit hash; good enough for palette bucketing and stable
  // across JS engines.
  let hash = 0
  for (let i = 0; i < name.length; i += 1) {
    hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  }
  return TAG_PALETTE[hash % TAG_PALETTE.length]
}

// ---- CRUD ------------------------------------------------------------

/** List active tags for an operator (soft-deleted rows excluded server-side). */
export async function fetchTags(operatorId: string): Promise<Tag[]> {
  return await api<Tag[]>('GET', `/api/staff/operators/${operatorId}/tags`)
}

/** Create a tag. Throws if the name is already taken on this operator. */
export async function createTag(operatorId: string, input: TagInput): Promise<Tag> {
  return await api<Tag>('POST', `/api/staff/operators/${operatorId}/tags`, input)
}

export async function patchTag(
  operatorId: string,
  tagId: string,
  patch: TagPatch,
): Promise<Tag> {
  return await api<Tag>(
    'PATCH',
    `/api/staff/operators/${operatorId}/tags/${tagId}`,
    patch,
  )
}

/** Soft-delete a tag. Existing assignments stay in the audit trail but
 *  disappear from chips + pickers because the active-only read filters
 *  them out. */
export async function deleteTag(operatorId: string, tagId: string): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/tags/${tagId}`,
  )
}

// ---- assignment ------------------------------------------------------

/** Replace the full set of tag ids on one booking. */
export async function setBookingTags(
  operatorId: string,
  bookingId: string,
  tagIds: string[],
): Promise<{ tag_ids: string[] }> {
  return await api<{ tag_ids: string[] }>(
    'POST',
    `/api/staff/operators/${operatorId}/bookings/${bookingId}/tags`,
    { tag_ids: tagIds },
  )
}

/** Replace the full set of tag ids on one contact. */
export async function setContactTags(
  operatorId: string,
  contactId: string,
  tagIds: string[],
): Promise<{ tag_ids: string[] }> {
  return await api<{ tag_ids: string[] }>(
    'POST',
    `/api/staff/operators/${operatorId}/contacts/${contactId}/tags`,
    { tag_ids: tagIds },
  )
}

// ---- bulk assignment (landr-uqr2) ----------------------------------
//
// "Apply tags to N rows" wired from BulkActionToolbar on Bookings +
// Contacts. Per row we union the desired tag ids with the row's CURRENT
// tag ids (so bulk-apply ADDS tags rather than replacing the set) and
// POST the union via setBookingTags / setContactTags. Each row fires
// in parallel; partial failures are surfaced to the caller for toasting.
//
// The full-replace semantics of setBookingTags / setContactTags are
// intentional — the FastAPI router enforces tag ownership server-side
// against the resolved operator. Computing the union on the client
// keeps the existing row-scoped endpoint contract intact (no new
// bulk endpoint needed).

/** Row payload for bulk-apply: the row id plus its already-attached tag
 *  ids (typically read off `BookingRow.tags` / `ContactRow.tags`). */
export type BulkApplyItem = {
  id: string
  currentTagIds: string[]
}

/** Outcome of a bulk-apply call. `ok` is the count of rows whose POST
 *  resolved; `failed` carries the row ids that rejected so the toast can
 *  surface partial-failure detail. */
export type BulkApplyResult = {
  ok: number
  failed: string[]
}

/** Union two id lists with stable order — keeps the row's existing tag
 *  order and appends any new ids that weren't already present. Pulled out
 *  so both bulk helpers + tests can exercise the merge logic directly. */
export function unionTagIds(currentIds: string[], addIds: string[]): string[] {
  const seen = new Set(currentIds)
  const next = [...currentIds]
  for (const id of addIds) {
    if (!seen.has(id)) {
      seen.add(id)
      next.push(id)
    }
  }
  return next
}

/** Apply `tagIds` to every booking in `items`, unioning with each row's
 *  existing tags. Fires in parallel via Promise.allSettled so a single
 *  row failure does not abort the batch. */
export async function bulkApplyTagsToBookings(
  operatorId: string,
  items: BulkApplyItem[],
  tagIds: string[],
): Promise<BulkApplyResult> {
  const results = await Promise.allSettled(
    items.map((item) =>
      setBookingTags(
        operatorId,
        item.id,
        unionTagIds(item.currentTagIds, tagIds),
      ),
    ),
  )
  const failed: string[] = []
  let ok = 0
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') ok += 1
    else failed.push(items[idx].id)
  })
  return { ok, failed }
}

/** Apply `tagIds` to every contact in `items`, unioning with each row's
 *  existing tags. Mirrors {@link bulkApplyTagsToBookings} so the toolbar
 *  can dispatch by surface without branching on contact-vs-booking. */
export async function bulkApplyTagsToContacts(
  operatorId: string,
  items: BulkApplyItem[],
  tagIds: string[],
): Promise<BulkApplyResult> {
  const results = await Promise.allSettled(
    items.map((item) =>
      setContactTags(
        operatorId,
        item.id,
        unionTagIds(item.currentTagIds, tagIds),
      ),
    ),
  )
  const failed: string[] = []
  let ok = 0
  results.forEach((r, idx) => {
    if (r.status === 'fulfilled') ok += 1
    else failed.push(items[idx].id)
  })
  return { ok, failed }
}

// ---- reads (Supabase REST embeds) ------------------------------------
//
// These power "list everything tagged X" queries and pre-fetch the
// attached tag set when the dashboard opens a detail sheet. Both go
// straight through Supabase REST (RLS-gated) — the read path doesn't
// need the FastAPI side-effect machinery.

/** Look up the tag ids currently attached to one booking. */
export async function fetchBookingTagIds(bookingId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('booking_tags')
    .select('tag_id')
    .eq('booking_id', bookingId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.tag_id as string)
}

/** Look up the tag ids currently attached to one contact. */
export async function fetchContactTagIds(contactId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from('contact_tags')
    .select('tag_id')
    .eq('contact_id', contactId)
  if (error) throw new Error(error.message)
  return (data ?? []).map((row) => row.tag_id as string)
}

// ---- display helpers -------------------------------------------------

/** Pick a readable text colour (black or white) for a chip background.
 *  Uses the luminance formula from WCAG so dark backgrounds get white text
 *  and light backgrounds get black. Tolerant of bad input — falls back to
 *  white (chips with broken colour values should still be readable). */
export function readableTextOn(hex: string): '#000000' | '#ffffff' {
  const m = /^#([0-9a-fA-F]{6})$/.exec(hex)
  if (!m) return '#ffffff'
  const [r, g, b] = [
    parseInt(m[1].slice(0, 2), 16),
    parseInt(m[1].slice(2, 4), 16),
    parseInt(m[1].slice(4, 6), 16),
  ]
  // Relative luminance (sRGB).
  const channel = (c: number) => {
    const s = c / 255
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4
  }
  const L = 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
  return L > 0.5 ? '#000000' : '#ffffff'
}
