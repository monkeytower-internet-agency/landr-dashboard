// landr-8ou3 — Visual card for a single saved View on /views.
//
// Replaces the plain-text helper that used to render when the operator had
// ≥1 visible View. Each card surfaces, at a glance:
//
//   - A colored gradient header keyed off the View's layout type
//     (Table → blue, Board → violet, Calendar → emerald). Layouts the
//     resolver doesn't recognise fall back to the table palette so the
//     index never renders a colorless / broken card.
//   - A lucide icon for the layout (Table / Columns3 / Calendar) on the
//     gradient header so the layout type is scannable even before the
//     name is read.
//   - The View name (truncates) and a small "Updated …" timestamp.
//   - A filter-count chip ("3 filters") sourced from config.filters via
//     readFilters() so stale / malformed entries are tolerated the same
//     way the chip bar tolerates them.
//   - A <PinButton> in the top-right of the gradient header. Toggling
//     pin does NOT navigate (PinButton itself stops propagation).
//
// Click semantics: the card body is the navigation surface (role=button +
// keyboard support). The pin button lives inside the card but eats its
// own click events so pinning never opens the view.
import { useNavigate } from 'react-router-dom'
import { Calendar, Columns3, type LucideIcon, Table } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { readFilters } from '@/lib/views-filters'
import { isViewLayout, type ViewLayout } from '@/components/views/LayoutSwitcher'
import type { SavedViewWithState } from '@/lib/saved-views'
import { cn } from '@/lib/utils'
import { PinButton } from './PinButton'

type LayoutVisual = {
  /** Tailwind classes for the gradient header background. */
  gradient: string
  /** Tailwind classes for the icon tile sitting on the gradient. */
  iconWrap: string
  /** Icon to render inside the tile. */
  Icon: LucideIcon
  /** Aria label for the layout icon. */
  label: string
}

const LAYOUT_VISUALS: Record<ViewLayout, LayoutVisual> = {
  table: {
    gradient: 'bg-gradient-to-br from-blue-500 to-blue-700',
    iconWrap: 'bg-white/15 text-white ring-1 ring-white/30',
    Icon: Table,
    label: 'Table layout',
  },
  board: {
    gradient: 'bg-gradient-to-br from-violet-500 to-violet-700',
    iconWrap: 'bg-white/15 text-white ring-1 ring-white/30',
    Icon: Columns3,
    label: 'Board layout',
  },
  calendar: {
    gradient: 'bg-gradient-to-br from-emerald-500 to-emerald-700',
    iconWrap: 'bg-white/15 text-white ring-1 ring-white/30',
    Icon: Calendar,
    label: 'Calendar layout',
  },
}

function readConfigLayout(config: Record<string, unknown>): ViewLayout {
  const raw = (config as { layout?: unknown }).layout
  return isViewLayout(raw as string | null | undefined)
    ? (raw as ViewLayout)
    : 'table'
}

// Lazy-init cached formatter (instantiating Intl objects per-render is wasteful
// when the index can show many cards). Matches the pattern used elsewhere in
// src/components/booking/*.tsx for date formatters.
let _relativeFmt: Intl.RelativeTimeFormat | null = null
function getRelativeFmt(): Intl.RelativeTimeFormat {
  if (!_relativeFmt) {
    _relativeFmt = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
  }
  return _relativeFmt
}

const RELATIVE_UNITS: ReadonlyArray<[Intl.RelativeTimeFormatUnit, number]> = [
  ['year', 60 * 60 * 24 * 365],
  ['month', 60 * 60 * 24 * 30],
  ['week', 60 * 60 * 24 * 7],
  ['day', 60 * 60 * 24],
  ['hour', 60 * 60],
  ['minute', 60],
  ['second', 1],
]

function formatRelative(iso: string): string {
  const then = new Date(iso).getTime()
  if (!Number.isFinite(then)) return ''
  const diffSeconds = Math.round((then - Date.now()) / 1000)
  const abs = Math.abs(diffSeconds)
  for (const [unit, secondsInUnit] of RELATIVE_UNITS) {
    if (abs >= secondsInUnit || unit === 'second') {
      const value = Math.round(diffSeconds / secondsInUnit)
      return getRelativeFmt().format(value, unit)
    }
  }
  return ''
}

export type ViewCardProps = {
  view: SavedViewWithState
  operatorId: string
}

export function ViewCard({ view, operatorId }: ViewCardProps) {
  const navigate = useNavigate()
  const layout = readConfigLayout(view.config)
  const visual = LAYOUT_VISUALS[layout]
  const Icon = visual.Icon

  const filterCount = readFilters(view.config).length
  const relative = formatRelative(view.updated_at)

  function open() {
    navigate(`/views/${view.id}`)
  }

  return (
    <Card
      interactive
      role="button"
      tabIndex={0}
      aria-label={`Open view ${view.name}`}
      data-testid={`view-card-${view.id}`}
      onClick={open}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          open()
        }
      }}
      className="cursor-pointer gap-0 overflow-hidden p-0"
    >
      <div
        className={cn(
          'relative flex h-20 items-start justify-between px-4 py-3',
          visual.gradient,
        )}
        data-testid={`view-card-header-${view.id}`}
        data-layout={layout}
      >
        <div
          className={cn(
            'flex h-10 w-10 items-center justify-center rounded-md',
            visual.iconWrap,
          )}
          aria-hidden
        >
          <Icon className="size-5" />
        </div>
        <PinButton
          viewId={view.id}
          pinned={view.user_state.pinned}
          operatorId={operatorId}
          size="md"
          // Override sidebar token colors so the pin reads on the gradient.
          className={cn(
            'text-white/80 hover:bg-white/15 hover:text-white',
            view.user_state.pinned && 'text-amber-300 hover:text-amber-300',
          )}
        />
        <span className="sr-only">{visual.label}</span>
      </div>

      <div className="flex flex-col gap-2 px-4 py-3">
        <h3
          className="truncate text-sm font-semibold"
          title={view.name}
        >
          {view.name}
        </h3>
        <div className="flex items-center justify-between gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-xs',
              filterCount > 0
                ? 'border-input bg-muted text-foreground'
                : 'border-input/60 text-muted-foreground',
            )}
            data-testid={`view-card-filter-count-${view.id}`}
          >
            {filterCount === 1 ? '1 filter' : `${filterCount} filters`}
          </span>
          {relative ? (
            <span
              className="text-muted-foreground truncate text-xs"
              title={new Date(view.updated_at).toLocaleString()}
            >
              Updated {relative}
            </span>
          ) : null}
        </div>
      </div>
    </Card>
  )
}
