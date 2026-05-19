import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
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
import { ConnectedAccounts } from '@/components/ConnectedAccounts'
import { useOperator } from '@/lib/operator'
import {
  fetchOperator,
  patchOperator,
  TAX_ID_KIND_LABELS,
  fetchGmailStatus,
  fetchGmailInstallUrl,
  disconnectGmail,
  OperatorPatchSchema,
  type OperatorPatch,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { t } from '@/lib/strings'

const TAX_ID_KIND_OPTIONS = ['es_nif', 'es_cif', 'de_ust_idnr', 'uk_vat', 'fr_siren', 'generic_eu_vat', 'other'] as const

export function Settings() {
  const { currentOperatorId } = useOperator()

  if (!currentOperatorId) {
    return (
      <div className="p-6 text-muted-foreground">{t.settings.noOperator}</div>
    )
  }

  return <SettingsInner operatorId={currentOperatorId} />
}

function SettingsInner({ operatorId }: { operatorId: string }) {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['operator-settings', operatorId],
    queryFn: () => fetchOperator(operatorId),
  })

  if (isLoading) return <div className="p-6 text-muted-foreground">{t.settings.loading}</div>
  if (error || !data)
    return (
      <div className="p-6 text-destructive">
        {t.settings.error}
        {error ? ` — ${(error as Error).message}` : ''}
      </div>
    )

  return (
    <SettingsForm
      operator={data}
      operatorId={operatorId}
      onSaved={() => qc.invalidateQueries({ queryKey: ['operator-settings', operatorId] })}
    />
  )
}

type FormProps = {
  operator: OperatorSettings
  operatorId: string
  onSaved: () => void
}

function SettingsForm({ operator, operatorId, onSaved }: FormProps) {
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
    <div className="mx-auto max-w-2xl space-y-6 p-6">
      <h1 className="text-2xl font-semibold">{t.settings.title}</h1>

      <form onSubmit={handleSubmit(onSubmit)} aria-label={t.settings.title}>
        {/* Company */}
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t.settings.sectionCompany}</CardTitle>
            <CardDescription>
              {t.settings.sectionCompanyDesc}
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid gap-1.5">
              <Label htmlFor="settings-name">{t.settings.fieldName}</Label>
              <Input id="settings-name" {...register('name')} disabled={mutation.isPending} />
              {errors.name && (
                <p role="alert" className="text-destructive text-xs">{errors.name.message}</p>
              )}
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="settings-legal-name">{t.settings.fieldLegalName}</Label>
              <Input id="settings-legal-name" {...register('legal_name')} disabled={mutation.isPending} />
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
              <Input id="settings-tax-id" {...register('tax_id')} disabled={mutation.isPending} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="settings-tax-id-kind">{t.settings.fieldTaxIdKind}</Label>
              <NativeSelect id="settings-tax-id-kind" {...register('tax_id_kind')} disabled={mutation.isPending}>
                <option value="">{t.settings.optionNone}</option>
                {TAX_ID_KIND_OPTIONS.map((k) => (
                  <option key={k} value={k}>{TAX_ID_KIND_LABELS[k]}</option>
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
              <Input id="settings-phone" type="tel" {...register('phone')} disabled={mutation.isPending} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="settings-street">{t.settings.fieldStreet}</Label>
              <Input id="settings-street" {...register('street')} disabled={mutation.isPending} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="settings-city">{t.settings.fieldCity}</Label>
                <Input id="settings-city" {...register('city')} disabled={mutation.isPending} />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="settings-postal-code">{t.settings.fieldPostalCode}</Label>
                <Input id="settings-postal-code" {...register('postal_code')} disabled={mutation.isPending} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="settings-region">{t.settings.fieldRegion}</Label>
                <Input id="settings-region" {...register('region')} disabled={mutation.isPending} />
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
                  <p role="alert" className="text-destructive text-xs">{errors.country.message}</p>
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
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={mutation.isPending || !isDirty}>
            {mutation.isPending ? t.settings.saving : t.settings.save}
          </Button>
        </div>
      </form>

      {/* Integrations — separate from form because no PATCH submit needed */}
      <GmailCard operatorId={operatorId} />

      {/* Connected accounts — operator-level identity links (landr-4im) */}
      <ConnectedAccounts />

      <Card>
        <CardHeader>
          <CardTitle>Onboarding</CardTitle>
          <CardDescription>
            Walk through the first-login wizard again. Your existing data is not reset.
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

function GmailCard({ operatorId }: { operatorId: string }) {
  const qc = useQueryClient()

  const { data, isLoading, error } = useQuery({
    queryKey: ['operator-gmail-status', operatorId],
    queryFn: () => fetchGmailStatus(operatorId),
  })

  const connectMutation = useMutation({
    mutationFn: () => fetchGmailInstallUrl(operatorId),
    onSuccess: ({ install_url }) => {
      window.location.href = install_url
    },
    onError: (err: Error) => {
      toast.error(t.settings.gmailConnectError, { description: err.message })
    },
  })

  const disconnectMutation = useMutation({
    mutationFn: () => disconnectGmail(operatorId),
    onSuccess: () => {
      toast.success(t.settings.gmailDisconnected)
      qc.invalidateQueries({ queryKey: ['operator-gmail-status', operatorId] })
    },
    onError: (err: Error) => {
      toast.error(t.settings.gmailDisconnectError, { description: err.message })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.sectionIntegrations}</CardTitle>
        <CardDescription>{t.settings.sectionIntegrationsDesc}</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Gmail</p>
            {isLoading && (
              <p className="text-muted-foreground text-xs">{t.settings.gmailLoading}</p>
            )}
            {error && (
              <p className="text-destructive text-xs">{t.settings.gmailError}</p>
            )}
            {data && !data.connected && (
              <p className="text-muted-foreground text-xs">{t.settings.gmailNotConnected}</p>
            )}
            {data?.connected && (
              <div className="text-xs text-muted-foreground space-y-0.5">
                <p>{data.email_address}</p>
                {data.connected_at && (
                  <p>{t.settings.gmailConnectedAt} {new Date(data.connected_at).toLocaleDateString()}</p>
                )}
              </div>
            )}
          </div>
          <div className="flex gap-2 shrink-0">
            {!data?.connected && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => connectMutation.mutate()}
                disabled={connectMutation.isPending || isLoading}
              >
                {connectMutation.isPending ? t.settings.gmailConnecting : t.settings.gmailConnect}
              </Button>
            )}
            {data?.connected && (
              <Button
                size="sm"
                variant="destructive"
                onClick={() => disconnectMutation.mutate()}
                disabled={disconnectMutation.isPending}
              >
                {disconnectMutation.isPending ? t.settings.gmailDisconnecting : t.settings.gmailDisconnect}
              </Button>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
