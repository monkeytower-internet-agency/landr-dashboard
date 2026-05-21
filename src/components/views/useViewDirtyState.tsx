// landr-hgtv — dirty-state machinery for a single View's config.
//
// Two save modes depending on visibility:
//
//   personal:  every change auto-saves (debounced 500ms). Mirrors the
//              "this is mine, just persist it" feel of the existing
//              Bookings filter persistence.
//   shared:    every change stages in local state. The user explicitly
//              clicks Save (PATCH) or Discard (revert to last-fetched
//              config). Otherwise an accidental tweak would mutate the
//              View for the whole operator team.
//
// The hook owns the in-memory `config` so the caller can plug it into the
// toolbar, layout body, and dirty-state buttons uniformly. It re-initialises
// whenever the View ID changes (e.g. user navigates between Views).

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import {
  patchSavedView,
  type SavedView,
  type SavedViewWithState,
} from '@/lib/saved-views'

const AUTO_SAVE_DEBOUNCE_MS = 500

export type SaveStatus = 'idle' | 'saving' | 'saved' | 'error'

export type ViewDirtyState = {
  /** The current (possibly unsaved) config — read this for rendering. */
  config: Record<string, unknown>
  /** True iff local config differs from the last server-confirmed config. */
  dirty: boolean
  /** Personal Views auto-save; Shared Views require explicit save. */
  mode: 'personal' | 'shared'
  /** Latest save-attempt outcome (drives toolbar UI). */
  status: SaveStatus
  /** Last error message, if any. */
  errorMessage: string | null
  /** Stage a config mutation. */
  setConfig: (next: Record<string, unknown>) => void
  /** Explicit save (Shared only — Personal auto-saves). Resolves on success. */
  save: () => Promise<void>
  /** Revert local state to last-fetched config. */
  discard: () => void
}

type Args = {
  operatorId: string | null
  view: SavedViewWithState | null
  /**
   * Called when a save succeeds so the caller can refresh related state
   * (TanStack Query cache invalidation, sidebar refresh, etc.). Receives
   * the server-confirmed View row.
   */
  onSaved?: (saved: SavedView) => void
}

type Snapshot = {
  viewId: string | null
  baseline: Record<string, unknown>
  local: Record<string, unknown>
  status: SaveStatus
  errorMessage: string | null
}

const EMPTY_SNAPSHOT: Snapshot = {
  viewId: null,
  baseline: {},
  local: {},
  status: 'idle',
  errorMessage: null,
}

export function useViewDirtyState({
  operatorId,
  view,
  onSaved,
}: Args): ViewDirtyState {
  // Single snapshot state keeps baseline + local + status in lock-step so
  // resetting on View change is one setState rather than a cascade of three
  // (which the compiler flags as cascading-renders-in-effect).
  const [snap, setSnap] = useState<Snapshot>(EMPTY_SNAPSHOT)
  const autoSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Re-initialise whenever the underlying View changes (or unloads).
  useEffect(() => {
    setSnap((prev) => {
      const nextId = view?.id ?? null
      if (prev.viewId === nextId) return prev
      const baseline = view?.config ?? {}
      return {
        viewId: nextId,
        baseline,
        local: baseline,
        status: 'idle',
        errorMessage: null,
      }
    })
  }, [view?.id, view?.config])

  const dirty = useMemo(
    () => !shallowEqualConfig(snap.local, snap.baseline),
    [snap.local, snap.baseline],
  )

  const mode = view?.visibility === 'shared' ? 'shared' : 'personal'

  const runSave = useCallback(
    async (snapshot: Record<string, unknown>) => {
      if (!operatorId || !view) return
      setSnap((prev) => ({ ...prev, status: 'saving', errorMessage: null }))
      try {
        const saved = await patchSavedView(operatorId, view.id, {
          config: snapshot,
        })
        const serverConfig = saved.config ?? snapshot
        setSnap((prev) => ({
          ...prev,
          baseline: serverConfig,
          local: serverConfig,
          status: 'saved',
          errorMessage: null,
        }))
        onSaved?.(saved)
      } catch (err) {
        setSnap((prev) => ({
          ...prev,
          status: 'error',
          errorMessage: err instanceof Error ? err.message : 'Save failed',
        }))
      }
    },
    [operatorId, view, onSaved],
  )

  const setConfig = useCallback(
    (next: Record<string, unknown>) => {
      setSnap((prev) => ({ ...prev, local: next }))

      if (mode !== 'personal') return
      if (!operatorId || !view) return

      if (autoSaveTimer.current) clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = setTimeout(() => {
        void runSave(next)
      }, AUTO_SAVE_DEBOUNCE_MS)
    },
    [mode, operatorId, view, runSave],
  )

  // Clean up pending debounced save on unmount / View change.
  const viewId = view?.id ?? null
  useEffect(() => {
    return () => {
      if (autoSaveTimer.current) {
        clearTimeout(autoSaveTimer.current)
        autoSaveTimer.current = null
      }
    }
  }, [viewId])

  const save = useCallback(async () => {
    if (!operatorId || !view) return
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
    await runSave(snap.local)
  }, [operatorId, view, runSave, snap.local])

  const discard = useCallback(() => {
    if (autoSaveTimer.current) {
      clearTimeout(autoSaveTimer.current)
      autoSaveTimer.current = null
    }
    setSnap((prev) => ({
      ...prev,
      local: prev.baseline,
      status: 'idle',
      errorMessage: null,
    }))
  }, [])

  return {
    config: snap.local,
    dirty,
    mode,
    status: snap.status,
    errorMessage: snap.errorMessage,
    setConfig,
    save,
    discard,
  }
}

/**
 * Cheap structural-equality check for two View config blobs. We don't need
 * deep semantic equality — just enough to suppress no-op auto-saves and
 * dirty-state flips. JSON.stringify is fine here because configs are small,
 * jsonb-clean, and key ordering is stable (we own both sides).
 */
export function shallowEqualConfig(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}
