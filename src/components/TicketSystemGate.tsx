// landr-7dya.10 — staff gate for the full-screen ticket-system app-view.
//
// The ticket workspace is STAFF-ONLY (ADR 0005). This guard mirrors the
// Revenue/Release/FeedbackInbox redirect pattern: while the staff flag (and the
// capability probe) is resolving, render a neutral placeholder; once resolved,
// a non-staff user — OR a staff user without the ticket-system capability
// (capabilities degrade gracefully when landr-7dya.14 is unmerged: staff get it
// by default) — is redirected to the operator dashboard home. The hosted
// surfaces also keep their own server-side enforcement (RLS + the inbox's own
// redirect), so this is defence-in-depth UX, not the sole gate.

import type { ReactNode } from 'react'
import { Navigate } from 'react-router-dom'
import { useEntitlements } from '@/lib/entitlements'
import { useAppMode } from '@/lib/app-mode-context'
import { t } from '@/lib/strings'

export function TicketSystemGate({ children }: { children: ReactNode }) {
  const { isLandrStaff, isLoading: entLoading } = useEntitlements()
  const { capabilities, capabilitiesLoading } = useAppMode()

  if (entLoading || capabilitiesLoading) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        {t.feedbackInbox.loading}
      </p>
    )
  }

  if (!isLandrStaff || !capabilities.can_use_ticket_system) {
    return <Navigate to="/" replace />
  }

  return <>{children}</>
}
