/**
 * Settings → Email log (landr-qg4q, landr-0xo6).
 *
 * Read-only operator surface that surfaces the outbound_emails queue.
 * Helps operators debug "why didn't the customer get the email" without
 * having to open Supabase Studio. Direct REST read (RLS-scoped); resend
 * mutations go through FastAPI (landr-2js5 contract).
 *
 * UI:
 *   - status filter chips (queued/sending/sent/failed) — toggle to OR.
 *     Empty selection = all statuses.
 *   - newest-first table of subject / recipient / status / sent_at.
 *   - click a row → drawer with body_html + body_text + last_error.
 *   - drawer has Resend button (terminal rows) → edit-and-resend dialog.
 *   - sent_via='dev_fallback' → amber 'Captured (dev)' badge + drawer note.
 */
import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'

import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { contactDateTime } from '@/lib/contacts'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  mobileSheetContent,
  mobileSheetHeader,
  mobileSheetBody,
} from '@/lib/mobile-sheet-classes'
import {
  fetchOutboundEmails,
  OUTBOUND_EMAIL_STATUSES,
  type OutboundEmailRow,
  type OutboundEmailStatus,
} from '@/lib/outbound-emails'
import { ResendDialog } from '@/components/email/ResendDialog'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { CountedFilterChip } from '@/components/ui/counted-filter-chip'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'

const STATUS_LABEL: Record<OutboundEmailStatus, string> = {
  queued: t.emailLog.statusLabels.queued,
  sending: t.emailLog.statusLabels.sending,
  sent: t.emailLog.statusLabels.sent,
  failed: t.emailLog.statusLabels.failed,
}

// Status badge palette — keep them low-contrast tints to stay aligned with
// the dashboard's recessed-table treatment (landr-z7t). The 'failed' tint
// uses destructive tokens so it pops in the row stream.
const STATUS_BADGE_CLASS: Record<OutboundEmailStatus, string> = {
  queued: 'bg-muted text-foreground/80',
  sending: 'bg-blue-100 text-blue-900 dark:bg-blue-900/40 dark:text-blue-100',
  sent: 'bg-green-100 text-green-900 dark:bg-green-900/40 dark:text-green-100',
  failed: 'bg-destructive/15 text-destructive dark:text-destructive',
}

// Terminal statuses: rows where resend is meaningful.
const TERMINAL_STATUSES: OutboundEmailStatus[] = ['sent', 'failed']

function StatusBadge({
  status,
  sentVia,
}: {
  status: OutboundEmailStatus
  sentVia?: 'gmail' | 'dev_fallback' | null
}) {
  // dev_fallback replaces the green Sent badge with an amber variant.
  if (status === 'sent' && sentVia === 'dev_fallback') {
    return (
      <span
        className="inline-flex items-center rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-100"
        data-testid="email-log-status-dev_fallback"
      >
        {t.emailLog.badgeCapturedDev}
      </span>
    )
  }

  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        STATUS_BADGE_CLASS[status],
      )}
      data-testid={`email-log-status-${status}`}
    >
      {STATUS_LABEL[status]}
    </span>
  )
}

// Convert a yyyy-mm-dd input value to a UTC ISO bound. Empty string → null
// so the fetcher omits the predicate entirely.
function toIsoStart(yyyyMmDd: string): string | undefined {
  if (!yyyyMmDd) return undefined
  return new Date(`${yyyyMmDd}T00:00:00.000Z`).toISOString()
}
function toIsoEnd(yyyyMmDd: string): string | undefined {
  if (!yyyyMmDd) return undefined
  return new Date(`${yyyyMmDd}T23:59:59.999Z`).toISOString()
}

