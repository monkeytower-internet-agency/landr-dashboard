// landr-y5si — config-health banner stack.
//
// Fetches GET /api/staff/operators/{operator_id}/config-health via the
// existing api client + react-query and renders a stacked set of banners
// at the top of the main dashboard layout (errors above warnings).
//
// Each banner:
//   - Shows title + message.
//   - Is click-through to issue.target_route (react-router navigate).
//   - Is dismissible for the session (local state; reappears on reload while
//     unresolved). Dismissal is NOT persisted server-side in v1.
//
// Empty issues list → renders nothing.
// Fetch error → renders nothing (silent; the app is still usable without this).
// Loading → renders nothing (no skeleton; banners are ambient health hints,
//            not critical path).

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { AlertTriangle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { fetchConfigHealth } from '@/lib/config-health'
import type { ConfigHealthIssue } from '@/lib/config-health'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

function severityClasses(severity: ConfigHealthIssue['severity']): {
  wrapper: string
  icon: string
  iconEl: string
} {
  if (severity === 'error') {
    return {
      wrapper:
        'border-b border-red-200 bg-red-50 px-4 py-3 text-red-900 dark:border-red-900/50 dark:bg-red-950/40 dark:text-red-100 sm:px-6',
      icon: 'text-red-600 dark:text-red-400',
      iconEl: 'text-red-600 dark:text-red-400',
    }
  }
  // warning
  return {
    wrapper:
      'border-b border-amber-200 bg-amber-50 px-4 py-3 text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-100 sm:px-6',
    icon: 'text-amber-600 dark:text-amber-400',
    iconEl: 'text-amber-600 dark:text-amber-400',
  }
}

function ConfigHealthBanner({
  issue,
  onDismiss,
}: {
  issue: ConfigHealthIssue
  onDismiss: (id: string) => void
}) {
  const navigate = useNavigate()
  const cls = severityClasses(issue.severity)

  function handleClick() {
    navigate(issue.target_route)
  }

  function handleDismiss(e: React.MouseEvent) {
    e.stopPropagation()
    onDismiss(issue.id)
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className={cls.wrapper}
      data-testid={`config-health-banner-${issue.id}`}
      data-severity={issue.severity}
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          className={`mt-0.5 size-4 shrink-0 ${cls.iconEl}`}
          aria-hidden
        />
        {/* Clicking the text area navigates to the target route */}
        <button
          type="button"
          className="flex-1 min-w-0 text-left cursor-pointer"
          onClick={handleClick}
          aria-label={`${issue.title}: ${issue.message} — ${t.configHealth.goToSetting}`}
        >
          <p className="text-sm font-medium">{issue.title}</p>
          <p className="text-xs opacity-80">{issue.message}</p>
        </button>
        <div className="flex items-center gap-1 shrink-0">
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleClick}
            className="h-7 text-xs"
            aria-label={`${t.configHealth.goToSetting}: ${issue.title}`}
          >
            {t.configHealth.goToSetting}
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            aria-label={`${t.configHealth.dismiss}: ${issue.title}`}
            onClick={handleDismiss}
            className="size-7"
          >
            <X className="size-4" aria-hidden />
          </Button>
        </div>
      </div>
    </div>
  )
}

export function ConfigHealthBanners() {
  const { currentOperatorId } = useOperator()
  const [dismissed, setDismissed] = useState<Set<string>>(new Set())

  const { data } = useQuery({
    queryKey: ['config-health', currentOperatorId],
    queryFn: () => {
      if (!currentOperatorId) return { issues: [] }
      return fetchConfigHealth(currentOperatorId)
    },
    enabled: !!currentOperatorId,
    // Refetch when the tab regains focus so returning from the Gmail OAuth
    // popup (which triggers a focus event) clears a resolved banner immediately.
    refetchOnWindowFocus: true,
    staleTime: 0,
    // Errors are swallowed — banners are ambient health hints, not critical
    // path. The user can still use the app normally.
    throwOnError: false,
  })

  function handleDismiss(id: string) {
    setDismissed((prev) => new Set([...prev, id]))
  }

  if (!data?.issues?.length) return null

  const visible = data.issues.filter((issue) => !dismissed.has(issue.id))
  if (!visible.length) return null

  // Sort: errors above warnings, stable within each group.
  const errors = visible.filter((i) => i.severity === 'error')
  const warnings = visible.filter((i) => i.severity === 'warning')
  const sorted = [...errors, ...warnings]

  return (
    <>
      {sorted.map((issue) => (
        <ConfigHealthBanner
          key={issue.id}
          issue={issue}
          onDismiss={handleDismiss}
        />
      ))}
    </>
  )
}
