// landr-52ik.1 — Sentry error monitoring (@sentry/react), gated on
// VITE_SENTRY_DSN.
//
// STRICTLY gated: unset/blank ⇒ initSentry() is a complete no-op (no
// Sentry.init() call, no monkeypatching, no network calls). This is how it
// ships until a Sentry project + DSN are provisioned — a human-only action
// (Sentry project creation + setting VITE_SENTRY_DSN as a Cloudflare Pages
// build env var). See the landr-52ik.1 handoff.
//
// Wiring: captureError() and notifyError() (src/lib/notify.ts) both funnel
// through addError() in src/lib/error-log.ts — that's the single choke
// point where EVERY captured error already lands, regardless of source:
//   - api-client.ts 401 / non-2xx responses (captureError, no toast)
//   - GlobalErrorCapture's window 'error' / 'unhandledrejection' listeners
//     (notifyError, sticky toast)
//   - RouteErrorBoundary's componentDidCatch (captureError, no toast)
// reportErrorToSentry() is called from addError() so all of the above
// forward to Sentry automatically — no changes needed at any call site.

import * as Sentry from '@sentry/react'

let _enabled = false

/** Initialise Sentry if VITE_SENTRY_DSN is set. Returns true if enabled. */
export function initSentry(): boolean {
  const dsn = (import.meta.env.VITE_SENTRY_DSN as string | undefined)?.trim()
  if (!dsn) {
    _enabled = false
    return false
  }

  Sentry.init({
    dsn,
    environment:
      (import.meta.env.VITE_DEPLOY_TIER as string | undefined) || 'dev',
    // Injected at build time by .github/workflows/deploy.yml
    // (VITE_COMMIT_SHA=${{ github.sha }}) — mirrors the release tag the
    // landr-api Sentry project uses (GIT_SHA), so a single deploy shows up
    // as the same release across both projects.
    release: (import.meta.env.VITE_COMMIT_SHA as string | undefined) || undefined,
    // No performance tracing (tracesSampleRate omitted = disabled) — this
    // ticket is error monitoring only.
  })
  _enabled = true
  return true
}

/** True once initSentry() has activated a real client (DSN was set). */
export function isSentryEnabled(): boolean {
  return _enabled
}

/**
 * Forward a captured error-log entry to Sentry. No-op when Sentry isn't
 * initialised. Called from error-log.ts::addError() so every capture path
 * (captureError / notifyError / GlobalErrorCapture / RouteErrorBoundary)
 * reports without needing per-call-site changes.
 */
export function reportErrorToSentry(
  message: string,
  opts?: { detail?: string; context?: string },
): void {
  if (!_enabled) return
  Sentry.captureException(new Error(message), {
    extra: {
      detail: opts?.detail,
      context: opts?.context,
    },
  })
}
