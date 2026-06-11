import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form'
import { Input } from '@/components/ui/input'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  createHotel,
  hotelFormSchema,
  updateHotel,
  type Hotel,
  type HotelFormValues,
} from '@/lib/hotels'
import { t } from '@/lib/strings'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  operatorId: string
  editTarget: Hotel | null
}

export function HotelFormSheet({
  open,
  onOpenChange,
  operatorId,
  editTarget,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        {open ? (
          <HotelFormSheetBody
            key={editTarget?.id ?? 'create'}
            operatorId={operatorId}
            editTarget={editTarget}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = {
  operatorId: string
  editTarget: Hotel | null
  onClose: () => void
}

function HotelFormSheetBody({ operatorId, editTarget, onClose }: BodyProps) {
  const queryClient = useQueryClient()

  const form = useForm<HotelFormValues>({
    resolver: zodResolver(hotelFormSchema),
    defaultValues: {
      name: editTarget?.name ?? '',
      email: editTarget?.email ?? '',
      address: editTarget?.address ?? '',
      phone: editTarget?.phone ?? '',
      maps_link: editTarget?.maps_link ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: async (values: HotelFormValues) => {
      if (editTarget) {
        return updateHotel(operatorId, editTarget.id, values)
      }
      return createHotel(operatorId, values)
    },
    onSuccess: () => {
      toast.success(
        editTarget ? t.hotels.toastUpdated : t.hotels.toastCreated,
      )
      queryClient.invalidateQueries({ queryKey: ['hotels', operatorId] })
      onClose()
    },
    onError: (err: Error) => {
      toast.error(t.hotels.toastError, { description: err.message })
    },
  })

  function handleSubmit(values: HotelFormValues) {
    mutation.mutate(values)
  }

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {editTarget ? t.hotels.formEditTitle : t.hotels.formCreateTitle}
        </SheetTitle>
        <SheetDescription>{t.hotels.formDescription}</SheetDescription>
      </SheetHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          aria-label={
            editTarget ? t.hotels.formEditTitle : t.hotels.formCreateTitle
          }
        >
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hotels.fieldName}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Hotel Sol"
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hotels.fieldEmail}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="reception@hotel.example"
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="address"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hotels.fieldAddress}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="Calle del Mar 12, 35660"
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="phone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hotels.fieldPhone}</FormLabel>
                <FormControl>
                  <Input
                    placeholder="+34 600 000 000"
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="maps_link"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hotels.fieldMapsLink}</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://maps.google.com/…"
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        </form>
      </Form>
      <SheetFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          {t.hotels.cancel}
        </Button>
        <Button
          type="submit"
          onClick={form.handleSubmit(handleSubmit)}
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? editTarget
              ? t.hotels.saving
              : t.hotels.creating
            : editTarget
              ? t.hotels.save
              : t.hotels.create}
        </Button>
      </SheetFooter>
    </>
  )
}
