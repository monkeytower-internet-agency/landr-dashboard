import { Button } from '@/components/ui/button'
import { t } from '@/lib/strings'
import { StepShell } from './StepShell'

export function Step1Welcome({ onNext }: { onNext: () => void }) {
  return (
    <StepShell heading={t.onboarding.step1.heading} body={t.onboarding.step1.body}>
      <div className="flex justify-end">
        <Button type="button" onClick={onNext}>
          {t.onboarding.step1.cta}
        </Button>
      </div>
    </StepShell>
  )
}
