import { useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

const TOTAL_STEPS = 9
const STEP_STORAGE_PREFIX = 'landr.dashboard.onboarding'
const DISMISS_STORAGE_PREFIX = 'landr.dashboard.onboardingBanner.dismissed'
const ONBOARDING_PATH_PREFIX = '/onboarding'

function dismissKey(operatorId: string): string {
  return `${DISMISS_STORAGE_PREFIX}.${operatorId}`
}

function stepKey(operatorId: string): string {
  return `${STEP_STORAGE_PREFIX}.${operatorId}.step`
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

function readLastStep(operatorId: string): number {
  if (typeof window === 'undefined') return 1
  try {
    const raw = window.localStorage.getItem(stepKey(operatorId))
    if (!raw) return 1
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1 || n > TOTAL_STEPS) return 1
    return Math.floor(n)
  } catch {
    return 1
  }
}

export function OnboardingBanner() {
  const { currentOperator } = useOperator()
  const location = useLocation()
  const [dismissTick, setDismissTick] = useState(0)

  const operatorId = currentOperator?.id ?? null

  // Re-read sessionStorage whenever the operator changes (per-tenant) or after
  // a local dismiss action bumps the tick. dismissTick is referenced in the
  // expression below so eslint/react keep it in the dependency chain.
  void dismissTick
  const dismissed = operatorId ? readDismissed(operatorId) : false

  if (!currentOperator) return null
  if (currentOperator.onboarded_at) return null
  if (location.pathname.startsWith(ONBOARDING_PATH_PREFIX)) return null
  if (dismissed) return null

  const lastStep = readLastStep(currentOperator.id)
  const resumeHref = `/onboarding/start?step=${lastStep}`

  function handleDismiss() {
    if (!operatorId) return
    writeDismissed(operatorId)
    setDismissTick((n) => n + 1)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 sm:px-6"
      data-testid="onboarding-banner"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400"
          aria-hidden
        />
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">{t.onboarding.banner.title}</p>
          <p className="text-xs text-amber-800/90 dark:text-amber-200/80">
            {t.onboarding.banner.body}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <Button asChild size="sm" variant="outline">
            <Link to={resumeHref}>{t.onboarding.banner.resume}</Link>
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={t.onboarding.banner.dismiss}
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
