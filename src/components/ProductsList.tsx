import { useMemo, useState } from 'react'
import { PlusIcon, SearchIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { productSummaryLine, type ProductRow } from '@/lib/products'
import { t } from '@/lib/strings'

type Props = {
  rows: ProductRow[]
  selectedId: string | null
  onSelect: (row: ProductRow) => void
  onCreate: () => void
}

export function ProductsList({ rows, selectedId, onSelect, onCreate }: Props) {
  const [filter, setFilter] = useState('')

  const filtered = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return rows
    return rows.filter((r) => {
      return (
        r.name.toLowerCase().includes(q) ||
        r.slug.toLowerCase().includes(q) ||
        (r.short_description ?? '').toLowerCase().includes(q) ||
        (r.product_group?.name ?? '').toLowerCase().includes(q)
      )
    })
  }, [filter, rows])

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
      <div className="text-muted-foreground text-xs">
        {filtered.length} / {rows.length}
      </div>
      <ul
        role="listbox"
        aria-label={t.products.listAriaLabel}
        className="flex max-h-[70vh] flex-col gap-1 overflow-y-auto"
      >
        {filtered.length === 0 ? (
          <li className="text-muted-foreground rounded-md border border-dashed p-4 text-center text-sm">
            {rows.length === 0 ? t.products.empty : t.products.noMatches}
          </li>
        ) : (
          filtered.map((row) => {
            const isSelected = row.id === selectedId
            return (
              <li key={row.id}>
                <button
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => onSelect(row)}
                  className={cn(
                    'group hover:bg-accent flex w-full flex-col gap-1 rounded-md border bg-card p-3 text-left transition-colors',
                    isSelected && 'border-primary ring-1 ring-primary',
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="truncate text-sm font-medium">
                      {row.name}
                    </span>
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
                  </div>
                  <span className="text-muted-foreground truncate text-xs">
                    {productSummaryLine(row)}
                  </span>
                </button>
              </li>
            )
          })
        )}
      </ul>
    </div>
  )
}
