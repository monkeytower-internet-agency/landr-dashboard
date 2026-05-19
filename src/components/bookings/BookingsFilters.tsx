// landr-1lj — filter bar above the Bookings table and BookingsCalendar.
//
// Multi-select chips for 5 dimensions:
//   1. lifecycle state (booking_lifecycle_stages.code)
//   2. specific product (products.id)
//   3. pickup location (locations.id via booking_participants)
//   4. product_kind enum
//   5. service_time_shape enum
//
// Options for 1/2/3 are derived from the bookings dataset itself — no
// extra round-trip. Options for 4/5 are hardcoded enums.
//
// State is persisted per-user (see useBookingsFilters). The same instance
// of this component can be reused above the table AND above the calendar
// because filter state lives in the hook, not the component.

import { useMemo } from 'react'
import { Check, Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  activeFilterCount,
  type UseBookingsFilters,
} from '@/lib/bookings-filters'
import type { BookingRow, ProductKind, ServiceTimeShape } from '@/lib/bookings'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Props = {
  bookings: BookingRow[]
  filtersApi: UseBookingsFilters
  /** Test-id prefix so multiple bars on the same page stay distinguishable. */
  testIdPrefix?: string
}

const PRODUCT_KINDS: ProductKind[] = [
  'service',
  'digital_good',
  'physical_good',
  'gift_card',
]

const SERVICE_TIME_SHAPES: ServiceTimeShape[] = [
  'single_date',
  'days_range',
  'fixed_window',
  'time_slot',
]

// Friendly labels for the small set of known stage codes the dashboard
// already names; everything else falls back to a humanised version of the
// raw code so operator-customised stages still render readably.
const KNOWN_STAGE_LABELS: Record<string, string> = {
  awaiting_general_approval: t.bookings.stage.awaitingGeneralApproval,
  awaiting_secondary_approval: t.bookings.stage.awaitingSecondaryApproval,
  awaiting_hotel_approval: t.bookings.stage.awaitingHotelApproval,
}

function lifecycleLabel(code: string): string {
  return KNOWN_STAGE_LABELS[code] ?? t.bookings.filters.stageFallback(code)
}

type Option = { value: string; label: string }

function uniqueSorted(options: Option[]): Option[] {
  const seen = new Map<string, Option>()
  for (const opt of options) {
    if (!seen.has(opt.value)) seen.set(opt.value, opt)
  }
  return Array.from(seen.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  )
}

