// Analytics: top customers table — landr-af6c.
//
// Plain table (no sort UI for v1; the data is pre-sorted by revenue desc
// in lib/analytics.ts). Caps at 10 rows by default; callers decide the
// limit when shaping the data.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { TopCustomerRow } from '@/lib/analytics'
import { formatCurrency } from '@/lib/reporting'

export type TopCustomersLabels = {
  columnName: string
  columnEmail: string
  columnBookings: string
  columnRevenue: string
  empty: string
}

export function TopCustomersTable({
  rows,
  currency,
  labels,
}: {
  rows: TopCustomerRow[]
  currency: string
  labels: TopCustomersLabels
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {labels.empty}
      </p>
    )
  }
  return (
    // landr-3qkr.6 — overflow-x-auto so the name+email+2-numeric columns
    // scroll inside the analytics card on a 360px phone instead of being
    // clipped by the page-level overflow-x-guard.
    <div className="overflow-x-auto">
    <Table data-testid="top-customers-table">
      <TableHeader>
        <TableRow>
          <TableHead>{labels.columnName}</TableHead>
          <TableHead>{labels.columnEmail}</TableHead>
          <TableHead className="text-right">{labels.columnBookings}</TableHead>
          <TableHead className="text-right">{labels.columnRevenue}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.customerId ?? row.email ?? row.name}>
            <TableCell className="font-medium">{row.name}</TableCell>
            <TableCell className="text-muted-foreground">
              {row.email ?? '—'}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.bookings.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(row.revenue, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  )
}
