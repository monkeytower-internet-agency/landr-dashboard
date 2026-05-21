// landr-7w3s — Table layout renderer for Views.
//
// Plugs into the ViewPage layout dispatcher. Driven entirely by the View's
// config (columns + sort) and the field registry (views-entity-fields.ts).
// Reuses @tanstack/react-table v8 (already in the repo via BookingsTable).
//
// Reuse vs. fork notes:
//   - We DO NOT reuse BookingsTable directly: its columns / accessors are
//     hardcoded for the legacy Bookings page (BookingRow nested shape),
//     while Views need columns to be derived from view.config.columns and
//     the items to be flat (BookingItem from views-bookings-data.ts).
//   - We DO reuse StageChip (current_stage cells), BookingDetailSheet
//     (row click), and the same TanStack v8 setup pattern.
//
// Sort handling: clicking a sortable column header writes the new sort
// into view.config.sort via onConfigChange (single-key for v1, matching
// the ViewToolbar sort dropdown). The visible sort indicator is driven
// from view.config.sort so the toolbar dropdown and table header stay in
// sync — there is no separate component-local sort state.
//
// Column picker: a dropdown on the top-right of the table toggles which
// fields appear. Toggling writes a fresh columns array into config; we
// preserve the existing order for visible fields and append newly-shown
// fields at the end (Decision: simplest "additive" behaviour; reorder UI
// is out of scope for v1).

import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown, Columns3 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { StageChip } from '@/components/approvals/StageChip'
import {
  fieldsFor,
  findField,
  readColumns,
  valueLabel,
  type ColumnRef,
  type ViewField,
} from '@/lib/views-entity-fields'
import type { BookingItem } from '@/lib/views-bookings-data'
import { t } from '@/lib/strings'

type SortEntry = { source: 'system' | 'custom'; key: string; dir: 'asc' | 'desc' }

type Props = {
  entityType: string
  config: Record<string, unknown>
  items: BookingItem[]
  onConfigChange: (patch: Record<string, unknown>) => void
  onRowClick?: (item: BookingItem) => void
}

