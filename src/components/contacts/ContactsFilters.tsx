// landr-pqk — sort dropdown + derived-type chip bar above the Contacts list.
//
// Three sort modes (mirroring useContactsSort defaults):
//   created_at_desc — Recently added (default)
//   updated_at_desc — Recently changed
//   name_asc        — Alphabetical (last_name then first_name)
//
// Four type chips (derived on the server by contacts_with_types view):
//   customer / attendee / employee / agent
//
// State lives in the hooks (useContactsSort / useContactsFilters), not in
// this component, so the same control could be re-mounted elsewhere
// without losing selection — same pattern as BookingsFilters (landr-1lj).

import { Filter, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { NativeSelect } from '@/components/ui/native-select'
import {
  CONTACT_TYPES,
  activeFilterCount,
  type UseContactsFilters,
} from '@/lib/contacts-filters'
import type { ContactsSort, UseContactsSort } from '@/lib/contacts-sort'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Props = {
  sortApi: UseContactsSort
  filtersApi: UseContactsFilters
  /** Test-id prefix so multiple bars on the same page stay distinguishable. */
  testIdPrefix?: string
}

const SORT_VALUES: ContactsSort[] = [
  'created_at_desc',
  'updated_at_desc',
  'name_asc',
]

function isSort(v: string): v is ContactsSort {
  return (SORT_VALUES as string[]).includes(v)
}

export function ContactsFilters({
  sortApi,
  filtersApi,
  testIdPrefix = 'contacts-filters',
}: Props) {
  const { sort, setSort } = sortApi
  const { filters, toggleType, setIncludeErased, clearAll } = filtersApi
  const total = activeFilterCount(filters)

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid={`${testIdPrefix}-bar`}
    >
      <label
        className="text-muted-foreground flex items-center gap-2 text-xs"
        htmlFor={`${testIdPrefix}-sort`}
      >
        {t.contacts.filters.sortLabel}
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
              {t.contacts.filters.sortRecentlyAdded}
            </option>
            <option value="updated_at_desc">
              {t.contacts.filters.sortRecentlyChanged}
            </option>
            <option value="name_asc">
              {t.contacts.filters.sortAlphabetical}
            </option>
          </NativeSelect>
        </span>
      </label>
      <span className="text-muted-foreground/40 hidden sm:inline" aria-hidden>
        |
      </span>
      <Filter className="text-muted-foreground size-4" aria-hidden="true" />
      <span className="text-muted-foreground text-xs">
        {t.contacts.filters.typeLabel}
      </span>
      {CONTACT_TYPES.map((type) => {
        const active = filters.types.includes(type)
        return (
          <Button
            key={type}
            type="button"
            size="sm"
            variant={active ? 'default' : 'outline'}
            onClick={() => toggleType(type)}
            data-testid={`${testIdPrefix}-type-${type}`}
            aria-pressed={active}
            className={cn('h-7 px-2 text-xs', active && 'shadow-sm')}
          >
            {t.contacts.filters.typeLabels[type] ?? type}
          </Button>
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
          {t.contacts.filters.clearAll}
        </Button>
      ) : null}
      {/* landr-dp45 — view toggle for GDPR-erased tombstones (default off). */}
      <label
        className="text-muted-foreground ml-auto flex cursor-pointer items-center gap-2 text-xs"
        htmlFor={`${testIdPrefix}-show-erased`}
      >
        <Checkbox
          id={`${testIdPrefix}-show-erased`}
          checked={filters.includeErased}
          onChange={(e) => setIncludeErased(e.target.checked)}
          data-testid={`${testIdPrefix}-show-erased`}
        />
        {t.contacts.filters.showErasedLabel}
      </label>
    </div>
  )
}
