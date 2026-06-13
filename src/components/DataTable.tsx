// landr-3qkr.2 / landr-v9e4.6 — shared DataTable shell extracted from the
// five hand-rolled tables (BookingsTable, ContactsTable, StaffTable,
// LocationsTable, GeneralApprovals). It owns the byte-identical chrome those
// tables duplicated verbatim:
//
//   • search row + "{filtered} / {total}" count (optional — omit `search`)
//   • sortable column headers (ArrowUpDown / ArrowUp / ArrowDown) via the
//     <SortableHeader> sub-component
//   • the <Table> body with skeleton-while-loading and empty-row states
//   • the Previous / pageIndex+1 / Next pagination footer (optional — omit
//     `paginate` for tables that don't paginate, e.g. LocationsTable)
//
// landr-3qkr.2 also adds the MOBILE card-list mode: below the md breakpoint
// (useIsMobile, 768px = Tailwind md) the same `table` instance renders a
// stacked list of cards via the per-table `renderCard(row)` prop instead of
// the horizontal-scrolling table. Search + pagination chrome is reused
// verbatim above/below the card list, so sort (via mobileSortControl),
// filtering, selection and pagination all keep working on a phone with no
// horizontal page scroll.
//
// Desktop output is pixel-faithful with the pre-extraction markup; the only
// structural change is that each table's column-level testids / handlers now
// flow through props instead of being inlined. See the per-table call sites.

import {
  flexRender,
  type Header,
  type Row,
  type Table as TanstackTable,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import type { ReactNode } from 'react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { SkeletonTableRows } from '@/components/SkeletonTableRows'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { useIsMobile } from '@/hooks/use-mobile'

/**
 * Sortable column header — the ArrowUpDown / ArrowUp / ArrowDown button block
 * the five tables duplicated verbatim. Non-sortable columns render their
 * header content bare (no button, no icon), matching the legacy markup.
 *
 * `sortTestId` (optional) preserves GeneralApprovals' `approvals-sort-<col>`
 * test hook; tables that never had one simply omit it.
 */
export function SortableHeader<TData>({
  header,
  sortTestId,
}: {
  header: Header<TData, unknown>
  sortTestId?: string
}) {
  const canSort = header.column.getCanSort()
  if (!canSort) {
    return <>{flexRender(header.column.columnDef.header, header.getContext())}</>
  }
  const dir = header.column.getIsSorted()
  const Icon = !dir ? ArrowUpDown : dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <button
      type="button"
      onClick={header.column.getToggleSortingHandler()}
      className="hover:text-foreground inline-flex cursor-pointer items-center gap-1"
      data-testid={sortTestId}
    >
      {flexRender(header.column.columnDef.header, header.getContext())}
      <Icon className="size-3 opacity-60" />
    </button>
  )
}

export type DataTableProps<TData> = {
  /** The configured TanStack table instance. */
  table: TanstackTable<TData>
  /** Number of columns — drives skeleton column count and empty-row colSpan. */
  columnCount: number
  /** Message shown in the body when there are zero post-pagination rows. */
  emptyMessage: ReactNode
  /** When true, paint the skeleton placeholder instead of rows/empty. */
  isLoading?: boolean

  // --- search row (optional) ---------------------------------------------
  /**
   * When provided, renders the search input + count row above the table.
   * Omit entirely for tables that have no search row.
   */
  search?: {
    value: string
    onChange: (next: string) => void
    placeholder: string
  }
  /** The "{filtered} / {total}" (or "N matches") node shown beside search. */
  matchCountNode?: ReactNode

  // --- pagination (optional) ---------------------------------------------
  /** When true (default), render the Previous / page / Next footer. */
  paginate?: boolean

  // --- per-row desktop hooks ---------------------------------------------
  /**
   * Wraps each <TableRow> — used for the right-click context menus
   * (BookingRowContextMenu, ContactRowContextMenu, ApprovalRowContextMenu).
   * Defaults to rendering the row bare.
   */
  rowWrapper?: (row: Row<TData>, rowNode: ReactNode) => ReactNode
  /** Click handler for a desktop row (opens the detail sheet). */
  onRowClick?: (row: Row<TData>) => void
  /** Per-row data-testid (e.g. `bookings-row-${id}`). */
  rowTestId?: (row: Row<TData>) => string
  /**
   * Per-row extra props (ref + data-focused) for keyboard-nav focus.
   * Mirrors useListKeyboardNav().getRowProps(index).
   */
  rowProps?: (
    row: Row<TData>,
    index: number,
  ) => {
    ref?: (el: HTMLElement | null) => void
    'data-focused'?: boolean | undefined
  }
  /**
   * Column ids hidden from BOTH header and body (LocationsTable keeps a
   * created_at column purely for sorting and never renders it). The cells
   * still exist in the row model — they're just skipped when rendering.
   */
  hiddenColumnIds?: ReadonlySet<string>
  /** Maps a sortable column id to its sort-button testid (GeneralApprovals). */
  sortTestId?: (columnId: string) => string | undefined
  /** Optional aria-label on the underlying <table> (StaffTable). */
  tableAriaLabel?: string
  /** Optional data-testid on the table-container wrapper (approvals-table). */
  containerTestId?: string
  /** data-testid passed to the loading skeleton rows (bookings-skeleton …). */
  skeletonTestId?: string

  // --- mobile card-list mode --------------------------------------------
  /**
   * Per-table card renderer for the below-md stacked list. When omitted the
   * table falls back to the desktop (horizontally-scrolling) layout on every
   * width — but every consumer passes one.
   */
  renderCard?: (row: Row<TData>) => ReactNode
  /**
   * Sort control shown above the card list on mobile (a column picker / the
   * table's sortable headers don't exist on cards). Optional.
   */
  mobileSortControl?: ReactNode
}

