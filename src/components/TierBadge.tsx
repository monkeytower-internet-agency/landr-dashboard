// landr-7dya.19 — deploy-tier badge in the AppShell topbar.
// Renders nothing on prod or when VITE_DEPLOY_TIER is unset.
// 'DEV' → blue pill, 'STAGING' → amber pill.
// Mounted once at the shell level — never per-route.

import { cn } from '@/lib/utils'
import { getTier } from '@/lib/tier'

export function TierBadge() {
  const tier = getTier()

  if (tier === null || tier === 'prod') return null

  const label = tier === 'dev' ? 'DEV' : 'STAGING'

  return (
    <span
      role="status"
      aria-label={`Deploy tier: ${label}`}
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-bold leading-none tracking-wide select-none',
        tier === 'dev'
          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300'
          : 'bg-amber-100 text-amber-700 dark:bg-amber-900/60 dark:text-amber-300',
      )}
    >
      {label}
    </span>
  )
}
