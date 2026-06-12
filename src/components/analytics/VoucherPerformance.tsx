// Analytics: voucher performance table — landr-1jgr.
//
// Plain table mirroring TopCustomersTable's pattern. Data is pre-sorted by
// redemption count desc in lib/analytics.shapeVoucherPerformance, so no
// sort UI is needed for v1.

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import type { VoucherPerformanceRow } from '@/lib/analytics'
import { formatCurrency } from '@/lib/reporting'

export type VoucherPerformanceLabels = {
  columnCode: string
  columnKind: string
  columnRedemptions: string
  columnDiscount: string
  empty: string
  kindPercent: string
  kindFlat: string
  kindUnknown: string
}

function kindLabel(
  kind: VoucherPerformanceRow['kind'],
  labels: VoucherPerformanceLabels,
): string {
  switch (kind) {
    case 'percent':
      return labels.kindPercent
    case 'flat':
      return labels.kindFlat
    case 'unknown':
      return labels.kindUnknown
  }
}

export function VoucherPerformance({
  rows,
  labels,
}: {
  rows: VoucherPerformanceRow[]
  labels: VoucherPerformanceLabels
}) {
  if (rows.length === 0) {
    return (
      <p className="text-muted-foreground py-8 text-center text-sm">
        {labels.empty}
      </p>
    )
  }
  return (
    // landr-3qkr.6 — overflow-x-auto so the code + kind + 2 numeric columns
    // scroll inside the analytics card on a 360px phone instead of clipping.
    <div className="overflow-x-auto">
    <Table data-testid="voucher-performance-table">
      <TableHeader>
        <TableRow>
          <TableHead>{labels.columnCode}</TableHead>
          <TableHead>{labels.columnKind}</TableHead>
          <TableHead className="text-right">
            {labels.columnRedemptions}
          </TableHead>
          <TableHead className="text-right">{labels.columnDiscount}</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {rows.map((row) => (
          <TableRow key={row.voucherId}>
            <TableCell className="font-medium">{row.code}</TableCell>
            <TableCell className="text-muted-foreground">
              {kindLabel(row.kind, labels)}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {row.redemptions.toLocaleString()}
            </TableCell>
            <TableCell className="text-right tabular-nums">
              {formatCurrency(row.discountTotal, row.currency)}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
    </div>
  )
}
