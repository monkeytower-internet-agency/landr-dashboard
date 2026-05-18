import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/strings'
import { StepShell } from './StepShell'

type Props = {
  onAdvance: () => void
  onBack: () => void
}

export function Step7Emails({ onAdvance, onBack }: Props) {
  return (
    <StepShell heading={t.onboarding.step7.heading} body={t.onboarding.step7.body}>
      <div className="rounded-md border border-border p-3 text-sm">
        {t.onboarding.step7.defaultKinds}
      </div>

      <div>
        <Button asChild variant="outline" size="sm">
          <Link to="/email-templates">{t.onboarding.step7.manage}</Link>
        </Button>
      </div>

      <div className="flex justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {t.onboarding.back}
        </Button>
        <Button type="button" onClick={onAdvance}>
          {t.onboarding.next}
        </Button>
      </div>
    </StepShell>
  )
}
