import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { BedDoubleIcon, CopyIcon, MoreHorizontalIcon, PackageIcon, PlusIcon, SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { EmptyState } from '@/components/EmptyState'
import { SkeletonListRows } from '@/components/SkeletonTableRows'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { productSummaryLine, type ProductRow } from '@/lib/products'
import { t } from '@/lib/strings'

// landr-u34k — persist the "show add-on products" toggle per user so
// flipping it on one tab survives reloads and other dashboard surfaces.
// Keyed by auth user id so two operators on the same browser don't see
// each other's preference. Falls back to a shared key for anonymous /
// pre-auth renders (the toggle just won't survive sign-out either way).
function addonsToggleStorageKey(userId: string | null): string {
  return `landr.dashboard.productsShowAddons.${userId ?? 'anonymous'}`
}

function readShowAddons(userId: string | null): boolean {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(addonsToggleStorageKey(userId)) === '1'
  } catch {
    return false
  }
}

function writeShowAddons(userId: string | null, value: boolean): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      addonsToggleStorageKey(userId),
      value ? '1' : '0',
    )
  } catch {
    /* ignore quota / disabled-storage errors */
  }
}

// landr-ssrx — group hotel_room rows under their hotel for visual clarity.
// We collect the non-hotel-room rows first (preserves the existing
// sort_order, then name) and then push one bucket per hotel at the end of
// the list. The supervisor explicitly preferred this over a collapsible
// disclosure (lighter touch + same outcome).
type RenderEntry =
  | { kind: 'row'; row: ProductRow }
  | { kind: 'hotel-header'; key: string; label: string }

function groupRows(rows: ProductRow[]): RenderEntry[] {
  const nonHotel: RenderEntry[] = []
  const byHotel = new Map<string, { label: string; rows: ProductRow[] }>()
  // Sentinel key for hotel_room rows missing a hotel link. The DB CHECK
  // makes this an impossible state, but a defensive bucket keeps the UI
  // honest if someone bypasses the form via direct REST writes.
  const UNASSIGNED = '__unassigned__'
  for (const row of rows) {
    if (row.product_kind === 'hotel_room') {
      const key = row.hotel_location_id ?? UNASSIGNED
      const label =
        row.hotel_location?.name ?? t.products.listGroupHotelUnassigned
      const bucket = byHotel.get(key) ?? { label, rows: [] }
      bucket.rows.push(row)
      byHotel.set(key, bucket)
    } else {
      nonHotel.push({ kind: 'row', row })
    }
  }
  const out: RenderEntry[] = [...nonHotel]
  // Stable header order: hotel name A→Z, with the defensive unassigned
  // bucket last so it doesn't shove the named hotels out of the way.
  const hotelKeys = [...byHotel.keys()].sort((a, b) => {
    if (a === UNASSIGNED) return 1
    if (b === UNASSIGNED) return -1
    return (byHotel.get(a)?.label ?? '').localeCompare(
      byHotel.get(b)?.label ?? '',
    )
  })
  for (const key of hotelKeys) {
    const bucket = byHotel.get(key)
    if (!bucket) continue
    out.push({
      kind: 'hotel-header',
      key,
      label: bucket.label,
    })
    for (const row of bucket.rows) {
      out.push({ kind: 'row', row })
    }
  }
  return out
}

type Props = {
  rows: ProductRow[]
  selectedId: string | null
  onSelect: (row: ProductRow) => void
  onCreate: () => void
  onDuplicate: (row: ProductRow) => void
  duplicatingId: string | null
  // landr-sj2z — paint skeleton list items in place of real chips while
  // the parent's fetch is in flight. Mirrors the table-side prop on the
  // other surfaces.
  isLoading?: boolean
}

