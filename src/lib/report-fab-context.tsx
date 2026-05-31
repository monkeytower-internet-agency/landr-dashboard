// landr-40x0 — shared context that lets any call site open the ReportFab
// dialog pre-filled with error details.
//
// Pattern matches command-palette-context.tsx exactly: provider wraps
// AppShell; useReportFab() is the consumer hook; the context value is a
// simple open-callback so non-React code (notifyError) is NOT wired here —
// see notify.ts which reads the callback via the module-level setter below.
//
// The "Report" action in an error toast calls openWithPrefill(text) which:
//   1. Sets the prefill text in the context state.
//   2. Sets open = true → ReportFab renders the dialog immediately.
//   3. ReportFab clears the prefill once it has consumed it.

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

// ---- types ------------------------------------------------------------------

type ReportFabContextValue = {
  /** Whether the dialog is open. */
  open: boolean
  setOpen: (open: boolean) => void
  /** Pre-filled text to seed the Report dialog (body field). Null = no prefill. */
  prefill: string | null
  /** Open the dialog and pre-fill the body with the given text. */
  openWithPrefill: (text: string) => void
  /** Consume (and clear) the prefill. Called by the dialog body on mount. */
  consumePrefill: () => string | null
}

const ReportFabContext = createContext<ReportFabContextValue | undefined>(
  undefined,
)

// ---- module-level bridge for non-React call sites ---------------------------

// notifyError() needs to trigger the dialog from outside React. It calls this
// setter (registered by the provider on mount) to open the dialog.
let _openWithPrefillFn: ((text: string) => void) | null = null

/** Used by notify.ts to open ReportFab pre-filled from non-React code. */
// eslint-disable-next-line react-refresh/only-export-components
export function _setReportFabOpener(fn: ((text: string) => void) | null) {
  _openWithPrefillFn = fn
}

/** Open ReportFab pre-filled from outside React (e.g. toast action). */
// eslint-disable-next-line react-refresh/only-export-components
export function openReportFabWithPrefill(text: string) {
  _openWithPrefillFn?.(text)
}

// ---- provider ---------------------------------------------------------------

export function ReportFabProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)
  const [prefill, setPrefill] = useState<string | null>(null)

  const openWithPrefill = useCallback((text: string) => {
    setPrefill(text)
    setOpen(true)
  }, [])

  const consumePrefill = useCallback((): string | null => {
    const v = prefill
    setPrefill(null)
    return v
  }, [prefill])

  // Register / unregister the module-level bridge.
  // We use a layout effect equivalent via useMemo + the setter — simpler:
  // just call the setter whenever openWithPrefill changes (stable ref due
  // to useCallback with no deps).
  useMemo(() => {
    _setReportFabOpener(openWithPrefill)
  }, [openWithPrefill])

  const value = useMemo<ReportFabContextValue>(
    () => ({ open, setOpen, prefill, openWithPrefill, consumePrefill }),
    [open, prefill, openWithPrefill, consumePrefill],
  )

  return (
    <ReportFabContext.Provider value={value}>
      {children}
    </ReportFabContext.Provider>
  )
}

// ---- hook -------------------------------------------------------------------

// eslint-disable-next-line react-refresh/only-export-components
export function useReportFab(): ReportFabContextValue {
  const ctx = useContext(ReportFabContext)
  if (!ctx) {
    throw new Error('useReportFab must be used inside <ReportFabProvider>')
  }
  return ctx
}
