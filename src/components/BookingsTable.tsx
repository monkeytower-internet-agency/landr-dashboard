import { useMemo, useState } from 'react'
import {
  flexRender,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table'
import { ArrowDown, ArrowUp, ArrowUpDown } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  customerDisplay,
  dateDisplay,
  priceDisplay,
  productDisplay,
  type BookingRow,
} from '@/lib/bookings'
import { t } from '@/lib/strings'

type Props = {
  rows: BookingRow[]
  onRowClick: (row: BookingRow) => void
}

export function BookingsTable({ rows, onRowClick }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: true },
  ])
  const [globalFilter, setGlobalFilter] = useState('')

  const columns = useMemo<ColumnDef<BookingRow>[]>(
    () => [
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: t.bookings.columnDate,
        cell: ({ row }) => dateDisplay(row.original.created_at),
        sortingFn: 'datetime',
      },
      {
        id: 'customer',
        header: t.bookings.columnCustomer,
        accessorFn: (row) => customerDisplay(row),
        cell: ({ getValue }) => (
          <span className="truncate">{getValue<string>()}</span>
        ),
      },
      {
        id: 'product',
        header: t.bookings.columnProduct,
        accessorFn: (row) => productDisplay(row),
        cell: ({ getValue }) => (
          <span className="truncate">{getValue<string>()}</span>
        ),
      },
      {
        id: 'status',
        accessorKey: 'current_semantic_state',
        header: t.bookings.columnStatus,
        cell: ({ row }) => (
          <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs">
            {row.original.current_semantic_state}
          </span>
        ),
      },
      {
        id: 'price',
        header: t.bookings.columnPrice,
        accessorFn: (row) => Number(row.gross_total) || 0,
        cell: ({ row }) => (
          <span className="font-medium">{priceDisplay(row.original)}</span>
        ),
      },
    ],
    [],
  )

  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize: 25 } },
  })

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-2">
        <Input
          value={globalFilter}
          onChange={(e) => setGlobalFilter(e.target.value)}
          placeholder={t.bookings.filterPlaceholder}
          className="max-w-sm"
          aria-label={t.bookings.filterPlaceholder}
        />
        <div className="text-muted-foreground text-sm">
          {table.getFilteredRowModel().rows.length} / {rows.length}
        </div>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((group) => (
              <TableRow key={group.id}>
                {group.headers.map((header) => {
                  const canSort = header.column.getCanSort()
                  const dir = header.column.getIsSorted()
                  const Icon = !dir
                    ? ArrowUpDown
                    : dir === 'asc'
                      ? ArrowUp
                      : ArrowDown
                  return (
                    <TableHead key={header.id}>
                      {canSort ? (
                        <button
                          type="button"
                          onClick={header.column.getToggleSortingHandler()}
                          className="hover:text-foreground inline-flex items-center gap-1"
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
            {table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell
                  colSpan={columns.length}
                  className="text-muted-foreground py-8 text-center text-sm"
                >
                  {t.bookings.empty}
                </TableCell>
              </TableRow>
            ) : (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  onClick={() => onRowClick(row.original)}
                  className="cursor-pointer"
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
    </div>
  )
}
