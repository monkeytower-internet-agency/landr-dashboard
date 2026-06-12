// landr-5f8q — chronological history view for the BookingDetailSheet
// "Timeline" tab. Reads from audit_log + payments + outbound_emails via
// fetchBookingTimeline(). Pure-presentation: all event synthesis lives in
// src/lib/bookings.ts so this component stays testable in isolation.

import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query'
import {
  CalendarPlus,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  CircleSlash,
  CreditCard,
  Hotel,
  Mail,
  RotateCw,
  XCircle,
  type LucideIcon,
} from 'lucide-react'
import { useState, type ReactNode } from 'react'
import { toast } from 'sonner'

import {
  fetchBookingTimeline,
  type BookingRow,
  type TimelineEmail,
  type TimelineEvent,
  type TimelineEventKind,
} from '@/lib/bookings'
import { resendEmail } from '@/lib/outbound-emails'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { ResendDialog } from '@/components/email/ResendDialog'
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

type Props = {
  booking: BookingRow
}

const ICON_BY_KIND: Record<TimelineEventKind, LucideIcon> = {
  created: CalendarPlus,
  stage_changed: CircleDot,
  approved: CheckCircle2,
  rejected: XCircle,
  hotel_confirmed: Hotel,
  hotel_declined: Hotel,
  paid: CreditCard,
  cancelled: CircleSlash,
  finalised: CheckCircle2,
  rescheduled: CalendarPlus,
  email_sent: Mail,
}

const TONE_BY_KIND: Record<TimelineEventKind, string> = {
  created: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  stage_changed:
    'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
  approved:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  rejected: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  hotel_confirmed:
    'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  hotel_declined: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  paid: 'bg-emerald-100 text-emerald-900 dark:bg-emerald-900/40 dark:text-emerald-200',
  cancelled: 'bg-red-100 text-red-900 dark:bg-red-900/40 dark:text-red-200',
  finalised: 'bg-sky-100 text-sky-900 dark:bg-sky-900/40 dark:text-sky-200',
  rescheduled:
    'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200',
  email_sent:
    'bg-slate-100 text-slate-900 dark:bg-slate-800 dark:text-slate-200',
}

const _timestampFormatter = new Intl.DateTimeFormat('en-IE', {
  year: 'numeric',
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
})

function formatTimestamp(iso: string): string {
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  return _timestampFormatter.format(d)
}

export function BookingTimeline({ booking }: Props): ReactNode {
  const queryClient = useQueryClient()
  const { currentOperatorId } = useOperator()
  const timelineQueryKey = ['bookings', booking.id, 'timeline']

  const query = useQuery<TimelineEvent[]>({
    // Keyed under ['bookings', id, 'timeline'] so the shared
    // invalidateBookingCaches() helper (['bookings']) automatically wipes
    // the timeline when any write touches this booking.
    queryKey: timelineQueryKey,
    queryFn: () => fetchBookingTimeline(booking.id, booking),
    staleTime: 30_000,
  })

  // Invalidate the timeline so a freshly-resent email appears as a new event.
  function invalidateTimeline() {
    void queryClient.invalidateQueries({ queryKey: timelineQueryKey })
  }

  if (query.isPending) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="booking-timeline-loading"
      >
        {t.bookings.timeline.loading}
      </p>
    )
  }

  if (query.isError) {
    return (
      <p
        className="text-destructive text-sm"
        role="alert"
        data-testid="booking-timeline-error"
      >
        {t.bookings.timeline.error}
      </p>
    )
  }

  const events = query.data ?? []
  if (events.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm italic"
        data-testid="booking-timeline-empty"
      >
        {t.bookings.timeline.empty}
      </p>
    )
  }

  return (
    <ol
      className="flex flex-col gap-3"
      aria-label={t.bookings.timeline.tabTimeline}
      data-testid="booking-timeline"
    >
      {events.map((evt) => {
        const Icon = ICON_BY_KIND[evt.kind] ?? CircleDot
        const tone = TONE_BY_KIND[evt.kind] ?? 'bg-muted text-muted-foreground'
        return (
          <li
            key={evt.id}
            className="flex items-start gap-3"
            data-event-kind={evt.kind}
          >
            <span
              className={cn(
                'mt-0.5 inline-flex size-7 shrink-0 items-center justify-center rounded-full',
                tone,
              )}
              aria-hidden
            >
              <Icon className="size-3.5" />
            </span>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <div className="flex items-baseline justify-between gap-2">
                <span className="text-sm font-medium">{evt.label}</span>
                <time
                  className="text-muted-foreground shrink-0 text-xs"
                  dateTime={evt.occurredAt}
                >
                  {formatTimestamp(evt.occurredAt)}
                </time>
              </div>
              {evt.detail ? (
                <span className="text-muted-foreground text-xs">
                  {evt.detail}
                </span>
              ) : null}
              {/* landr-33r3 — per-email actions: preview-first, then resend. */}
              {evt.kind === 'email_sent' && evt.email ? (
                <EmailEventActions
                  email={evt.email}
                  operatorId={currentOperatorId}
                  onSent={invalidateTimeline}
                />
              ) : null}
            </div>
          </li>
        )
      })}
    </ol>
  )
}

const _previewIframeTitle = t.bookings.timeline.email.previewBodyHtmlTitle

