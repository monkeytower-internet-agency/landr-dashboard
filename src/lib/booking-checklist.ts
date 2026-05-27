// landr-r87i — per-(operator, booking) checklist with server-defined defaults.
//
// History:
//   v1 (landr-84n1) stored EVERY item (defaults + done flags + customs) in
//   localStorage. Defaults were a hardcoded array in this module.
//   v2 (landr-r87i) lifts the DEFAULT item set to the server table
//   `operator_checklist_templates`. localStorage now holds only the per-
//   booking diff: done flags keyed on item id, plus operator-added custom
//   items. Defaults flow in as a `template` argument to useBookingChecklist
//   so the UI can show per-operator-curated seed lists.
//
// v2 storage shape (under the same `landr.dashboard.booking-checklist.<op>.<bk>`
// key for migration compatibility):
//
//   {
//     v: 2,
//     done: { '<itemId>': true, ... },
//     custom: [{ id, label, done, custom: true }, ...],
//     lastUpdatedAt: 1716297600000
//   }
//
// Backwards-compat: if a v1 record is present (no `v` field, items[] array),
// we project it into the v2 shape transparently on read — the done flags
// for defaults carry over, customs are preserved, and the next write
// persists in v2 format.
//
// The hardcoded V1 defaults remain exported as DEFAULT_CHECKLIST_ITEMS so
// the BookingChecklist component can fall back to them when the server
// template hasn't arrived yet (initial render, fetch in flight). They
// match the server-side _V1_DEFAULTS in
// app/routers/staff_operator_checklist_template.py so behaviour is
// indistinguishable before the operator customises.

import { useCallback, useMemo, useState } from 'react'

export type ChecklistItem = {
  id: string
  label: string
  done: boolean
  /** True for items the operator added per-booking; defaults come from
   *  the server template and aren't removable per-booking. */
  custom?: boolean
}

export type ChecklistState = {
  items: ChecklistItem[]
  /** Unix millis of the last mutation (diagnostics only). */
  lastUpdatedAt: number
}

/** Default item passed to useBookingChecklist as the seed list (typically
 *  from the server template). `id` is the stable key used for done-flag
 *  storage. */
export type ChecklistTemplateItem = {
  id: string
  label: string
}

/**
 * Hardcoded fallback defaults — the same four landr-84n1 shipped, mirrored
 * server-side in app/routers/staff_operator_checklist_template.py._V1_DEFAULTS.
 *
 * Two reasons this still lives in code:
 *   1. The BookingChecklist component renders BEFORE the server template
 *      arrives; we show this list so the UI never flashes empty.
 *   2. Tests + isolated previews that don't wire a template still get a
 *      sensible default — no behaviour change for callers that omit the
 *      `template` argument.
 *
 * `id`s match the server defaults so done flags survive when the server
 * template hydrates and replaces the fallback.
 */
export const DEFAULT_CHECKLIST_ITEMS: ReadonlyArray<ChecklistTemplateItem> = [
  { id: 'default-called-customer', label: 'Called customer' },
  { id: 'default-payment-received', label: 'Payment received' },
  { id: 'default-equipment-ready', label: 'Equipment ready' },
  { id: 'default-emailed-pickup', label: 'Emailed pickup details' },
]

// ---- storage ---------------------------------------------------------

export function storageKey(operatorId: string, bookingId: string): string {
  return `landr.dashboard.booking-checklist.${operatorId}.${bookingId}`
}

/** v2 record shape persisted to localStorage. */
type StoredV2 = {
  v: 2
  done: Record<string, boolean>
  custom: ChecklistItem[]
  lastUpdatedAt: number
}

function isStoredV2(v: unknown): v is StoredV2 {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<StoredV2>
  return (
    s.v === 2 &&
    !!s.done &&
    typeof s.done === 'object' &&
    Array.isArray(s.custom) &&
    typeof s.lastUpdatedAt === 'number'
  )
}

/** v1 record shape — left for migration only. */
type StoredV1 = {
  items: ChecklistItem[]
  lastUpdatedAt: number
}

function isStoredV1(v: unknown): v is StoredV1 {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<StoredV1>
  return Array.isArray(s.items) && typeof s.lastUpdatedAt === 'number'
}