export function TableLayout({
  entityType,
  config,
  items,
  onConfigChange,
  onRowClick,
}: Props) {
  const columnRefs = readColumns(entityType, config)
  const allFields = fieldsFor(entityType)
  const sortState = readSort(config)

  const columns = useMemo<ColumnDef<BookingItem>[]>(
    () =>
      columnRefs
        .map((ref) => fieldToColumn(entityType, ref))
        .filter((c): c is ColumnDef<BookingItem> => c !== null),
    [entityType, columnRefs],
  )

  // Translate config.sort → TanStack SortingState. v1 supports one key
  // (matches ViewToolbar's sort dropdown).
  const sorting: SortingState = sortState.slice(0, 1).map((s) => ({
    id: s.key,
    desc: s.dir === 'desc',
  }))

  const table = useReactTable({
    data: items,
    columns,
    state: { sorting },
    getCoreRowModel: getCoreRowModel(),
    manualSorting: true,
    // Disable internal sort; we round-trip through config so the toolbar
    // dropdown and column header stay in sync.
  })

  function handleHeaderClick(field: ViewField) {
    if (!field.sortable) return
    const current = sortState[0]
    let nextSort: SortEntry[]
    if (!current || current.key !== field.key) {
      nextSort = [{ source: 'system', key: field.key, dir: 'asc' }]
    } else if (current.dir === 'asc') {
      nextSort = [{ ...current, dir: 'desc' }]
    } else {
      // 3rd click clears sort.
      nextSort = []
    }
    onConfigChange({ ...config, sort: nextSort })
  }

  function handleToggleColumn(key: string) {
    const visibleKeys = new Set(columnRefs.map((c) => c.key))
    let next: ColumnRef[]
    if (visibleKeys.has(key)) {
      next = columnRefs.filter((c) => c.key !== key)
    } else {
      next = [...columnRefs, { source: 'system', key }]
    }
    onConfigChange({ ...config, columns: next })
  }

  const visibleKeySet = useMemo(
    () => new Set(columnRefs.map((c) => c.key)),
    [columnRefs],
  )

  return (
    <div className="flex flex-col gap-3" data-testid="view-table-layout">
      <div className="flex items-center justify-between gap-2">
        <span
          className="text-muted-foreground text-xs"
          data-testid="view-table-rowcount"
        >
          {t.views.table.rowCount(items.length, items.length)}
        </span>
        <ColumnPicker
          entityType={entityType}
          allFields={allFields}
          visibleKeys={visibleKeySet}
          onToggle={handleToggleColumn}
        />
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const field = findField(entityType, header.column.id)
                  const canSort = field?.sortable ?? false
                  const active = sortState[0]?.key === header.column.id
                  const dir = active ? sortState[0]?.dir : null
                  const Icon = !active
                    ? ArrowUpDown
                    : dir === 'asc'
                      ? ArrowUp
                      : ArrowDown
                  return (
                    <TableHead
                      key={header.id}
                      data-testid={`view-table-header-${header.column.id}`}
                    >
                      {canSort ? (
                        <button
                          type="button"
                          onClick={() => field && handleHeaderClick(field)}
                          className="hover:text-foreground inline-flex cursor-pointer items-center gap-1"
                          data-testid={`view-table-sort-${header.column.id}`}
                        >
                          {flexRender(
                            header.column.columnDef.header,
                            header.getContext(),
                          )}
                          <Icon className="size-3 opacity-60" />
                        </button>
                      ) : (
                        flexRender(
                          header.column.columnDef.header,
                          header.getContext(),
                        )
                      )}
                    </TableHead>
                  )
                })}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={Math.max(1, columns.length)}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  {t.views.table.empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick?.(row.original)}
                  data-testid={`view-table-row-${row.original.id}`}
                  className={onRowClick ? 'cursor-pointer' : undefined}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </TableCell>
                  ))}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------

type ColumnPickerProps = {
  entityType: string
  allFields: readonly ViewField[]
  visibleKeys: Set<string>
  onToggle: (key: string) => void
}

