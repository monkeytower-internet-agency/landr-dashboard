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
import { Download, Mail, Tag as TagIcon, X } from 'lucide-react'

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
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover'
import { TagPicker } from '@/components/tags/TagPicker'
import { t } from '@/lib/strings'

export type BulkAction =
  | 'approve'
  | 'reject'
  | 'exportCsv'
  | 'sendReminder'
  // landr-uqr2 — surfaced on Bookings + Contacts. Opens a TagPicker
  // popover; submit fans the chosen tags out via onApplyTags() which the
  // parent wires to bulkApplyTagsToBookings / bulkApplyTagsToContacts.
  | 'tag'

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
  /** landr-uqr2 — fan-out tag apply across the selected rows. The toolbar
   *  opens a TagPicker popover and forwards the chosen tag ids; the
   *  parent (Bookings / Contacts / Approvals) handles the per-row POST
   *  via bulkApplyTagsToBookings / bulkApplyTagsToContacts and toasts
   *  the success/partial-failure outcome. */
  onApplyTags?: (ids: string[], tagIds: string[]) => Promise<void> | void
  /** Operator id required when `actions` includes 'tag' (the TagPicker
   *  loads the operator's tag list to populate options). Ignored otherwise. */
  operatorId?: string
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
  onApplyTags,
  operatorId,
  busy = false,
  testIdPrefix = 'bulk-toolbar',
}: Props) {
  const [confirmReject, setConfirmReject] = useState(false)
  // landr-uqr2 — pending tag selection inside the popover. Kept local so
  // closing the popover discards the choice and re-opening starts empty.
  const [tagPopoverOpen, setTagPopoverOpen] = useState(false)
  const [tagSelection, setTagSelection] = useState<string[]>([])
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

        {actions.includes('tag') && operatorId ? (
          <Popover
            open={tagPopoverOpen}
            onOpenChange={(open) => {
              if (busy && open) return
              setTagPopoverOpen(open)
              if (!open) setTagSelection([])
            }}
          >
            <PopoverTrigger asChild>
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={busy}
                data-testid={`${testIdPrefix}-tag`}
              >
                <TagIcon className="size-4 mr-1" />
                {t.bulkActions.applyTags}
              </Button>
            </PopoverTrigger>
            <PopoverContent
              align="center"
              side="top"
              className="w-80 p-3"
              data-testid={`${testIdPrefix}-tag-popover`}
            >
              <div className="flex flex-col gap-2">
                <div>
                  <p className="text-sm font-medium">
                    {t.bulkActions.applyTagsPopoverTitle}
                  </p>
                  <p className="text-muted-foreground text-xs">
                    {t.bulkActions.applyTagsPopoverHint(count)}
                  </p>
                </div>
                <TagPicker
                  operatorId={operatorId}
                  selectedIds={tagSelection}
                  onChange={setTagSelection}
                  disabled={busy}
                  testIdPrefix={`${testIdPrefix}-tag-picker`}
                />
                <div className="flex items-center justify-end gap-2 pt-1">
                  <Button
                    type="button"
                    size="sm"
                    variant="default"
                    disabled={busy || tagSelection.length === 0}
                    onClick={async () => {
                      if (!onApplyTags || tagSelection.length === 0) return
                      const idsSnapshot = [...selectedIds]
                      const tagsSnapshot = [...tagSelection]
                      await onApplyTags(idsSnapshot, tagsSnapshot)
                      // Parent decides whether to clear selection; we just
                      // reset our local popover state so re-opening starts
                      // empty.
                      setTagSelection([])
                      setTagPopoverOpen(false)
                    }}
                    data-testid={`${testIdPrefix}-tag-confirm`}
                  >
                    {busy
                      ? t.bulkActions.applyTagsConfirmBusy
                      : t.bulkActions.applyTagsConfirm}
                  </Button>
                </div>
              </div>
            </PopoverContent>
          </Popover>
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
