import { ConnectedAccounts } from '@/components/ConnectedAccounts'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

// Connected accounts subsection (landr-4im). Hosts operator-level identity
// links (Google / Apple / GitHub / etc.). The card is implemented in the
// shared ConnectedAccounts component so it can be reused from places like
// onboarding without re-importing this route.
export function ConnectedAccountsSettings() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.connectedAccounts },
        ]}
      />
      <h1 className="text-2xl font-semibold">
        {t.settingsHub.sections.connectedAccounts}
      </h1>
      <ConnectedAccounts />
    </div>
  )
}