function ColumnPicker({
  allFields,
  visibleKeys,
  onToggle,
}: ColumnPickerProps) {
  const [open, setOpen] = useState(false)
  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="outline"
          className="h-7 gap-1 px-2 text-xs"
          data-testid="view-table-column-picker"
        >
          <Columns3 className="size-3.5" aria-hidden="true" />
          {t.views.table.columnPickerLabel}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>{t.views.table.columnPickerHeading}</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {allFields.length === 0 ? (
          <div className="text-muted-foreground px-2 py-1.5 text-xs">
            {t.views.table.columnPickerEmpty}
          </div>
        ) : (
          allFields.map((f) => (
            <DropdownMenuCheckboxItem
              key={f.key}
              checked={visibleKeys.has(f.key)}
              onCheckedChange={() => onToggle(f.key)}
              onSelect={(e) => e.preventDefault()}
              data-testid={`view-table-column-toggle-${f.key}`}
            >
              {f.label}
            </DropdownMenuCheckboxItem>
          ))
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

// ---------------------------------------------------------------------------
// Field → TanStack column

function fieldToColumn(
  entityType: string,
  ref: ColumnRef,
): ColumnDef<BookingItem> | null {
  const field = findField(entityType, ref.key)
  if (!field) return null

  const col: ColumnDef<BookingItem> = {
    id: field.key,
    header: field.label,
    enableSorting: field.sortable,
    accessorFn: (row) => readCellValue(row, field.key),
    cell: ({ row }) => renderCell(row.original, field),
  }
  return col
}

function readCellValue(item: BookingItem, key: string): unknown {
  if (key === 'current_stage') return item.current_stage?.code ?? null
  if (key === 'product_id') return item.product_name ?? item.product_id ?? null
  if (key === 'pickup_location_id') {
    return item.pickup_location_name ?? item.pickup_location_id ?? null
  }
  return (item as unknown as Record<string, unknown>)[key]
}

function renderCell(item: BookingItem, field: ViewField): React.ReactNode {
  // landr-7w3s — per-type cell renderers. Keep them small and inline; the
  // field registry tells us the type so we don't have to switch on the
  // field key.
  if (field.key === 'current_stage') {
    const code = item.current_stage?.code ?? null
    if (!code) return <span className="text-muted-foreground text-xs">—</span>
    return <StageChip code={code} />
  }
  if (field.type === 'id') {
    // FK reference — render the embedded display name.
    if (field.key === 'product_id') {
      return item.product_name ? (
        <span className="truncate">{item.product_name}</span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      )
    }
    if (field.key === 'pickup_location_id') {
      return item.pickup_location_name ? (
        <span className="truncate">{item.pickup_location_name}</span>
      ) : (
        <span className="text-muted-foreground text-xs">—</span>
      )
    }
    // Unknown id field — fall back to the raw id.
    const raw = (item as unknown as Record<string, unknown>)[field.key]
    return raw ? String(raw) : '—'
  }
  if (field.type === 'date') {
    const raw = (item as unknown as Record<string, unknown>)[field.key]
    if (typeof raw !== 'string' || raw.length === 0) {
      return (
        <span className="text-muted-foreground text-xs">
          {t.views.table.dateFallback}
        </span>
      )
    }
    return <span className="whitespace-nowrap">{formatDayLabel(raw)}</span>
  }
  if (field.type === 'number') {
    if (field.key === 'booking_total') {
      return (
        <span className="font-medium">
          {formatMoney(item.booking_total, item.currency || 'EUR')}
        </span>
      )
    }
    const raw = (item as unknown as Record<string, unknown>)[field.key]
    return raw === null || raw === undefined ? (
      <span className="text-muted-foreground text-xs">—</span>
    ) : (
      <span>{String(raw)}</span>
    )
  }
  if (field.type === 'enum') {
    const raw = (item as unknown as Record<string, unknown>)[field.key]
    if (raw === null || raw === undefined) {
      return <span className="text-muted-foreground text-xs">—</span>
    }
    return (
      <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
        {valueLabel(field.key === 'current_semantic_state' ? 'booking' : 'booking', field.key, raw as string)}
      </span>
    )
  }
  if (field.type === 'boolean') {
    const raw = (item as unknown as Record<string, unknown>)[field.key]
    return raw === true ? 'Yes' : raw === false ? 'No' : '—'
  }
  // text — including customer_first_name / customer_email / customer_last_name / currency
  const raw = (item as unknown as Record<string, unknown>)[field.key]
  if (raw === null || raw === undefined || raw === '') {
    return <span className="text-muted-foreground text-xs">—</span>
  }
  return <span className="truncate">{String(raw)}</span>
}

// ---------------------------------------------------------------------------
// Formatters

const moneyFormatters = new Map<string, Intl.NumberFormat>()
function formatMoney(value: string | number, currency: string): string {
  const n = typeof value === 'number' ? value : Number(value)
  if (!Number.isFinite(n)) return t.views.table.moneyFallback
  let fmt = moneyFormatters.get(currency)
  if (!fmt) {
    fmt = new Intl.NumberFormat('en-IE', { style: 'currency', currency })
    moneyFormatters.set(currency, fmt)
  }
  return fmt.format(n)
}

const _dayFormatter = new Intl.DateTimeFormat('en-IE', {
  weekday: 'short',
  day: 'numeric',
  month: 'short',
})

function formatDayLabel(iso: string): string {
  // Anchor pure-date ISO at UTC noon so weekday is TZ-stable.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (dateOnly) {
    const [, y, m, d] = dateOnly
    const date = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d), 12))
    if (Number.isNaN(date.getTime())) return iso
    return _dayFormatter.format(date)
  }
  const parsed = new Date(iso)
  if (Number.isNaN(parsed.getTime())) return iso
  return _dayFormatter.format(parsed)
}

// ---------------------------------------------------------------------------

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
