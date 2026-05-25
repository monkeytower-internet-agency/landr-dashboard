// landr-znzz.2 — "Customer page" tab inside BookingDetailSheet.
//
// Lets the guide (Martin) customise the customer-facing briefing ("event")
// page for a booking:
//   * a private share link (copy / WhatsApp / preview) + reset-link action
//   * a Publish toggle (the whole page is private until published)
//   * page content: title, welcome note, tone, review nudge
//   * a per-day "tonight's update": conditions verdict + plan + meeting point,
//     each with its own Publish toggle (the nightly-update workflow)
//
// Pickup times/locations are NOT edited here — they live in the day /
// attendance editor and surface on the page automatically. The hint copy
// makes that explicit.
//
// Data flow mirrors the other booking tabs: one TanStack Query keyed on
// (operator, booking) for the briefing, and mutations that invalidate it.
// PUT /days returns only the single day row, so day mutations invalidate the
// whole briefing query to fold the change back in.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
  CheckCircle2Icon,
  ExternalLinkIcon,
  LinkIcon,
  MessageCircleIcon,
  RotateCcwIcon,
} from 'lucide-react'

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
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import { Textarea } from '@/components/ui/textarea'
import {
  BRIEFING_CONDITIONS,
  BRIEFING_TONES,
  createBriefing,
  fetchBriefing,
  findDay,
  patchBriefing,
  putBriefingDay,
  rotateBriefingToken,
  whatsappShareUrl,
  type Briefing,
  type BriefingConditionsStatus,
  type BriefingDayPatch,
  type BriefingPatch,
  type BriefingTone,
} from '@/lib/booking-briefing'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'

type Props = {
  operatorId: string
  bookingId: string
  /** Distinct booking-days (ISO YYYY-MM-DD, sorted) derived by the parent
   *  from the booking's line items via bookingDayOptions(). */
  days: string[]
  /** Customer phone (E.164-ish) for the WhatsApp deep-link, if known. */
  customerPhone?: string | null
}

const BRIEFING_QUERY_KEY = 'booking-briefing'

function briefingQueryKey(operatorId: string, bookingId: string) {
  return [BRIEFING_QUERY_KEY, operatorId, bookingId] as const
}

const TONE_LABELS: Record<BriefingTone, string> = {
  playful: t.bookings.briefing.toneOptionPlayful,
  calm: t.bookings.briefing.toneOptionCalm,
  minimal: t.bookings.briefing.toneOptionMinimal,
}

const CONDITION_LABELS: Record<BriefingConditionsStatus, string> = {
  pending: t.bookings.briefing.conditionPending,
  go: t.bookings.briefing.conditionGo,
  marginal: t.bookings.briefing.conditionMarginal,
  no_go: t.bookings.briefing.conditionNoGo,
}

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

export function BookingCustomerPage({
  operatorId,
  bookingId,
  days,
  customerPhone,
}: Props) {
  const queryClient = useQueryClient()

  const briefingQuery = useQuery({
    queryKey: briefingQueryKey(operatorId, bookingId),
    queryFn: () => fetchBriefing(operatorId, bookingId),
    enabled: !!operatorId && !!bookingId,
  })

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: briefingQueryKey(operatorId, bookingId),
    })

  const createMutation = useMutation({
    mutationFn: () => createBriefing(operatorId, bookingId),
    onSuccess: (created) => {
      queryClient.setQueryData(
        briefingQueryKey(operatorId, bookingId),
        created,
      )
    },
    onError: (err: Error) =>
      toast.error(t.bookings.briefing.createError, {
        description: err.message,
      }),
  })

  // ---- loading / error / empty states ----
  if (briefingQuery.isPending) {
    return (
      <p className="text-muted-foreground text-xs italic">
        {t.bookings.briefing.loading}
      </p>
    )
  }
  if (briefingQuery.isError) {
    return (
      <p className="text-destructive text-xs" role="alert">
        {briefingQuery.error?.message ?? t.bookings.briefing.loadError}
      </p>
    )
  }

  const briefing = briefingQuery.data
  if (!briefing) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.bookings.briefing.emptyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground text-sm">
            {t.bookings.briefing.emptyBody}
          </p>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            data-testid="briefing-create"
          >
            {createMutation.isPending
              ? t.bookings.briefing.createWorking
              : t.bookings.briefing.createAction}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    // Keyed on updated_at so any server-side change to the briefing row
    // (rotate-token refetch, a PATCH, another operator's edit) remounts the
    // editor and reseeds its useState drafts — the repo's no-useEffect
    // reseed convention (see StaffEditSheet), which dodges the
    // react-hooks/set-state-in-effect rule and the cascading-render hazard.
    <BriefingEditor
      key={briefing.updated_at}
      operatorId={operatorId}
      bookingId={bookingId}
      briefing={briefing}
      days={days}
      customerPhone={customerPhone}
      invalidate={invalidate}
    />
  )
}

