import { useEffect, useRef } from 'react'
import { Controller, useForm, useWatch } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { TimezonePicker } from '@/components/ui/timezone-picker'
import { LocalePicker } from '@/components/ui/locale-picker'
import {
  OperatorPatchSchema,
  patchOperator,
  TAX_ID_KIND_LABELS,
  type OperatorPatch,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { guessLocale, guessTimezone } from '@/lib/locale-defaults'
import { t } from '@/lib/strings'
import { StepShell } from './StepShell'

const TAX_ID_KIND_OPTIONS = ['es_nif', 'es_cif', 'de_ust_idnr', 'uk_vat', 'fr_siren', 'generic_eu_vat', 'other'] as const

type Props = {
  operator: OperatorSettings
  operatorId: string
  onAdvance: () => void
  onBack: () => void
}

export function Step2Company({ operator, operatorId, onAdvance, onBack }: Props) {
  const qc = useQueryClient()
  const {
    register,
    control,
    handleSubmit,
    setValue,
    getValues,
    formState: { errors, isSubmitting },
  } = useForm<OperatorPatch>({
    resolver: zodResolver(OperatorPatchSchema),
    defaultValues: {
      name: operator.name ?? '',
      legal_name: operator.legal_name ?? '',
      tax_id: operator.tax_id ?? '',
      tax_id_kind: operator.tax_id_kind ?? undefined,
      country: operator.country ?? '',
      timezone: operator.timezone ?? '',
      default_locale: operator.default_locale ?? '',
    },
  })

  // Seed timezone/locale from country on first mount if they are empty.
  const didSeedRef = useRef(false)
  useEffect(() => {
    if (didSeedRef.current) return
    didSeedRef.current = true
    const current = getValues()
    const country = (current.country ?? '').trim()
    if (!current.timezone) {
      setValue('timezone', guessTimezone(country, operator.region), { shouldDirty: false })
    }
    if (!current.default_locale) {
      setValue('default_locale', guessLocale(country), { shouldDirty: false })
    }
  }, [getValues, operator.region, setValue])

  // Re-seed when the user picks a country, only if the user hasn't set tz/locale yet.
  const watchedCountry = useWatch({ control, name: 'country' })
  const userTouchedTzRef = useRef<boolean>(Boolean(operator.timezone))
  const userTouchedLocaleRef = useRef<boolean>(Boolean(operator.default_locale))
  useEffect(() => {
    if (!didSeedRef.current) return
    const country = (watchedCountry ?? '').trim()
    if (!country) return
    if (!userTouchedTzRef.current) {
      setValue('timezone', guessTimezone(country, operator.region), { shouldDirty: false })
    }
    if (!userTouchedLocaleRef.current) {
      setValue('default_locale', guessLocale(country), { shouldDirty: false })
    }
  }, [watchedCountry, operator.region, setValue])

  const mutation = useMutation({
    mutationFn: (patch: OperatorPatch) => patchOperator(operatorId, patch),
    onSuccess: (next) => {
      qc.setQueryData(['operator-settings', operatorId], next)
      onAdvance()
    },
    onError: (err: Error) =>
      toast.error(t.onboarding.saveError, { description: err.message }),
  })

  function onSubmit(values: OperatorPatch) {
    const payload: OperatorPatch = { ...values }
    if (!payload.tax_id_kind) delete (payload as { tax_id_kind?: unknown }).tax_id_kind
    mutation.mutate(payload)
  }

  return (
    <StepShell heading={t.onboarding.step2.heading} body={t.onboarding.step2.body}>
      <form
        onSubmit={handleSubmit(onSubmit)}
        className="space-y-4"
        aria-label={t.onboarding.step2.heading}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="onb-name">{t.settings.fieldName}</Label>
          <Input id="onb-name" {...register('name')} disabled={isSubmitting} />
          {errors.name && (
            <p role="alert" className="text-destructive text-xs">{errors.name.message}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="onb-legal-name">{t.settings.fieldLegalName}</Label>
          <Input id="onb-legal-name" {...register('legal_name')} disabled={isSubmitting} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="onb-tax-id">{t.settings.fieldTaxId}</Label>
            <Input id="onb-tax-id" {...register('tax_id')} disabled={isSubmitting} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="onb-tax-id-kind">{t.settings.fieldTaxIdKind}</Label>
            <NativeSelect id="onb-tax-id-kind" {...register('tax_id_kind')} disabled={isSubmitting}>
              <option value="">{t.settings.optionNone}</option>
              {TAX_ID_KIND_OPTIONS.map((k) => (
                <option key={k} value={k}>{TAX_ID_KIND_LABELS[k]}</option>
              ))}
            </NativeSelect>
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="onb-country">{t.settings.fieldCountry}</Label>
          <Input
            id="onb-country"
            {...register('country')}
            maxLength={2}
            placeholder="DE"
            disabled={isSubmitting}
          />
          {errors.country && (
            <p role="alert" className="text-destructive text-xs">{errors.country.message}</p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="onb-timezone">{t.settings.fieldTimezone}</Label>
          <Controller
            control={control}
            name="timezone"
            render={({ field }) => (
              <TimezonePicker
                id="onb-timezone"
                value={field.value ?? ''}
                onChange={(tz) => {
                  userTouchedTzRef.current = true
                  field.onChange(tz)
                }}
                disabled={isSubmitting}
              />
            )}
          />
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="onb-locale">{t.settings.fieldLocale}</Label>
          <Controller
            control={control}
            name="default_locale"
            render={({ field }) => (
              <LocalePicker
                id="onb-locale"
                value={field.value ?? ''}
                onChange={(loc) => {
                  userTouchedLocaleRef.current = true
                  field.onChange(loc)
                }}
                disabled={isSubmitting}
              />
            )}
          />
        </div>
        <div className="flex justify-between gap-3 pt-2">
          <Button type="button" variant="outline" onClick={onBack}>
            {t.onboarding.back}
          </Button>
          <Button type="submit" disabled={mutation.isPending}>
            {mutation.isPending ? t.onboarding.saving : t.onboarding.next}
          </Button>
        </div>
      </form>
    </StepShell>
  )
}
