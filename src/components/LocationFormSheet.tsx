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
import { NativeSelect } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import {
  createLocation,
  locationFormSchema,
  resolveFormOutput,
  updateLocation,
  type Location,
  type LocationFormValues,
  type LocationRoleType,
} from '@/lib/locations'
import { t } from '@/lib/strings'

type Props = {
  open: boolean
  onOpenChange: (open: boolean) => void
  operatorId: string
  locations: Location[]
  roleTypes: LocationRoleType[]
  editTarget: Location | null
}

export function LocationFormSheet({
  open,
  onOpenChange,
  operatorId,
  locations,
  roleTypes,
  editTarget,
}: Props) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-md">
        {open ? (
          <LocationFormSheetBody
            key={editTarget?.id ?? 'create'}
            operatorId={operatorId}
            locations={locations}
            roleTypes={roleTypes}
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
  locations: Location[]
  roleTypes: LocationRoleType[]
  editTarget: Location | null
  onClose: () => void
}

function LocationFormSheetBody({
  operatorId,
  locations,
  roleTypes,
  editTarget,
  onClose,
}: BodyProps) {
  const queryClient = useQueryClient()

  const isHotelLike = (roleTypeId: string | null) => {
    if (!roleTypeId) return false
    const rt = roleTypes.find((r) => r.id === roleTypeId)
    return rt?.code === 'hotel'
  }

  const form = useForm<LocationFormValues>({
    resolver: zodResolver(locationFormSchema),
    defaultValues: {
      name: editTarget?.name ?? '',
      role_type_id: (editTarget as (Location & { role_type_id?: string | null }) | null)?.role_type_id ?? null,
      parent_id: editTarget?.parent_id ?? null,
      email: editTarget?.email ?? '',
    },
  })

  const watchedParentId = form.watch('parent_id')
  const watchedRoleTypeId = form.watch('role_type_id')

  // Site-level locations only (no parent) are eligible as parents for sub-points.
  const siteLocations = locations.filter(
    (loc) => !loc.parent_id && loc.id !== editTarget?.id,
  )

  const mutation = useMutation({
    mutationFn: async (values: LocationFormValues) => {
      const output = resolveFormOutput(values)

      if (output.parent_id) {
        const parent = locations.find((l) => l.id === output.parent_id)
        if (parent?.parent_id) {
          form.setError('parent_id', {
            message: t.pickupLocations.errorSubPointDepth,
          })
          throw new Error(t.pickupLocations.errorSubPointDepth)
        }
      }

      if (editTarget) {
        return updateLocation(operatorId, editTarget.id, output)
      }
      return createLocation(operatorId, output)
    },
    onSuccess: () => {
      toast.success(
        editTarget ? t.pickupLocations.toastUpdated : t.pickupLocations.toastCreated,
      )
      queryClient.invalidateQueries({ queryKey: ['locations', operatorId] })
      onClose()
    },
    onError: (err: Error) => {
      if (!err.message.includes('Sub-points')) {
        toast.error(t.pickupLocations.toastError, { description: err.message })
      }
    },
  })

  function handleSubmit(values: LocationFormValues) {
    mutation.mutate(values)
  }

  const hotelLike = isHotelLike(watchedRoleTypeId)
  const emailLabel = hotelLike
    ? t.pickupLocations.fieldEmailHotel
    : t.pickupLocations.fieldEmail

  return (
    <>
      <SheetHeader>
        <SheetTitle>
          {editTarget
            ? t.pickupLocations.formEditTitle
            : t.pickupLocations.formCreateTitle}
        </SheetTitle>
        <SheetDescription>
          {t.pickupLocations.formDescription}
        </SheetDescription>
      </SheetHeader>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4"
          aria-label={
            editTarget
              ? t.pickupLocations.formEditTitle
              : t.pickupLocations.formCreateTitle
          }
        >
          {hotelLike && (
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{emailLabel}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="contact@hotel.example"
                      disabled={mutation.isPending}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}

          <FormField
            control={form.control}
            name="name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.pickupLocations.fieldName}</FormLabel>
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
            name="role_type_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.pickupLocations.fieldRoleType}</FormLabel>
                <FormControl>
                  <NativeSelect
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : e.target.value)
                    }
                    disabled={mutation.isPending}
                  >
                    <option value="">
                      {t.pickupLocations.fieldRoleTypeNone}
                    </option>
                    {roleTypes.map((rt) => (
                      <option key={rt.id} value={rt.id}>
                        {rt.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="parent_id"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.pickupLocations.fieldParent}</FormLabel>
                <FormControl>
                  <NativeSelect
                    value={field.value ?? ''}
                    onChange={(e) =>
                      field.onChange(e.target.value === '' ? null : e.target.value)
                    }
                    disabled={mutation.isPending}
                  >
                    <option value="">
                      {t.pickupLocations.fieldParentNone}
                    </option>
                    {siteLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {watchedParentId && (() => {
            const parent = locations.find((l) => l.id === watchedParentId)
            if (parent?.parent_id) {
              return (
                <p role="alert" className="text-destructive text-xs">
                  {t.pickupLocations.errorSubPointDepth}
                </p>
              )
            }
            return null
          })()}

          {!hotelLike && (
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{emailLabel}</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="contact@location.example"
                      disabled={mutation.isPending}
                      {...field}
                      value={field.value ?? ''}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          )}
        </form>
      </Form>
      <SheetFooter>
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={mutation.isPending}
        >
          {t.pickupLocations.cancel}
        </Button>
        <Button
          type="submit"
          onClick={form.handleSubmit(handleSubmit)}
          disabled={mutation.isPending}
        >
          {mutation.isPending
            ? editTarget
              ? t.pickupLocations.saving
              : t.pickupLocations.creating
            : editTarget
              ? t.pickupLocations.save
              : t.pickupLocations.create}
        </Button>
      </SheetFooter>
    </>
  )
}
