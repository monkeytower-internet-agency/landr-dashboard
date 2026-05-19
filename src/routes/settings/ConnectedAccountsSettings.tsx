import { ConnectedAccounts } from '@/components/ConnectedAccounts'
import { t } from '@/lib/strings'

// Connected accounts subsection (landr-4im). Hosts operator-level identity
// links (Google / Apple / GitHub / etc.). The card is implemented in the
// shared ConnectedAccounts component so it can be reused from places like
// onboarding without re-importing this route.
export function ConnectedAccountsSettings() {
  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">
        {t.settingsHub.sections.connectedAccounts}
      </h1>
      <ConnectedAccounts />
    </div>
  )
}
