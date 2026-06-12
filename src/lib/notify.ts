// landr-40x0 — notifyError(): central error-capture helper.
//
// Usage:
//   import { notifyError } from '@/lib/notify'
//   notifyError('Could not load bookings', { detail: err.message })
//
// What it does:
//   1. Pushes the error to the in-memory store (src/lib/error-log.ts).
//   2. Shows a sonner toast that is sticky (duration: Infinity), close-
//      buttoned, with:
//      - Copy action: copies "[ISO ts] message — context\nDetail: ..." to
//        the clipboard.
//      - Report action: opens the ReportFab dialog pre-filled with the
//        error text, so the operator can file a ticket in one click.
//
// Non-React: this is a plain module, safe to call from api-client.ts and
// from window error listeners.

import { toast } from 'sonner'
import { addError } from '@/lib/error-log'
import { openReportFabWithPrefill } from '@/lib/report-fab-context'

// ---- types ------------------------------------------------------------------

export type NotifyErrorOptions = {
  /** Additional detail (server body, exception message…). */
  detail?: string
  /**
   * Context hint. Defaults to window.location.pathname.
   * Provide explicitly if the call site knows a better value.
   */
  context?: string
}

// ---- helper -----------------------------------------------------------------

function buildCopyText(
  ts: string,
  message: string,
  context: string,
  detail?: string,
): string {
  const parts: string[] = [`[${ts}] ${message} — ${context}`]
  if (detail) parts.push(`Detail: ${detail}`)
  return parts.join('\n')
}

// ---- public API -------------------------------------------------------------

function resolveContext(opts?: NotifyErrorOptions): string {
  return (
    opts?.context ??
    (typeof window !== 'undefined' ? window.location.pathname : '(unknown)')
  )
}

/**
 * Capture an error into the error-log store *without* showing a toast.
 *
 * landr-q9ph: api-client uses this (not notifyError) so that errors thrown by
 * api() are still recorded in the history bell + copy/report surface, but the
 * user-visible toast stays the caller's responsibility. Most api() callers
 * already show a contextual toast in their react-query onError (e.g. the
 * booking inline-edit / drag-reschedule hooks: "Could not update dates" with
 * the server detail). Toasting again from api-client produced a *duplicate*
 * error toast (a real UX bug, surfaced as the failing "called once" assertions
 * in inline-edit-booking / calendar-reschedule). Capture-only keeps exactly one
 * toast on screen while preserving the error-capture feature.
 *
 * For errors that have NO component-level handler (ConnectedAccounts'
 * Supabase-direct flows, the global window error/unhandledrejection listeners),
 * keep using notifyError() so they still get the sticky/copyable toast.
 */
export function captureError(message: string, opts?: NotifyErrorOptions): void {
  addError({ message, detail: opts?.detail, context: resolveContext(opts) })
}

/**
 * Capture an error: store it, show a sticky sonner toast with Copy + Report
 * actions. Safe to call from anywhere (no React dependency).
 */
export function notifyError(
  message: string,
  opts?: NotifyErrorOptions,
): void {
  const context = resolveContext(opts)
  const { detail } = opts ?? {}

  const entry = addError({ message, detail, context })

  const copyText = buildCopyText(entry.ts, message, context, detail)

  const buildPrefill = () =>
    [
      `**Error report** (auto-filled from error capture)`,
      ``,
      `**Message:** ${message}`,
      detail ? `**Detail:** ${detail}` : null,
      `**Route:** ${context}`,
      `**Time:** ${entry.ts}`,
    ]
      .filter(Boolean)
      .join('\n')

  toast.error(message, {
    id: entry.id,
    description: detail,
    duration: Infinity,
    closeButton: true,
    action: {
      label: 'Copy',
      onClick: () => {
        void navigator.clipboard.writeText(copyText).catch(() => {
          // Clipboard may be unavailable (non-HTTPS, browser policy) — silently swallow.
        })
      },
    },
    cancel: {
      label: 'Report',
      onClick: () => {
        openReportFabWithPrefill(buildPrefill())
      },
    },
  })
}
