// landr-funh — Settings → Providers route. Thin wrapper around
// ProvidersManager, mirroring PickupLocations.tsx.

import { ProvidersManager } from '@/components/providers/ProvidersManager'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

export function Providers() {
  const { currentOperatorId } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.providers },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.providers}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <header>
          <h1 className="text-xl font-semibold">{t.providers.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.providers.subtitle}
          </p>
        </header>
        <p className="text-muted-foreground text-sm">
          {t.providers.noOperator}
        </p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <ProvidersManager operatorId={currentOperatorId} />
    </>
  )
}
