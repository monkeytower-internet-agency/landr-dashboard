// landr-sj2z — Skeleton row placeholder for tables while their data is
// still loading. Renders `count` <TableRow>s (default 6) each with
// `columnCount` <TableCell>s containing a pulsing <Skeleton> bar.
//
// Used by BookingsTable, ContactsTable, GeneralApprovals, and ProductsList
// so the operator sees the table chrome (or list shell) immediately with
// skeleton placeholders instead of a blank gap during the first fetch.
// The friendly EmptyState card from landr-s1mr only renders once loading
// completes AND there are zero real rows — never during the loading
// window — to prevent the empty-state flash.

import { Skeleton } from '@/components/ui/skeleton'
import { TableCell, TableRow } from '@/components/ui/table'

type Props = {
  /** Number of skeleton rows to render. Default 6 (sweet spot between
   *  enough perceived loading volume and not pushing real content too far
   *  down once the fetch lands). */
  count?: number
  /** Number of <TableCell> placeholders per row. Should match the table's
   *  actual column count so the skeleton aligns with the eventual rows. */
  columnCount: number
  /** Optional test hook so callers can assert the skeleton rendered. */
  'data-testid'?: string
}

export function SkeletonTableRows({
  count = 6,
  columnCount,
  'data-testid': testId,
}: Props) {
  return (
    <>
      {Array.from({ length: count }, (_unused, rowIndex) => (
        <TableRow
          key={`skeleton-row-${rowIndex}`}
          data-testid={testId ? `${testId}-row-${rowIndex}` : undefined}
          aria-hidden="true"
        >
          {Array.from({ length: columnCount }, (_unused2, colIndex) => (
            <TableCell key={`skeleton-cell-${rowIndex}-${colIndex}`}>
              <Skeleton className="h-4 w-full" />
            </TableCell>
          ))}
        </TableRow>
      ))}
    </>
  )
}

// landr-sj2z — list-style skeleton for the ProductsList chip layout
// (which is a <ul> of card-style options, not a <Table>). Same intent:
// keep the surrounding chrome visible, fill the list area with pulsing
// placeholders, hide both real chips and the EmptyState while loading.
type ListProps = {
  count?: number
  'data-testid'?: string
}

export function SkeletonListRows({
  count = 6,
  'data-testid': testId,
}: ListProps) {
  return (
    <>
      {Array.from({ length: count }, (_unused, index) => (
        <li
          key={`skeleton-list-${index}`}
          role="presentation"
          aria-hidden="true"
          data-testid={testId ? `${testId}-row-${index}` : undefined}
          className="flex flex-col gap-2 rounded-md border bg-card p-3"
        >
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="h-3 w-3/4" />
        </li>
      ))}
    </>
  )
}
