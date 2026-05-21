import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  patchOperator,
  OperatorPatchSchema,
  type OperatorPatch,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { OperatorSection } from './_shared'

// Display preferences subsection (landr-c3t). Currently a single toggle:
// show_premium_teasers. Lives in its own form so the toggle persists with
// a tiny PATCH instead of having to round-trip the entire Company payload.
export function DisplayPreferencesSettings() {
  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.displayPreferences },
        ]}
      />
      <OperatorSection>
        {({ operator, operatorId, invalidate }) => (
          <DisplayPreferencesForm
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

function DisplayPreferencesForm({ operator, operatorId, onSaved }: FormProps) {
  const {
    control,
    handleSubmit,
    formState: { isDirty },
  } = useForm<OperatorPatch>({
    resolver: zodResolver(OperatorPatchSchema),
    defaultValues: {
      show_premium_teasers: operator.show_premium_teasers ?? false,
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

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t.settings.sectionDisplayPrefs}</h1>

      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        aria-label={t.settings.sectionDisplayPrefs}
      >
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t.settings.sectionDisplayPrefs}</CardTitle>
            <CardDescription>{t.settings.sectionDisplayPrefsDesc}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-2">
            <Controller
              control={control}
              name="show_premium_teasers"
              render={({ field }) => {
                const isFreeTier = operator.subscription_package?.slug === 'free'
                // Free-tier operators are forced ON visually so they can't
                // opt out of seeing upgrade prompts; paid tiers can toggle.
                const checked = isFreeTier ? true : !!field.value
                return (
                  <div className="flex items-start gap-3">
                    <Checkbox
                      id="settings-show-premium-teasers"
                      checked={checked}
                      onChange={(e) =>
                        !isFreeTier && field.onChange(e.target.checked)
                      }
                      disabled={mutation.isPending || isFreeTier}
                      title={
                        isFreeTier
                          ? t.settings.fieldShowPremiumTeasersFreeLockedHint
                          : undefined
                      }
                    />
                    <div className="flex flex-col gap-1">
                      <Label
                        htmlFor="settings-show-premium-teasers"
                        className="cursor-pointer text-sm font-normal"
                      >
                        {t.settings.fieldShowPremiumTeasers}
                      </Label>
                      <p className="text-muted-foreground text-xs">
                        {isFreeTier
                          ? t.settings.fieldShowPremiumTeasersFreeLockedHint
                          : t.settings.fieldShowPremiumTeasersHint}
                      </p>
                    </div>
                  </div>
                )
              }}
            />
          </CardContent>
        </Card>

        <div className="flex justify-end gap-3">
          <Button type="submit" disabled={mutation.isPending || !isDirty}>
            {mutation.isPending ? t.settings.saving : t.settings.save}
          </Button>
        </div>
      </form>
    </div>
  )
}
