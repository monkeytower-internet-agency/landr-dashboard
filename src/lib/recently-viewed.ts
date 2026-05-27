// landr-ne58 — per-user "Recently viewed" memory for the sidebar.
//
// Tracks the last N (=5) detail-surfaces the operator opened, so they can
// jump back without re-running a search. Persisted in localStorage scoped
// by Supabase auth user id (NOT operator id) — the same person hopping
// between operators should still see their personal trail.
//
// Storage shape (single JSON array under one key per user):
//
//   landr.dashboard.recentlyViewed.<userId> = [
//     { type, id, label, href, ts },
//     …
//   ]
//
// Newest entry first. Duplicate (type, id) pairs are de-duplicated on
// insert — the latest open wins and bumps the existing entry to the top
// instead of growing the list.
//
// Cross-tab sync: trackView() dispatches a `storage` event manually so
// other tabs in the same browser pick up the new entry without a reload.
// (localStorage's native storage event only fires in OTHER tabs, not the
// writer, which is why useRecentlyViewed also listens to a custom event
// for same-tab updates.)

import { useCallback, useEffect, useMemo, useState } from 'react'

export type RecentlyViewedType = 'booking' | 'contact' | 'product' | 'view'

export type RecentlyViewedEntry = {
  type: RecentlyViewedType
  id: string
  label: string
  href: string
  /** Unix millis. Used only for diagnostics — order is by array position. */
  ts: number
}

export const RECENTLY_VIEWED_LIMIT = 5

/** Custom event fired on same-tab writes so `useRecentlyViewed` re-reads. */
const SAME_TAB_EVENT = 'landr:recently-viewed-changed'

export function storageKey(userId: string): string {
  return `landr.dashboard.recentlyViewed.${userId}`
}

function isEntry(v: unknown): v is RecentlyViewedEntry {
  if (!v || typeof v !== 'object') return false
  const e = v as Partial<RecentlyViewedEntry>
  return (
    typeof e.id === 'string' &&
    typeof e.label === 'string' &&
    typeof e.href === 'string' &&
    typeof e.ts === 'number' &&
    (e.type === 'booking' ||
      e.type === 'contact' ||
      e.type === 'product' ||
      e.type === 'view')
  )
}

function readStored(userId: string): RecentlyViewedEntry[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(userId))
    if (!raw) return []
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isEntry).slice(0, RECENTLY_VIEWED_LIMIT)
  } catch {
    return []
  }
}

function writeStored(userId: string, entries: RecentlyViewedEntry[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      storageKey(userId),
      JSON.stringify(entries.slice(0, RECENTLY_VIEWED_LIMIT)),
    )
    // Notify same-tab listeners. Native `storage` events only fire in
    // OTHER tabs; same-tab observers rely on this custom event.
    window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: userId }))
  } catch {
    /* silently ignore — quota / disabled storage. */
  }
}

/**
 * Record that the user just opened a detail surface. Idempotent for a
 * (type, id) pair — re-opening a row bumps it to the top instead of
 * duplicating. No-op when userId is null (signed out).
 */
export function trackView(
  userId: string | null,
  type: RecentlyViewedType,
  id: string,
  label: string,
  href: string,
): void {
  if (!userId || !id) return
  const trimmedLabel = label.trim() || '—'
  const current = readStored(userId)
  const filtered = current.filter((e) => !(e.type === type && e.id === id))
  const next: RecentlyViewedEntry[] = [
    { type, id, label: trimmedLabel, href, ts: Date.now() },
    ...filtered,
  ].slice(0, RECENTLY_VIEWED_LIMIT)
  writeStored(userId, next)
}

/** Read the current trail. Returns [] when userId is null. */
export function getRecentlyViewed(userId: string | null): RecentlyViewedEntry[] {
  if (!userId) return []
  return readStored(userId)
}

/** Clear the trail. Mainly for tests + a future "Clear history" affordance. */
export function clearRecentlyViewed(userId: string | null): void {
  if (!userId || typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey(userId))
    window.dispatchEvent(new CustomEvent(SAME_TAB_EVENT, { detail: userId }))
  } catch {
    /* ignore */
  }
}

/**
 * Reactive read — re-renders on same-tab `trackView` writes (custom event)
 * AND cross-tab `storage` events. Returns [] until userId is available.
 *
 * Implementation: instead of mirroring localStorage into a useState (which
 * would force a setState-in-effect to sync on userId change, tripping the
 * react-hooks/set-state-in-effect rule), we bump a "tick" counter whenever
 * a write event fires and re-read inside a useMemo keyed on (userId, tick).
 * The read itself is cheap — JSON.parse on at most 5 entries.
 */
export function useRecentlyViewed(
  userId: string | null,
): RecentlyViewedEntry[] {
  const [tick, setTick] = useState(0)
  const bump = useCallback(() => setTick((n) => n + 1), [])

  useEffect(() => {
    if (!userId || typeof window === 'undefined') return
    const ownKey = storageKey(userId)
    function onStorage(e: StorageEvent) {
      // Cross-tab write to OUR user's slot, or a full localStorage wipe
      // (key === null). Other users' slots are ignored.
      if (e.key === null || e.key === ownKey) bump()
    }
    function onSameTab(e: Event) {
      const detail = (e as CustomEvent<string>).detail
      // Custom event carries the userId so we can skip writes for OTHER
      // users (shouldn't happen in practice — one auth user per app — but
      // future-proof against multi-account experiments).
      if (!detail || detail === userId) bump()
    }
    window.addEventListener('storage', onStorage)
    window.addEventListener(SAME_TAB_EVENT, onSameTab)
    return () => {
      window.removeEventListener('storage', onStorage)
      window.removeEventListener(SAME_TAB_EVENT, onSameTab)
    }
  }, [userId, bump])

  return useMemo(
    () => getRecentlyViewed(userId),
    // `tick` is part of the key so write events trigger a re-read; the
    // value itself is never referenced inside the memo body.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [userId, tick],
  )
}
