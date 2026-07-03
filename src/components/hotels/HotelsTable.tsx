import { useMemo, useState } from 'react'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { AlertCircleIcon, PencilIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/DataTable'
import type { Hotel } from '@/lib/hotels'
import { t } from '@/lib/strings'

type Props = {
  rows: Hotel[]
  onEdit: (row: Hotel) => void
  onDelete: (row: Hotel) => void
}

// Shared edit/delete action cluster, reused by the desktop actions column and
// the mobile card (mirrors LocationsTable's LocationRowActions).
function HotelRowActions({
  row,
  onEdit,
  onDelete,
}: {
  row: Hotel
  onEdit: (row: Hotel) => void
  onDelete: (row: Hotel) => void
}) {
  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onEdit(row)
        }}
        aria-label={`${t.hotels.actionEdit} — ${row.name}`}
      >
        <PencilIcon className="size-3.5" />
        <span className="hidden sm:inline">{t.hotels.actionEdit}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(row)
        }}
        aria-label={`${t.hotels.actionDelete} — ${row.name}`}
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2Icon className="size-3.5" />
        <span className="hidden sm:inline">{t.hotels.actionDelete}</span>
      </Button>
    </div>
  )
}

// A hotel with no contact email cannot receive booking confirmations — render
// a red error badge in the email column instead of the (empty) address text.
function MissingEmailBadge() {
  return (
    <span className="text-destructive bg-destructive/10 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium">
      <AlertCircleIcon className="size-3" />
      {t.hotels.missingEmail}
    </span>
  )
}

const HIDDEN_COLUMNS = new Set(['created_at'])

export function HotelsTable({ rows, onEdit, onDelete }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: false },
  ])
  const [globalFilter, setGlobalFilter] = useState('')

  const columns = useMemo<ColumnDef<Hotel>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: t.hotels.columnName,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: t.hotels.columnEmail,
        cell: ({ row }) =>
          row.original.missing_email ? (
            <MissingEmailBadge />
          ) : (
            <span
              className="text-muted-foreground block max-w-[220px] truncate text-sm"
              title={row.original.email ?? undefined}
            >
              {row.original.email}
            </span>
          ),
      },
      {
        id: 'address',
        accessorKey: 'address',
        header: t.hotels.columnAddress,
        cell: ({ row }) =>
          row.original.address ? (
            <span
              className="text-muted-foreground block max-w-[260px] truncate text-sm"
              title={row.original.address}
            >
              {row.original.address}
            </span>
          ) : null,
      },
      {
        id: 'phone',
        accessorKey: 'phone',
        header: t.hotels.columnPhone,
        cell: ({ row }) =>
          row.original.phone ? (
            <span className="text-muted-foreground text-sm">
              {row.original.phone}
            </span>
          ) : null,
      },
      {
        id: 'created_at',
        accessorKey: 'created_at',
        header: '',
        enableGlobalFilter: false,
        sortingFn: 'datetime',
        cell: () => null,
      },
      {
        id: 'actions',
        header: () => (
          <span className="sr-only">{t.hotels.columnActions}</span>
        ),
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <HotelRowActions
            row={row.original}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [onEdit, onDelete],
  )

  // TanStack Table's useReactTable() returns functions that cannot be
  // memoized safely; React Compiler skips memoization here by design.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data: rows,
    columns,
    state: { sorting, globalFilter },
    onSortingChange: setSorting,
    onGlobalFilterChange: setGlobalFilter,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
  })

  const visibleColumnCount = columns.filter(
    (c) => !HIDDEN_COLUMNS.has(c.id as string),
  ).length

  // Mobile card: name + email/missing-email badge + address + phone, with the
  // edit/delete actions inline (mirrors LocationsTable's renderCard).
  const renderCard = (row: Row<Hotel>) => {
    const hotel = row.original
    return (
      <div className="bg-card flex flex-col gap-2 rounded-lg border p-3 shadow-s">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate font-medium">{hotel.name}</span>
          {hotel.missing_email ? <MissingEmailBadge /> : null}
        </div>
        {!hotel.missing_email && hotel.email ? (
          <div className="text-muted-foreground truncate text-sm">
            {hotel.email}
          </div>
        ) : null}
        {hotel.address ? (
          <div className="text-muted-foreground text-sm">{hotel.address}</div>
        ) : null}
        {hotel.phone ? (
          <div className="text-muted-foreground text-sm">{hotel.phone}</div>
        ) : null}
        <div className="flex justify-end">
          <HotelRowActions row={hotel} onEdit={onEdit} onDelete={onDelete} />
        </div>
      </div>
    )
  }

  return (
    <DataTable
      table={table}
      columnCount={visibleColumnCount}
      emptyMessage={t.hotels.empty}
      paginate={false}
      hiddenColumnIds={HIDDEN_COLUMNS}
      search={{
        value: globalFilter,
        onChange: setGlobalFilter,
        placeholder: t.hotels.filterPlaceholder,
      }}
      matchCountNode={t.hotels.matches(
        table.getFilteredRowModel().rows.length,
        rows.length,
      )}
      renderCard={renderCard}
    />
  )
}
