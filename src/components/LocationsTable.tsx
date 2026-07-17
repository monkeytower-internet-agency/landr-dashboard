import { useCallback, useMemo, useState } from 'react'
import {
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type SortingState,
} from '@tanstack/react-table'
import { PencilIcon, Trash2Icon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable } from '@/components/DataTable'
import type { Location, LocationRoleType } from '@/lib/locations'
import { t } from '@/lib/strings'

type Props = {
  rows: Location[]
  roleTypes: LocationRoleType[]
  onEdit: (row: Location) => void
  onDelete: (row: Location) => void
}

// landr-3qkr.2 — shared edit/delete action cluster, reused by the desktop
// actions column and the mobile card.
//
// landr-cyoi — hotel rows are READ-ONLY here: a hotel is a first-class entity
// managed under Settings → Hotels, so this page renders a "Managed under
// Hotels" affordance instead of the Edit/Delete buttons for those rows.
function LocationRowActions({
  row,
  isHotel,
  onEdit,
  onDelete,
}: {
  row: Location
  isHotel: boolean
  onEdit: (row: Location) => void
  onDelete: (row: Location) => void
}) {
  if (isHotel) {
    return (
      <div className="flex items-center justify-end">
        <span className="text-muted-foreground text-xs italic">
          {t.pickupLocations.managedUnderHotels}
        </span>
      </div>
    )
  }
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
        aria-label={`${t.pickupLocations.actionEdit} — ${row.name}`}
      >
        <PencilIcon className="size-3.5" />
        <span className="hidden sm:inline">{t.pickupLocations.actionEdit}</span>
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={(e) => {
          e.stopPropagation()
          onDelete(row)
        }}
        aria-label={`${t.pickupLocations.actionDelete} — ${row.name}`}
        className="text-destructive hover:text-destructive hover:bg-destructive/10"
      >
        <Trash2Icon className="size-3.5" />
        <span className="hidden sm:inline">
          {t.pickupLocations.actionDelete}
        </span>
      </Button>
    </div>
  )
}

const HIDDEN_COLUMNS = new Set(['created_at'])

export function LocationsTable({ rows, roleTypes, onEdit, onDelete }: Props) {
  const [sorting, setSorting] = useState<SortingState>([
    { id: 'created_at', desc: false },
  ])
  const [globalFilter, setGlobalFilter] = useState('')

  const roleTypeMap = useMemo(() => {
    const m = new Map<string, LocationRoleType>()
    for (const rt of roleTypes) m.set(rt.id, rt)
    return m
  }, [roleTypes])

  const parentMap = useMemo(() => {
    const m = new Map<string, Location>()
    for (const row of rows) m.set(row.id, row)
    return m
  }, [rows])

  const roleTypeOf = useCallback(
    (row: Location) =>
      roleTypeMap.get(
        (row as Location & { role_type_id?: string }).role_type_id ?? '',
      ),
    [roleTypeMap],
  )
  const parentOf = useCallback(
    (row: Location) => (row.parent_id ? parentMap.get(row.parent_id) : null),
    [parentMap],
  )

  const columns = useMemo<ColumnDef<Location>[]>(
    () => [
      {
        id: 'name',
        accessorKey: 'name',
        header: t.pickupLocations.columnName,
        cell: ({ row }) => (
          <span className="font-medium">{row.original.name}</span>
        ),
      },
      {
        id: 'role_type_id',
        accessorKey: 'role_type_id',
        header: t.pickupLocations.columnRoleType,
        cell: ({ row }) => {
          const rt = roleTypeOf(row.original)
          return rt ? (
            <span className="bg-muted text-muted-foreground inline-flex rounded-full px-2 py-0.5 text-xs">
              {rt.label}
            </span>
          ) : null
        },
      },
      {
        id: 'parent_id',
        accessorKey: 'parent_id',
        header: t.pickupLocations.columnParent,
        cell: ({ row }) => {
          const parent = parentOf(row.original)
          return parent ? (
            <span className="text-muted-foreground text-sm">{parent.name}</span>
          ) : null
        },
      },
      {
        id: 'email',
        accessorKey: 'email',
        header: t.pickupLocations.columnEmail,
        cell: ({ row }) =>
          row.original.email ? (
            <span className="text-muted-foreground text-sm">
              {row.original.email}
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
          <span className="sr-only">{t.pickupLocations.columnActions}</span>
        ),
        enableSorting: false,
        enableGlobalFilter: false,
        cell: ({ row }) => (
          <LocationRowActions
            row={row.original}
            isHotel={roleTypeOf(row.original)?.code === 'hotel'}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        ),
      },
    ],
    [roleTypeOf, parentOf, onEdit, onDelete],
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

  // landr-3qkr.2 — mobile card: name + role-type badge + parent + email,
  // edit/delete actions inline.
  const renderCard = (row: Row<Location>) => {
    const loc = row.original
    const rt = roleTypeOf(loc)
    const parent = parentOf(loc)
    return (
      <div className="bg-card flex flex-col gap-2 rounded-lg border p-3 shadow-s">
        <div className="flex items-start justify-between gap-2">
          <span className="min-w-0 truncate font-medium">{loc.name}</span>
          {rt ? (
            <span className="bg-muted text-muted-foreground inline-flex shrink-0 rounded-full px-2 py-0.5 text-xs">
              {rt.label}
            </span>
          ) : null}
        </div>
        {parent ? (
          <div className="text-muted-foreground text-sm">{parent.name}</div>
        ) : null}
        {loc.email ? (
          <div className="text-muted-foreground truncate text-sm">
            {loc.email}
          </div>
        ) : null}
        <div className="flex justify-end">
          <LocationRowActions
            row={loc}
            isHotel={rt?.code === 'hotel'}
            onEdit={onEdit}
            onDelete={onDelete}
          />
        </div>
      </div>
    )
  }

  return (
    <DataTable
      table={table}
      columnCount={visibleColumnCount}
      emptyMessage={t.pickupLocations.empty}
      paginate={false}
      hiddenColumnIds={HIDDEN_COLUMNS}
      search={{
        value: globalFilter,
        onChange: setGlobalFilter,
        placeholder: t.pickupLocations.filterPlaceholder,
      }}
      matchCountNode={t.pickupLocations.matches(
        table.getFilteredRowModel().rows.length,
        rows.length,
      )}
      renderCard={renderCard}
    />
  )
}
