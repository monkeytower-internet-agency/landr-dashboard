import { useEffect, useState } from 'react'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { z } from 'zod'

import { useAuth } from '@/lib/auth'
import { trackView } from '@/lib/recently-viewed'

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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { CustomerBookings } from '@/components/customer/CustomerBookings'
import { TagPicker } from '@/components/tags/TagPicker'
import { invalidateBookingCaches, type BookingRow } from '@/lib/bookings'
import {
  contactNameDisplay,
  fetchContact,
  patchContact,
  type ContactRow,
} from '@/lib/contacts'
import { setContactTags } from '@/lib/tags'
import { t } from '@/lib/strings'

type Props = {
  contactId: string | null
  onOpenChange: (open: boolean) => void
}

// Locale options — kept narrow; mirrors OPERATOR_LOCALES used elsewhere.
// Contacts may carry any string in preferred_locale (e.g. legacy "es"),
// so we treat the field as free-form text in the schema and surface the
// known options in a select with the raw value preserved as a fallback.
const KNOWN_LOCALES: { value: string; label: string }[] = [
  { value: 'de', label: 'Deutsch (de)' },
  { value: 'en', label: 'English (en)' },
  { value: 'es', label: 'Español (es)' },
  { value: 'fr', label: 'Français (fr)' },
  { value: 'it', label: 'Italiano (it)' },
]

const schema = z.object({
  first_name: z.string().trim().max(120),
  last_name: z.string().trim().max(120),
  email: z
    .string()
    .trim()
    .max(320)
    .refine(
      (v) => v === '' || /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v),
      { message: t.customerDetail.invalidEmail },
    ),
  phone: z.string().trim().max(64),
  preferred_locale: z.string().trim().max(16),
})

type FormValues = z.infer<typeof schema>

function defaultsFrom(row: ContactRow): FormValues {
  return {
    first_name: row.first_name ?? '',
    last_name: row.last_name ?? '',
    email: row.email ?? '',
    phone: row.phone ?? '',
    preferred_locale: row.preferred_locale ?? '',
  }
}

