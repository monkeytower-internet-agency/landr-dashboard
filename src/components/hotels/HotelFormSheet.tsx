import { useMemo, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import {
  Form,
  FormControl,
  FormDescription,
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
import { TimezonePicker } from '@/components/ui/timezone-picker'
import { HotelPlacesSearch } from '@/components/hotels/HotelPlacesSearch'
import {
  buildHotelFormSchema,
  createHotel,
  updateHotel,
  type Hotel,
  type HotelFormValues,
  type PlaceSearchResult,
} from '@/lib/hotels'
import { PHONE_HTML_PATTERN } from '@/lib/phone'
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
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
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
  const [autofillBanner, setAutofillBanner] = useState<'filled' | null>(null)

  // landr-rhf8: grandfather legacy phone values — format is only enforced
  // when the phone actually changes this session (vs. the stored record)
  // or on create. HotelFormSheetBody remounts (via `key=`) whenever
  // editTarget changes, so this only needs to be correct once per mount.
  const hotelFormSchema = useMemo(
    () =>
      buildHotelFormSchema({
        isCreate: !editTarget,
        originalPhone: editTarget?.phone ?? '',
      }),
    [editTarget],
  )

  const form = useForm<HotelFormValues>({
    resolver: zodResolver(hotelFormSchema),
    defaultValues: {
      name: editTarget?.name ?? '',
      email: editTarget?.email ?? '',
      address: editTarget?.address ?? '',
      phone: editTarget?.phone ?? '',
      maps_link: editTarget?.maps_link ?? '',
      website: editTarget?.website ?? '',
      contact_email: editTarget?.contact_email ?? '',
      checkin_time: editTarget?.checkin_time ?? '',
      checkout_time: editTarget?.checkout_time ?? '',
      timezone: editTarget?.timezone ?? '',
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
      // Invalidate config-health so the hotel_missing_email banner disappears
      // immediately when the operator adds a missing booking email (landr-v526).
      queryClient.invalidateQueries({ queryKey: ['config-health'] })
      onClose()
    },
    onError: (err: Error) => {
      toast.error(t.hotels.toastError, { description: err.message })
    },
  })

  function handlePlaceSelect(result: PlaceSearchResult) {
    // Pre-fill fields from Google Places Text Search. Only overwrite a field if
    // the place provides a value — never blank out something the user already typed.
    if (result.name) form.setValue('name', result.name, { shouldValidate: true })
    if (result.address) form.setValue('address', result.address, { shouldValidate: true })
    if (result.phone) form.setValue('phone', result.phone, { shouldValidate: true })
    if (result.website) form.setValue('website', result.website, { shouldValidate: true })
    if (result.mapsLink) form.setValue('maps_link', result.mapsLink, { shouldValidate: true })
    if (result.timezone) form.setValue('timezone', result.timezone, { shouldValidate: true })
    // NOTE: email (booking-confirmation) and contact_email are intentionally
    // NOT pre-filled — Google gives a general contact, not the reservations inbox.
    setAutofillBanner('filled')
  }

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
          {/* Google Places search — sits above the Name field; only shown
              when creating or when editing without data filled in yet.
              The form still works 100% without it. */}
          <div className="space-y-1">
            <p className="text-sm font-medium">{t.hotels.placesSearchLabel}</p>
            <HotelPlacesSearch
              operatorId={operatorId}
              disabled={mutation.isPending}
              onSelect={handlePlaceSelect}
            />
          </div>

          {autofillBanner === 'filled' && (
            <p
              className="rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground"
              data-testid="places-autofill-banner"
            >
              {t.hotels.placesAutofilled}
            </p>
          )}

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
                <FormDescription>{t.hotels.fieldEmailHint}</FormDescription>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="contact_email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hotels.fieldContactEmail}</FormLabel>
                <FormControl>
                  <Input
                    type="email"
                    placeholder="info@hotel.example"
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormDescription>{t.hotels.fieldContactEmailHint}</FormDescription>
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
                    type="tel"
                    placeholder="+34 600 000 000"
                    pattern={PHONE_HTML_PATTERN}
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormDescription>{t.hotels.fieldPhoneHint}</FormDescription>
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

          <FormField
            control={form.control}
            name="website"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hotels.fieldWebsite}</FormLabel>
                <FormControl>
                  <Input
                    type="url"
                    placeholder="https://www.hotel.example"
                    disabled={mutation.isPending}
                    {...field}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <div className="grid grid-cols-2 gap-4">
            <FormField
              control={form.control}
              name="checkin_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hotels.fieldCheckinTime}</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
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
              name="checkout_time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.hotels.fieldCheckoutTime}</FormLabel>
                  <FormControl>
                    <Input
                      type="time"
                      disabled={mutation.isPending}
                      {...field}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="timezone"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.hotels.fieldTimezone}</FormLabel>
                <FormControl>
                  <TimezonePicker
                    id={field.name}
                    value={field.value}
                    onChange={field.onChange}
                    disabled={mutation.isPending}
                    placeholder="Inherit operator timezone"
                  />
                </FormControl>
                <FormDescription>{t.hotels.fieldTimezoneHint}</FormDescription>
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
