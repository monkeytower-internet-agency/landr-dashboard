// Analytics: revenue per staff table — landr-ce45.
//
// Plain table (no sort UI for v1; the data is pre-sorted by revenue desc
// in lib/analytics.ts). Mirrors TopCustomersTable's structure so the
// /analytics page stays visually consistent. The shaper handles all
// attribution math — this component is presentation only.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { PerStaffRevenueRow } from '@/lib/analytics'
import { formatCurrency } from '@/lib/reporting'

export type RevenuePerStaffLabels = {
  columnName: string
  columnBookings: string
  columnRevenue: string
  columnAverage: string
  empty: string
}

export function RevenuePerStaff({
  rows,
  currency,
  labels,
}: {
  rows: PerStaffRevenueRow[]
  currency: string
  labels: RevenuePerStaffLabels
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {labels.empty}
      </p>
    )
  }
  return (
    <Table data-testid="revenue-per-staff-table">
      <TableHeader>
        <TableRow>
          <TableHead>{labels.columnName}</TableHead>
          <TableHead className="text-right">{labels.columnBookings}</TableHead>
          <TableHead className="text-right">{labels.columnRevenue}</TableHead>
          <TableHead className="text-right">{labels.columnAverage}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.providerId}>
            <TableCell className="font-medium">{row.providerName}</TableCell>
            <TableCell className="text-right tabular-nums">
              {row.bookings.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(row.revenue, currency)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(row.averagePerBooking, currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  )
}
