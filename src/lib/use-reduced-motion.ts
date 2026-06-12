// landr-7dya.5 — Reactive hook for the prefers-reduced-motion media query.
//
// Returns true when the user's OS / browser has "reduce motion" enabled.
// The hook subscribes to change events so components re-render if the user
// toggles the preference while the app is open.
//
// Usage: skip decorative transforms (tilt, scale) when this returns true.

import { useEffect, useState } from 'react'

const QUERY = '(prefers-reduced-motion: reduce)'

/**
 * Returns true when `prefers-reduced-motion: reduce` is active.
 *
 * SSR-safe: defaults to false when `window.matchMedia` is unavailable.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return window.matchMedia(QUERY).matches
  })

  useEffect(() => {
    if (typeof window === 'undefined') return
    const mql = window.matchMedia(QUERY)
    // Subscribe to future changes; the initial value is already captured in
    // the useState initializer above, so no synchronous setState call here
    // (which would trigger a cascading render per react-hooks/set-state-in-effect).
    const onChange = (e: MediaQueryListEvent) => setReduced(e.matches)
    mql.addEventListener('change', onChange)
    return () => mql.removeEventListener('change', onChange)
  }, [])

  return reduced
}
