// Extracted from BookingCustomerPage.tsx (landr-v9e4.9 — pure-helper extraction).
// DayCard + WeatherHint live here; BookingCustomerPage imports them.

import { useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckCircle2Icon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  BRIEFING_CONDITIONS,
  putBriefingDay,
  type BriefingConditionsStatus,
  type BriefingDay,
  type BriefingDayPatch,
} from '@/lib/booking-briefing'
import {
  fetchWeatherForecast,
  type WeatherForecast,
} from '@/lib/operatorSettings'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

// Chip colour per verdict — green go, amber marginal, red no-go, neutral
// pending. Selected state inverts to a solid fill.
const CONDITION_CHIP: Record<
  BriefingConditionsStatus,
  { idle: string; active: string }
> = {
  pending: {
    idle: 'border-border text-muted-foreground hover:bg-secondary',
    active: 'border-foreground bg-secondary text-foreground',
  },
  go: {
    idle: 'border-emerald-300 text-emerald-700 hover:bg-emerald-50 dark:border-emerald-800 dark:text-emerald-400 dark:hover:bg-emerald-950',
    active: 'border-emerald-600 bg-emerald-600 text-white',
  },
  marginal: {
    idle: 'border-amber-300 text-amber-700 hover:bg-amber-50 dark:border-amber-800 dark:text-amber-400 dark:hover:bg-amber-950',
    active: 'border-amber-500 bg-amber-500 text-white',
  },
  no_go: {
    idle: 'border-red-300 text-red-700 hover:bg-red-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-950',
    active: 'border-red-600 bg-red-600 text-white',
  },
}

const CONDITION_LABELS: Record<BriefingConditionsStatus, string> = {
  pending: t.bookings.briefing.conditionPending,
  go: t.bookings.briefing.conditionGo,
  marginal: t.bookings.briefing.conditionMarginal,
  no_go: t.bookings.briefing.conditionNoGo,
}

export type DayCardProps = {
  operatorId: string
  bookingId: string
  day: string
  existing: BriefingDay | null
  invalidate: () => void
  /** landr-znzz.7 — show forecast hint next to conditions chips when true. */
  weatherEnabled: boolean
}

