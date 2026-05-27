// landr-wmsc — Cmd/Ctrl+K command palette open state.
//
// Lives at the AppShell level so any route under the protected shell can
// trigger or read the palette without prop drilling. The provider also
// installs a window-level keydown listener so Cmd+K / Ctrl+K toggles the
// palette from anywhere in the app (including form fields, since `cmdk`
// itself only handles keys once the palette is open).
//
// Splitting the context out into its own file (rather than colocating
// with the provider component) lets `useCommandPalette()` be exported
// without tripping `react-refresh/only-export-components`, the same
// pattern the sidebar-mode context uses (sidebar-mode-context-shared.ts).
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

type CommandPaletteContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const CommandPaletteContext = createContext<
  CommandPaletteContextValue | undefined
>(undefined)

/**
 * Hot-key matcher for Cmd+K (macOS) / Ctrl+K (everything else). We accept
 * either modifier so a Mac user on a Windows-style keyboard still gets the
 * palette via Ctrl+K. The check is case-insensitive so Shift+K still maps.
 */
function isPaletteHotkey(event: KeyboardEvent): boolean {
  if (event.key !== 'k' && event.key !== 'K') return false
  return event.metaKey || event.ctrlKey
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((prev) => !prev), [])

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (!isPaletteHotkey(event)) return
      event.preventDefault()
      setOpen((prev) => !prev)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
  )

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
    </CommandPaletteContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext)
  if (!ctx) {
    throw new Error(
      'useCommandPalette must be used inside <CommandPaletteProvider>',
    )
  }
  return ctx
}
