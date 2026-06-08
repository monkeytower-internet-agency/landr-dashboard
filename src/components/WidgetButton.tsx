/**
 * landr-xen4 → landr-aoak.3 — top-bar "new booking (staff)" quick-action.
 *
 * Originally a one-click shortcut that opened the LIVE public booking widget
 * in a NEW TAB. landr-aoak.3 repurposes it as the STAFF-MODE booking entry:
 * clicking it opens a large modal (full-screen on mobile per landr-3qkr) that
 * embeds the booking widget in an <iframe> in staff/agent mode, so the
 * operator can book on a customer's behalf — with the operator-only powers
 * (force-book a full/blocked day, price override) the widget gates behind a
 * valid signed staff session. See StaffWidgetModal for the mint + postMessage
 * + completion wiring.
 *
 * The env-matched host logic is unchanged (dev → bw-dev.landr.de, staging →
 * bw-staging.landr.de, prod → bw.landr.de): the iframe + the staff-init
 * postMessage targetOrigin + the completion-message origin check all derive
 * from the SAME EmbedEnv → host map, so the wrong-env/token CORS incident the
 * original button guarded against cannot recur.
 *
 * Visibility rules (AND-gated, UNCHANGED from landr-xen4):
 *   1. The current operator's effective entitlements include `embed`.
 *   2. The operator's widget_token has loaded and is non-null.
 *      While loading or when absent, the button is simply hidden.
 */

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { PlusIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { type EmbedEnv } from '@/lib/embed-hosts'
import { getTier } from '@/lib/tier'
import { useOperator } from '@/lib/operator'
import { useEntitlements } from '@/lib/entitlements'
import { fetchWidgetToken } from '@/lib/shortcode'
import { StaffWidgetModal } from '@/components/StaffWidgetModal'
import { t } from '@/lib/strings'

/** Map dashboard deploy tier → widget EmbedEnv. */
function tierToEmbedEnv(): EmbedEnv {
  const tier = getTier()
  if (tier === 'prod') return 'live'
  if (tier === 'staging') return 'staging'
  // dev or null (local dev / unknown) both point at the dev widget host.
  return 'development'
}

export function WidgetButton() {
  const { currentOperatorId } = useOperator()
  const { isEnabled, isLoading: entitlementsLoading } = useEntitlements()
  const [open, setOpen] = useState(false)

  const tokenQuery = useQuery<string | null>({
    queryKey: ['operator-widget-token', currentOperatorId],
    queryFn: () => fetchWidgetToken(currentOperatorId!),
    enabled: !!currentOperatorId,
  })

  // Gating: embed feature must be enabled AND token must be present.
  const embedEnabled = isEnabled('embed')
  const widgetToken = tokenQuery.data ?? null
  const loading = entitlementsLoading || tokenQuery.isPending

  if (loading) return null
  if (!embedEnabled) return null
  if (!widgetToken) return null
  if (!currentOperatorId) return null

  const env = tierToEmbedEnv()

  return (
    <>
      <Button
        variant="ghost"
        size="icon"
        className="size-8"
        onClick={() => setOpen(true)}
        aria-label={t.staffWidget.openLabel}
        title={t.staffWidget.openTitle}
        data-testid="widget-button"
      >
        <PlusIcon className="size-4" />
      </Button>
      <StaffWidgetModal
        operatorId={currentOperatorId}
        widgetToken={widgetToken}
        env={env}
        open={open}
        onOpenChange={setOpen}
      />
    </>
  )
}