function v1ToV2(v1: StoredV1): StoredV2 {
  const done: Record<string, boolean> = {}
  const custom: ChecklistItem[] = []
  for (const it of v1.items) {
    if (it.custom) {
      custom.push({ ...it, custom: true })
    } else if (it.done) {
      // Carry over done flags for defaults; the new default list might
      // not include this id (operator since removed it from their
      // template) — that's fine, the flag is silently dropped on render
      // but stays in storage so a template revert can resurrect it.
      done[it.id] = true
    }
  }
  return { v: 2, done, custom, lastUpdatedAt: v1.lastUpdatedAt }
}

function emptyV2(): StoredV2 {
  return { v: 2, done: {}, custom: [], lastUpdatedAt: 0 }
}

function readStoredV2(operatorId: string, bookingId: string): StoredV2 {
  if (typeof window === 'undefined') return emptyV2()
  try {
    const raw = window.localStorage.getItem(storageKey(operatorId, bookingId))
    if (!raw) return emptyV2()
    const parsed = JSON.parse(raw)
    if (isStoredV2(parsed)) return parsed
    if (isStoredV1(parsed)) return v1ToV2(parsed)
    return emptyV2()
  } catch {
    return emptyV2()
  }
}

function writeStoredV2(
  operatorId: string,
  bookingId: string,
  state: StoredV2,
): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      storageKey(operatorId, bookingId),
      JSON.stringify(state),
    )
  } catch {
    /* silently ignore — quota / disabled storage. */
  }
}

// ---- projection ------------------------------------------------------

/**
 * Project the v2 stored state through the current template into the
 * rendered ChecklistState. Order: template items first (template order),
 * then customs (stored order). Done flags survive across template edits
 * for any id that's still in the template.
 */
function project(
  template: ReadonlyArray<ChecklistTemplateItem>,
  stored: StoredV2,
): ChecklistState {
  const items: ChecklistItem[] = template.map((t) => ({
    id: t.id,
    label: t.label,
    done: !!stored.done[t.id],
  }))
  for (const c of stored.custom) {
    items.push({ ...c, custom: true })
  }
  return { items, lastUpdatedAt: stored.lastUpdatedAt }
}

/**
 * Pure read — no React. Returns the projected state. When `operatorId` or
 * `bookingId` is null we still return a sensible ChecklistState (all
 * unchecked, no customs) so tests + isolated previews keep rendering.
 */
export function getChecklist(
  operatorId: string | null,
  bookingId: string | null,
  template: ReadonlyArray<ChecklistTemplateItem> = DEFAULT_CHECKLIST_ITEMS,
): ChecklistState {
  if (!operatorId || !bookingId) {
    return project(template, emptyV2())
  }
  return project(template, readStoredV2(operatorId, bookingId))
}

/** Fresh, unchecked state — used by tests + the null-scope render path. */
export function seedState(
  template: ReadonlyArray<ChecklistTemplateItem> = DEFAULT_CHECKLIST_ITEMS,
): ChecklistState {
  return project(template, emptyV2())
}

/** Count of done items vs total. */
export function checklistProgress(state: ChecklistState): {
  done: number
  total: number
} {
  return {
    done: state.items.filter((i) => i.done).length,
    total: state.items.length,
  }
}

/**
 * Generate a stable id for a custom item. Includes a short random suffix
 * so two operators adding the same label on the same booking don't
 * collide if v3 ever consolidates client state.
 */
export function makeCustomItemId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `custom-${Date.now().toString(36)}-${rand}`
}

// ---- hook ------------------------------------------------------------

export type UseBookingChecklist = {
  state: ChecklistState
  progress: { done: number; total: number }
  toggle: (id: string) => void
  addCustom: (label: string) => void
  removeCustom: (id: string) => void
  /** True when the persistence layer is wired (operator + booking ids present). */
  persisted: boolean
}

type ScopedOverride = {
  scope: string
  stored: StoredV2
}

function scopeKeyOf(operatorId: string | null, bookingId: string | null): string {
  return `${operatorId ?? ''}::${bookingId ?? ''}`
}