/**
 * landr-33r3 — preview + resend actions for an email timeline event.
 *
 * Clicking the row expands a sandboxed preview of the sent email (subject +
 * iframe srcDoc body_html + body_text fallback — mirrors EmailLog's body
 * rendering). Two actions:
 *   - "Send exactly this email" → confirm dialog summarising to/subject, then
 *     POST resend with an EMPTY body (verbatim copy via the landr-2js5 endpoint).
 *   - "Modify & send" → the shared ResendDialog prefilled with the row.
 * After either send the parent invalidates the timeline query so the new
 * email event appears.
 */
function EmailEventActions({
  email,
  operatorId,
  onSent,
}: {
  email: TimelineEmail
  operatorId: string | null
  onSent: () => void
}): ReactNode {
  const [expanded, setExpanded] = useState(false)
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [modifyOpen, setModifyOpen] = useState(false)

  // The operator that owns the email row (falls back to the active operator).
  const opId = operatorId ?? email.operatorId

  const exactResend = useMutation({
    // Empty payload → the endpoint copies the source row verbatim.
    mutationFn: () => resendEmail(opId, email.id, {}),
    onSuccess: () => {
      toast.success(t.bookings.timeline.email.toastSuccess)
      setConfirmOpen(false)
      onSent()
    },
    onError: (err: Error) => {
      toast.error(t.bookings.timeline.email.toastError, {
        description: err.message,
      })
    },
  })

  return (
    <div className="mt-1 flex flex-col gap-2">
      {email.resentFromId ? (
        <span
          className="text-muted-foreground text-xs italic"
          data-testid="timeline-email-resent-note"
        >
          {t.bookings.timeline.email.resentNote(email.resentFromId)}
        </span>
      ) : null}

      <button
        type="button"
        className="text-muted-foreground hover:text-foreground flex items-center gap-1 self-start text-xs font-medium"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        data-testid="timeline-email-preview-toggle"
      >
        <ChevronDown
          className={cn('size-3.5 transition-transform', expanded && 'rotate-180')}
          aria-hidden
        />
        {expanded
          ? t.bookings.timeline.email.collapse
          : t.bookings.timeline.email.expand}
      </button>

      {expanded ? (
        <div
          className="flex flex-col gap-3 rounded-md border p-3"
          data-testid="timeline-email-preview"
        >
          <div className="flex flex-col gap-0.5">
            <span className="text-muted-foreground text-xs font-semibold uppercase tracking-wide">
              {t.bookings.timeline.email.previewSubjectLabel}
            </span>
            <span className="text-sm font-medium break-words">
              {email.subject || '—'}
            </span>
          </div>

          <section>
            <h4 className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wide">
              {t.bookings.timeline.email.previewBodyHtmlLabel}
            </h4>
            <iframe
              title={_previewIframeTitle}
              srcDoc={email.bodyHtml}
              sandbox=""
              className="bg-background h-56 w-full rounded-md border"
              data-testid="timeline-email-iframe"
            />
          </section>

          <section>
            <h4 className="text-muted-foreground mb-1 text-xs font-semibold uppercase tracking-wide">
              {t.bookings.timeline.email.previewBodyTextLabel}
            </h4>
            <pre className="bg-muted/40 max-h-56 overflow-auto rounded-md border p-3 text-xs whitespace-pre-wrap">
              {email.bodyText || '—'}
            </pre>
          </section>

          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setConfirmOpen(true)}
              data-testid="timeline-email-send-exact"
            >
              <RotateCw className="size-4" />
              {t.bookings.timeline.email.sendExact}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => setModifyOpen(true)}
              data-testid="timeline-email-modify"
            >
              <Mail className="size-4" />
              {t.bookings.timeline.email.modifyAndSend}
            </Button>
          </div>
        </div>
      ) : null}

      {/* "Send exactly this email" confirm dialog — summarises to/subject. */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent data-testid="timeline-email-confirm">
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.bookings.timeline.email.confirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {t.bookings.timeline.email.confirmDescription}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
            <dt className="text-muted-foreground">
              {t.bookings.timeline.email.confirmToLabel}
            </dt>
            <dd className="break-words font-medium">{email.toAddress || '—'}</dd>
            <dt className="text-muted-foreground">
              {t.bookings.timeline.email.confirmSubjectLabel}
            </dt>
            <dd className="break-words font-medium">{email.subject || '—'}</dd>
          </dl>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={exactResend.isPending}>
              {t.bookings.timeline.email.confirmCancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                // Keep the dialog open until the mutation settles.
                e.preventDefault()
                exactResend.mutate()
              }}
              disabled={exactResend.isPending}
              data-testid="timeline-email-confirm-send"
            >
              {exactResend.isPending
                ? t.bookings.timeline.email.confirmSending
                : t.bookings.timeline.email.confirmSend}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* "Modify & send" — shared ResendDialog prefilled with the row. */}
      <ResendDialog
        source={{
          id: email.id,
          to_address: email.toAddress,
          subject: email.subject,
          body_html: email.bodyHtml,
          body_text: email.bodyText,
        }}
        operatorId={opId}
        open={modifyOpen}
        onOpenChange={setModifyOpen}
        onResent={onSent}
      />
    </div>
  )
}
