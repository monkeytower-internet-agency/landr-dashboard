import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { PickupLocationsManager } from '@/components/pickup/PickupLocationsManager'
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
  const [manageOpen, setManageOpen] = useState(false)
  const queryClient = useQueryClient()

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

  function handleManageOpenChange(open: boolean) {
    setManageOpen(open)
    if (!open) {
      // Refresh the wizard's count display when the overlay closes.
      queryClient.invalidateQueries({ queryKey: ['locations', operatorId] })
    }
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
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setManageOpen(true)}
        >
          {t.onboarding.step4.manage}
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

      <Sheet open={manageOpen} onOpenChange={handleManageOpenChange}>
        <SheetContent
          side="right"
          className="flex w-full flex-col gap-0 overflow-y-auto sm:max-w-2xl"
        >
          <SheetHeader>
            <SheetTitle>{t.pickupLocations.title}</SheetTitle>
            <SheetDescription>
              {t.pickupLocations.subtitle}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-4 pb-4">
            <PickupLocationsManager operatorId={operatorId} hideHeader />
          </div>
        </SheetContent>
      </Sheet>
    </StepShell>
  )
}