export function DayCard({
  operatorId,
  bookingId,
  day,
  existing,
  invalidate,
  weatherEnabled,
}: DayCardProps) {
  // Seeds reflect the server row at mount; the parent remounts this card
  // (key includes the row's updated_at) on any server-side change, so no
  // re-sync effect is needed.
  const [status, setStatus] = useState<BriefingConditionsStatus>(
    existing?.conditions_status ?? 'pending',
  )
  const [conditionsNote, setConditionsNote] = useState(
    existing?.conditions_note ?? '',
  )
  const [planHeadline, setPlanHeadline] = useState(existing?.plan_headline ?? '')
  const [planDetail, setPlanDetail] = useState(existing?.plan_detail ?? '')
  const [meetingPoint, setMeetingPoint] = useState(
    existing?.meeting_point_text ?? '',
  )

  const dayMutation = useMutation({
    mutationFn: (patch: BriefingDayPatch) =>
      putBriefingDay(operatorId, bookingId, day, patch),
    onSuccess: () => invalidate(),
    onError: (err: Error) =>
      toast.error(t.bookings.briefing.daySaveToastError, {
        description: err.message,
      }),
  })

  // landr-znzz.7 — weather forecast hint. Only fetched when operator has
  // weather opt-in enabled. The verdict stays manual — this is informational.
  const weatherQuery = useQuery<WeatherForecast>({
    queryKey: ['weather-forecast', operatorId, day],
    queryFn: () => fetchWeatherForecast(operatorId, day),
    enabled: weatherEnabled,
    staleTime: 10 * 60 * 1000, // 10 min — forecasts don't change that fast
    retry: false, // graceful — don't spam a flaky provider
  })

  const published = existing?.is_published ?? false

  const dirty =
    status !== (existing?.conditions_status ?? 'pending') ||
    conditionsNote !== (existing?.conditions_note ?? '') ||
    planHeadline !== (existing?.plan_headline ?? '') ||
    planDetail !== (existing?.plan_detail ?? '') ||
    meetingPoint !== (existing?.meeting_point_text ?? '')

  function saveDay() {
    if (!dirty || dayMutation.isPending) return
    dayMutation.mutate(
      {
        conditions_status: status,
        conditions_note: conditionsNote.trim() || null,
        plan_headline: planHeadline.trim() || null,
        plan_detail: planDetail.trim() || null,
        meeting_point_text: meetingPoint.trim() || null,
      },
      {
        onSuccess: () =>
          toast.success(t.bookings.briefing.daySaveToastSuccess(day)),
      },
    )
  }

  // Per-day publish toggle saves immediately. The verdict + plan are saved
  // alongside so toggling publish never strands unsaved edits.
  function togglePublish(next: boolean) {
    if (dayMutation.isPending) return
    dayMutation.mutate(
      {
        conditions_status: status,
        conditions_note: conditionsNote.trim() || null,
        plan_headline: planHeadline.trim() || null,
        plan_detail: planDetail.trim() || null,
        meeting_point_text: meetingPoint.trim() || null,
        is_published: next,
      },
      {
        onSuccess: () =>
          toast.success(t.bookings.briefing.daySaveToastSuccess(day)),
      },
    )
  }

  return (
    <div
      className="flex flex-col gap-3 rounded-md border p-3"
      data-testid={`briefing-day-${day}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-semibold">{day}</span>
        {published ? (
          <span className="text-muted-foreground inline-flex items-center gap-1 text-xs">
            <CheckCircle2Icon className="size-3.5 text-emerald-600" />
            {t.bookings.briefing.dayPublishLabel}
          </span>
        ) : null}
      </div>

      {/* Conditions verdict chips */}
      <div className="flex flex-col gap-1.5">
        <span className="text-muted-foreground text-xs font-medium">
          {t.bookings.briefing.dayConditionsLabel}
        </span>
        <div className="flex flex-wrap gap-1.5" role="group">
          {BRIEFING_CONDITIONS.map((c) => {
            const active = status === c
            const palette = CONDITION_CHIP[c]
            return (
              <button
                key={c}
                type="button"
                onClick={() => setStatus(c)}
                disabled={dayMutation.isPending}
                aria-pressed={active}
                data-testid={`briefing-day-${day}-condition-${c}`}
                className={cn(
                  'rounded-full border px-3 py-1 text-xs font-medium transition-colors disabled:opacity-50',
                  active ? palette.active : palette.idle,
                )}
              >
                {CONDITION_LABELS[c]}
              </button>
            )
          })}
        </div>
        {/* landr-znzz.7 — weather forecast hint (informs, never decides) */}
        {weatherEnabled && (
          <WeatherHint
            forecast={weatherQuery.data ?? null}
            isLoading={weatherQuery.isPending}
          />
        )}
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`day-${day}-conditions-note`}>
          {t.bookings.briefing.dayConditionsNoteLabel}
        </Label>
        <Textarea
          id={`day-${day}-conditions-note`}
          value={conditionsNote}
          onChange={(e) => setConditionsNote(e.target.value)}
          placeholder={t.bookings.briefing.dayConditionsNotePlaceholder}
          disabled={dayMutation.isPending}
          rows={2}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`day-${day}-plan-headline`}>
          {t.bookings.briefing.dayPlanHeadlineLabel}
        </Label>
        <Input
          id={`day-${day}-plan-headline`}
          value={planHeadline}
          onChange={(e) => setPlanHeadline(e.target.value)}
          placeholder={t.bookings.briefing.dayPlanHeadlinePlaceholder}
          disabled={dayMutation.isPending}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`day-${day}-plan-detail`}>
          {t.bookings.briefing.dayPlanDetailLabel}
        </Label>
        <Textarea
          id={`day-${day}-plan-detail`}
          value={planDetail}
          onChange={(e) => setPlanDetail(e.target.value)}
          placeholder={t.bookings.briefing.dayPlanDetailPlaceholder}
          disabled={dayMutation.isPending}
          rows={3}
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <Label htmlFor={`day-${day}-meeting-point`}>
          {t.bookings.briefing.dayMeetingPointLabel}
        </Label>
        <Textarea
          id={`day-${day}-meeting-point`}
          value={meetingPoint}
          onChange={(e) => setMeetingPoint(e.target.value)}
          placeholder={t.bookings.briefing.dayMeetingPointPlaceholder}
          disabled={dayMutation.isPending}
          rows={2}
        />
      </div>

      <label className="flex items-start gap-2">
        <Checkbox
          checked={published}
          onChange={(e) => togglePublish(e.target.checked)}
          disabled={dayMutation.isPending}
          data-testid={`briefing-day-${day}-publish`}
          className="mt-0.5"
        />
        <span className="flex flex-col gap-0.5">
          <span className="text-sm font-medium">
            {t.bookings.briefing.dayPublishLabel}
          </span>
          <span className="text-muted-foreground text-xs">
            {t.bookings.briefing.dayPublishHint}
          </span>
        </span>
      </label>

      <div className="flex justify-end">
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={saveDay}
          disabled={!dirty || dayMutation.isPending}
          data-testid={`briefing-day-${day}-save`}
        >
          {dayMutation.isPending
            ? t.bookings.briefing.daySaving
            : t.bookings.briefing.daySave}
        </Button>
      </div>
    </div>
  )
}

// ============================================================================
// WeatherHint
//
// Informs (never decides). Shows the forecast hint from the API next to the
// conditions chips. Three states:
//   * loading  — subtle spinner text
//   * error    — silent (provider failure is graceful; we don't alarm the guide)
//   * hint     — compact one-line summary from the API
// ============================================================================

type WeatherHintProps = {
  forecast: WeatherForecast | null
  isLoading: boolean
}

export function WeatherHint({ forecast, isLoading }: WeatherHintProps) {
  if (isLoading) {
    return (
      <span
        className="text-muted-foreground text-xs italic"
        data-testid="weather-hint-loading"
      >
        {t.weatherSettings.forecastHintLoading}
      </span>
    )
  }

  if (!forecast || !forecast.enabled) return null

  // Graceful: provider down or disabled — show nothing
  if ('error' in forecast) return null

  return (
    <span
      className="text-muted-foreground inline-flex items-center gap-1 text-xs"
      data-testid="weather-hint"
      title={t.weatherSettings.forecastHintLabel}
    >
      <span aria-hidden="true">☀️</span>
      {forecast.hint}
    </span>
  )
}