export function BookingsFilters({
  bookings,
  filtersApi,
  testIdPrefix = 'bookings-filters',
}: Props) {
  const { filters, toggle, clearDimension, clearAll } = filtersApi

  // Derive dropdown options from the dataset so the bar only offers
  // dimensions the operator actually has data for.
  const lifecycleOptions = useMemo<Option[]>(
    () =>
      uniqueSorted(
        bookings
          .map((b) => b.current_stage?.code ?? null)
          .filter((c): c is string => !!c)
          .map((c) => ({ value: c, label: lifecycleLabel(c) })),
      ),
    [bookings],
  )

  const productOptions = useMemo<Option[]>(
    () =>
      uniqueSorted(
        bookings
          .flatMap((b) => b.items)
          .map((it) => it.products)
          .filter((p): p is NonNullable<typeof p> => !!p)
          .map((p) => ({ value: p.id, label: p.name })),
      ),
    [bookings],
  )

  const pickupOptions = useMemo<Option[]>(
    () =>
      uniqueSorted(
        bookings
          .flatMap((b) => b.participants ?? [])
          .map((p) => p.pickup_location)
          .filter((l): l is NonNullable<typeof l> => !!l)
          .map((l) => ({ value: l.id, label: l.name })),
      ),
    [bookings],
  )

  const kindOptions = useMemo<Option[]>(
    () =>
      PRODUCT_KINDS.map((k) => ({
        value: k,
        label: t.bookings.filters.kindLabels[k] ?? k,
      })),
    [],
  )

  const shapeOptions = useMemo<Option[]>(
    () =>
      SERVICE_TIME_SHAPES.map((s) => ({
        value: s,
        label: t.bookings.filters.shapeLabels[s] ?? s,
      })),
    [],
  )

  const total = activeFilterCount(filters)

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid={`${testIdPrefix}-bar`}
    >
      <Filter className="text-muted-foreground size-4" aria-hidden="true" />
      <FilterDropdown
        testId={`${testIdPrefix}-lifecycle`}
        label={t.bookings.filters.lifecycleState}
        options={lifecycleOptions}
        selected={filters.lifecycleStates}
        onToggle={(v) => toggle('lifecycleStates', v)}
        onClear={() => clearDimension('lifecycleStates')}
      />
      <FilterDropdown
        testId={`${testIdPrefix}-product`}
        label={t.bookings.filters.product}
        options={productOptions}
        selected={filters.productIds}
        onToggle={(v) => toggle('productIds', v)}
        onClear={() => clearDimension('productIds')}
      />
      <FilterDropdown
        testId={`${testIdPrefix}-pickup`}
        label={t.bookings.filters.pickupLocation}
        options={pickupOptions}
        selected={filters.pickupLocationIds}
        onToggle={(v) => toggle('pickupLocationIds', v)}
        onClear={() => clearDimension('pickupLocationIds')}
      />
      <FilterDropdown
        testId={`${testIdPrefix}-kind`}
        label={t.bookings.filters.productKind}
        options={kindOptions}
        selected={filters.productKinds}
        onToggle={(v) => toggle('productKinds', v)}
        onClear={() => clearDimension('productKinds')}
      />
      <FilterDropdown
        testId={`${testIdPrefix}-shape`}
        label={t.bookings.filters.serviceTimeShape}
        options={shapeOptions}
        selected={filters.serviceTimeShapes}
        onToggle={(v) => toggle('serviceTimeShapes', v)}
        onClear={() => clearDimension('serviceTimeShapes')}
      />
      {total > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={clearAll}
          data-testid={`${testIdPrefix}-clear-all`}
          className="text-muted-foreground"
        >
          <X className="size-3" aria-hidden="true" />
          {t.bookings.filters.clearAll}
        </Button>
      ) : null}
    </div>
  )
}

type FilterDropdownProps = {
  testId: string
  label: string
  options: Option[]
  selected: string[]
  onToggle: (value: string) => void
  onClear: () => void
}

function FilterDropdown({
  testId,
  label,
  options,
  selected,
  onToggle,
  onClear,
}: FilterDropdownProps) {
  const count = selected.length
  const triggerLabel =
    count > 0 ? `${label}${t.bookings.filters.activeCount(count)}` : label

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant={count > 0 ? 'default' : 'outline'}
          data-testid={`${testId}-trigger`}
          aria-label={triggerLabel}
        >
          {triggerLabel}
        </Button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-2"
        data-testid={`${testId}-content`}
      >
        {options.length === 0 ? (
          <p className="text-muted-foreground p-2 text-xs">
            {t.bookings.filters.noOptions}
          </p>
        ) : (
          <ul className="flex flex-col gap-1" role="group" aria-label={label}>
            {options.map((opt) => {
              const checked = selected.includes(opt.value)
              return (
                <li key={opt.value}>
                  <label
                    className={cn(
                      'hover:bg-muted flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-sm',
                    )}
                    data-testid={`${testId}-option-${opt.value}`}
                  >
                    <Checkbox
                      checked={checked}
                      onChange={() => onToggle(opt.value)}
                      aria-label={opt.label}
                    />
                    <span className="flex-1 truncate">{opt.label}</span>
                    {checked ? (
                      <Check className="size-3.5 opacity-70" aria-hidden="true" />
                    ) : null}
                  </label>
                </li>
              )
            })}
          </ul>
        )}
        {count > 0 ? (
          <div className="border-t mt-2 pt-2">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={onClear}
              className="w-full justify-center text-xs"
              data-testid={`${testId}-clear`}
            >
              {t.bookings.filters.clearAll}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
