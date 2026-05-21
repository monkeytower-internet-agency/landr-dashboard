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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
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
    <Tabs value={value} onValueChange={(next) => onChange(next as ViewLayout)}>
      <TabsList
        variant="pill"
        aria-label={t.views.layout.groupLabel}
        data-testid={testIdPrefix}
      >
        {OPTIONS.map((opt) => {
          const active = opt.value === value
          const Icon = opt.icon
          return (
            <TabsTrigger key={opt.value} value={opt.value} asChild>
              <Button
                type="button"
                size="sm"
                variant={active ? 'default' : 'ghost'}
                aria-label={opt.label}
                data-testid={`${testIdPrefix}-${opt.value}`}
                className={cn(
                  'h-7 gap-1 px-2 text-xs',
                  !active && 'text-muted-foreground',
                )}
              >
                <Icon className="size-3.5" aria-hidden="true" />
                {opt.label}
              </Button>
            </TabsTrigger>
          )
        })}
      </TabsList>
    </Tabs>
  )
}
