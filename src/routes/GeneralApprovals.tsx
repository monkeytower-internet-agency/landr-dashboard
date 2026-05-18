import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  customerDisplay,
  dateDisplay,
  fetchPendingGeneralApprovals,
  postGeneralApprovalDecision,
  priceDisplay,
  productDisplay,
  type ApprovalDecision,
  type BookingRow,
} from '@/lib/bookings'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

type DialogState = {
  row: BookingRow
  decision: ApprovalDecision
} | null

export function GeneralApprovals() {
  const { currentOperatorId } = useOperator()
  const queryClient = useQueryClient()
  const [dialog, setDialog] = useState<DialogState>(null)
  const [note, setNote] = useState('')

  const query = useQuery<BookingRow[]>({
    queryKey: ['bookings', 'general-approvals', currentOperatorId ?? 'none'],
    queryFn: () => fetchPendingGeneralApprovals(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const mutation = useMutation({
    mutationFn: async () => {
      if (!dialog) throw new Error('No booking selected')
      await postGeneralApprovalDecision({
        bookingId: dialog.row.id,
        decision: dialog.decision,
        notes: note.trim() || undefined,
      })
    },
    onSuccess: () => {
      const isApprove = dialog?.decision === 'approve'
      toast.success(
        isApprove
          ? t.generalApprovals.toastApproved
          : t.generalApprovals.toastRejected,
      )
      queryClient.invalidateQueries({ queryKey: ['bookings'] })
      handleClose()
    },
    onError: (err: Error) => {
      toast.error(t.generalApprovals.toastError, { description: err.message })
    },
  })

  function openDialog(row: BookingRow, decision: ApprovalDecision) {
    setNote('')
    setDialog({ row, decision })
  }

  function handleClose() {
    if (mutation.isPending) return
    setDialog(null)
    setNote('')
  }

  const rows = query.data ?? []
  const isApprove = dialog?.decision === 'approve'

  return (
    <div className="flex flex-col gap-6">
      <header className="flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">{t.generalApprovals.title}</h1>
      </header>

      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.generalApprovals.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">
          {t.generalApprovals.loading}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">
          {t.generalApprovals.empty}
        </p>
      ) : (
        <div className="overflow-x-auto rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.generalApprovals.columnDate}</TableHead>
                <TableHead>{t.generalApprovals.columnCustomer}</TableHead>
                <TableHead>{t.generalApprovals.columnProduct}</TableHead>
                <TableHead>{t.generalApprovals.columnPrice}</TableHead>
                <TableHead>{t.generalApprovals.columnActions}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((row) => (
                <TableRow key={row.id}>
                  <TableCell className="whitespace-nowrap">
                    {dateDisplay(row.created_at)}
                  </TableCell>
                  <TableCell>{customerDisplay(row)}</TableCell>
                  <TableCell>{productDisplay(row)}</TableCell>
                  <TableCell className="font-medium">
                    {priceDisplay(row)}
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="default"
                        onClick={() => openDialog(row, 'approve')}
                        aria-label={`${t.generalApprovals.actionApprove} booking ${row.id}`}
                      >
                        {t.generalApprovals.actionApprove}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => openDialog(row, 'reject')}
                        aria-label={`${t.generalApprovals.actionReject} booking ${row.id}`}
                      >
                        {t.generalApprovals.actionReject}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) handleClose()
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {isApprove
                ? t.generalApprovals.approveDialogTitle
                : t.generalApprovals.rejectDialogTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {isApprove
                ? t.generalApprovals.approveDialogDescription
                : t.generalApprovals.rejectDialogDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>

          {dialog ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
                <div className="font-medium">{customerDisplay(dialog.row)}</div>
                <div className="text-muted-foreground text-xs">
                  {productDisplay(dialog.row)} — {priceDisplay(dialog.row)}
                </div>
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="approval-note">
                  {t.generalApprovals.noteLabel}
                </Label>
                <Textarea
                  id="approval-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder={t.generalApprovals.notePlaceholder}
                  disabled={mutation.isPending}
                  rows={3}
                />
              </div>
            </div>
          ) : null}

          <AlertDialogFooter>
            <AlertDialogCancel
              disabled={mutation.isPending}
              onClick={handleClose}
            >
              {t.generalApprovals.cancel}
            </AlertDialogCancel>
            <Button
              variant={isApprove ? 'default' : 'destructive'}
              disabled={mutation.isPending}
              onClick={() => mutation.mutate()}
            >
              {mutation.isPending
                ? isApprove
                  ? t.generalApprovals.approving
                  : t.generalApprovals.rejecting
                : isApprove
                  ? t.generalApprovals.confirmApprove
                  : t.generalApprovals.confirmReject}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