export function CustomerDetailSheet({ contactId, onOpenChange }: Props) {
  const open = contactId !== null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* landr-li8e — widen to ~60vw on desktop so the contact form +
          history have room to breathe. Stays as Sheet (not modal) so the
          contacts list behind it remains visible for quick triage. */}
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-[60vw]">
        {contactId ? (
          <CustomerDetailBody
            key={contactId}
            contactId={contactId}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = {
  contactId: string
  onClose: () => void
}

type ActiveTab = 'details' | 'bookings'

function CustomerDetailBody({ contactId, onClose }: BodyProps) {
  const queryClient = useQueryClient()
  const { user } = useAuth()
  const [showDiscard, setShowDiscard] = useState(false)
  // landr-7o2a — Details vs Bookings tab. Defaults to Details so the most
  // common operator interaction (editing the contact) stays one click away.
  // Bookings is read-only — click a row to drill into BookingDetailSheet.
  const [activeTab, setActiveTab] = useState<ActiveTab>('details')
  // landr-7o2a — clicking a booking row stacks BookingDetailSheet on top.
  // We keep the row in local state so the nested sheet stays open even if
  // the bookings query refetches in the background.
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null)

  const query = useQuery<ContactRow>({
    queryKey: ['contact', contactId],
    queryFn: () => fetchContact(contactId),
  })

  // landr-ne58 — record this open in the sidebar "Recently viewed" trail.
  // We wait for the contact row to load so the stored label is the resolved
  // display name rather than a placeholder id. The body is keyed by
  // contactId in the parent, so reopens of a different contact remount and
  // re-fire the effect; trackView() de-duplicates by (type, id).
  const contactLabel = query.data ? contactNameDisplay(query.data) : null
  useEffect(() => {
    if (!contactLabel) return
    trackView(
      user?.id ?? null,
      'contact',
      contactId,
      contactLabel,
      `/contacts?open=${contactId}`,
    )
  }, [user?.id, contactId, contactLabel])

  const hasData = !!query.data && !query.isError

  return (
    <>
      <SheetHeader>
        <div className="flex items-center justify-between gap-2">
          <SheetTitle>{t.customerDetail.title}</SheetTitle>
          {/* landr-a8fg — shareable deep-link to this contact. Uses the
              ?open=<contactId> route landr-ne58 already wires for the
              Recently-viewed trail so the pasted link opens this sheet on
              the next operator's screen. */}
          <CopyLinkButton
            path={`/contacts?open=${contactId}`}
            testId="contact-copy-link"
          />
        </div>
        <SheetDescription>
          {query.data ? contactNameDisplay(query.data) : ' '}
        </SheetDescription>
      </SheetHeader>

      {hasData ? (
        // landr-7o2a — Details / Bookings tab strip. Built on the shared
        // shadcn Tabs primitive (landr-maat). Panels render conditionally
        // below so the form/sheet flex layout stays intact.
        <Tabs
          value={activeTab}
          onValueChange={(next) => setActiveTab(next as ActiveTab)}
          className="mx-4 mt-2 w-fit shrink-0 self-start"
        >
          <TabsList variant="pill" aria-label={t.customerDetail.title}>
            <TabsTrigger
              variant="pill"
              value="details"
              data-testid="customer-tab-details"
            >
              {t.customerDetail.bookings.tabDetails}
            </TabsTrigger>
            <TabsTrigger
              variant="pill"
              value="bookings"
              data-testid="customer-tab-bookings"
            >
              {t.customerDetail.bookings.tabBookings}
            </TabsTrigger>
          </TabsList>
        </Tabs>
      ) : null}

      {query.isPending ? (
        <p className="text-muted-foreground px-4 text-sm">
          {t.customerDetail.loading}
        </p>
      ) : query.isError || !query.data ? (
        <div className="flex flex-1 flex-col gap-2 px-4">
          <p className="text-destructive text-sm" role="alert">
            {query.error?.message ?? t.customerDetail.error}
          </p>
          <SheetFooter className="px-0">
            <Button type="button" variant="outline" onClick={onClose}>
              {t.customerDetail.close}
            </Button>
          </SheetFooter>
        </div>
      ) : activeTab === 'bookings' ? (
        <div
          role="tabpanel"
          aria-label={t.customerDetail.bookings.tabBookings}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <CustomerBookings
            contactId={contactId}
            onBookingClick={(row) => setActiveBooking(row)}
          />
          <SheetFooter className="flex flex-row items-center justify-end gap-2 border-t">
            <Button type="button" variant="outline" onClick={onClose}>
              {t.customerDetail.close}
            </Button>
          </SheetFooter>
        </div>
      ) : (
        <CustomerEditForm
          row={query.data}
          onClose={onClose}
          showDiscard={showDiscard}
          setShowDiscard={setShowDiscard}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['contact', contactId] })
            queryClient.invalidateQueries({ queryKey: ['contacts'] })
            // landr-399m — bookings list AND Views layer (['views-bookings'])
            // both denormalise customer fields, so patching a contact must
            // invalidate both via the shared helper.
            void invalidateBookingCaches(queryClient)
          }}
        />
      )}

      {/* landr-7o2a — nested BookingDetailSheet stacks on top when the
          operator clicks a row in the Bookings tab. Existing call sites of
          CustomerDetailSheet stay unchanged: they don't need to wire a
          separate BookingDetailSheet on the side. */}
      <BookingDetailSheet
        row={activeBooking}
        onOpenChange={(open) => {
          if (!open) setActiveBooking(null)
        }}
      />
    </>
  )
}

type EditFormProps = {
  row: ContactRow
  onClose: () => void
  showDiscard: boolean
  setShowDiscard: (open: boolean) => void
  onSaved: () => void
}

