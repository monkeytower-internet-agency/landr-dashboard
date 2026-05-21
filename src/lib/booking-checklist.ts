// landr-84n1 — per-(operator, booking) checklist persisted to localStorage.
//
// v1 is deliberately client-side: no migration, no server round-trip — the
// operator just wants a private "what have I done for this booking" memo
// pad that survives a page refresh. v2 will lift this to a Postgres table
// keyed on (operator_id, booking_id) once the team validates the workflow.
//
// Storage shape (single JSON object per booking):
//
//   landr.dashboard.booking-checklist.<operatorId>.<bookingId> = {
//     items: [{ id, label, done, custom? }, ...],
//     lastUpdatedAt: 1716297600000
//   }
//
// Custom items carry `custom: true` and can be removed; defaults are
// seeded on first read and cannot be removed (toggling done is the only
// op). Default labels can drift in code without orphaning existing state:
// we re-seed any default that disappeared while preserving its `done`
// flag by matching on stable id.
//
// Why scope on operator AND booking?  An operator (in landr terms) is the
// business tenant — different operators editing the SAME booking in a
// shared device should not see each other's checklist state, and the
// same operator should keep their checklist when re-opening the booking.

import { useCallback, useMemo, useState } from 'react'

export type ChecklistItem = {
  id: string
  label: string
  done: boolean
  /** True for items the operator added; defaults are seeded and not removable. */
  custom?: boolean
}

export type ChecklistState = {
  items: ChecklistItem[]
  /** Unix millis of the last mutation (diagnostics only). */
  lastUpdatedAt: number
}

/**
 * Seeded defaults. Order matters — they render top-to-bottom and the
 * progress denominator includes them. Ids are stable so adding/renaming
 * a default in code does not orphan stored `done` flags for the others.
 */
export const DEFAULT_CHECKLIST_ITEMS: ReadonlyArray<
  Pick<ChecklistItem, 'id' | 'label'>
> = [
  { id: 'default-called-customer', label: 'Called customer' },
  { id: 'default-payment-received', label: 'Payment received' },
  { id: 'default-equipment-ready', label: 'Equipment ready' },
  { id: 'default-emailed-pickup', label: 'Emailed pickup details' },
]

const DEFAULT_IDS = new Set(DEFAULT_CHECKLIST_ITEMS.map((i) => i.id))

export function storageKey(operatorId: string, bookingId: string): string {
  return `landr.dashboard.booking-checklist.${operatorId}.${bookingId}`
}

function isChecklistItem(v: unknown): v is ChecklistItem {
  if (!v || typeof v !== 'object') return false
  const i = v as Partial<ChecklistItem>
  return (
    typeof i.id === 'string' &&
    typeof i.label === 'string' &&
    typeof i.done === 'boolean'
  )
}

function isChecklistState(v: unknown): v is ChecklistState {
  if (!v || typeof v !== 'object') return false
  const s = v as Partial<ChecklistState>
  return (
    Array.isArray(s.items) &&
    s.items.every(isChecklistItem) &&
    typeof s.lastUpdatedAt === 'number'
  )
}

/**
 * Build a fresh state seeded with the defaults — all unchecked. Used for
 * first-time opens and when stored JSON is unreadable.
 */
export function seedState(): ChecklistState {
  return {
    items: DEFAULT_CHECKLIST_ITEMS.map((d) => ({
      id: d.id,
      label: d.label,
      done: false,
    })),
    lastUpdatedAt: 0,
  }
}

/**
 * Merge stored state with the current defaults: any default missing from
 * storage is appended (preserving the operator's custom items at the end);
 * any stored default has its label refreshed from code so renamed defaults
 * surface without losing the `done` flag.
 *
 * Order: defaults first (in the canonical order), then customs (in their
 * stored order). Stored-but-unknown default ids are dropped — that's the
 * forward-compat path when a default is removed in code.
 */
function reconcileWithDefaults(stored: ChecklistState): ChecklistState {
  const storedById = new Map(stored.items.map((it) => [it.id, it]))
  const merged: ChecklistItem[] = []
  for (const d of DEFAULT_CHECKLIST_ITEMS) {
    const existing = storedById.get(d.id)
    merged.push({
      id: d.id,
      label: d.label,
      done: existing?.done ?? false,
    })
  }
  for (const it of stored.items) {
    if (DEFAULT_IDS.has(it.id)) continue
    if (!it.custom) continue
    merged.push({ ...it, custom: true })
  }
  return { items: merged, lastUpdatedAt: stored.lastUpdatedAt }
}

function readStored(operatorId: string, bookingId: string): ChecklistState {
  if (typeof window === 'undefined') return seedState()
  try {
    const raw = window.localStorage.getItem(storageKey(operatorId, bookingId))
    if (!raw) return seedState()
    const parsed = JSON.parse(raw)
    if (!isChecklistState(parsed)) return seedState()
    return reconcileWithDefaults(parsed)
  } catch {
    return seedState()
  }
}

