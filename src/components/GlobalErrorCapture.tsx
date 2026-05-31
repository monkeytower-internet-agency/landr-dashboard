// Mounts window-level error + unhandledrejection listeners that feed into
// the error-log store via notifyError. Renders nothing.
//
// Lives in its own file so both shells (operator AppShell + the staff
// TicketSystemShell, which sits as a SIBLING route and not nested under
// AppShell) can mount one copy each. Component-level effect (not module
// level) so StrictMode double-invoke is handled correctly — cleanup
// removes the listeners.

import { useEffect } from 'react'

import { notifyError } from '@/lib/notify'

export function GlobalErrorCapture() {
  useEffect(() => {
    function onError(event: ErrorEvent) {
      const message = event.message || 'Uncaught error'
      const detail =
        event.error instanceof Error
          ? (event.error.stack ?? event.error.message)
          : String(event.error ?? '')
      notifyError(message, { detail: detail || undefined })
    }

    function onUnhandledRejection(event: PromiseRejectionEvent) {
      const reason = event.reason
      const message =
        reason instanceof Error
          ? reason.message
          : String(reason ?? 'Unhandled promise rejection')
      const detail =
        reason instanceof Error
          ? (reason.stack ?? reason.message)
          : String(reason ?? '')
      notifyError(message, { detail: detail || undefined })
    }

    window.addEventListener('error', onError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    return () => {
      window.removeEventListener('error', onError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
  }, [])

  return null
}
