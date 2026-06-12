import * as React from "react"

// landr-3qkr.1 — canonical mobile-breakpoint hook for the whole dashboard.
// This is THE shared useIsMobile() referenced by the dashboard-mobile epic
// (landr-3qkr): every slice (M1 shell, M2 DataTable card mode, M3 full-screen
// sheets, M4 forms, M5 dialogs/calendar) should import from "@/hooks/use-mobile"
// rather than rolling its own matchMedia check, so the JS breakpoint and the
// Tailwind `md:` breakpoint (768px) stay in lockstep.
//
// 768 === Tailwind's `md` breakpoint. Keep these two in sync: components mix
// CSS (`md:hidden`) and JS (this hook) to decide mobile-vs-desktop, and a
// mismatch produces a dead band where neither variant shows.
//
// Note on first paint: the hook returns `false` until the mount effect runs
// (matchMedia isn't read during render to stay SSR/jsdom-safe), so callers
// that branch on it render the desktop variant for one frame on a real phone.
// That's acceptable for layout chrome; anything that must be correct on the
// very first frame should also gate with a CSS `md:` class.
export const MOBILE_BREAKPOINT = 768

export function useIsMobile() {
  const [isMobile, setIsMobile] = React.useState<boolean | undefined>(undefined)

  React.useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`)
    const onChange = () => {
      setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    }
    mql.addEventListener("change", onChange)
    setIsMobile(window.innerWidth < MOBILE_BREAKPOINT)
    return () => mql.removeEventListener("change", onChange)
  }, [])

  return !!isMobile
}
