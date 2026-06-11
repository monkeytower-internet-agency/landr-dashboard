// Extracted from BookingCustomerPage.tsx (landr-v9e4.9 — pure-helper extraction).
// BriefingEditor lives here; BookingCustomerPage imports it.

import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import {
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
  BRIEFING_TONES,
  findDay,
  patchBriefing,
  rotateBriefingToken,
  whatsappShareUrl,
  type Briefing,
  type BriefingPatch,
  type BriefingTone,
} from '@/lib/booking-briefing'
import { t } from '@/lib/strings'
import { DayCard } from './BriefingDayCard'

const BRIEFING_QUERY_KEY = 'booking-briefing'

// eslint-disable-next-line react-refresh/only-export-components
export function briefingQueryKey(operatorId: string, bookingId: string): readonly [string, string, string] {
  return [BRIEFING_QUERY_KEY, operatorId, bookingId] as const
}

const TONE_LABELS: Record<BriefingTone, string> = {
  playful: t.bookings.briefing.toneOptionPlayful,
  calm: t.bookings.briefing.toneOptionCalm,
  minimal: t.bookings.briefing.toneOptionMinimal,
}

export type BriefingEditorProps = {
  operatorId: string
  bookingId: string
  briefing: Briefing
  days: string[]
  customerPhone?: string | null
  invalidate: () => void
  /** landr-znzz.7 — whether weather forecast hint is enabled for this operator. */
  weatherEnabled: boolean
}

export function BriefingEditor({
  operatorId,
  bookingId,
  briefing,
  days,
  customerPhone,
  invalidate,
  weatherEnabled,
}: BriefingEditorProps) {
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
                  weatherEnabled={weatherEnabled}
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