export function DataTable<TData>({
  table,
  columnCount,
  emptyMessage,
  isLoading = false,
  search,
  matchCountNode,
  paginate = true,
  rowWrapper,
  onRowClick,
  rowTestId,
  rowProps,
  hiddenColumnIds,
  sortTestId,
  tableAriaLabel,
  containerTestId,
  skeletonTestId,
  renderCard,
  mobileSortControl,
}: DataTableProps<TData>) {
  const isMobile = useIsMobile()
  const visibleRows = table.getRowModel().rows
  const columnVisible = (columnId: string) =>
    hiddenColumnIds ? !hiddenColumnIds.has(columnId) : true

  const searchRow =
    search || matchCountNode ? (
      <div className="flex items-center justify-between gap-2">
        {search ? (
          <Input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="max-w-sm"
            aria-label={search.placeholder}
          />
        ) : (
          <span />
        )}
        {matchCountNode != null ? (
          <div className="text-muted-foreground text-sm">{matchCountNode}</div>
        ) : null}
      </div>
    ) : null

  const paginationFooter = paginate ? (
    <div className="flex items-center justify-end gap-2">
      <Button
        variant="outline"
        size="sm"
        onClick={() => table.previousPage()}
        disabled={!table.getCanPreviousPage()}
      >
        Previous
      </Button>
      <span className="text-muted-foreground text-sm">
        {table.getState().pagination.pageIndex + 1} /{' '}
        {Math.max(1, table.getPageCount())}
      </span>
      <Button
        variant="outline"
        size="sm"
        onClick={() => table.nextPage()}
        disabled={!table.getCanNextPage()}
      >
        Next
      </Button>
    </div>
  ) : null

  // --- mobile card-list mode ---------------------------------------------
  if (isMobile && renderCard) {
    return (
      <div className="flex flex-col gap-4">
        {searchRow}
        {mobileSortControl}
        {isLoading ? (
          <div className="flex flex-col gap-3" data-testid="datatable-cards-loading">
            {Array.from({ length: 6 }, (_unused, i) => (
              <div
                key={`card-skeleton-${i}`}
                aria-hidden="true"
                className="h-24 animate-pulse rounded-lg border bg-[var(--surface-dense-subtle)]"
              />
            ))}
          </div>
        ) : visibleRows.length === 0 ? (
          <div
            className="text-muted-foreground rounded-md border py-8 text-center text-sm"
            data-testid="datatable-cards-empty"
          >
            {emptyMessage}
          </div>
        ) : (
          <ul className="flex flex-col gap-3" data-testid="datatable-card-list">
            {visibleRows.map((row, index) => {
              const extra = rowProps?.(row, index)
              const cardNode = (
                <li
                  key={row.id}
                  data-testid={rowTestId?.(row)}
                  ref={extra?.ref}
                  data-focused={extra?.['data-focused']}
                  className="data-[focused]:ring-2 data-[focused]:ring-ring/40 rounded-lg"
                >
                  {renderCard(row)}
                </li>
              )
              return rowWrapper ? rowWrapper(row, cardNode) : cardNode
            })}
          </ul>
        )}
        {paginationFooter}
      </div>
    )
  }

  // --- desktop table mode ------------------------------------------------
  return (
    <div className="flex flex-col gap-4">
      {searchRow}
      <div
        className="surface-dense overflow-x-auto rounded-md border"
        data-testid={containerTestId}
      >
        <Table aria-label={tableAriaLabel}>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers
                  .filter((h) => columnVisible(h.column.id))
                  .map((header) => (
                    <TableHead key={header.id}>
                      <SortableHeader
                        header={header}
                        sortTestId={sortTestId?.(header.column.id)}
                      />
                    </TableHead>
                  ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              <SkeletonTableRows
                count={6}
                columnCount={columnCount}
                data-testid={skeletonTestId}
              />
            ) : visibleRows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columnCount}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  {emptyMessage}
                </TableCell>
              </TableRow>
            ) : (
              visibleRows.map((row, index) => {
                const extra = rowProps?.(row, index)
                const rowNode = (
                  <TableRow
                    key={row.id}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={
                      onRowClick
                        ? 'cursor-pointer data-[focused]:bg-muted/60'
                        : undefined
                    }
                    data-testid={rowTestId?.(row)}
                    ref={extra?.ref}
                    data-focused={extra?.['data-focused']}
                  >
                    {row
                      .getVisibleCells()
                      .filter((c) => columnVisible(c.column.id))
                      .map((cell) => (
                        <TableCell key={cell.id}>
                          {flexRender(cell.column.columnDef.cell, cell.getContext())}
                        </TableCell>
                      ))}
                  </TableRow>
                )
                return rowWrapper ? rowWrapper(row, rowNode) : rowNode
              })
            )}
          </TableBody>
        </Table>
      </div>
      {paginationFooter}
    </div>
  )
}