function writeStored(
  operatorId: string,
  bookingId: string,
  state: ChecklistState,
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

/** Pure read — no React. Returns seeded defaults when nothing is stored. */
export function getChecklist(
  operatorId: string | null,
  bookingId: string | null,
): ChecklistState {
  if (!operatorId || !bookingId) return seedState()
  return readStored(operatorId, bookingId)
}

/** Count of done items vs total. Total includes defaults and customs. */
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
 * collide if v2 ever consolidates client state.
 */
export function makeCustomItemId(): string {
  const rand = Math.random().toString(36).slice(2, 8)
  return `custom-${Date.now().toString(36)}-${rand}`
}

export type UseBookingChecklist = {
  state: ChecklistState
  progress: { done: number; total: number }
  toggle: (id: string) => void
  addCustom: (label: string) => void
  removeCustom: (id: string) => void
  /** True when the persistence layer is wired (operator + booking ids present). */
  persisted: boolean
}

/**
 * Restore-and-persist the checklist for (operatorId, bookingId). When
 * either id is null the hook still works in-memory (so the UI keeps
 * rendering in tests / signed-out previews) but skips persistence.
 *
 * Implementation note: we follow the same shape as useRecentlyViewed —
 * a "tick" counter bumped on every write triggers a re-read inside a
 * useMemo keyed on (scope, tick, override). This avoids the
 * react-hooks/set-state-in-effect lint we'd hit if we mirrored
 * localStorage into useState and re-synced on scope change. The
 * `override` slot lets in-memory edits (when persistence is skipped
 * because operatorId is null) survive without a localStorage round-trip.
 */
type ScopedOverride = {
  scope: string
  state: ChecklistState
}

function scopeKeyOf(operatorId: string | null, bookingId: string | null): string {
  return `${operatorId ?? ''}::${bookingId ?? ''}`
}

export function useBookingChecklist(
  operatorId: string | null,
  bookingId: string | null,
): UseBookingChecklist {
  // `tick` triggers a localStorage re-read after each persisted write.
  // `override` carries in-memory state for the null-operator path; it
  // remembers its own scope so a scope change naturally drops stale data
  // without needing setState-in-effect or setState-in-render.
  const [tick, setTick] = useState(0)
  const [override, setOverride] = useState<ScopedOverride | null>(null)
  const bump = useCallback(() => setTick((n) => n + 1), [])

  const scope = scopeKeyOf(operatorId, bookingId)
  const persisted = !!operatorId && !!bookingId
  const activeOverride =
    override && override.scope === scope ? override.state : null

  const state = useMemo<ChecklistState>(
    () => activeOverride ?? getChecklist(operatorId, bookingId),
    // `tick` participates as a cache-buster so writes re-read storage.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [operatorId, bookingId, tick, activeOverride],
  )

  const apply = useCallback(
    (next: ChecklistState) => {
      if (persisted) {
        writeStored(operatorId as string, bookingId as string, next)
        // Drop any stale override left over from a previous null-scope
        // session so subsequent reads come from storage.
        setOverride(null)
        bump()
      } else {
        setOverride({ scope, state: next })
      }
    },
    [persisted, operatorId, bookingId, scope, bump],
  )

  const toggle = useCallback(
    (id: string) => {
      const current = activeOverride ?? getChecklist(operatorId, bookingId)
      const next: ChecklistState = {
        items: current.items.map((it) =>
          it.id === id ? { ...it, done: !it.done } : it,
        ),
        lastUpdatedAt: Date.now(),
      }
      apply(next)
    },
    [activeOverride, operatorId, bookingId, apply],
  )

  const addCustom = useCallback(
    (label: string) => {
      const trimmed = label.trim()
      if (!trimmed) return
      const current = activeOverride ?? getChecklist(operatorId, bookingId)
      const item: ChecklistItem = {
        id: makeCustomItemId(),
        label: trimmed,
        done: false,
        custom: true,
      }
      const next: ChecklistState = {
        items: [...current.items, item],
        lastUpdatedAt: Date.now(),
      }
      apply(next)
    },
    [activeOverride, operatorId, bookingId, apply],
  )

  const removeCustom = useCallback(
    (id: string) => {
      // Defaults are protected — guard at the storage layer so a misuse
      // from the UI side cannot silently drop a default item.
      if (DEFAULT_IDS.has(id)) return
      const current = activeOverride ?? getChecklist(operatorId, bookingId)
      const next: ChecklistState = {
        items: current.items.filter((it) => it.id !== id),
        lastUpdatedAt: Date.now(),
      }
      apply(next)
    },
    [activeOverride, operatorId, bookingId, apply],
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
