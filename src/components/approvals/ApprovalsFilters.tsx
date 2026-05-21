// landr-aqn4 — filter bar above the Approvals queue.
//
// Mirrors src/components/bookings/BookingsFilters.tsx (landr-1lj / knz3)
// but with approvals-specific dimensions:
//   1. reason          — derived from approval_trace.applied_rules
//   2. product         — products.id from booking_products
//   3. customer status — 'new' / 'returning'
//   4. urgency         — days-until-activity bucket
//   5. price           — gross_total bucket
//
// Options for reason / customer status / urgency / price are STATIC enums
// (each chip shows a count badge of unfiltered base-dataset matches,
// disabled-when-zero). Product options derive from the dataset itself.

import { useMemo } from 'react'
import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CountedFilterChip } from '@/components/ui/counted-filter-chip'
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import {
  activeApprovalsFilterCount,
  type UseApprovalsFilters,
} from '@/lib/approvals-filters'
import {
  APPROVAL_REASON_BUCKETS,
  APPROVAL_STAGE_BUCKETS,
  PRICE_BUCKETS,
  URGENCY_BUCKETS,
  approvalReasonsOf,
  isNewCustomer,
  priceBucketOf,
  stageOf,
  urgencyBucketOf,
  type ApprovalStage,
  type BookingRow,
  type PriceBucket,
  type UrgencyBucket,
} from '@/lib/bookings'
import { t } from '@/lib/strings'

type Props = {
  bookings: BookingRow[]
  filtersApi: UseApprovalsFilters
  /** Test-id prefix so multiple bars on the same page stay distinguishable. */
  testIdPrefix?: string
  /** Reference date for urgency bucketing. Tests override; production defaults
   *  to `new Date()` per call. */
  now?: Date
}

type Option = { value: string; label: string; count: number }

function bucketByValue(
  pairs: Array<{ bookingId: string; value: string; label: string }>,
  extras: Array<{ value: string; label: string }> = [],
): Option[] {
  const seenByValue = new Map<
    string,
    { label: string; bookings: Set<string> }
  >()
  for (const { bookingId, value, label } of pairs) {
    let entry = seenByValue.get(value)
    if (!entry) {
      entry = { label, bookings: new Set() }
      seenByValue.set(value, entry)
    }
    entry.bookings.add(bookingId)
  }
  for (const extra of extras) {
    if (!seenByValue.has(extra.value)) {
      seenByValue.set(extra.value, { label: extra.label, bookings: new Set() })
    }
  }
  return Array.from(seenByValue.entries())
    .map(([value, { label, bookings }]) => ({
      value,
      label,
      count: bookings.size,
    }))
    .sort((a, b) => a.label.localeCompare(b.label))
}

