import { HotelsManager } from '@/components/hotels/HotelsManager'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

// landr-cyoi — Hotels settings page. Mirrors PickupLocations.tsx: declares
// the topbar breadcrumb once at the top so it's set in both the loading-shell
// and the manager branches.
export function Hotels() {
  const { currentOperatorId } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.hotels },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.hotels}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <header>
          <h1 className="text-xl font-semibold">{t.hotels.title}</h1>
          <p className="text-muted-foreground text-sm">{t.hotels.subtitle}</p>
        </header>
        <p className="text-muted-foreground text-sm">{t.hotels.loading}</p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <HotelsManager operatorId={currentOperatorId} />
    </>
  )
}
