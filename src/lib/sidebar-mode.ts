// landr-fzcg — 3-state sidebar collapse control (Supabase-style):
//   'collapsed'    → icon rail only, never expands
//   'expanded'     → always full width
//   'hover-expand' → icon rail by default, expands on mouseenter,
//                    collapses on mouseleave
//
// The mode is persisted under `landr.dashboard.sidebarMode` (single key,
// global across operators — the user's body-mechanics preference is not
// tenant-scoped). The shadcn Sidebar primitive only knows about an
// `open: boolean` state, so the hook translates `mode` + `hover` into
// the boolean each render: see `openFor()` below.

import { useCallback, useEffect, useMemo, useState } from 'react'

export type SidebarMode = 'collapsed' | 'expanded' | 'hover-expand'

export const DEFAULT_SIDEBAR_MODE: SidebarMode = 'expanded'

export const SIDEBAR_MODE_STORAGE_KEY = 'landr.dashboard.sidebarMode'

const VALID_MODES: ReadonlyArray<SidebarMode> = [
  'collapsed',
  'expanded',
  'hover-expand',
]

// Cycle order matches the segmented control left→right so a click on the
// "next" affordance reads naturally: collapsed → expanded → hover-expand.
const CYCLE_ORDER: ReadonlyArray<SidebarMode> = [
  'collapsed',
  'expanded',
  'hover-expand',
]

function isSidebarMode(v: unknown): v is SidebarMode {
  return (
    typeof v === 'string' && (VALID_MODES as ReadonlyArray<string>).includes(v)
  )
}

function readStored(): SidebarMode {
  if (typeof window === 'undefined') return DEFAULT_SIDEBAR_MODE
  try {
    const raw = window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)
    if (isSidebarMode(raw)) return raw
    return DEFAULT_SIDEBAR_MODE
  } catch {
    return DEFAULT_SIDEBAR_MODE
  }
}

function writeStored(value: SidebarMode): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, value)
  } catch {
    /* silently ignore — quota / disabled storage. */
  }
}

/**
 * Translate the user-visible 3-state mode (+ live hover signal) into the
 * boolean `open` flag the underlying shadcn Sidebar expects.
 *
 *   collapsed     → false (always)
 *   expanded      → true  (always)
 *   hover-expand  → `hovered` (open while pointer is over the sidebar)
 */
export function openFor(mode: SidebarMode, hovered: boolean): boolean {
  if (mode === 'expanded') return true
  if (mode === 'collapsed') return false
  return hovered
}

export type UseSidebarMode = {
  mode: SidebarMode
  setMode: (next: SidebarMode) => void
  /** Advance to the next mode in cycle order — for the cycling button. */
  cycle: () => void
}

/**
 * Restore-and-persist the sidebar mode. Returns a stable callbacks bag.
 */
export function useSidebarMode(): UseSidebarMode {
  const [mode, setModeState] = useState<SidebarMode>(() => readStored())

  // Cross-tab sync — if the user flips the mode in another tab, mirror it
  // here. localStorage 'storage' events only fire for OTHER tabs, so this
  // is a no-op on the originating tab and avoids loops.
  useEffect(() => {
    if (typeof window === 'undefined') return
    function onStorage(event: StorageEvent) {
      if (event.key !== SIDEBAR_MODE_STORAGE_KEY) return
      if (isSidebarMode(event.newValue)) setModeState(event.newValue)
    }
    window.addEventListener('storage', onStorage)
    return () => window.removeEventListener('storage', onStorage)
  }, [])

  const setMode = useCallback((next: SidebarMode) => {
    setModeState(next)
    writeStored(next)
  }, [])

  const cycle = useCallback(() => {
    setModeState((current) => {
      const idx = CYCLE_ORDER.indexOf(current)
      const next = CYCLE_ORDER[(idx + 1) % CYCLE_ORDER.length]
      writeStored(next)
      return next
    })
  }, [])

  return useMemo(() => ({ mode, setMode, cycle }), [mode, setMode, cycle])
}
