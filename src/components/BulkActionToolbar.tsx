// landr-lbbj — sticky bulk-action toolbar shown when ≥1 rows are
// checked on Approvals or Bookings. Pure presentation: parent owns
// the Set<id> selection state and the action handlers. The toolbar
// only decides which buttons to render (via the `actions` prop) and
// surfaces a busy state while a mutation is in flight.
//
// Visual contract (matches design-video-1-layout guidance):
//   - hidden until count > 0
//   - sticks to the bottom of the viewport (bottom-4 inset, centred)
//   - shows "<n> selected" + Clear, then the action buttons inline
//   - destructive action (reject) opens an AlertDialog confirm
//
// The toolbar is intentionally dumb about WHICH endpoints to call —
// it forwards (selectedIds) to each handler. Parent routes do the
// Promise.all + toast.

import { useState } from 'react'
import { Download, Mail, X } from 'lucide-react'

import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { t } from '@/lib/strings'

export type BulkAction = 'approve' | 'reject' | 'exportCsv' | 'sendReminder'

type Props = {
  /** Currently selected row ids. Toolbar is hidden when this is empty. */
  selectedIds: string[]
  /** Called when the X / Clear button is pressed. */
  onClear: () => void
  /** Which buttons to render (Approvals = approve+reject+csv+reminder,
   *  Bookings = csv+reminder by default). */
  actions: readonly BulkAction[]
  /** Action handlers — only the ones in `actions` need to be supplied. */
  onApprove?: (ids: string[]) => Promise<void> | void
  onReject?: (ids: string[]) => Promise<void> | void
  onExportCsv?: (ids: string[]) => Promise<void> | void
  onSendReminder?: (ids: string[]) => Promise<void> | void
  /** Disable all buttons (parent flips this during async work). */
  busy?: boolean
  /** Optional test-id prefix so route specs can scope queries. */
  testIdPrefix?: string
}

export function BulkActionToolbar({
  selectedIds,
  onClear,
  actions,
  onApprove,
  onReject,
  onExportCsv,
  onSendReminder,
  busy = false,
  testIdPrefix = 'bulk-toolbar',
}: Props) {
  const [confirmReject, setConfirmReject] = useState(false)
  const count = selectedIds.length

  if (count === 0) return null

  async function handle(fn?: (ids: string[]) => Promise<void> | void) {
    if (!fn || busy) return
    await fn([...selectedIds])
  }

  return (
    <>
      <div
        role="region"
        aria-label={t.bulkActions.selectionCount(count)}
        data-testid={testIdPrefix}
        // landr-gu14 — on phone the 4-button toolbar (approvals) overflowed
        // the 375px viewport. Allow wrapping + cap width via max-w so the
        // pill stays on-screen; desktop keeps the original single-row look
        // via sm:flex-nowrap.
        className="fixed bottom-4 left-1/2 z-50 flex max-w-[calc(100vw-1rem)] -translate-x-1/2 flex-wrap items-center justify-center gap-2 rounded-2xl border bg-background px-3 py-2 shadow-lg sm:max-w-none sm:flex-nowrap sm:rounded-full"
      >
        <span
          className="text-sm font-medium pl-2"
          data-testid={`${testIdPrefix}-count`}
        >
          {t.bulkActions.selectionCount(count)}
        </span>

        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onClear}
          disabled={busy}
          aria-label={t.bulkActions.clear}
          data-testid={`${testIdPrefix}-clear`}
        >
          <X className="size-4" />
        </Button>

        <div className="h-5 w-px bg-border mx-1" aria-hidden />

        {actions.includes('approve') ? (
          <Button
            type="button"
            size="sm"
            variant="default"
            onClick={() => void handle(onApprove)}
            disabled={busy}
            data-testid={`${testIdPrefix}-approve`}
          >
            {busy ? t.bulkActions.working : t.bulkActions.approve}
          </Button>
        ) : null}

        {actions.includes('reject') ? (
          <Button
            type="button"
            size="sm"
            variant="destructive"
            onClick={() => setConfirmReject(true)}
            disabled={busy}
            data-testid={`${testIdPrefix}-reject`}
          >
            {t.bulkActions.reject}
          </Button>
        ) : null}

        {actions.includes('exportCsv') ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handle(onExportCsv)}
            disabled={busy}
            data-testid={`${testIdPrefix}-export-csv`}
          >
            <Download className="size-4 mr-1" />
            {t.bulkActions.exportCsv}
          </Button>
        ) : null}

        {actions.includes('sendReminder') ? (
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={() => void handle(onSendReminder)}
            disabled={busy}
            data-testid={`${testIdPrefix}-send-reminder`}
          >
            <Mail className="size-4 mr-1" />
            {t.bulkActions.sendReminder}
          </Button>
        ) : null}
      </div>

      <AlertDialog
        open={confirmReject}
        onOpenChange={(open) => {
          if (!busy) setConfirmReject(open)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.bulkActions.confirmRejectTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.bulkActions.confirmRejectDescription(count)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>
              {t.bulkActions.cancel}
            </AlertDialogCancel>
            <Button
              variant="destructive"
              disabled={busy}
              onClick={async () => {
                await handle(onReject)
                setConfirmReject(false)
              }}
              data-testid={`${testIdPrefix}-reject-confirm`}
            >
              {busy
                ? t.bulkActions.working
                : t.bulkActions.confirmRejectAction}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
