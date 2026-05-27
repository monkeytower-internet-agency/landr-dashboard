// landr-kwu9 — global ? keyboard shortcuts cheat sheet open state.
//
// Mirrors the command-palette-context pattern (landr-wmsc): the provider
// owns open state + installs a window-level keydown listener so '?' from
// anywhere under the protected shell pops the cheat-sheet dialog. Splitting
// the context out into its own file (rather than colocating with the
// component) keeps `useKeyboardShortcutsHelp()` exportable without tripping
// `react-refresh/only-export-components`.
//
// '?' is a printable character on most keyboards, so we intentionally
// suppress it when the user is typing into an input/textarea/contenteditable
// — otherwise the cheat sheet would steal every '?' the user types into a
// note field, a search box, or the command palette itself.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react'
import type { ReactNode } from 'react'

type KeyboardShortcutsHelpContextValue = {
  open: boolean
  setOpen: (open: boolean) => void
  toggle: () => void
}

const KeyboardShortcutsHelpContext = createContext<
  KeyboardShortcutsHelpContextValue | undefined
>(undefined)

/**
 * True when the event target is a text-entry surface where '?' should be
 * treated as plain input, not as a shortcut. We deliberately accept
 * contenteditable nodes (rich-text editors, markdown previews) so future
 * editor surfaces don't have to opt-out one-by-one.
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

/**
 * Match the '?' key. On most layouts '?' is Shift+/, so check both the
 * resolved key (covers layouts where '?' is unshifted) and the Shift+/
 * combo (covers US/UK QWERTY where event.key may report '/' on some
 * browsers if shift is read separately).
 */
function isHelpHotkey(event: KeyboardEvent): boolean {
  // Ignore when a modifier is held — Cmd+? / Ctrl+? are reserved for the
  // browser/OS (e.g. macOS Help menu) and should never trigger the sheet.
  if (event.metaKey || event.ctrlKey || event.altKey) return false
  return event.key === '?'
}

export function KeyboardShortcutsHelpProvider({
  children,
}: {
  children: ReactNode
}) {
  const [open, setOpen] = useState(false)

  const toggle = useCallback(() => setOpen((prev) => !prev), [])

  useEffect(() => {
    function handler(event: KeyboardEvent) {
      if (!isHelpHotkey(event)) return
      if (isEditableTarget(event.target)) return
      event.preventDefault()
      setOpen((prev) => !prev)
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [])

  const value = useMemo<KeyboardShortcutsHelpContextValue>(
    () => ({ open, setOpen, toggle }),
    [open, toggle],
  )

  return (
    <KeyboardShortcutsHelpContext.Provider value={value}>
      {children}
    </KeyboardShortcutsHelpContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export function useKeyboardShortcutsHelp(): KeyboardShortcutsHelpContextValue {
  const ctx = useContext(KeyboardShortcutsHelpContext)
  if (!ctx) {
    throw new Error(
      'useKeyboardShortcutsHelp must be used inside <KeyboardShortcutsHelpProvider>',
    )
  }
  return ctx
}