type EditorProps = {
  operatorId: string
  bookingId: string
  briefing: Briefing
  days: string[]
  customerPhone?: string | null
  invalidate: () => void
}

function BriefingEditor({
  operatorId,
  bookingId,
  briefing,
  days,
  customerPhone,
  invalidate,
}: EditorProps) {
  const queryClient = useQueryClient()
  const [showRotate, setShowRotate] = useState(false)

  // ---- content draft (explicit Save, like the Notes/Details tabs) ----
  const [title, setTitle] = useState(briefing.title ?? '')
  const [welcome, setWelcome] = useState(briefing.welcome_note ?? '')
  const [tone, setTone] = useState<string>(briefing.tone || 'playful')
  const [showReviews, setShowReviews] = useState(briefing.show_reviews)
  const [reviewUrl, setReviewUrl] = useState(briefing.review_url ?? '')

  // No re-sync effect: the parent remounts this component (key={updated_at})
  // whenever the briefing row changes server-side, so the useState seeds
  // above always reflect the latest row. See the comment at the call site.

  const patchMutation = useMutation({
    mutationFn: (patch: BriefingPatch) =>
      patchBriefing(operatorId, bookingId, patch),
    onSuccess: (updated) => {
      queryClient.setQueryData(
        briefingQueryKey(operatorId, bookingId),
        updated,
      )
    },
    onError: (err: Error) =>
      toast.error(t.bookings.briefing.saveToastError, {
        description: err.message,
      }),
  })

  const rotateMutation = useMutation({
    mutationFn: () => rotateBriefingToken(operatorId, bookingId),
    onSuccess: (row) => {
      // rotate-token returns the row WITHOUT days — fold the new token into
      // the cached briefing, preserving the existing day cards.
      queryClient.setQueryData<Briefing | null>(
        briefingQueryKey(operatorId, bookingId),
        (prev) => (prev ? { ...prev, ...row, days: prev.days } : prev),
      )
      setShowRotate(false)
      toast.success(t.bookings.briefing.rotateToastSuccess)
    },
    onError: (err: Error) =>
      toast.error(t.bookings.briefing.rotateToastError, {
        description: err.message,
      }),
  })

  const contentDirty =
    title !== (briefing.title ?? '') ||
    welcome !== (briefing.welcome_note ?? '') ||
    tone !== (briefing.tone || 'playful') ||
    showReviews !== briefing.show_reviews ||
    reviewUrl !== (briefing.review_url ?? '')

  function saveContent() {
    if (!contentDirty || patchMutation.isPending) return
    patchMutation.mutate(
      {
        title: title.trim() || null,
        welcome_note: welcome.trim() || null,
        tone,
        show_reviews: showReviews,
        review_url: reviewUrl.trim() || null,
      },
      {
        onSuccess: () => toast.success(t.bookings.briefing.saveToastSuccess),
      },
    )
  }

  // Publish toggle saves immediately (independent of the content Save button)
  // so the most consequential action is one click — mirrors the tag/charge
  // toggles elsewhere in the sheet.
  function togglePublish(next: boolean) {
    if (patchMutation.isPending) return
    patchMutation.mutate(
      { is_published: next },
      {
        onSuccess: () => toast.success(t.bookings.briefing.saveToastSuccess),
      },
    )
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(briefing.public_url)
      toast.success(t.bookings.briefing.copyToastSuccess)
    } catch {
      toast.error(t.bookings.briefing.copyToastError)
    }
  }

  const waUrl = whatsappShareUrl(
    briefing.public_url,
    t.bookings.briefing.whatsappGreeting,
    customerPhone,
  )

  return (
    <>
      {/* Share / publish */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.bookings.briefing.shareTitle}
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {t.bookings.briefing.shareHint}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <Input
              readOnly
              value={briefing.public_url}
              aria-label={t.bookings.briefing.shareTitle}
              data-testid="briefing-public-url"
              className="font-mono text-xs"
              onFocus={(e) => e.currentTarget.select()}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={copyLink}
              data-testid="briefing-copy"
            >
              <LinkIcon className="size-3.5" />
              {t.bookings.briefing.copyLink}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              asChild
              data-testid="briefing-whatsapp"
            >
              <a href={waUrl} target="_blank" rel="noopener noreferrer">
                <MessageCircleIcon className="size-3.5" />
                {t.bookings.briefing.shareWhatsApp}
              </a>
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              asChild
              data-testid="briefing-preview"
            >
              <a
                href={briefing.public_url}
                target="_blank"
                rel="noopener noreferrer"
              >
                <ExternalLinkIcon className="size-3.5" />
                {t.bookings.briefing.openPreview}
              </a>
            </Button>
          </div>

          {/* Publish toggle */}
          <label className="flex items-start gap-2 rounded-md border p-3">
            <Checkbox
              checked={briefing.is_published}
              onChange={(e) => togglePublish(e.target.checked)}
              disabled={patchMutation.isPending}
              data-testid="briefing-publish"
              className="mt-0.5"
            />
            <span className="flex flex-col gap-0.5">
              <span className="text-sm font-medium">
                {t.bookings.briefing.publishLabel}
              </span>
              <span className="text-muted-foreground text-xs">
                {briefing.is_published
                  ? t.bookings.briefing.publishHintOn
                  : t.bookings.briefing.publishHintOff}
              </span>
            </span>
          </label>
        </CardContent>
      </Card>

      {/* Content */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.bookings.briefing.contentTitle}
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {t.bookings.briefing.contentHint}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="briefing-title">
              {t.bookings.briefing.fieldTitle}
            </Label>
            <Input
              id="briefing-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder={t.bookings.briefing.fieldTitlePlaceholder}
              disabled={patchMutation.isPending}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="briefing-welcome">
              {t.bookings.briefing.fieldWelcome}
            </Label>
            <Textarea
              id="briefing-welcome"
              value={welcome}
              onChange={(e) => setWelcome(e.target.value)}
              placeholder={t.bookings.briefing.fieldWelcomePlaceholder}
              disabled={patchMutation.isPending}
              rows={4}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="briefing-tone">
              {t.bookings.briefing.fieldTone}
            </Label>
            <NativeSelect
              id="briefing-tone"
              value={tone}
              onChange={(e) => setTone(e.target.value)}
              disabled={patchMutation.isPending}
              data-testid="briefing-tone"
            >
              {BRIEFING_TONES.map((tn) => (
                <option key={tn} value={tn}>
                  {TONE_LABELS[tn]}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Review nudge */}
          <div className="flex flex-col gap-2 rounded-md border p-3">
            <span className="text-sm font-medium">
              {t.bookings.briefing.reviewTitle}
            </span>
            <label className="flex items-center gap-2">
              <Checkbox
                checked={showReviews}
                onChange={(e) => setShowReviews(e.target.checked)}
                disabled={patchMutation.isPending}
                data-testid="briefing-show-reviews"
              />
              <span className="text-sm">
                {t.bookings.briefing.reviewShowLabel}
              </span>
            </label>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="briefing-review-url">
                {t.bookings.briefing.reviewUrlLabel}
              </Label>
              <Input
                id="briefing-review-url"
                type="url"
                value={reviewUrl}
                onChange={(e) => setReviewUrl(e.target.value)}
                placeholder={t.bookings.briefing.reviewUrlPlaceholder}
                disabled={patchMutation.isPending || !showReviews}
              />
            </div>
          </div>

          <div className="flex justify-end">
            <Button
              type="button"
              onClick={saveContent}
              disabled={!contentDirty || patchMutation.isPending}
              data-testid="briefing-save"
            >
              {patchMutation.isPending
                ? t.bookings.briefing.saving
                : t.bookings.briefing.save}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Daily updates */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.bookings.briefing.daysTitle}
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {t.bookings.briefing.daysHint}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {days.length === 0 ? (
            <p className="text-muted-foreground text-xs italic">
              {t.bookings.briefing.daysEmpty}
            </p>
          ) : (
            days.map((day) => {
              const existing = findDay(briefing, day)
              // Remount the day body whenever its server row changes so its
              // useState drafts reseed without a useEffect (repo convention;
              // dodges react-hooks/set-state-in-effect). The "__none__"
              // sentinel covers the not-yet-created case.
              const dayKey = existing?.updated_at ?? `__none__:${day}`
              return (
                <DayCard
                  key={`${day}:${dayKey}`}
                  operatorId={operatorId}
                  bookingId={bookingId}
                  day={day}
                  existing={existing}
                  invalidate={invalidate}
                />
              )
            })
          )}
        </CardContent>
      </Card>

      {/* Reset link */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.bookings.briefing.rotateTitle}
          </CardTitle>
          <p className="text-muted-foreground text-xs">
            {t.bookings.briefing.rotateHint}
          </p>
        </CardHeader>
        <CardContent>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowRotate(true)}
            disabled={rotateMutation.isPending}
            data-testid="briefing-rotate"
          >
            <RotateCcwIcon className="size-3.5" />
            {t.bookings.briefing.rotateAction}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={showRotate} onOpenChange={setShowRotate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.bookings.briefing.rotateConfirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.bookings.briefing.rotateConfirmBody}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotateMutation.isPending}>
              {t.bookings.briefing.rotateConfirmCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault()
                rotateMutation.mutate()
              }}
              disabled={rotateMutation.isPending}
              data-testid="briefing-rotate-confirm"
            >
              {rotateMutation.isPending
                ? t.bookings.briefing.rotateWorking
                : t.bookings.briefing.rotateConfirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

type DayCardProps = {
  operatorId: string
  bookingId: string
  day: string
  existing: BriefingDay | null
  invalidate: () => void
}

function DayCard({
  operatorId,
  bookingId,
  day,
  existing,
  invalidate,
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
