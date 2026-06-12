// landr-40x0 — client-side error capture store.
//
// Keeps the last MAX_ERRORS captured errors in memory (session-scoped, never
// persisted). Errors arrive via notifyError() in src/lib/notify.ts.
//
// State management: tiny module-level store + useSyncExternalStore (no extra
// dep). The repo has no zustand/jotai so this matches the existing pattern
// (command-palette-context uses createContext + useState; here we use a
// module store so non-React call sites — api-client, window listeners — can
// push errors without needing a hook or a provider).

import { useSyncExternalStore } from 'react'

// ---- types ------------------------------------------------------------------

export type ErrorEntry = {
  /** Stable unique id for React keys + copy. */
  id: string
  /** ISO 8601 timestamp */
  ts: string
  /** One-line human message */
  message: string
  /** Optional extra detail (e.g. server error body) */
  detail?: string
  /** window.location.pathname at capture time */
  context: string
}

// ---- store ------------------------------------------------------------------

const MAX_ERRORS = 50

type Listener = () => void

let _errors: ErrorEntry[] = []
const _listeners = new Set<Listener>()

function notify() {
  for (const l of _listeners) l()
}

// ---- public API -------------------------------------------------------------

/** Add an error entry. Caps at MAX_ERRORS (oldest dropped). */
export function addError(entry: Omit<ErrorEntry, 'id' | 'ts'>): ErrorEntry {
  const full: ErrorEntry = {
    id: crypto.randomUUID(),
    ts: new Date().toISOString(),
    context: entry.context,
    message: entry.message,
    detail: entry.detail,
  }
  _errors = [full, ..._errors].slice(0, MAX_ERRORS)
  notify()
  return full
}

/** Return the current list (newest first). */
export function listErrors(): ErrorEntry[] {
  return _errors
}

/** Clear all captured errors. */
export function clearErrors(): void {
  _errors = []
  notify()
}

// ---- React hook -------------------------------------------------------------

/**
 * Subscribe to the error log. Returns the current list; re-renders whenever
 * an error is added or cleared. Uses React 18 useSyncExternalStore for
 * safe concurrent-mode subscription.
 */
export function useErrorLog(): ErrorEntry[] {
  return useSyncExternalStore(
    (listener) => {
      _listeners.add(listener)
      return () => _listeners.delete(listener)
    },
    listErrors,
    // Server snapshot (SSR) — always empty.
    () => [],
  )
}
