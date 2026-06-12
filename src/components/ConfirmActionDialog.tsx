import type { ReactNode } from 'react'

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

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  /** Label for the dismiss/cancel button. */
  cancelLabel: string
  confirmLabel: string
  /** Label shown while isPending is true. Defaults to confirmLabel. */
  confirmingLabel?: string
  variant?: 'default' | 'destructive'
  isPending: boolean
  /** Whether the Confirm button should be disabled (in addition to isPending). */
  confirmDisabled?: boolean
  onConfirm: () => void
  /** data-testid placed on the Confirm button. */
  confirmTestId?: string
  /** Optional custom body content rendered between description and footer. */
  children?: ReactNode
}

/**
 * Generic reusable confirmation dialog built on AlertDialog.
 *
 * Handles the standard pattern: header (title + description), optional
 * custom body (children), footer (Cancel + Confirm).
 *
 * Used by BookingDetailSheet's 5 action dialogs; also suitable for
 * StaffRevokeDialog / GdprEraseDialog migrations.
 */
export function ConfirmActionDialog({
  open,
  onOpenChange,
  title,
  description,
  cancelLabel,
  confirmLabel,
  confirmingLabel,
  variant = 'default',
  isPending,
  confirmDisabled = false,
  onConfirm,
  confirmTestId,
  children,
}: Props) {
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {children}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={isPending}>{cancelLabel}</AlertDialogCancel>
          <AlertDialogAction
            disabled={isPending || confirmDisabled}
            onClick={(e) => {
              e.preventDefault()
              if (isPending || confirmDisabled) return
              onConfirm()
            }}
            variant={variant}
            data-testid={confirmTestId}
          >
            {isPending ? (confirmingLabel ?? confirmLabel) : confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
