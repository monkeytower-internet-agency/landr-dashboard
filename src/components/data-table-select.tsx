// landr-3qkr.2 / landr-v9e4.6 — shared leading select column factory.
//
// BookingsTable, ContactsTable and GeneralApprovals each inlined a verbatim
// indeterminate-checkbox column: a header checkbox that toggles every visible
// row plus a per-row checkbox, both writing to a Set<string> of selected ids
// and both stopPropagation so the box never triggers the row's onClick. This
// factory returns that column so the three tables share one definition.
//
// The row object must expose an `id: string` (all three row types do).
// `testIdPrefix` keeps the existing data-testids verbatim:
//   <prefix>-select-all  and  <prefix>-select-<rowId>

import type { ColumnDef } from '@tanstack/react-table'

import { Checkbox } from '@/components/ui/checkbox'
import { t } from '@/lib/strings'

export function selectColumn<TData extends { id: string }>({
  selectedIds,
  setSelectedIds,
  testIdPrefix,
}: {
  selectedIds: Set<string>
  setSelectedIds: (next: Set<string>) => void
  testIdPrefix: string
}): ColumnDef<TData> {
  return {
    id: 'select',
    enableSorting: false,
    header: ({ table }) => {
      const visibleIds = table
        .getRowModel()
        .rows.map((r) => (r.original as TData).id)
      const allChecked =
        visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id))
      const someChecked = visibleIds.some((id) => selectedIds.has(id))
      return (
        <Checkbox
          checked={allChecked}
          ref={(el) => {
            if (el) el.indeterminate = !allChecked && someChecked
          }}
          onChange={(e) => {
            const next = new Set(selectedIds)
            if (e.currentTarget.checked) {
              for (const id of visibleIds) next.add(id)
            } else {
              for (const id of visibleIds) next.delete(id)
            }
            setSelectedIds(next)
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={t.bulkActions.selectAllAria}
          data-testid={`${testIdPrefix}-select-all`}
        />
      )
    },
    cell: ({ row }) => {
      const id = (row.original as TData).id
      const checked = selectedIds.has(id)
      return (
        <Checkbox
          checked={checked}
          onChange={(e) => {
            const next = new Set(selectedIds)
            if (e.currentTarget.checked) next.add(id)
            else next.delete(id)
            setSelectedIds(next)
          }}
          onClick={(e) => e.stopPropagation()}
          aria-label={t.bulkActions.selectRowAria(id)}
          data-testid={`${testIdPrefix}-select-${id}`}
        />
      )
    },
  }
}
