import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
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

const TOTAL_STEPS = 9
const STORAGE_PREFIX = 'landr.dashboard.onboarding'

const STEP_LABELS = [
  '',
  'steps.welcome',
  'steps.company',
  'steps.address',
  'steps.pickup',
  'steps.products',
  'steps.gmail',
  'steps.emails',
  'steps.embed',
  'steps.done',
] as const

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

  const advance = useCallback(() => {
    setStep(step + 1)
  }, [setStep, step])

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
    },
    onError: (err: Error) =>
      toast.error(t.onboarding.saveError, { description: err.message }),
  })

  function handleFinishStep8() {
    finishMutation.mutate()
  }

  if (operatorQuery.isLoading || !operatorQuery.data) {
    return (
      <div className="p-6 text-muted-foreground text-sm" role="status">
        {t.settings.loading}
      </div>
    )
  }

  const operator = operatorQuery.data

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold">{t.onboarding.title}</h1>
        <ProgressBar step={step} total={TOTAL_STEPS} />
        <p className="text-xs text-muted-foreground">
          {t.onboarding.progress(step, TOTAL_STEPS)}
        </p>
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
          slug={operator.slug}
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

function ProgressBar({ step, total }: { step: number; total: number }) {
  const pct = Math.round(((step - 1) / (total - 1)) * 100)
  return (
    <div className="space-y-1.5">
      <div
        className="h-2 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
      >
        <div
          className="h-full bg-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      <ol className="flex flex-wrap gap-x-2 gap-y-1 text-[0.65rem] text-muted-foreground">
        {STEP_LABELS.slice(1).map((key, i) => {
          const idx = i + 1
          const label = t.onboarding.steps[key.split('.')[1] as keyof typeof t.onboarding.steps]
          return (
            <li
              key={key}
              className={
                idx === step
                  ? 'font-medium text-foreground'
                  : idx < step
                  ? 'text-foreground/70'
                  : ''
              }
            >
              {idx}. {label}
            </li>
          )
        })}
      </ol>
    </div>
  )
}
