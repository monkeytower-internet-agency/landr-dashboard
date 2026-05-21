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
import { deleteLocation, type Location } from '@/lib/locations'
import { t } from '@/lib/strings'

type Props = {
  location: Location | null
  operatorId: string
  onOpenChange: (open: boolean) => void
}

export function LocationDeleteDialog({
  location,
  operatorId,
  onOpenChange,
}: Props) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      if (!location) throw new Error('No location selected')
      await deleteLocation(operatorId, location.id)
    },
    onSuccess: () => {
      toast.success(t.pickupLocations.toastDeleted)
      queryClient.invalidateQueries({ queryKey: ['locations', operatorId] })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(t.pickupLocations.toastError, { description: err.message })
    },
  })

  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return
    onOpenChange(next)
  }

  return (
    <AlertDialog open={location !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {t.pickupLocations.deleteDialogTitle}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {t.pickupLocations.deleteDialogDescription}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {location ? (
          <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
            <div className="font-medium">{location.name}</div>
            {location.email ? (
              <div className="text-muted-foreground text-xs">
                {location.email}
              </div>
            ) : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t.pickupLocations.deleteDialogCancel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
            variant="destructive"
          >
            {mutation.isPending
              ? t.pickupLocations.deleteDialogDeleting
              : t.pickupLocations.deleteDialogConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
