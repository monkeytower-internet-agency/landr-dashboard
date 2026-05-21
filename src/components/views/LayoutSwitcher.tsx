// landr-hgtv — Layout switcher (Table / Board / Calendar).
//
// Three-button group that flips the active layout for the current View by
// updating the ?layout= URL param. The default (no param) falls back to the
// View's stored config.layout. Decision B2 from the grilling:
//   - ?layout= is a per-tab override; the View's saved default is unchanged
//     unless the user explicitly clicks "Set as default layout" (rendered
//     by ViewPage, not here, because that affordance needs API access).

import { LayoutGrid, LayoutList, CalendarDays } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

// eslint-disable-next-line react-refresh/only-export-components
export const VIEW_LAYOUTS = ['table', 'board', 'calendar'] as const
export type ViewLayout = (typeof VIEW_LAYOUTS)[number]

// eslint-disable-next-line react-refresh/only-export-components
export function isViewLayout(value: string | null | undefined): value is ViewLayout {
  return value === 'table' || value === 'board' || value === 'calendar'
}

type Props = {
  /** Layout currently shown (URL override OR config.layout fallback). */
  value: ViewLayout
  /** Caller decides whether to flip ?layout= or update the View's config. */
  onChange: (next: ViewLayout) => void
  testIdPrefix?: string
}

type LayoutOption = {
  value: ViewLayout
  label: string
  icon: typeof LayoutList
}

const OPTIONS: readonly LayoutOption[] = [
  { value: 'table', label: t.views.layout.table, icon: LayoutList },
  { value: 'board', label: t.views.layout.board, icon: LayoutGrid },
  { value: 'calendar', label: t.views.layout.calendar, icon: CalendarDays },
]

export function LayoutSwitcher({ value, onChange, testIdPrefix = 'layout-switcher' }: Props) {
  return (
    <div
      role="tablist"
      aria-label={t.views.layout.groupLabel}
      data-testid={testIdPrefix}
      className="border-input bg-background inline-flex rounded-md border p-0.5"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value
        const Icon = opt.icon
        return (
          <Button
            key={opt.value}
            type="button"
            role="tab"
            size="sm"
            variant={active ? 'default' : 'ghost'}
            aria-selected={active}
            aria-label={opt.label}
            data-testid={`${testIdPrefix}-${opt.value}`}
            onClick={() => onChange(opt.value)}
            className={cn(
              'h-7 gap-1 px-2 text-xs',
              !active && 'text-muted-foreground',
            )}
          >
            <Icon className="size-3.5" aria-hidden="true" />
            {opt.label}
          </Button>
        )
      })}
    </div>
  )
}