function CustomerEditForm({
  row,
  onClose,
  showDiscard,
  setShowDiscard,
  onSaved,
}: EditFormProps) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: defaultsFrom(row),
    mode: 'onChange',
  })

  const mutation = useMutation({
    mutationFn: async (values: FormValues) => {
      await patchContact(row.id, {
        first_name: values.first_name.trim() || null,
        last_name: values.last_name.trim() || null,
        email: values.email.trim() || null,
        phone: values.phone.trim() || null,
        preferred_locale: values.preferred_locale.trim() || null,
      })
    },
    onSuccess: () => {
      toast.success(t.customerDetail.toastSuccess)
      onSaved()
      onClose()
    },
    onError: (err: Error) => {
      toast.error(t.customerDetail.toastError, { description: err.message })
    },
  })

  function handleSubmit(values: FormValues) {
    mutation.mutate(values)
  }

  function requestClose() {
    if (form.formState.isDirty && !mutation.isPending) {
      setShowDiscard(true)
      return
    }
    onClose()
  }

  // Surface the contact's current preferred_locale even when it's not in
  // KNOWN_LOCALES so the operator does not silently lose it.
  const currentLocale = form.watch('preferred_locale')
  const localeOptions = (() => {
    const all = [...KNOWN_LOCALES]
    if (
      currentLocale &&
      !all.some((opt) => opt.value === currentLocale)
    ) {
      all.unshift({ value: currentLocale, label: currentLocale })
    }
    return all
  })()

  return (
    <>
      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(handleSubmit)}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2"
          aria-label={t.customerDetail.title}
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="first_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.customerDetail.fieldFirstName}</FormLabel>
                  <FormControl>
                    <Input disabled={mutation.isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="last_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t.customerDetail.fieldLastName}</FormLabel>
                  <FormControl>
                    <Input disabled={mutation.isPending} {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>

          <FormField
            control={form.control}
            name="email"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.customerDetail.fieldEmail}</FormLabel>
                <FormControl>
                  <Input type="email" disabled={mutation.isPending} {...field} />
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
                <FormLabel>{t.customerDetail.fieldPhone}</FormLabel>
                <FormControl>
                  <Input type="tel" disabled={mutation.isPending} {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          <FormField
            control={form.control}
            name="preferred_locale"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t.customerDetail.fieldPreferredLocale}</FormLabel>
                <FormControl>
                  <NativeSelect
                    value={field.value}
                    onChange={(e) => field.onChange(e.target.value)}
                    disabled={mutation.isPending}
                  >
                    <option value="">{t.customerDetail.localeNone}</option>
                    {localeOptions.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </NativeSelect>
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />

          {/* landr-iz58 — tag picker writes via setContactTags on every
              change (immediate-save model). The form-level "Save" button
              still handles other field changes; tags persist independently
              because the API surface is its own POST. */}
          <ContactTagsField row={row} disabled={mutation.isPending} />
        </form>
      </Form>

      <SheetFooter className="flex flex-row items-center justify-end gap-2 border-t">
        <Button
          type="button"
          variant="outline"
          onClick={requestClose}
          disabled={mutation.isPending}
        >
          {t.customerDetail.cancel}
        </Button>
        <Button
          type="button"
          onClick={form.handleSubmit(handleSubmit)}
          disabled={
            !form.formState.isDirty ||
            !form.formState.isValid ||
            mutation.isPending
          }
          title={
            !form.formState.isDirty ? t.customerDetail.noChanges : undefined
          }
        >
          {mutation.isPending
            ? t.customerDetail.saving
            : t.customerDetail.save}
        </Button>
      </SheetFooter>

      <AlertDialog
        open={showDiscard}
        onOpenChange={(next) => setShowDiscard(next)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.customerDetail.discardTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.customerDetail.discardDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>
              {t.customerDetail.discardCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                setShowDiscard(false)
                onClose()
              }}
              variant="destructive"
            >
              {t.customerDetail.discardConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---- TagPicker bridge (landr-iz58) ----------------------------------
//
// Renders a TagPicker pre-populated with the contact's current tag set.
// Toggling a tag fires setContactTags() immediately — independent of the
// react-hook-form save lifecycle for the other contact fields. That keeps
// the form's dirty-state logic clean (tag changes don't enable the Save
// button, and saving other fields doesn't double-write tags).

type ContactTagsFieldProps = {
  row: ContactRow
  disabled?: boolean
}

function ContactTagsField({ row, disabled }: ContactTagsFieldProps) {
  const queryClient = useQueryClient()
  const initial = (row.tags ?? []).map((t) => t.id)
  const [selected, setSelected] = useState<string[]>(initial)

  const mutation = useMutation({
    mutationFn: (nextIds: string[]) => setContactTags(row.operator_id, row.id, nextIds),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['contact', row.id] })
      queryClient.invalidateQueries({ queryKey: ['contacts'] })
    },
    onError: (err: Error) => {
      // Roll back optimistic change on failure.
      setSelected(initial)
      toast.error(t.customerDetail.tagsToastError, { description: err.message })
    },
  })

  return (
    <div data-testid="customer-tags-picker">
      <label className="text-xs font-medium">{t.customerDetail.tagsLabel}</label>
      <div className="mt-1">
        <TagPicker
          operatorId={row.operator_id}
          selectedIds={selected}
          onChange={(next) => {
            setSelected(next)
            mutation.mutate(next)
          }}
          disabled={disabled || mutation.isPending}
          testIdPrefix="customer-tag-picker"
        />
      </div>
    </div>
  )
}
