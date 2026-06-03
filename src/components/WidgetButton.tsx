/**
 * landr-xen4 — top-bar "Open booking widget" quick-action.
 *
 * One-click shortcut that opens the LIVE booking widget for the CURRENT
 * operator scope in a new tab. Always uses the env-matched host (dev →
 * bw-dev.landr.de, staging → bw-staging.landr.de, prod → bw.landr.de)
 * with the operator's real widget_token — preventing the real incident where
 * staff opened bw.landr.de with a dev-only token and got a CORS error.
 *
 * Visibility rules (AND-gated):
 *   1. The current operator's effective entitlements include `embed`
 *      (mirrors the /settings/embed gate — operators without embed can't
 *      sensibly open their widget).
 *   2. The operator's widget_token has loaded and is non-null.
 *      While loading or when absent, the button is simply hidden.
 */

import { useQuery } from '@tanstack/react-query'
import { ExternalLinkIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { buildWidgetUrl, type EmbedEnv } from '@/lib/embed-hosts'
import { getTier } from '@/lib/tier'
import { useOperator } from '@/lib/operator'
import { useEntitlements } from '@/lib/entitlements'
import { fetchWidgetToken } from '@/lib/shortcode'

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

  const env = tierToEmbedEnv()
  const url = buildWidgetUrl(env, widgetToken)

  return (
    <Button
      variant="ghost"
      size="icon"
      className="size-8"
      asChild
      data-testid="widget-button"
    >
      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label="Open booking widget"
        title="Open booking widget"
      >
        <ExternalLinkIcon className="size-4" />
      </a>
    </Button>
  )
}