export function ApprovalsFilters({
  bookings,
  filtersApi,
  testIdPrefix = 'approvals-filters',
  now,
}: Props) {
  const { filters, toggle, clearDimension, clearAll } = filtersApi

  const reasonOptions = useMemo<Option[]>(
    () =>
      bucketByValue(
        bookings.flatMap((b) =>
          Array.from(approvalReasonsOf(b)).map((bucket) => ({
            bookingId: b.id,
            value: bucket,
            label: t.generalApprovals.filters.reasonLabels[bucket] ?? bucket,
          })),
        ),
        APPROVAL_REASON_BUCKETS.map((bucket) => ({
          value: bucket,
          label: t.generalApprovals.filters.reasonLabels[bucket] ?? bucket,
        })),
      ),
    [bookings],
  )

  const productOptions = useMemo<Option[]>(
    () =>
      bucketByValue(
        bookings.flatMap((b) =>
          b.items
            .map((it) => it.products)
            .filter((p): p is NonNullable<typeof p> => !!p)
            .map((p) => ({ bookingId: b.id, value: p.id, label: p.name })),
        ),
      ),
    [bookings],
  )

  const customerStatusOptions = useMemo<Option[]>(
    () =>
      bucketByValue(
        bookings.map((b) => {
          const status = isNewCustomer(b) ? 'new' : 'returning'
          return {
            bookingId: b.id,
            value: status,
            label: t.generalApprovals.filters.customerStatusLabels[status],
          }
        }),
        (['new', 'returning'] as const).map((s) => ({
          value: s,
          label: t.generalApprovals.filters.customerStatusLabels[s],
        })),
      ),
    [bookings],
  )

  const urgencyOptions = useMemo<Option[]>(
    () =>
      bucketByValue(
        bookings.map((b) => {
          const bucket = urgencyBucketOf(b, now)
          return {
            bookingId: b.id,
            value: bucket,
            label:
              t.generalApprovals.filters.urgencyLabels[bucket] ?? bucket,
          }
        }),
        URGENCY_BUCKETS.map((bucket: UrgencyBucket) => ({
          value: bucket,
          label: t.generalApprovals.filters.urgencyLabels[bucket] ?? bucket,
        })),
      ),
    [bookings, now],
  )

  const priceOptions = useMemo<Option[]>(
    () =>
      bucketByValue(
        bookings.map((b) => {
          const bucket = priceBucketOf(b)
          return {
            bookingId: b.id,
            value: bucket,
            label: t.generalApprovals.filters.priceLabels[bucket] ?? bucket,
          }
        }),
        PRICE_BUCKETS.map((bucket: PriceBucket) => ({
          value: bucket,
          label: t.generalApprovals.filters.priceLabels[bucket] ?? bucket,
        })),
      ),
    [bookings],
  )

  // landr-qmdo — Stage ('general' | 'secondary' | 'hotel'). Rows whose
  // stage code doesn't map to a known bucket (stageOf → null) are skipped
  // here so the count badges only reflect the three canonical states.
  const stageOptions = useMemo<Option[]>(() => {
    const pairs: Array<{ bookingId: string; value: string; label: string }> = []
    for (const b of bookings) {
      const bucket = stageOf(b)
      if (!bucket) continue
      pairs.push({
        bookingId: b.id,
        value: bucket,
        label: t.generalApprovals.filters.stageLabels[bucket] ?? bucket,
      })
    }
    return bucketByValue(
      pairs,
      APPROVAL_STAGE_BUCKETS.map((bucket: ApprovalStage) => ({
        value: bucket,
        label: t.generalApprovals.filters.stageLabels[bucket] ?? bucket,
      })),
    )
  }, [bookings])

  const total = activeApprovalsFilterCount(filters)

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid={`${testIdPrefix}-bar`}
    >
      <Filter className="text-muted-foreground size-4" aria-hidden="true" />
      <FilterDropdown
        testId={`${testIdPrefix}-reason`}
        label={t.generalApprovals.filters.reason}
        options={reasonOptions}
        selected={filters.reasons}
        onToggle={(v) => toggle('reasons', v)}
        onClear={() => clearDimension('reasons')}
      />
      <FilterDropdown
        testId={`${testIdPrefix}-product`}
        label={t.generalApprovals.filters.product}
        options={productOptions}
        selected={filters.productIds}
        onToggle={(v) => toggle('productIds', v)}
        onClear={() => clearDimension('productIds')}
      />
      <FilterDropdown
        testId={`${testIdPrefix}-customer-status`}
        label={t.generalApprovals.filters.customerStatus}
        options={customerStatusOptions}
        selected={filters.customerStatus}
        onToggle={(v) => toggle('customerStatus', v)}
        onClear={() => clearDimension('customerStatus')}
      />
      <FilterDropdown
        testId={`${testIdPrefix}-urgency`}
        label={t.generalApprovals.filters.urgency}
        options={urgencyOptions}
        selected={filters.urgency}
        onToggle={(v) => toggle('urgency', v)}
        onClear={() => clearDimension('urgency')}
      />
      <FilterDropdown
        testId={`${testIdPrefix}-price`}
        label={t.generalApprovals.filters.price}
        options={priceOptions}
        selected={filters.price}
        onToggle={(v) => toggle('price', v)}
        onClear={() => clearDimension('price')}
      />
      <FilterDropdown
        testId={`${testIdPrefix}-stage`}
        label={t.generalApprovals.filters.stage}
        options={stageOptions}
        selected={filters.stages}
        onToggle={(v) => toggle('stages', v)}
        onClear={() => clearDimension('stages')}
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
          {t.generalApprovals.filters.clearAll}
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
    count > 0
      ? `${label}${t.generalApprovals.filters.activeCount(count)}`
      : label

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
        className="w-72 p-2"
        data-testid={`${testId}-content`}
      >
        {options.length === 0 ? (
          <p className="text-muted-foreground p-2 text-xs">
            {t.generalApprovals.filters.noOptions}
          </p>
        ) : (
          <div
            className="flex flex-wrap gap-1.5 p-1"
            role="group"
            aria-label={label}
          >
            {options.map((opt) => {
              const checked = selected.includes(opt.value)
              return (
                <CountedFilterChip
                  key={opt.value}
                  label={opt.label}
                  count={opt.count}
                  selected={checked}
                  onToggle={() => onToggle(opt.value)}
                  testId={`${testId}-option-${opt.value}`}
                  disabledTooltip={t.generalApprovals.filters.noOfValue(
                    opt.label,
                  )}
                />
              )
            })}
          </div>
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
              {t.generalApprovals.filters.clearAll}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
