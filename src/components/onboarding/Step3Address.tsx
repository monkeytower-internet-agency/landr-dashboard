import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  OperatorPatchSchema,
  patchOperator,
  type OperatorPatch,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { isValidPhoneFormat, PHONE_HTML_PATTERN } from '@/lib/phone'
import { t } from '@/lib/strings'
import { StepShell } from './StepShell'

type Props = {
  operator: OperatorSettings
  operatorId: string
  onAdvance: () => void
  onBack: () => void
}

export function Step3Address({ operator, operatorId, onAdvance, onBack }: Props) {
  const qc = useQueryClient()
  const {
    register,
    handleSubmit,
    setError,
    formState: { isSubmitting, errors },
  } = useForm<OperatorPatch>({
    resolver: zodResolver(OperatorPatchSchema),
    defaultValues: {
      phone: operator.phone ?? '',
      street: operator.street ?? '',
      city: operator.city ?? '',
      postal_code: operator.postal_code ?? '',
      region: operator.region ?? '',
    },
  })

  const mutation = useMutation({
    mutationFn: (patch: OperatorPatch) => patchOperator(operatorId, patch),
    onSuccess: (next) => {
      qc.setQueryData(['operator-settings', operatorId], next)
      onAdvance()
    },
    onError: (err: Error) =>
      toast.error(t.onboarding.saveError, { description: err.message }),
  })

  // landr-1url: lightweight international-format nudge (no new dependency).
  // OperatorPatchSchema is shared with CompanySettings.tsx and others, so we
  // deliberately do NOT tighten it there — this step layers an extra, scoped
  // phone-format check on top instead. Phone stays optional (blank passes);
  // a filled value must look internationally-formatted (leading '+' +
  // country code).
  function onValid(v: OperatorPatch) {
    const phone = v.phone ?? ''
    if (phone.trim() && !isValidPhoneFormat(phone)) {
      setError('phone', { type: 'manual', message: t.onboarding.step3.phoneError })
      return
    }
    mutation.mutate(v)
  }

  return (
    <StepShell heading={t.onboarding.step3.heading} body={t.onboarding.step3.body}>
      <form
        onSubmit={handleSubmit(onValid)}
        className="space-y-4"
        aria-label={t.onboarding.step3.heading}
      >
        <div className="grid gap-1.5">
          <Label htmlFor="onb-phone">{t.settings.fieldPhone}</Label>
          <Input
            id="onb-phone"
            type="tel"
            placeholder="+34 600 123 456"
            pattern={PHONE_HTML_PATTERN}
            {...register('phone')}
            disabled={isSubmitting}
          />
          <p className="text-xs text-muted-foreground">
            {t.onboarding.step3.phoneHint}
          </p>
          {errors.phone && (
            <p role="alert" className="text-destructive text-xs">
              {errors.phone.message}
            </p>
          )}
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="onb-street">{t.settings.fieldStreet}</Label>
          <Input id="onb-street" {...register('street')} disabled={isSubmitting} />
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div className="grid gap-1.5">
            <Label htmlFor="onb-city">{t.settings.fieldCity}</Label>
            <Input id="onb-city" {...register('city')} disabled={isSubmitting} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="onb-postal-code">{t.settings.fieldPostalCode}</Label>
            <Input id="onb-postal-code" {...register('postal_code')} disabled={isSubmitting} />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="onb-region">{t.settings.fieldRegion}</Label>
          <Input id="onb-region" {...register('region')} disabled={isSubmitting} />
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
