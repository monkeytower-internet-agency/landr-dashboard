import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  deleteMembership,
  staffEmailDisplay,
  type StaffRow,
} from '@/lib/staff'
import { t } from '@/lib/strings'

type Props = {
  member: StaffRow | null
  onOpenChange: (open: boolean) => void
}

const CONFIRM_PHRASE = 'REVOKE'

export function StaffRevokeDialog({ member, onOpenChange }: Props) {
  const queryClient = useQueryClient()
  const [confirmText, setConfirmText] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      if (!member) throw new Error('No member selected')
      await deleteMembership(member.id)
    },
    onSuccess: () => {
      toast.success(t.staff.revokeToastSuccess)
      queryClient.invalidateQueries({ queryKey: ['staff'] })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(t.staff.revokeToastError, { description: err.message })
    },
  })

  const open = member !== null
  const isReady =
    confirmText.trim().toUpperCase() === CONFIRM_PHRASE && !mutation.isPending

  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return
    if (!next) setConfirmText('')
    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.staff.revokeTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.staff.revokeDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {member ? (
          <div className="flex flex-col gap-3">
            <div className="bg-muted/30 rounded-md border px-3 py-2 text-sm">
              <div className="font-medium">{staffEmailDisplay(member)}</div>
              <div className="text-muted-foreground text-xs">
                Role: {member.role}
              </div>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="staff-revoke-confirm">
                {t.staff.revokeConfirm}
              </Label>
              <Input
                id="staff-revoke-confirm"
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                autoComplete="off"
                disabled={mutation.isPending}
              />
            </div>
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t.staff.revokeCancel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!isReady}
            onClick={(e) => {
              e.preventDefault()
              if (!isReady) return
              mutation.mutate()
            }}
            className="bg-destructive text-white hover:bg-destructive/90"
          >
            {mutation.isPending
              ? t.staff.revokeSubmitting
              : t.staff.revokeSubmit}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