export function EmailLog() {
  const { currentOperatorId } = useOperator()
  const { hour12 } = useOperatorCalendarPrefs()
  const [activeStatuses, setActiveStatuses] = useState<OutboundEmailStatus[]>(
    [],
  )
  const [sinceDate, setSinceDate] = useState<string>('')
  const [untilDate, setUntilDate] = useState<string>('')
  const [openRow, setOpenRow] = useState<OutboundEmailRow | null>(null)

  const sinceIso = useMemo(() => toIsoStart(sinceDate), [sinceDate])
  const untilIso = useMemo(() => toIsoEnd(untilDate), [untilDate])

  const queryKey = useMemo(
    () => [
      'outbound-emails',
      currentOperatorId ?? 'none',
      [...activeStatuses].sort().join(','),
      sinceIso ?? '',
      untilIso ?? '',
    ],
    [currentOperatorId, activeStatuses, sinceIso, untilIso],
  )

  const query = useQuery({
    queryKey,
    queryFn: () =>
      fetchOutboundEmails(currentOperatorId as string, {
        statuses: activeStatuses,
        sinceIso,
        untilIso,
      }),
    enabled: !!currentOperatorId,
  })

  const rows = useMemo(() => query.data ?? [], [query.data])

  // Per-status counts within the currently loaded result-set. Drives the
  // filter chip badges (CountedFilterChip disables itself when the count
  // is 0, so operators see at a glance which statuses are present).
  const statusCounts = useMemo(() => {
    const map: Record<OutboundEmailStatus, number> = {
      queued: 0,
      sending: 0,
      sent: 0,
      failed: 0,
    }
    for (const r of rows) map[r.status] = (map[r.status] ?? 0) + 1
    return map
  }, [rows])

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.emailLog },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.emailLog}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <header>
          <h1 className="text-xl font-semibold">{t.emailLog.title}</h1>
          <p className="text-muted-foreground text-sm">{t.emailLog.subtitle}</p>
        </header>
        <p className="text-muted-foreground text-sm">{t.emailLog.noOperator}</p>
      </div>
    )
  }

  function toggleStatus(s: OutboundEmailStatus) {
    setActiveStatuses((prev) =>
      prev.includes(s) ? prev.filter((x) => x !== s) : [...prev, s],
    )
  }

  function clearFilters() {
    setActiveStatuses([])
    setSinceDate('')
    setUntilDate('')
  }

  return (
    <div className="flex flex-col gap-6">
      {titleNode}
      <header>
        <h1 className="text-xl font-semibold">{t.emailLog.title}</h1>
        <p className="text-muted-foreground text-sm">{t.emailLog.subtitle}</p>
      </header>

      <div className="flex flex-wrap items-end gap-3">
        <div
          role="group"
          aria-label={t.emailLog.filtersLabel}
          className="flex flex-wrap gap-2"
        >
          {OUTBOUND_EMAIL_STATUSES.map((s) => (
            <CountedFilterChip
              key={s}
              label={STATUS_LABEL[s]}
              count={statusCounts[s] ?? 0}
              selected={activeStatuses.includes(s)}
              onToggle={() => toggleStatus(s)}
              testId={`email-log-filter-${s}`}
            />
          ))}
        </div>
        <div className="flex items-end gap-2">
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t.emailLog.fromLabel}
            <Input
              type="date"
              value={sinceDate}
              onChange={(e) => setSinceDate(e.target.value)}
              className="h-8 w-36"
              aria-label={t.emailLog.fromLabel}
            />
          </label>
          <label className="flex flex-col gap-1 text-xs text-muted-foreground">
            {t.emailLog.toLabel}
            <Input
              type="date"
              value={untilDate}
              onChange={(e) => setUntilDate(e.target.value)}
              className="h-8 w-36"
              aria-label={t.emailLog.toLabel}
            />
          </label>
          {(activeStatuses.length > 0 || sinceDate || untilDate) && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={clearFilters}
              className="h-8"
            >
              {t.emailLog.clearFilters}
            </Button>
          )}
        </div>
      </div>

      {query.isPending ? (
        <p className="text-muted-foreground text-sm">{t.emailLog.loading}</p>
      ) : query.isError ? (
        <p className="text-destructive text-sm">
          {t.emailLog.error}
          {query.error ? ` — ${(query.error as Error).message}` : ''}
        </p>
      ) : rows.length === 0 ? (
        <p className="text-muted-foreground text-sm">{t.emailLog.empty}</p>
      ) : (
        // landr-3qkr.6 — overflow-x-auto so the 5-column email log scrolls
        // horizontally inside its own container on a 360px phone instead of
        // being clipped by the page-level overflow-x-guard.
        <div className="overflow-x-auto rounded-md border">
          <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.emailLog.columnSubject}</TableHead>
              <TableHead>{t.emailLog.columnRecipient}</TableHead>
              <TableHead>{t.emailLog.columnStatus}</TableHead>
              <TableHead>{t.emailLog.columnSentAt}</TableHead>
              <TableHead>{t.emailLog.columnCreatedAt}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => (
              <TableRow
                key={row.id}
                onClick={() => setOpenRow(row)}
                tabIndex={0}
                role="button"
                aria-label={t.emailLog.rowAriaLabel(row.subject)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    setOpenRow(row)
                  }
                }}
                className="cursor-pointer"
              >
                <TableCell className="max-w-xs truncate font-medium">
                  {row.subject}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {row.to_address}
                </TableCell>
                <TableCell>
                  <StatusBadge status={row.status} sentVia={row.sent_via} />
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {contactDateTime(row.sent_at, { hour12 })}
                </TableCell>
                <TableCell className="text-muted-foreground text-xs">
                  {contactDateTime(row.created_at, { hour12 })}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
          </Table>
        </div>
      )}

      <EmailLogDrawer
        row={openRow}
        hour12={hour12}
        operatorId={currentOperatorId}
        emailLogQueryKey={queryKey}
        onOpenChange={(open) => {
          if (!open) setOpenRow(null)
        }}
      />
    </div>
  )
}

