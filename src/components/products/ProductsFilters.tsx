// landr-pugm — sort dropdown + product_kind chip bar above the Products list.
//
// Three sort modes (mirroring useProductsSort defaults):
//   created_at_desc — Recently added (default)
//   updated_at_desc — Recently changed
//   name_asc        — Alphabetical (name ASC)
//
// Six kind chips (matches public.product_kind enum):
//   service / subscription / hotel_room / physical_good / digital_good / gift_card
//
// State lives in the hooks (useProductsSort / useProductsFilters), not in
// this component, so the same control could be re-mounted elsewhere
// without losing selection — same pattern as ContactsFilters (landr-pqk).

import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CountedFilterChip } from '@/components/ui/counted-filter-chip'
import { NativeSelect } from '@/components/ui/native-select'
import { productKindLabel, type ProductKindCounts } from '@/lib/products'
import {
  PRODUCT_KINDS,
  activeFilterCount,
  type UseProductsFilters,
} from '@/lib/products-filters'
import type { ProductsSort, UseProductsSort } from '@/lib/products-sort'
import { t } from '@/lib/strings'

const ZERO_COUNTS: ProductKindCounts = {
  service: 0,
  subscription: 0,
  hotel_room: 0,
  physical_good: 0,
  digital_good: 0,
  gift_card: 0,
}

type Props = {
  sortApi: UseProductsSort
  filtersApi: UseProductsFilters
  /**
   * Per-kind counts (landr-knz3). When omitted, defaults to all-zero,
   * which disables every chip — callers should pass a real value as soon
   * as the count query resolves.
   */
  kindCounts?: ProductKindCounts
  /** Test-id prefix so multiple bars on the same page stay distinguishable. */
  testIdPrefix?: string
}

const SORT_VALUES: ProductsSort[] = [
  'created_at_desc',
  'updated_at_desc',
  'name_asc',
]

function isSort(v: string): v is ProductsSort {
  return (SORT_VALUES as string[]).includes(v)
}

export function ProductsFilters({
  sortApi,
  filtersApi,
  kindCounts = ZERO_COUNTS,
  testIdPrefix = 'products-filters',
}: Props) {
  const { sort, setSort } = sortApi
  const { filters, toggleKind, clearAll } = filtersApi
  const total = activeFilterCount(filters)

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid={`${testIdPrefix}-bar`}
    >
      <Filter className="text-muted-foreground size-4" aria-hidden="true" />
      <span className="text-muted-foreground text-xs">
        {t.products.filters.kindLabel}
      </span>
      {PRODUCT_KINDS.map((kind) => {
        const active = filters.kinds.includes(kind)
        const label = productKindLabel(kind)
        return (
          <CountedFilterChip
            key={kind}
            label={label}
            count={kindCounts[kind]}
            selected={active}
            onToggle={() => toggleKind(kind)}
            testId={`${testIdPrefix}-kind-${kind}`}
            disabledTooltip={t.products.filters.noOfKind(label)}
          />
        )
      })}
      {total > 0 ? (
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={clearAll}
          data-testid={`${testIdPrefix}-clear-all`}
          className="text-muted-foreground h-7 px-2 text-xs"
        >
          <X className="size-3" aria-hidden="true" />
          {t.products.filters.clearAll}
        </Button>
      ) : null}
      <label
        className="text-muted-foreground ml-auto flex items-center gap-2 text-xs"
        htmlFor={`${testIdPrefix}-sort`}
      >
        {t.products.filters.sortLabel}
        <span className="w-44">
          <NativeSelect
            id={`${testIdPrefix}-sort`}
            value={sort}
            onChange={(e) => {
              const v = e.target.value
              if (isSort(v)) setSort(v)
            }}
            data-testid={`${testIdPrefix}-sort-select`}
          >
            <option value="created_at_desc">
              {t.products.filters.sortRecentlyAdded}
            </option>
            <option value="updated_at_desc">
              {t.products.filters.sortRecentlyChanged}
            </option>
            <option value="name_asc">
              {t.products.filters.sortAlphabetical}
            </option>
          </NativeSelect>
        </span>
      </label>
    </div>
  )
}
