import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { TimezonePicker } from '@/components/ui/timezone-picker'
import { LocalePicker } from '@/components/ui/locale-picker'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  patchOperator,
  TAX_ID_KIND_LABELS,
  OperatorPatchSchema,
  type OperatorPatch,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { OperatorSection } from './_shared'

const TAX_ID_KIND_OPTIONS = [
  'es_nif',
  'es_cif',
  'de_ust_idnr',
  'uk_vat',
  'fr_siren',
  'generic_eu_vat',
  'other',
] as const

// Company subsection of the Settings hub. Covers identity (name / legal
// name / slug), tax & legal, contact & address, and locale — anything
// that lives on the operator row's "who is this business" attributes.
// Calendar prefs + display prefs live in their own subsections so each
// PATCH stays small.
export function CompanySettings() {
  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.company },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.company}
      />
      <OperatorSection>
        {({ operator, operatorId, invalidate }) => (
          <CompanyForm
            operator={operator}
            operatorId={operatorId}
            onSaved={invalidate}
          />
        )}
      </OperatorSection>
    </>
  )
}

type FormProps = {
  operator: OperatorSettings
  operatorId: string
  onSaved: () => void
}

function CompanyForm({ operator, operatorId, onSaved }: FormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<OperatorPatch>({
    resolver: zodResolver(OperatorPatchSchema),
    defaultValues: {
      name: operator.name ?? '',
      legal_name: operator.legal_name ?? '',
      tax_id: operator.tax_id ?? '',
      tax_id_kind: operator.tax_id_kind ?? undefined,
      phone: operator.phone ?? '',
      street: operator.street ?? '',
      city: operator.city ?? '',
      postal_code: operator.postal_code ?? '',
      region: operator.region ?? '',
      country: operator.country ?? '',
      timezone: operator.timezone ?? '',
      default_locale: operator.default_locale ?? '',
      // landr-x5o5.7 — hotel-facing email language.
      hotel_email_locale: operator.hotel_email_locale ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (patch: OperatorPatch) => patchOperator(operatorId, patch),
    onSuccess: () => {
      toast.success(t.settings.toastSuccess)
      onSaved()
    },
    onError: (err: Error) => {
      toast.error(t.settings.toastError, { description: err.message })
    },
  })

  function onSubmit(values: OperatorPatch) {
    mutation.mutate(values)
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <form onSubmit={handleSubmit(onSubmit)} aria-label={t.settings.title}>
        {/* Company */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t.settings.sectionCompany}</CardTitle>
            <CardDescription>{t.settings.sectionCompanyDesc}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="settings-name">{t.settings.fieldName}</Label>
              <Input
                id="settings-name"
                {...register('name')}
                disabled={mutation.isPending}
              />
              {errors.name && (
                <p role="alert" className="text-destructive text-xs">
                  {errors.name.message}
                </p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="settings-legal-name">{t.settings.fieldLegalName}</Label>
              <Input
                id="settings-legal-name"
                {...register('legal_name')}
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="settings-slug">{t.settings.fieldSlug}</Label>
              <Input id="settings-slug" value={operator.slug} disabled readOnly />
              <p className="text-muted-foreground text-xs">{t.settings.fieldSlugHint}</p>
            </div>
          </CardContent>
        </Card>

        {/* Tax & legal */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t.settings.sectionTax}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="settings-tax-id">{t.settings.fieldTaxId}</Label>
              <Input
                id="settings-tax-id"
                {...register('tax_id')}
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="settings-tax-id-kind">{t.settings.fieldTaxIdKind}</Label>
              <NativeSelect
                id="settings-tax-id-kind"
                {...register('tax_id_kind')}
                disabled={mutation.isPending}
              >
                <option value="">{t.settings.optionNone}</option>
                {TAX_ID_KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>
                    {TAX_ID_KIND_LABELS[k]}
                  </option>
                ))}
              </NativeSelect>
            </div>
          </CardContent>
        </Card>

        {/* Contact & address */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t.settings.sectionContact}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="settings-phone">{t.settings.fieldPhone}</Label>
              <Input
                id="settings-phone"
                type="tel"
                {...register('phone')}
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="settings-street">{t.settings.fieldStreet}</Label>
              <Input
                id="settings-street"
                {...register('street')}
                disabled={mutation.isPending}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="settings-city">{t.settings.fieldCity}</Label>
                <Input
                  id="settings-city"
                  {...register('city')}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="settings-postal-code">
                  {t.settings.fieldPostalCode}
                </Label>
                <Input
                  id="settings-postal-code"
                  {...register('postal_code')}
                  disabled={mutation.isPending}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="settings-region">{t.settings.fieldRegion}</Label>
                <Input
                  id="settings-region"
                  {...register('region')}
                  disabled={mutation.isPending}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="settings-country">{t.settings.fieldCountry}</Label>
                <Input
                  id="settings-country"
                  {...register('country')}
                  disabled={mutation.isPending}
                  maxLength={2}
                  placeholder="DE"
                />
                {errors.country && (
                  <p role="alert" className="text-destructive text-xs">
                    {errors.country.message}
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Locale */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t.settings.sectionLocale}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="settings-timezone">{t.settings.fieldTimezone}</Label>
              <Controller
                control={control}
                name="timezone"
                render={({ field }) => (
                  <TimezonePicker
                    id="settings-timezone"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    disabled={mutation.isPending}
                  />
                )}
              />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="settings-locale">{t.settings.fieldLocale}</Label>
              <Controller
                control={control}
                name="default_locale"
                render={({ field }) => (
                  <LocalePicker
                    id="settings-locale"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    disabled={mutation.isPending}
                  />
                )}
              />
            </div>
            {/* landr-x5o5.7 — hotel-facing email language. Separate from
                default_locale so Spanish-only hotels receive Spanish emails
                regardless of the operator's own interface language. */}
            <div className="grid gap-1.5" data-testid="hotel-email-locale-section">
              <Label htmlFor="settings-hotel-email-locale">
                {t.settings.fieldHotelEmailLocale}
              </Label>
              <Controller
                control={control}
                name="hotel_email_locale"
                render={({ field }) => (
                  <LocalePicker
                    id="settings-hotel-email-locale"
                    value={field.value ?? ''}
                    onChange={field.onChange}
                    disabled={mutation.isPending}
                    placeholder="— Same as default locale —"
                  />
                )}
              />
              <p className="text-muted-foreground text-xs">
                {t.settings.fieldHotelEmailLocaleHint}
              </p>
            </div>
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={mutation.isPending || !isDirty}>
            {mutation.isPending ? t.settings.saving : t.settings.save}
          </Button>
        </div>
      </form>

      {/* Re-run the first-login onboarding wizard. Keeps the link with
          Company because Company is the default landing subsection. */}
      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
          <CardDescription>
            Walk through the first-login wizard again. Your existing data is not
            reset.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild variant="outline" size="sm">
            <Link to="/onboarding/start">{t.onboarding.rerunLink}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
