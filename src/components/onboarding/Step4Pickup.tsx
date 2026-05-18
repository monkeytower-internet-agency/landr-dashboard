import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import { fetchLocations, type Location } from '@/lib/locations'
import { t } from '@/lib/strings'
import { StepShell } from './StepShell'

type Props = {
  operatorId: string
  onAdvance: () => void
  onBack: () => void
}

export function Step4Pickup({ operatorId, onAdvance, onBack }: Props) {
  const [confirmingSkip, setConfirmingSkip] = useState(false)

  const { data: locations = [], isLoading } = useQuery<Location[]>({
    queryKey: ['locations', operatorId],
    queryFn: () => fetchLocations(operatorId),
    enabled: !!operatorId,
  })

  const count = locations.length
  const isEmpty = !isLoading && count === 0

  function handleNext() {
    if (isEmpty && !confirmingSkip) {
      setConfirmingSkip(true)
      return
    }
    onAdvance()
  }

  return (
    <StepShell heading={t.onboarding.step4.heading} body={t.onboarding.step4.body}>
      <p className="text-sm">{t.onboarding.step4.count(count)}</p>

      <ul className="text-sm text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
        {locations.slice(0, 8).map((l) => (
          <li key={l.id} className="truncate">• {l.name}</li>
        ))}
      </ul>

      <div>
        <Button asChild variant="outline" size="sm">
          <Link to="/pickup-locations">{t.onboarding.step4.manage}</Link>
        </Button>
      </div>

      {confirmingSkip && (
        <p role="alert" className="text-xs text-amber-600 dark:text-amber-500">
          {t.onboarding.step4.skipWarning}
        </p>
      )}

      <div className="flex justify-between gap-3 pt-2">
        <Button type="button" variant="outline" onClick={onBack}>
          {t.onboarding.back}
        </Button>
        <Button type="button" onClick={handleNext}>
          {isEmpty && !confirmingSkip ? t.onboarding.skip : t.onboarding.next}
        </Button>
      </div>
    </StepShell>
  )
}
