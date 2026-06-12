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
import { deleteHotel, type Hotel } from '@/lib/hotels'
import { t } from '@/lib/strings'

type Props = {
  hotel: Hotel | null
  operatorId: string
  onOpenChange: (open: boolean) => void
}

export function HotelDeleteDialog({ hotel, operatorId, onOpenChange }: Props) {
  const queryClient = useQueryClient()

  const mutation = useMutation({
    mutationFn: async () => {
      if (!hotel) throw new Error('No hotel selected')
      await deleteHotel(operatorId, hotel.id)
    },
    onSuccess: () => {
      toast.success(t.hotels.toastDeleted)
      queryClient.invalidateQueries({ queryKey: ['hotels', operatorId] })
      onOpenChange(false)
    },
    onError: (err: Error) => {
      toast.error(t.hotels.toastError, { description: err.message })
    },
  })

  function handleOpenChange(next: boolean) {
    if (mutation.isPending) return
    onOpenChange(next)
  }

  return (
    <AlertDialog open={hotel !== null} onOpenChange={handleOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.hotels.deleteTitle}</AlertDialogTitle>
          <AlertDialogDescription>
            {t.hotels.deleteWarning}
          </AlertDialogDescription>
        </AlertDialogHeader>
        {hotel ? (
          <div className="bg-muted/30 rounded-md border px-3 py-2 text-sm">
            <div className="font-medium">{hotel.name}</div>
            {hotel.email ? (
              <div className="text-muted-foreground text-xs">{hotel.email}</div>
            ) : null}
          </div>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={mutation.isPending}>
            {t.hotels.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            disabled={mutation.isPending}
            onClick={(e) => {
              e.preventDefault()
              mutation.mutate()
            }}
            variant="destructive"
          >
            {mutation.isPending ? t.hotels.saving : t.hotels.deleteConfirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
