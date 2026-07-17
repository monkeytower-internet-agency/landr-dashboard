// landr-6s44 — "set up branded email sending" nudge banner.
//
// Surfaces an operator-wide nudge when GET /api/operator/email-sender
// (@/lib/email-sender) reports the sending domain is not configured, or is
// configured but not yet verified. Mirrors the OnboardingBanner /
// ConfigHealthBanners placement + dismiss pattern (session-scoped dismiss,
// reappears on reload while unresolved) but is driven by the dedicated
// email-sender status client — NOT the generic config-health check — so it
// dedupes its cache entry with the Settings → Email sending page via the
// same EMAIL_SENDER_QUERY_KEY / useEmailSenderConfig hook.
//
// Fails closed to hidden: no banner while loading, on fetch error, or when
// no operator is selected. CTA links to the canonical route
// /account/integrations/email-sender (the old flat /account/email-sender
// 404s and only exists as a redirect — see App.tsx).

import { useState } from 'react'
import { Link } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useEmailSenderConfig } from '@/lib/email-sender'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

const DISMISS_STORAGE_PREFIX = 'landr.dashboard.emailSenderNudge.dismissed'
const EMAIL_SENDER_SETTINGS_PATH = '/account/integrations/email-sender'

function dismissKey(operatorId: string): string {
  return `${DISMISS_STORAGE_PREFIX}.${operatorId}`
}

function readDismissed(operatorId: string): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.sessionStorage.getItem(dismissKey(operatorId)) === 'true'
  } catch {
    return false
  }
}

function writeDismissed(operatorId: string) {
  if (typeof window === 'undefined') return
  try {
    window.sessionStorage.setItem(dismissKey(operatorId), 'true')
  } catch {
    // sessionStorage may be disabled — banner will reappear on next render.
  }
}

export function EmailSenderNudgeBanner() {
  const { currentOperatorId } = useOperator()
  const { data, isLoading, error } = useEmailSenderConfig(currentOperatorId)
  const [dismissTick, setDismissTick] = useState(0)

  // Referenced so eslint/react keep dismissTick in the dependency chain that
  // forces a re-render after a local dismiss action.
  void dismissTick

  if (!currentOperatorId) return null
  // Fail closed to hidden while loading or on fetch error — this is an
  // ambient nudge, not critical path.
  if (isLoading || error || !data) return null

  const notReady = data.configured === false || data.verification_status !== 'verified'
  if (!notReady) return null

  if (readDismissed(currentOperatorId)) return null

  function handleDismiss() {
    writeDismissed(currentOperatorId!)
    setDismissTick((n) => n + 1)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 sm:px-6"
      data-testid="email-sender-nudge-banner"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{t.emailSenderNudge.title}</p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
            {t.emailSenderNudge.body}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild size="sm" variant="outline">
            <Link to={EMAIL_SENDER_SETTINGS_PATH}>
              {t.emailSenderNudge.cta}
            </Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t.emailSenderNudge.dismiss}
            onClick={handleDismiss}
            className="size-7"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}
