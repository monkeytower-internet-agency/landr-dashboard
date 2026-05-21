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
import { useAuth } from '@/lib/auth'
import {
  contactNameDisplay,
  gdprEraseContact,
  type ContactRow,
} from '@/lib/contacts'
import { t } from '@/lib/strings'

type Props = {
  contact: ContactRow | null
  onOpenChange: (open: boolean) => void
}

const CONFIRM_PHRASE = 'ERASE'

export function GdprEraseDialog({ contact, onOpenChange }: Props) {
  const { user } = useAuth()
  const queryClient = useQueryClient()
  const [confirmText, setConfirmText] = useState('')
  const [reason, setReason] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      if (!contact) throw new Error('No contact selected')
      if (!user) throw new Error('Not signed in')
      await gdprEraseContact({
        contactId: contact.id,
        requestedByUserId: user.id,
        jurisdictionNote: reason.trim(),
      })
    },
    onSuccess: () => {
      toast.success(t.contacts.eraseToastSuccess)
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(t.contacts.eraseToastError, {
        description: err.message,
      })
    },
  })

  const open = contact !== null
  const isReady =
    confirmText.trim().toUpperCase() === CONFIRM_PHRASE &&
    reason.trim().length > 0 &&
    !mutation.isPending

  // Reset local form state every time the dialog closes. Doing this in the
  // open-change handler (rather than an effect) avoids the React Compiler
  // "set-state-in-effect" lint and the cascading-render hazard it flags.
  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return
    if (!next) {
      setConfirmText('')
      setReason('')
    }
    onOpenChange(next)
  }

  return (
    <AlertDialog open={open} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.contacts.eraseDialogTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.contacts.eraseDialogIntro}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {contact ? (
          <div className="flex flex-col gap-3">
            <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
              <div className="font-medium">{contactNameDisplay(contact)}</div>
              {contact.email ? (
                <div className="text-muted-foreground text-xs">
                  {contact.email}
                </div>
              ) : null}
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gdpr-erase-reason">
                {t.contacts.eraseDialogReasonLabel}
              </Label>
              <Input
                id="gdpr-erase-reason"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={t.contacts.eraseDialogReasonPlaceholder}
                disabled={mutation.isPending}
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="gdpr-erase-confirm">
                {t.contacts.eraseDialogConfirmLabel}
              </Label>
              <Input
                id="gdpr-erase-confirm"
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
            {t.contacts.eraseDialogCancel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={!isReady}
            onClick={(e) => {
              e.preventDefault()
              if (!isReady) return
              mutation.mutate()
            }}
            variant="destructive"
          >
            {mutation.isPending
              ? t.contacts.erasing
              : t.contacts.eraseDialogSubmit}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
