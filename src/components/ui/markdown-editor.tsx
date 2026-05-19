import { useContext, useEffect, useState } from 'react'
import MDEditor, { type MDEditorProps } from '@uiw/react-md-editor'
import '@uiw/react-md-editor/markdown-editor.css'

import { ThemeContext } from '@/lib/theme'

type ColorMode = 'light' | 'dark'

function readDomColorMode(): ColorMode {
  if (typeof document === 'undefined') return 'light'
  return document.documentElement.classList.contains('dark') ? 'dark' : 'light'
}

/**
 * Watches `<html class="dark">` for changes so the editor honours theme
 * toggles even when used outside a ThemeProvider (or, e.g., when the user's OS
 * preference flips at runtime). The ThemeProvider keeps that class in sync, so
 * subscribing to it covers both the context and class-only cases.
 */
function useDomColorMode(): ColorMode {
  const [mode, setMode] = useState<ColorMode>(readDomColorMode)
  useEffect(() => {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined')
      return
    const root = document.documentElement
    const update = () => setMode(readDomColorMode())
    update()
    const observer = new MutationObserver(update)
    observer.observe(root, { attributes: true, attributeFilter: ['class'] })
    return () => observer.disconnect()
  }, [])
  return mode
}

/**
 * Theme-aware wrapper around @uiw/react-md-editor.
 *
 * The underlying editor styles its chrome via the `data-color-mode` attribute
 * on an ancestor element. Without it, the editor renders with a white
 * background even when the dashboard is in dark mode (landr-kk2).
 *
 * Re-renders automatically when the ThemeProvider's resolvedTheme changes;
 * falls back to observing `<html class="dark">` when used outside the
 * provider (e.g. in tests or isolated stories).
 */
export function MarkdownEditor(props: MDEditorProps) {
  const themeCtx = useContext(ThemeContext)
  const domMode = useDomColorMode()
  const colorMode: ColorMode = themeCtx?.resolvedTheme ?? domMode
  return (
    <div data-color-mode={colorMode}>
      <MDEditor {...props} />
    </div>
  )
}
