import { Controller, useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
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
import { t } from '@/lib/strings'
import { OperatorSection } from './_shared'

// Calendar & display subsection (landr-f1s). Owns work-hours window +
// time-format pref. Split out of Company because it's a calendar concern,
// not an identity concern.
export function CalendarDisplaySettings() {
  return (
    <OperatorSection>
      {({ operator, operatorId, invalidate }) => (
        <CalendarDisplayForm
          operator={operator}
          operatorId={operatorId}
          onSaved={invalidate}
        />
      )}
    </OperatorSection>
  )
}

type FormProps = {
  operator: OperatorSettings
  operatorId: string
  onSaved: () => void
}

function CalendarDisplayForm({ operator, operatorId, onSaved }: FormProps) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<OperatorPatch>({
    resolver: zodResolver(OperatorPatchSchema),
    defaultValues: {
      // Postgres returns time as 'HH:MM:SS'; <Input type=time> wants
      // 'HH:MM' — strip seconds. Mirrors the pre-split Settings.tsx logic.
      work_hours_start: (operator.work_hours_start ?? '08:00:00').slice(0, 5),
      work_hours_end: (operator.work_hours_end ?? '20:00:00').slice(0, 5),
      time_format_24h: operator.time_format_24h ?? true,
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
      <h1 className="text-2xl font-semibold">{t.settings.sectionCalendar}</h1>

      <form
        onSubmit={handleSubmit((values) => mutation.mutate(values))}
        aria-label={t.settings.sectionCalendar}
      >
        <Card className="mb-6">
          <CardHeader>
            <CardTitle>{t.settings.sectionCalendar}</CardTitle>
            <CardDescription>{t.settings.sectionCalendarDesc}</CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-1.5">
                <Label htmlFor="settings-work-hours-start">
                  {t.settings.fieldWorkHoursStart}
                </Label>
                <Input
                  id="settings-work-hours-start"
                  type="time"
                  step={900}
                  {...register('work_hours_start')}
                  disabled={mutation.isPending}
                />
                {errors.work_hours_start && (
                  <p role="alert" className="text-destructive text-xs">
                    {errors.work_hours_start.message}
                  </p>
                )}
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor="settings-work-hours-end">
                  {t.settings.fieldWorkHoursEnd}
                </Label>
                <Input
                  id="settings-work-hours-end"
                  type="time"
                  step={900}
                  {...register('work_hours_end')}
                  disabled={mutation.isPending}
                />
                {errors.work_hours_end && (
                  <p role="alert" className="text-destructive text-xs">
                    {errors.work_hours_end.message}
                  </p>
                )}
              </div>
            </div>
            <p className="text-muted-foreground text-xs">
              {t.settings.fieldWorkHoursHint}
            </p>
            <div className="grid gap-1.5">
              <Label htmlFor="settings-time-format">{t.settings.fieldTimeFormat}</Label>
              <Controller
                control={control}
                name="time_format_24h"
                render={({ field }) => (
                  <NativeSelect
                    id="settings-time-format"
                    value={field.value === false ? '12h' : '24h'}
                    onChange={(e) => field.onChange(e.target.value === '24h')}
                    disabled={mutation.isPending}
                  >
                    <option value="24h">{t.settings.timeFormat24h}</option>
                    <option value="12h">{t.settings.timeFormat12h}</option>
                  </NativeSelect>
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
    </div>
  )
}
