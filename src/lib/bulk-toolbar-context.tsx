// landr-3qkr.7 — context that signals whether a BulkActionToolbar is currently
// visible (i.e. at least one row is selected). QuickCaptureFab reads this to
// hide itself on small screens while the bulk toolbar occupies the bottom of
// the viewport, preventing the two fixed elements from overlapping.
//
// Pattern: provider wraps AppShell (added in AppShell.tsx); BulkActionToolbar
// sets active=true when it renders (count > 0); QuickCaptureFab reads active
// and applies `hidden` below md when true.
//
// Why a context instead of a prop? The FAB is mounted at the shell level, not
// inside the route tree that also renders the toolbar. Threading the active
// flag through the router tree → AppShell → FAB is more invasive than a
// small context. The context never holds the selection data itself (that stays
// in each route's local state) — it only carries the boolean active flag.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

// ---- types ------------------------------------------------------------------

type BulkToolbarContextValue = {
  /** True when at least one BulkActionToolbar on screen has a non-empty selection. */
  bulkToolbarActive: boolean
  /** Called by BulkActionToolbar on mount / when count changes. */
  setBulkToolbarActive: (active: boolean) => void
}

const BulkToolbarContext = createContext<BulkToolbarContextValue | undefined>(
  undefined,
)

// ---- provider ---------------------------------------------------------------

export function BulkToolbarProvider({ children }: { children: ReactNode }) {
  const [bulkToolbarActive, setBulkToolbarActiveState] = useState(false)

  const setBulkToolbarActive = useCallback((active: boolean) => {
    setBulkToolbarActiveState(active)
  }, [])

  const value = useMemo(
    () => ({ bulkToolbarActive, setBulkToolbarActive }),
    [bulkToolbarActive, setBulkToolbarActive],
  )

  return (
    <BulkToolbarContext.Provider value={value}>
      {children}
    </BulkToolbarContext.Provider>
  )
}

// ---- consumer hook ----------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components
export function useBulkToolbar(): BulkToolbarContextValue {
  const ctx = useContext(BulkToolbarContext)
  if (!ctx) {
    // Graceful fallback so components outside the provider (e.g. in unit tests
    // that don't mount the full AppShell) don't crash.
    return { bulkToolbarActive: false, setBulkToolbarActive: () => {} }
  }
  return ctx
}
