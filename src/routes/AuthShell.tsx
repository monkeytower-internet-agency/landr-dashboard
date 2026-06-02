import type { ReactNode } from 'react'
import { t } from '@/lib/strings'

/**
 * Shared branded chrome for the logged-out auth pages (Login, Forgot
 * password, Reset password). Centralises the Landr logo + the soft radial
 * purple gradient that mirrors the mobile onboarding background so every
 * auth surface looks identical.
 *
 * The gradient glow is hardcoded to the Landr brand purple (the dashboard
 * theme's --accent token resolves to a near-surface tone, not the brand
 * colour). Low opacity reads well on both the light and dark page bg.
 */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <div className="relative flex min-h-screen flex-col items-center justify-center gap-0 overflow-hidden bg-background p-6 pb-[24vh]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_65%_65%_at_80%_20%,_rgba(134,59,255,0.16)_0%,_rgba(134,59,255,0.08)_55%,_transparent_100%)]"
      />
      <img
        src="/logos/landr-logo-hi.webp"
        alt={t.app.name}
        className="relative z-10 w-full max-w-xs h-auto"
      />
      {children}
    </div>
  )
}
