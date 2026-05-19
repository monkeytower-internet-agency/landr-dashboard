import { PickupLocationsManager } from '@/components/pickup/PickupLocationsManager'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

export function PickupLocations() {
  const { currentOperatorId } = useOperator()

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        <header>
          <h1 className="text-xl font-semibold">{t.pickupLocations.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.pickupLocations.subtitle}
          </p>
        </header>
        <p className="text-muted-foreground text-sm">
          {t.pickupLocations.loading}
        </p>
      </div>
    )
  }

  return <PickupLocationsManager operatorId={currentOperatorId} />
}
