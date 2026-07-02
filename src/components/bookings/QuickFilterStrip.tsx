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

import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import {
  EMPTY_FILTERS,
  type BookingsFilters,
  type UseBookingsFilters,
} from '@/lib/bookings-filters'
import { t } from '@/lib/strings'

// landr-c53m.6 — 'awaiting_payment' is a backend-reserved semantic code
// (booking_lifecycle_stages migrations seed/backfill it for every operator
// that participates in the lifecycle catalogue at all — see
// 20260512215136_booking_lifecycle_stages.sql and
// 20260612020000_backfill_lifecycle_stages.sql in landr-api). It is NOT a
// free-form label an operator can rename away, but an operator that has no
// lifecycle catalogue yet (or is missing this stage for any other reason)
// must not get a "Pending payment" chip that silently filters to nothing.
// We verify the code is actually present among the operator's configured
// stages (same `stages` list BookingDetailSheet already loads via
// fetchBookingStages) and hide the chip rather than target a dead code.
const PAYMENT_PENDING_STAGE_CODE = 'awaiting_payment'

type StageLike = { code: string }

type Props = {
  filtersApi: UseBookingsFilters
  /** The operator's active lifecycle stages (see fetchBookingStages).
   *  Omit while unloaded — the "Pending payment" chip renders optimistically
   *  until we know for sure the stage is missing, so there's no flicker on
   *  first paint for the (overwhelmingly common) operator that has it. */
  stages?: ReadonlyArray<StageLike>
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
    target: {
      ...EMPTY_FILTERS,
      lifecycleStates: [PAYMENT_PENDING_STAGE_CODE],
    },
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
  stages,
  testIdPrefix = 'bookings-quick-filters',
}: Props) {
  const { filters, setFilters } = filtersApi

  // landr-c53m.6 — only suppress the "Pending payment" chip once we've
  // actually loaded the operator's stages AND confirmed the reserved code
  // isn't among them; `stages === undefined` (not yet loaded) keeps the
  // chip visible so the default operator sees no behaviour change.
  const presets = useMemo(() => {
    if (stages === undefined) return PRESETS
    const hasPaymentPendingStage = stages.some(
      (s) => s.code === PAYMENT_PENDING_STAGE_CODE,
    )
    return hasPaymentPendingStage
      ? PRESETS
      : PRESETS.filter((p) => p.id !== 'pending_payment')
  }, [stages])

  return (
    <div
      className="flex flex-wrap items-center gap-1.5"
      role="group"
      aria-label={t.bookings.quickFilters.ariaLabel}
      data-testid={`${testIdPrefix}-bar`}
    >
      {presets.map((preset) => {
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
