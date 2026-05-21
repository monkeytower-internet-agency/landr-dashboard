// landr-68a9 — quick-filter pill strip above the Bookings table.
//
// Five hardcoded presets:
//   - All              → clearAll() (also clears the showPast view toggle
//                        because EMPTY_FILTERS is the canonical "default")
//   - Today            → service date == today
//   - This week        → service date in Mon..Sun of the current week
//   - Pending payment  → lifecycle stage == 'awaiting_payment'
//   - Upcoming (30d)   → service date in [today, today+30)
//
// Presets are NOT additive — clicking one replaces the entire filter
// state with the preset's target. This matches operator expectations
// (presets are mutually exclusive shortcuts) and keeps "currently
// active" trivially decidable: a pill is active iff the live filter
// state deep-equals its target.

import { Button } from '@/components/ui/button'
import {
  EMPTY_FILTERS,
  type BookingsFilters,
  type UseBookingsFilters,
} from '@/lib/bookings-filters'
import { t } from '@/lib/strings'

type Props = {
  filtersApi: UseBookingsFilters
  /** Test-id prefix; mirrors BookingsFilters so multiple bars on one
   *  page (table + calendar) stay distinguishable. */
  testIdPrefix?: string
}

type Preset = {
  id: 'all' | 'today' | 'this_week' | 'pending_payment' | 'upcoming'
  label: string
  target: BookingsFilters
}

const PRESETS: ReadonlyArray<Preset> = [
  {
    id: 'all',
    label: t.bookings.quickFilters.all,
    target: EMPTY_FILTERS,
  },
  {
    id: 'today',
    label: t.bookings.quickFilters.today,
    target: { ...EMPTY_FILTERS, serviceDateRange: 'today' },
  },
  {
    id: 'this_week',
    label: t.bookings.quickFilters.thisWeek,
    target: { ...EMPTY_FILTERS, serviceDateRange: 'this_week' },
  },
  {
    id: 'pending_payment',
    label: t.bookings.quickFilters.pendingPayment,
    // landr-68a9 — operator-level stage code; awaiting_payment is the
    // seeded Para42 stage but other operators may rename it. The chip
    // simply targets the canonical code — operators with a different
    // code can still rely on the underlying filter dropdown.
    target: { ...EMPTY_FILTERS, lifecycleStates: ['awaiting_payment'] },
  },
  {
    id: 'upcoming',
    label: t.bookings.quickFilters.upcoming,
    target: { ...EMPTY_FILTERS, serviceDateRange: 'next_30d' },
  },
]

function filtersEqual(a: BookingsFilters, b: BookingsFilters): boolean {
  return (
    a.showPast === b.showPast &&
    a.serviceDateRange === b.serviceDateRange &&
    arraysEqualSorted(a.lifecycleStates, b.lifecycleStates) &&
    arraysEqualSorted(a.productIds, b.productIds) &&
    arraysEqualSorted(a.pickupLocationIds, b.pickupLocationIds) &&
    arraysEqualSorted(a.productKinds, b.productKinds) &&
    arraysEqualSorted(a.serviceTimeShapes, b.serviceTimeShapes)
  )
}

function arraysEqualSorted(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const sa = [...a].sort()
  const sb = [...b].sort()
  for (let i = 0; i < sa.length; i++) if (sa[i] !== sb[i]) return false
  return true
}

export function QuickFilterStrip({
  filtersApi,
  testIdPrefix = 'bookings-quick-filters',
}: Props) {
  const { filters, setFilters } = filtersApi

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={t.bookings.quickFilters.ariaLabel}
      data-testid={`${testIdPrefix}-bar`}
    >
      {PRESETS.map((preset) => {
        const active = filtersEqual(filters, preset.target)
        return (
          <Button
            key={preset.id}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            aria-pressed={active}
            data-testid={`${testIdPrefix}-${preset.id}`}
            onClick={() => setFilters(preset.target)}
          >
            {preset.label}
          </Button>
        )
      })}
    </div>
  )
}
