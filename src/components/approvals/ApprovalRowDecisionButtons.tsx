// Extracted from GeneralApprovals.tsx (landr-v9e4.9 — pure-helper extraction).
// The inline Approve / Reject button cluster, shared by the desktop actions
// column and the mobile card so the decision wiring stays in one place.
// stopPropagation keeps the buttons from also opening the detail sheet.

import { Button } from '@/components/ui/button'
import { type ApprovalDecision, type BookingRow } from '@/lib/bookings'
import { t } from '@/lib/strings'

type ApprovalRowDecisionButtonsProps = {
  row: BookingRow
  onDecide: (row: BookingRow, decision: ApprovalDecision) => void
}

export function ApprovalRowDecisionButtons({
  row,
  onDecide,
}: ApprovalRowDecisionButtonsProps) {
  return (
    <div
      className="flex items-center gap-2"
      onClick={(e) => e.stopPropagation()}
    >
      <Button
        size="sm"
        variant="default"
        onClick={() => onDecide(row, 'approve')}
        aria-label={`${t.generalApprovals.actionApprove} booking ${row.id}`}
      >
        {t.generalApprovals.actionApprove}
      </Button>
      {/* landr-wg2y: brand (orange) — reject side of the approve/reject
          decision, not a delete/erase action. */}
      <Button
        size="sm"
        variant="brand"
        onClick={() => onDecide(row, 'reject')}
        aria-label={`${t.generalApprovals.actionReject} booking ${row.id}`}
      >
        {t.generalApprovals.actionReject}
      </Button>
    </div>
  )
}
