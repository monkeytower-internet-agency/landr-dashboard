// landr-oxlk — right-click context menu on a Pending Approvals row.
// Tiny surface: the queue itself is a triage view (every row already has
// inline Approve / Reject buttons), so the context menu mirrors those
// plus a quick Open-detail. The destructive items defer to the parent's
// existing AlertDialog wizard (note input + confirm) so we don't re-
// implement that flow here — clicking just calls the parent's openDialog
// handler.
import { CheckIcon, PencilIcon, XIcon } from 'lucide-react'

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@/components/ui/context-menu'
import type { ApprovalDecision, BookingRow } from '@/lib/bookings'
import { t } from '@/lib/strings'

type Props = {
  row: BookingRow
  onOpenDetail: (row: BookingRow) => void
  onDecide: (row: BookingRow, decision: ApprovalDecision) => void
  children: React.ReactNode
}

export function ApprovalRowContextMenu({
  row,
  onOpenDetail,
  onDecide,
  children,
}: Props) {
  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent
        data-testid={`approvals-row-context-menu-${row.id}`}
      >
        <ContextMenuItem
          onSelect={() => onOpenDetail(row)}
          data-testid="approvals-row-context-open"
        >
          <PencilIcon />
          {t.generalApprovals.rowContextMenu.openDetail}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          onSelect={() => onDecide(row, 'approve')}
          data-testid="approvals-row-context-approve"
        >
          <CheckIcon />
          {t.generalApprovals.rowContextMenu.approve}
        </ContextMenuItem>
        <ContextMenuItem
          variant="destructive"
          onSelect={() => onDecide(row, 'reject')}
          data-testid="approvals-row-context-reject"
        >
          <XIcon />
          {t.generalApprovals.rowContextMenu.reject}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  )
}