export function ProductsList({
  rows,
  selectedId,
  onSelect,
  onCreate,
  onDuplicate,
  duplicatingId,
  isLoading = false,
}: Props) {
  const [filter, setFilter] = useState('')
  // landr-u34k — hide is_addon_only=true rows by default. The toggle
  // surfaces them again for operators who need to find / edit one.
  const { user } = useAuth()
  const userId = user?.id ?? null
  const [showAddons, setShowAddons] = useState<boolean>(() =>
    readShowAddons(userId),
  )

  // Re-hydrate when the auth user changes (e.g. an operator signs out and
  // a colleague signs in on the same browser). Reads from THAT user's
  // stored preference rather than carrying over the previous one.
  const lastUserRef = useRef<string | null>(userId)
  useEffect(() => {
    if (lastUserRef.current === userId) return
    lastUserRef.current = userId
    setShowAddons(readShowAddons(userId))
  }, [userId])

  const onToggleAddons = useCallback(
    (next: boolean) => {
      setShowAddons(next)
      writeShowAddons(userId, next)
    },
    [userId],
  )

  // Apply the addon-only visibility first, then the search filter. This
  // ordering means the "X / Y" counter at the top reflects the addon-aware
  // visible set (rather than counting hidden add-on rows the operator
  // can't see).
  const visibleRows = useMemo(
    () => (showAddons ? rows : rows.filter((r) => !r.is_addon_only)),
    [rows, showAddons],
  )
  const hiddenAddonCount = useMemo(
    () => rows.filter((r) => r.is_addon_only).length,
    [rows],
  )

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return visibleRows
    return visibleRows.filter((r) => {
      return (
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.short_description ?? '').toLowerCase().includes(q) ||
        (r.product_group?.name ?? '').toLowerCase().includes(q) ||
        // landr-ssrx — let operators jump to a hotel's rooms by typing
        // the hotel name (the parent location).
        (r.hotel_location?.name ?? '').toLowerCase().includes(q)
      )
    })
  }, [filter, visibleRows])

  // landr-ssrx — flatten the filtered list into a render plan that
  // intersperses hotel headers above their room groups.
  const entries = useMemo(() => groupRows(filtered), [filtered])

  // landr-s1mr / landr-sj2z — When the operator has zero products AND
  // the parent fetch has settled, surface the friendly empty-state card
  // with a "New product" CTA. During the loading window we fall through
  // so the skeleton placeholder list renders below, preventing an empty-
  // state flash before the first rows arrive.
  if (rows.length === 0 && !isLoading) {
    return (
      <div className="flex h-full flex-col">
        <EmptyState
          icon={PackageIcon}
          title={t.emptyStates.products.title}
          description={t.emptyStates.products.description}
          action={{ label: t.emptyStates.products.cta, onClick: onCreate }}
          data-testid="products-empty-state"
        />
      </div>
    )
  }

  return (
    <div className="flex h-full flex-col gap-3">
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <SearchIcon
            aria-hidden="true"
            className="text-muted-foreground pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2"
          />
          <Input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder={t.products.filterPlaceholder}
            aria-label={t.products.filterPlaceholder}
            className="pl-8"
          />
        </div>
        <Button
          size="sm"
          onClick={onCreate}
          aria-label={t.products.createNew}
        >
          <PlusIcon className="size-4" />
          <span className="hidden sm:inline">{t.products.createNew}</span>
        </Button>
      </div>
      {/* landr-u34k — Show add-on products toggle. Disabled with a clear
          empty-state when the operator has zero addon_only products, so
          new accounts don't see a confusing checkbox that does nothing. */}
      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <Checkbox
          checked={showAddons}
          onChange={(e) => onToggleAddons(e.target.checked)}
          disabled={hiddenAddonCount === 0}
          aria-label={t.products.showAddonsToggle}
        />
        <span>
          {t.products.showAddonsToggle}
          {hiddenAddonCount > 0 ? (
            <span className="ml-1 opacity-70">({hiddenAddonCount})</span>
          ) : null}
        </span>
      </label>
      <div className="text-muted-foreground text-xs">
        {filtered.length} / {visibleRows.length}
      </div>
      {/* landr-sydf — list grows with the viewport instead of capping at
          70vh and scrolling early. The list itself only scrolls when its
          natural height exceeds the available space; the detail card on the
          right keeps its own scroll if its content is long. */}
      <ul
        role="listbox"
        aria-label={t.products.listAriaLabel}
        className="flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto"
      >
        {isLoading ? (
          // landr-sj2z — skeleton chips while the products query is in
          // flight. The list aria-label stays so AT users still know
          // they're inside the products listbox.
          <SkeletonListRows count={6} data-testid="products-skeleton" />
        ) : filtered.length === 0 ? (
          <li className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            {visibleRows.length === 0 ? t.products.empty : t.products.noMatches}
          </li>
        ) : (
          entries.map((entry) => {
            if (entry.kind === 'hotel-header') {
              return (
                <li
                  key={`hdr-${entry.key}`}
                  // role=presentation so the header isn't announced as an
                  // option to AT users navigating the listbox; the rooms
                  // beneath it stay individually selectable.
                  role="presentation"
                  className="text-muted-foreground mt-2 flex items-center gap-2 px-1 pt-2 text-xs font-medium uppercase tracking-wide"
                >
                  <BedDoubleIcon aria-hidden="true" className="size-3.5" />
                  <span>
                    {t.products.listGroupHotelPrefix}
                    {entry.label}
                  </span>
                </li>
              )
            }
            const row = entry.row
            const isSelected = row.id === selectedId
            const isDuplicating = duplicatingId === row.id
            return (
              <li key={row.id}>
                {/* landr-sydf — entire chip is the selection trigger (not
                    just the name). The outer wrapper uses role=option +
                    keyboard handlers because nesting a <button> inside a
                    <button> (we have a DropdownMenu trigger inside) would
                    be invalid HTML. The dropdown menu cell stops click
                    propagation so opening the menu does not also fire
                    onSelect. */}
                <div
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={0}
                  onClick={() => onSelect(row)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      onSelect(row)
                    }
                  }}
                  className={cn(
                    'group flex w-full cursor-pointer flex-col gap-1 rounded-md border bg-card p-3 text-left transition-colors',
                    'hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                    isSelected && 'border-primary ring-1 ring-primary',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium">
                      {row.name}
                    </span>
                    <div
                      className="flex shrink-0 items-center gap-1"
                      // Clicks on the badge / dropdown trigger live inside
                      // the chip — guard against double-firing onSelect
                      // when the user opens the row menu.
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => e.stopPropagation()}
                    >
                      <span
                        className={cn(
                          'shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide',
                          row.active
                            ? 'bg-primary/10 text-primary'
                            : 'bg-muted text-muted-foreground',
                        )}
                      >
                        {row.active ? t.products.statusActive : t.products.statusInactive}
                      </span>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="size-6"
                            aria-label="Row actions"
                            disabled={isDuplicating}
                          >
                            <MoreHorizontalIcon className="size-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => onDuplicate(row)}
                            disabled={isDuplicating}
                          >
                            <CopyIcon className="mr-2 size-4" />
                            {isDuplicating
                              ? t.products.duplicating
                              : t.products.duplicate}
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                  <span className="text-muted-foreground w-full truncate text-xs">
                    {productSummaryLine(row)}
                  </span>
                </div>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
