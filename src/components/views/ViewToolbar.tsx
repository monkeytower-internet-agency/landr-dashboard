// landr-hgtv — Toolbar above a View's body.
//
// Three slots:
//   - Filter chips (delegated to ViewFilterChips).
//   - Sort dropdown (single-key for v1; the Table layout in landr-7w3s
//     will likely upgrade this to multi-key when columns land).
//   - Column picker placeholder (disabled until landr-7w3s Table layout).
//
// landr-1ztq — Toolbar also exposes a "Group:" dropdown that writes to
// `config.groupBy` (used by the Table layout; other layouts ignore it).
//
// landr-4cwh — Board layouts also get a "Swimlanes" dropdown that writes
// to `boardConfig.swimlaneBy` (any enum or id field of the entity).
//
// landr-9nj9 — Board layouts also get a "Column by" dropdown (primary
// grouping) that writes to `boardConfig.columnBy`. Selecting "Default"
// clears the key so the BoardLayout fallback (first enum field) takes over.
//
// State lives in the parent (ViewPage owns the View's config). The toolbar
// is a controlled component over the in-memory config blob.

import {
  Filter as FilterIcon,
  ArrowUpDown,
  Columns3,
  Columns2,
  Layers,
  Rows3,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'
import { ViewFilterChips } from '@/components/views/ViewFilterChips'
import { readFilters, type Filter } from '@/lib/views-filters'
import {
  fieldsFor,
  groupableFieldsFor,
  readGroupBy,
  type GroupByRef,
} from '@/lib/views-entity-fields'
import { t } from '@/lib/strings'

type SortEntry = { source: 'system' | 'custom'; key: string; dir: 'asc' | 'desc' }

type Props = {
  entityType: string
  config: Record<string, unknown>
  onChange: (next: Record<string, unknown>) => void
  /** landr-4cwh — Effective layout (URL override or config). The Swimlanes
   *  control only renders when this is 'board' since it writes a
   *  Board-only config key. */
  layout?: 'table' | 'board' | 'calendar'
  testIdPrefix?: string
}

const NO_SORT_VALUE = '__none__'
const NO_GROUP_VALUE = '__none__'
const NO_SWIMLANE_VALUE = '__none__'
const NO_COLUMN_BY_VALUE = '__none__'

export function ViewToolbar({
  entityType,
  config,
  onChange,
  layout,
  testIdPrefix = 'view-toolbar',
}: Props) {
  const filters = readFilters(config)
  const sort = readSort(config)
  const groupBy = readGroupBy(entityType, config)
  const sortableFields = fieldsFor(entityType).filter((f) => f.sortable)
  const groupableFields = groupableFieldsFor(entityType)
  // landr-4cwh — swimlanes can group by any enum or id field. We exclude
  // free-text / date / number / boolean — they don't yield discrete rows.
  const swimlaneFields = fieldsFor(entityType).filter(
    (f) => f.type === 'enum' || f.type === 'id',
  )
  const swimlaneBy = readSwimlaneBy(config)
  const activeSwimlaneKey = swimlaneBy ?? NO_SWIMLANE_VALUE
  // landr-9nj9 — column-by picker uses the same enum/id field shortlist as
  // swimlanes (board renders one column per distinct value of the field).
  const columnByFields = fieldsFor(entityType).filter(
    (f) => f.type === 'enum' || f.type === 'id',
  )
  const columnBy = readColumnBy(config)
  const activeColumnByKey = columnBy ?? NO_COLUMN_BY_VALUE

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

  // landr-1ztq — group-by writes a GroupByRef (or clears the key) into the
  // config blob. Layouts that don't care about groupBy (Board, Calendar)
  // simply ignore it; only TableLayout reads it back.
  function setGroupByKey(key: string) {
    if (key === NO_GROUP_VALUE) {
      const { groupBy: _drop, ...rest } = config as Record<string, unknown>
      onChange(rest)
      return
    }
    const next: GroupByRef = { source: 'system', key }
    onChange({ ...config, groupBy: next })
  }

  // landr-4cwh — write boardConfig.swimlaneBy. Selecting "None" persists
  // an explicit null (keeps the key in place so a future diff shows the
  // operator opted out, vs. it just being unset by an older write).
  function setSwimlaneBy(key: string) {
    const prevBoard =
      (config as { boardConfig?: Record<string, unknown> }).boardConfig ?? {}
    const nextBoard: Record<string, unknown> = {
      ...prevBoard,
      swimlaneBy: key === NO_SWIMLANE_VALUE ? null : key,
    }
    onChange({ ...config, boardConfig: nextBoard })
  }

  // landr-9nj9 — write boardConfig.columnBy. Selecting "Default" deletes
  // the key entirely so BoardLayout's fallback (first enum field, today
  // `current_stage`) takes over. We keep the rest of boardConfig
  // (notably swimlaneBy) intact so the two pickers are independent.
  function setColumnBy(key: string) {
    const prevBoard =
      (config as { boardConfig?: Record<string, unknown> }).boardConfig ?? {}
    if (key === NO_COLUMN_BY_VALUE) {
      const { columnBy: _drop, ...rest } = prevBoard
      onChange({ ...config, boardConfig: rest })
      return
    }
    const nextBoard: Record<string, unknown> = {
      ...prevBoard,
      columnBy: key,
    }
    onChange({ ...config, boardConfig: nextBoard })
  }

  const activeSortKey = sort[0]?.key ?? NO_SORT_VALUE
  const activeSortDir = sort[0]?.dir ?? 'asc'
  const activeGroupKey = groupBy?.key ?? NO_GROUP_VALUE

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
          aria-label={t.views.toolbar.sortLabel}
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

      {groupableFields.length > 0 ? (
        <div className="flex items-center gap-1.5">
          <Layers
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
          <span className="text-muted-foreground text-xs">
            {t.views.toolbar.groupByLabel}
          </span>
          <NativeSelect
            value={activeGroupKey}
            onChange={(e) => setGroupByKey(e.target.value)}
            data-testid={`${testIdPrefix}-group-key`}
            className="h-7 w-auto text-xs"
            aria-label={t.views.toolbar.groupByLabel}
          >
            <option value={NO_GROUP_VALUE}>{t.views.toolbar.groupByNone}</option>
            {groupableFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      {layout === 'board' ? (
        <div
          className="flex items-center gap-1.5"
          data-testid={`${testIdPrefix}-column-by`}
        >
          <Columns2
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
          <span className="text-muted-foreground text-xs">
            {t.views.toolbar.columnByLabel}
          </span>
          <NativeSelect
            value={activeColumnByKey}
            onChange={(e) => setColumnBy(e.target.value)}
            data-testid={`${testIdPrefix}-column-by-key`}
            className="h-7 w-auto text-xs"
            aria-label={t.views.toolbar.columnByLabel}
          >
            <option value={NO_COLUMN_BY_VALUE}>
              {t.views.toolbar.columnByNone}
            </option>
            {columnByFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

      {layout === 'board' ? (
        <div
          className="flex items-center gap-1.5"
          data-testid={`${testIdPrefix}-swimlane`}
        >
          <Rows3
            className="text-muted-foreground size-4"
            aria-hidden="true"
          />
          <span className="text-muted-foreground text-xs">
            {t.views.toolbar.swimlaneLabel}
          </span>
          <NativeSelect
            value={activeSwimlaneKey}
            onChange={(e) => setSwimlaneBy(e.target.value)}
            data-testid={`${testIdPrefix}-swimlane-key`}
            className="h-7 w-auto text-xs"
            aria-label={t.views.toolbar.swimlaneLabel}
          >
            <option value={NO_SWIMLANE_VALUE}>
              {t.views.toolbar.swimlaneNone}
            </option>
            {swimlaneFields.map((f) => (
              <option key={f.key} value={f.key}>
                {f.label}
              </option>
            ))}
          </NativeSelect>
        </div>
      ) : null}

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

// landr-4cwh — Read boardConfig.swimlaneBy, tolerating string / null /
// missing alike. Anything else collapses to null so the Swimlanes dropdown
// shows "None" instead of crashing on a malformed config.
function readSwimlaneBy(config: Record<string, unknown>): string | null {
  const bc = (config as { boardConfig?: { swimlaneBy?: unknown } }).boardConfig
  const raw = bc?.swimlaneBy
  return typeof raw === 'string' ? raw : null
}

// landr-9nj9 — Read boardConfig.columnBy, tolerating missing / null /
// malformed configs alike. The picker treats anything non-string as "no
// explicit pick" (Default) so the BoardLayout fallback chain stays in
// charge — matching how swimlanes handle the same shape.
function readColumnBy(config: Record<string, unknown>): string | null {
  const bc = (config as { boardConfig?: { columnBy?: unknown } }).boardConfig
  const raw = bc?.columnBy
  return typeof raw === 'string' ? raw : null
}
