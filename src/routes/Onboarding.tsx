import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { useOperator } from '@/lib/operator'
import {
  fetchOperator,
  markOnboarded,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { t } from '@/lib/strings'

import { Step1Welcome } from '@/components/onboarding/Step1Welcome'
import { Step2Company } from '@/components/onboarding/Step2Company'
import { Step3Address } from '@/components/onboarding/Step3Address'
import { Step4Pickup } from '@/components/onboarding/Step4Pickup'
import { Step5Products } from '@/components/onboarding/Step5Products'
import { Step6Gmail } from '@/components/onboarding/Step6Gmail'
import { Step7Emails } from '@/components/onboarding/Step7Emails'
import { Step8Embed } from '@/components/onboarding/Step8Embed'
import { Step9Done } from '@/components/onboarding/Step9Done'
import { OnboardingNodePath } from '@/components/onboarding/OnboardingNodePath'
import { useOnboardingCelebrations } from '@/components/onboarding/useOnboardingCelebrations'
import { Mascot } from '@/components/illustrations/Mascot'

const TOTAL_STEPS = 9
const STORAGE_PREFIX = 'landr.dashboard.onboarding'


function storageKey(operatorId: string): string {
  return `${STORAGE_PREFIX}.${operatorId}.step`
}

function readStoredStep(operatorId: string): number | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = window.localStorage.getItem(storageKey(operatorId))
    if (!raw) return null
    const n = Number(raw)
    if (!Number.isFinite(n) || n < 1 || n > TOTAL_STEPS) return null
    return Math.floor(n)
  } catch {
    return null
  }
}

function writeStoredStep(operatorId: string, step: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(storageKey(operatorId), String(step))
  } catch {
    // localStorage may be disabled — wizard still works in-memory.
  }
}

function clearStoredStep(operatorId: string) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.removeItem(storageKey(operatorId))
  } catch {
    // ignore
  }
}

/** Energetic resume copy — shown when the user isn't on step 1. */
function resumeLabel(step: number, total: number): string {
  const pct = Math.round(((step - 1) / (total - 1)) * 100)
  if (pct >= 80) return `Step ${step} of ${total} — almost there! 🚀`
  if (pct >= 50) return `Step ${step} of ${total} — you're on a roll! ⚡`
  return `Step ${step} of ${total}`
}

export function Onboarding() {
  const { currentOperatorId, refreshOperators } = useOperator()

  if (!currentOperatorId) {
    return (
      <div className="p-6 text-muted-foreground text-sm">
        {t.settings.noOperator}
      </div>
    )
  }
  return <OnboardingInner operatorId={currentOperatorId} refresh={refreshOperators} />
}

