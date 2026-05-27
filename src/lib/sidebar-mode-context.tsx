// landr-fzcg — context wrapper around `useSidebarMode` + the live
// `hovered` flag used by the hover-expand mode. Lives at the AppShell
// level so it can both (a) drive the controlled `open` prop on shadcn's
// SidebarProvider via openFor(mode, hovered) and (b) be read by
// AppSidebar to render the 3-state control + attach pointer handlers
// to the sidebar DOM element. A context avoids subscribing twice to
// localStorage and keeps the producers + consumers in lockstep.
//
// The bare context object + the consumer hook live in
// `sidebar-mode-context-shared.ts` so this .tsx file only exports a
// component (keeps Vite Fast Refresh happy).

import { useCallback, useMemo, useState, type ReactNode } from 'react'

import { useSidebarMode } from './sidebar-mode'
import {
  SidebarModeContext,
  type SidebarModeContextValue,
} from './sidebar-mode-context-shared'

export function SidebarModeProvider({ children }: { children: ReactNode }) {
  const modeApi = useSidebarMode()
  const [hovered, setHoveredState] = useState(false)
  // Wrap setter in useCallback so it stays stable across renders and
  // doesn't churn the memoised context value (which would invalidate
  // every consumer's useEffect deps unnecessarily).
  const setHovered = useCallback((next: boolean) => {
    setHoveredState(next)
  }, [])
  const value = useMemo<SidebarModeContextValue>(
    () => ({ ...modeApi, hovered, setHovered }),
    [modeApi, hovered, setHovered],
  )
  return (
    <SidebarModeContext.Provider value={value}>
      {children}
    </SidebarModeContext.Provider>
  )
}
