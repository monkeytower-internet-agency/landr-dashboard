// landr-hgtv — Toolbar above a View's body.
//
// Three slots:
//   - Filter chips (delegated to ViewFilterChips).
//   - Sort dropdown (single-key for v1; the Table layout in landr-7w3s
//     will likely upgrade this to multi-key when columns land).
//   - Column picker placeholder (disabled until landr-7w3s Table layout).
//
// State lives in the parent (ViewPage owns the View's config). The toolbar
// is a controlled component over the in-memory config blob.

import { Filter as FilterIcon, ArrowUpDown, Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { ViewFilterChips } from '@/components/views/ViewFilterChips'
import { readFilters, type Filter } from '@/lib/views-filters'
import { fieldsFor } from '@/lib/views-entity-fields'
import { t } from '@/lib/strings'

type SortEntry = { source: 'system' | 'custom'; key: string; dir: 'asc' | 'desc' }

type Props = {
  entityType: string
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  testIdPrefix?: string
}

const NO_SORT_VALUE = '__none__'

export function ViewToolbar({
  entityType,
  config,
  onChange,
  testIdPrefix = 'view-toolbar',
}: Props) {
  const filters = readFilters(config)
  const sort = readSort(config)
  const sortableFields = fieldsFor(entityType).filter((f) => f.sortable)

  function setFilters(next: Filter[]) {
    onChange({ ...config, filters: next })
  }

  function setSortKey(key: string) {
    if (key === NO_SORT_VALUE) {
      onChange({ ...config, sort: [] })
      return
    }
    const existingDir = sort[0]?.dir ?? 'asc'
    const next: SortEntry[] = [{ source: 'system', key, dir: existingDir }]
    onChange({ ...config, sort: next })
  }

  function toggleSortDir() {
    if (sort.length === 0) return
    const head = sort[0]
    const flipped: SortEntry = {
      ...head,
      dir: head.dir === 'asc' ? 'desc' : 'asc',
    }
    onChange({ ...config, sort: [flipped, ...sort.slice(1)] })
  }

  const activeSortKey = sort[0]?.key ?? NO_SORT_VALUE
  const activeSortDir = sort[0]?.dir ?? 'asc'

  return (
    <div
      className="flex flex-wrap items-center gap-3"
      data-testid={`${testIdPrefix}-bar`}
    >
      <div className="flex items-center gap-2">
        <FilterIcon
          className="text-muted-foreground size-4"
          aria-hidden="true"
        />
        <ViewFilterChips
          entityType={entityType}
          filters={filters}
          onChange={setFilters}
          testIdPrefix={`${testIdPrefix}-filters`}
        />
      </div>

      <div className="flex items-center gap-1.5">
        <ArrowUpDown
          className="text-muted-foreground size-4"
          aria-hidden="true"
        />
        <span className="text-muted-foreground text-xs">
          {t.views.toolbar.sortLabel}
        </span>
        <NativeSelect
          value={activeSortKey}
          onChange={(e) => setSortKey(e.target.value)}
          data-testid={`${testIdPrefix}-sort-key`}
          className="h-7 w-auto text-xs"
        >
          <option value={NO_SORT_VALUE}>{t.views.toolbar.sortNone}</option>
          {sortableFields.map((f) => (
            <option key={f.key} value={f.key}>
              {f.label}
            </option>
          ))}
        </NativeSelect>
        {activeSortKey !== NO_SORT_VALUE ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs"
            onClick={toggleSortDir}
            aria-label={
              activeSortDir === 'asc'
                ? t.views.toolbar.sortAsc
                : t.views.toolbar.sortDesc
            }
            data-testid={`${testIdPrefix}-sort-dir`}
          >
            {activeSortDir === 'asc' ? '↑' : '↓'}
          </Button>
        ) : null}
      </div>

      <Button
        type="button"
        size="sm"
        variant="ghost"
        disabled
        title={t.views.toolbar.columnsPlaceholderTip}
        className="text-muted-foreground ml-auto h-7 gap-1 px-2 text-xs"
        data-testid={`${testIdPrefix}-columns`}
      >
        <Columns3 className="size-3.5" aria-hidden="true" />
        {t.views.toolbar.columns}
      </Button>
    </div>
  )
}

function readSort(config: Record<string, unknown>): SortEntry[] {
  const raw = (config as { sort?: unknown }).sort
  if (!Array.isArray(raw)) return []
  return raw.filter(isSortEntry)
}

function isSortEntry(x: unknown): x is SortEntry {
  if (!x || typeof x !== 'object') return false
  const s = x as Partial<SortEntry>
  return (
    (s.source === 'system' || s.source === 'custom') &&
    typeof s.key === 'string' &&
    (s.dir === 'asc' || s.dir === 'desc')
  )
}
