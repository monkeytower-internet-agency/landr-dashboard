// landr-fzcg — bare context + consumer hook for SidebarModeProvider.
// Split out of sidebar-mode-context.tsx so the .tsx file only exports a
// React component (Vite Fast Refresh requirement).

import { createContext, useContext } from 'react'

import type { UseSidebarMode } from './sidebar-mode'

export type SidebarModeContextValue = UseSidebarMode & {
  hovered: boolean
  setHovered: (next: boolean) => void
}

export const SidebarModeContext =
  createContext<SidebarModeContextValue | null>(null)

export function useSidebarModeContext(): SidebarModeContextValue {
  const ctx = useContext(SidebarModeContext)
  if (!ctx) {
    throw new Error(
      'useSidebarModeContext must be used within a SidebarModeProvider.',
    )
  }
  return ctx
}
