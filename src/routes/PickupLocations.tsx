import { PickupLocationsManager } from '@/components/pickup/PickupLocationsManager'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

export function PickupLocations() {
  const { currentOperatorId } = useOperator()

  // landr-fx2i — declare topbar breadcrumb once at the top so it's set
  // both in the loading-shell branch and the manager branch.
  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.pickupLocations },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.pickupLocations}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
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

  return (
    <>
      {titleNode}
      <PickupLocationsManager operatorId={currentOperatorId} />
    </>
  )
}