type DrawerProps = {
  row: OutboundEmailRow | null
  hour12: boolean
  operatorId: string
  emailLogQueryKey: readonly unknown[]
  onOpenChange: (open: boolean) => void
}

function EmailLogDrawer({
  row,
  hour12,
  operatorId,
  emailLogQueryKey,
  onOpenChange,
}: DrawerProps) {
  const open = row !== null
  const isMobile = useIsMobile()
  const queryClient = useQueryClient()
  const [resendOpen, setResendOpen] = useState(false)
  const isTerminal = row ? TERMINAL_STATUSES.includes(row.status) : false

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        {/* landr-3qkr.3 — full-screen below md. */}
        <SheetContent
          className={cn('w-full overflow-y-auto sm:max-w-2xl', mobileSheetContent)}
        >
          {/* landr-3qkr.3 — sticky header below md with notch clearance. */}
          <SheetHeader className={cn('p-4', isMobile && mobileSheetHeader)}>
            <SheetTitle>{row?.subject ?? ''}</SheetTitle>
            <SheetDescription>
              {row
                ? t.emailLog.drawerHeader(
                    row.to_address,
                    row.template_kind,
                    row.locale,
                  )
                : ''}
            </SheetDescription>
          </SheetHeader>
          {/* landr-3qkr.3 — pb-safe via mobileSheetBody on mobile. */}
          {row && (
            <div className={cn('flex flex-col gap-4 px-4 pb-6 text-sm', mobileSheetBody)}>
              <dl className="grid grid-cols-2 gap-3 text-xs">
                <div>
                  <dt className="text-muted-foreground">
                    {t.emailLog.fieldStatus}
                  </dt>
                  <dd className="mt-0.5">
                    <StatusBadge status={row.status} sentVia={row.sent_via} />
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t.emailLog.fieldRetries}
                  </dt>
                  <dd className="mt-0.5 font-mono">{row.retries}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t.emailLog.columnCreatedAt}
                  </dt>
                  <dd className="mt-0.5">
                    {contactDateTime(row.created_at, { hour12 })}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">
                    {t.emailLog.columnSentAt}
                  </dt>
                  <dd className="mt-0.5">
                    {contactDateTime(row.sent_at, { hour12 })}
                  </dd>
                </div>
              </dl>

              {/* dev_fallback explanation */}
              {row.status === 'sent' && row.sent_via === 'dev_fallback' && (
                <div className="rounded-md border border-amber-200 bg-amber-50 p-3 dark:border-amber-900/50 dark:bg-amber-900/20">
                  <p className="text-xs text-amber-800 dark:text-amber-200">
                    {t.emailLog.drawerDevFallbackNote}{' '}
                    <Link
                      to="/account/integrations/gmail"
                      className="underline"
                    >
                      {t.emailLog.drawerDevFallbackLink}
                    </Link>
                  </p>
                </div>
              )}

              {/* resent_from_id note */}
              {row.resent_from_id && (
                <p className="text-xs text-muted-foreground">
                  {t.emailLog.drawerResentFromNote(row.resent_from_id)}
                </p>
              )}

              {/* last_error — only when non-null */}
              {row.last_error && (
                <div className="rounded-md border border-destructive/30 bg-destructive/10 p-3">
                  <p className="text-xs font-medium text-destructive">
                    {t.emailLog.fieldLastError}
                  </p>
                  <p className="mt-1 whitespace-pre-wrap break-all text-xs text-destructive">
                    {row.last_error}
                  </p>
                </div>
              )}

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.emailLog.fieldBodyHtml}
                </h3>
                <iframe
                  title={t.emailLog.fieldBodyHtmlTitle}
                  srcDoc={row.body_html}
                  sandbox=""
                  className="h-72 w-full rounded-md border bg-white"
                />
              </section>

              <section>
                <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.emailLog.fieldBodyText}
                </h3>
                <pre className="max-h-72 overflow-auto rounded-md border bg-muted/40 p-3 text-xs whitespace-pre-wrap">
                  {row.body_text || '—'}
                </pre>
              </section>

              {isTerminal && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="self-start"
                  onClick={() => setResendOpen(true)}
                  data-testid="email-log-resend-button"
                >
                  {t.emailLog.resendButton}
                </Button>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {row && isTerminal && (
        <ResendDialog
          source={row}
          operatorId={operatorId}
          open={resendOpen}
          onOpenChange={setResendOpen}
          onResent={() =>
            void queryClient.invalidateQueries({
              queryKey: emailLogQueryKey as string[],
            })
          }
        />
      )}
    </>
  )
}