function OnboardingInner({
  operatorId,
  refresh,
}: {
  operatorId: string
  refresh: () => void
}) {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()

  const operatorQuery = useQuery<OperatorSettings>({
    queryKey: ['operator-settings', operatorId],
    queryFn: () => fetchOperator(operatorId),
  })

  const [isCompleted, setIsCompleted] = useState(false)

  // landr-y7lw — robustness for stale/incomplete operator contexts (notably a
  // staff "view as" target whose row can't be loaded, or one that's already
  // onboarded). Without these guards the wizard rendered a never-resolving
  // loading state (effectively a blank page) when fetchOperator errored, and
  // pointlessly walked an already-onboarded operator back through setup.
  //
  // We bail to the dashboard in two cases:
  //   1. the operator fetch errored (orphaned / unresolvable context), and
  //   2. the operator is already onboarded AND the wizard wasn't just completed
  //      in this session (isCompleted guards the step-9 "Done" screen so the
  //      genuine finish flow still shows its success step).
  // The legitimate first-run flow (onboarded_at null, fetch OK) is untouched.

  // URL is the single source of truth for `step`. This way, in-SPA
  // navigation to `/onboarding/start?step=N` (e.g. via the resume banner's
  // <Link>) immediately changes which step is rendered — no remount needed.
  // Fallback order: ?step=N → localStorage → 1.
  const step = useMemo(() => {
    const fromUrl = Number(searchParams.get('step'))
    if (Number.isFinite(fromUrl) && fromUrl >= 1 && fromUrl <= TOTAL_STEPS) {
      return Math.floor(fromUrl)
    }
    return readStoredStep(operatorId) ?? 1
  }, [searchParams, operatorId])

  const setStep = useCallback(
    (next: number) => {
      const clamped = Math.min(TOTAL_STEPS, Math.max(1, Math.floor(next)))
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev)
          params.set('step', String(clamped))
          return params
        },
        { replace: true },
      )
    },
    [setSearchParams],
  )

  // If the URL didn't carry `?step=`, mirror the derived step back into the
  // URL so refreshes / shared links keep working. We do this in an effect so
  // render stays pure. Persistence to localStorage also lives here, gated by
  // isCompleted to avoid racing finishMutation.onSuccess's clearStoredStep.
  useEffect(() => {
    if (isCompleted) return
    writeStoredStep(operatorId, step)
    const current = searchParams.get('step')
    if (current !== String(step)) {
      const next = new URLSearchParams(searchParams)
      next.set('step', String(step))
      setSearchParams(next, { replace: true })
    }
  }, [step, operatorId, searchParams, setSearchParams, isCompleted])

  const { justCompletedStep, triggerStepCelebration, triggerFinishConfetti } =
    useOnboardingCelebrations()

  const advance = useCallback(() => {
    // Mark the current step as just-completed for the pop-in animation.
    triggerStepCelebration(step)
    setStep(step + 1)
  }, [setStep, step, triggerStepCelebration])

  const back = useCallback(() => {
    setStep(step - 1)
  }, [setStep, step])

  const finishMutation = useMutation({
    mutationFn: () => markOnboarded(operatorId),
    onSuccess: () => {
      setIsCompleted(true)
      clearStoredStep(operatorId)
      refresh()
      setStep(TOTAL_STEPS)
      // Trigger the full confetti burst — lazy-loaded, no-op on reduced-motion.
      void triggerFinishConfetti()
    },
    onError: (err: Error) =>
      toast.error(t.onboarding.saveError, { description: err.message }),
  })

  function handleFinishStep8() {
    finishMutation.mutate()
  }

  // landr-y7lw — the operator context couldn't be loaded (e.g. a stale view-as
  // target or an orphaned operator). Redirect to the dashboard instead of
  // hanging on a perpetual loading state (the blank page).
  if (operatorQuery.isError) {
    return <Navigate to="/" replace />
  }

  if (operatorQuery.isLoading || !operatorQuery.data) {
    return (
      <div className="p-6 text-muted-foreground text-sm" role="status">
        {t.settings.loading}
      </div>
    )
  }

  const operator = operatorQuery.data

  // landr-y7lw — already-onboarded operators don't belong in the setup wizard.
  // Send them to the dashboard rather than re-running onboarding. isCompleted
  // exempts the in-session finish flow so the step-9 "Done" screen still shows
  // after a genuine completion (markOnboarded sets onboarded_at).
  if (operator.onboarded_at && !isCompleted) {
    return <Navigate to="/" replace />
  }

  // Mascot pose: wave on step 1 and 9 (done), celebrate on the last step,
  // thinking on mid steps, empty-ish never — keep it encouraging.
  const mascotPose =
    step === 1
      ? 'wave'
      : step === TOTAL_STEPS
        ? 'celebrate'
        : step >= 7
          ? 'celebrate'
          : step >= 4
            ? 'thinking'
            : 'wave'

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      {/* Mascot + header row */}
      <header className="space-y-3">
        <div className="flex items-end gap-4">
          <Mascot
            pose={mascotPose}
            size={80}
            className="flex-shrink-0 animate-slide-up-fade"
            key={`mascot-${mascotPose}`}
          />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold font-display">
              {t.onboarding.title}
            </h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              {resumeLabel(step, TOTAL_STEPS)}
            </p>
          </div>
        </div>

        {/* Duolingo-style node progress path */}
        <OnboardingNodePath
          step={step}
          total={TOTAL_STEPS}
          justCompletedStep={justCompletedStep}
        />
      </header>

      {step === 1 && <Step1Welcome onNext={advance} />}
      {step === 2 && (
        <Step2Company
          operator={operator}
          operatorId={operatorId}
          onAdvance={advance}
          onBack={back}
        />
      )}
      {step === 3 && (
        <Step3Address
          operator={operator}
          operatorId={operatorId}
          onAdvance={advance}
          onBack={back}
        />
      )}
      {step === 4 && (
        <Step4Pickup operatorId={operatorId} onAdvance={advance} onBack={back} />
      )}
      {step === 5 && (
        <Step5Products operatorId={operatorId} onAdvance={advance} onBack={back} />
      )}
      {step === 6 && (
        <Step6Gmail operatorId={operatorId} onAdvance={advance} onBack={back} />
      )}
      {step === 7 && <Step7Emails onAdvance={advance} onBack={back} />}
      {step === 8 && (
        <Step8Embed
          operatorId={operatorId}
          onFinish={handleFinishStep8}
          onBack={back}
          finishing={finishMutation.isPending}
        />
      )}
      {step === 9 && <Step9Done />}

      {step === 9 && (
        <div className="text-center pt-4">
          <button
            type="button"
            onClick={() => navigate('/')}
            className="cursor-pointer text-xs text-muted-foreground underline"
          >
            {t.onboarding.step9.ctaDashboard}
          </button>
        </div>
      )}
    </div>
  )
}