/**
 * Restore-and-persist the checklist for (operatorId, bookingId), driven by
 * the supplied template (typically loaded from the server via
 * `useChecklistTemplate`). When either id is null the hook still works
 * in-memory but skips localStorage persistence.
 *
 * The template ids are the source of truth for which items render —
 * stored done flags whose ids aren't in the template are silently
 * dropped from display (but stay in storage until the next write so a
 * template revert can resurrect them).
 *
 * Implementation note: matches the v1 shape — a `tick` counter triggers a
 * re-read after each persisted write, an `override` slot carries in-
 * memory state for the null-scope path.
 */
export function useBookingChecklist(
  operatorId: string | null,
  bookingId: string | null,
  template: ReadonlyArray<ChecklistTemplateItem> = DEFAULT_CHECKLIST_ITEMS,
): UseBookingChecklist {
  const [tick, setTick] = useState(0)
  const [override, setOverride] = useState<ScopedOverride | null>(null)
  const bump = useCallback(() => setTick((n) => n + 1), [])

  const scope = scopeKeyOf(operatorId, bookingId)
  const persisted = !!operatorId && !!bookingId
  const activeOverride =
    override && override.scope === scope ? override.stored : null

  const stored = useMemo<StoredV2>(
    () => {
      if (activeOverride) return activeOverride
      if (!operatorId || !bookingId) return emptyV2()
      return readStoredV2(operatorId, bookingId)
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [operatorId, bookingId, tick, activeOverride],
  )

  const state = useMemo<ChecklistState>(
    () => project(template, stored),
    [template, stored],
  )

  const apply = useCallback(
    (next: StoredV2) => {
      if (persisted) {
        writeStoredV2(operatorId as string, bookingId as string, next)
        setOverride(null)
        bump()
      } else {
        setOverride({ scope, stored: next })
      }
    },
    [persisted, operatorId, bookingId, scope, bump],
  )

  const toggle = useCallback(
    (id: string) => {
      const current =
        activeOverride ??
        (persisted
          ? readStoredV2(operatorId as string, bookingId as string)
          : emptyV2())
      // Custom item toggle lives in the `custom` array.
      const customIdx = current.custom.findIndex((c) => c.id === id)
      if (customIdx >= 0) {
        const nextCustom = current.custom.slice()
        nextCustom[customIdx] = {
          ...nextCustom[customIdx],
          done: !nextCustom[customIdx].done,
        }
        apply({
          ...current,
          custom: nextCustom,
          lastUpdatedAt: Date.now(),
        })
        return
      }
      // Template/default item toggle lives in `done` map.
      const nextDone = { ...current.done }
      if (nextDone[id]) {
        delete nextDone[id]
      } else {
        nextDone[id] = true
      }
      apply({
        ...current,
        done: nextDone,
        lastUpdatedAt: Date.now(),
      })
    },
    [activeOverride, operatorId, bookingId, persisted, apply],
  )

  const addCustom = useCallback(
    (label: string) => {
      const trimmed = label.trim()
      if (!trimmed) return
      const current =
        activeOverride ??
        (persisted
          ? readStoredV2(operatorId as string, bookingId as string)
          : emptyV2())
      const item: ChecklistItem = {
        id: makeCustomItemId(),
        label: trimmed,
        done: false,
        custom: true,
      }
      apply({
        ...current,
        custom: [...current.custom, item],
        lastUpdatedAt: Date.now(),
      })
    },
    [activeOverride, operatorId, bookingId, persisted, apply],
  )

  const removeCustom = useCallback(
    (id: string) => {
      const current =
        activeOverride ??
        (persisted
          ? readStoredV2(operatorId as string, bookingId as string)
          : emptyV2())
      const nextCustom = current.custom.filter((c) => c.id !== id)
      if (nextCustom.length === current.custom.length) {
        // Id wasn't a custom — defaults aren't removable per-booking
        // (operator must edit the template in Settings -> Operations).
        return
      }
      apply({
        ...current,
        custom: nextCustom,
        lastUpdatedAt: Date.now(),
      })
    },
    [activeOverride, operatorId, bookingId, persisted, apply],
  )

  const progress = useMemo(() => checklistProgress(state), [state])

  return useMemo(
    () => ({
      state,
      progress,
      toggle,
      addCustom,
      removeCustom,
      persisted,
    }),
    [state, progress, toggle, addCustom, removeCustom, persisted],
  )
}
