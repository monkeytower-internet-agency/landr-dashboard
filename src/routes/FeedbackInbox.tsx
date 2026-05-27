// landr-wwhn.28 — /feedback-inbox: cross-operator feedback triage inbox.
//
// STAFF-ONLY surface. Operators are redirected to home; the DB view
// (feedback_inbox_operator_summary) is gated on is_landr_staff and returns
// zero rows to non-staff in any case.
//
// Layout:
//   Left rail  (fixed, scrollable)  — operators list with unread/awaiting counts.
//   Main pane  (flex-grow, scrollable) — threads for the selected operator.
//
// Left-rail row semantics:
//   • unread_count    — bell notifications for the calling staff user that have
//                       read_at IS NULL and belong to a ticket from this operator.
//   • awaiting_reply_count — tickets whose last comment is from a non-staff user
//                       (i.e. operator sent the last message; staff reply needed).
//
// Thread list (main pane):
//   One card per ticket. Each card shows a compact timeline of the ticket
//   opening event + comments, newest-activity-first thread order.
//   Clicking "View on board" navigates to /tickets?open=<id> (same deep-link
//   that the bell uses — lands the detail sheet on the kanban board).
//
// Filters (above threads):
//   status | perceived_impact | unread | awaiting-reply | assignee.
//   Default sort: oldest-unanswered-first (threads.sort in feedback-inbox.ts).
//
// Data layer: src/lib/feedback-inbox.ts

import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  InboxIcon,
  MessageSquareIcon,
  ArrowUpRightIcon,
  UserIcon,
} from 'lucide-react'
import { OriginChip, CardStatusIcons } from '@/components/tickets/CardVisuals'

import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { cn } from '@/lib/utils'
import { contactDateTime } from '@/lib/contacts'
import { useEntitlements } from '@/lib/entitlements'
import { useOperatorCalendarPrefs } from '@/lib/operator'
import {
  fetchOperatorInboxSummaries,
  fetchInboxThreads,
  threadMatchesFilter,
  INBOX_FILTER_DEFAULTS,
  type OperatorInboxSummary,
  type InboxTicketThread,
  type InboxTimelineEvent,
  type InboxFilter,
} from '@/lib/feedback-inbox'
import {
  fetchAssignableUsers,
  PERCEIVED_IMPACT_LABEL,
  TICKET_STATUSES,
  type TicketStatus,
  type TicketPerceivedImpact,
  type AssignableUser,
} from '@/lib/tickets'
import { Button } from '@/components/ui/button'
import { NativeSelect } from '@/components/ui/native-select'

// ---- helpers ----------------------------------------------------------------

function relativeTime(iso: string): string {
  try {
    const diffMs = Date.now() - new Date(iso).getTime()
    const diffSec = Math.floor(diffMs / 1000)
    if (diffSec < 60) return 'just now'
    const diffMin = Math.floor(diffSec / 60)
    if (diffMin < 60) return `${diffMin}m ago`
    const diffH = Math.floor(diffMin / 60)
    if (diffH < 24) return `${diffH}h ago`
    const diffD = Math.floor(diffH / 24)
    return `${diffD}d ago`
  } catch {
    return ''
  }
}

/** Compute awaiting-reply ticket ids: last comment is from non-staff. */
function computeAwaitingReplyIds(
  threads: InboxTicketThread[],
  staffUserIds: ReadonlySet<string>,
): Set<string> {
  const ids = new Set<string>()
  for (const { ticket, timeline } of threads) {
    // Find the last comment event
    let lastComment: InboxTimelineEvent | null = null
    for (let i = timeline.length - 1; i >= 0; i--) {
      const ev = timeline[i]
      if (ev && ev.kind === 'comment') {
        lastComment = ev
        break
      }
    }
    if (lastComment !== null && lastComment.author_id !== null) {
      if (
        !staffUserIds.has(lastComment.author_id) &&
        ticket.status !== 'done'
      ) {
        ids.add(ticket.id)
      }
    }
  }
  return ids
}

// ---- pill / badge helpers ---------------------------------------------------

function InlineBadge({
  children,
  variant = 'default',
  className,
  testId,
}: {
  children: ReactNode
  variant?: 'default' | 'amber' | 'outline' | 'internal'
  className?: string
  testId?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium',
        variant === 'default' && 'bg-muted text-foreground/80',
        variant === 'amber' &&
          'border border-amber-400 text-amber-700 dark:text-amber-400',
        variant === 'outline' && 'border border-border text-foreground/70',
        variant === 'internal' &&
          'border border-amber-400 text-amber-700 dark:text-amber-400',
        className,
      )}
      data-testid={testId}
    >
      {children}
    </span>
  )
}

// ---- Left rail operator row -------------------------------------------------

type OperatorRailItemProps = {
  summary: OperatorInboxSummary
  isSelected: boolean
  onClick: () => void
}

function OperatorRailItem({ summary, isSelected, onClick }: OperatorRailItemProps) {
  const hasUnread = summary.unread_count > 0
  const hasAwaiting = summary.awaiting_reply_count > 0

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full px-3 py-2.5 text-left transition-colors rounded-md',
        'hover:bg-accent hover:text-accent-foreground',
        isSelected
          ? 'bg-accent text-accent-foreground font-medium'
          : 'text-foreground',
      )}
      data-testid={`inbox-rail-item-${summary.operator_id}`}
      aria-pressed={isSelected}
    >
      <div className="flex items-center justify-between gap-2 min-w-0">
        <span className="truncate text-sm font-medium">
          {summary.operator_name ??
            summary.operator_slug ??
            summary.operator_id.slice(0, 8)}
        </span>
        {hasUnread && (
          <span
            className="shrink-0 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-bold text-destructive-foreground"
            aria-label={t.feedbackInbox.unreadBadge(summary.unread_count)}
            data-testid={`inbox-rail-unread-${summary.operator_id}`}
          >
            {summary.unread_count}
          </span>
        )}
      </div>
      <div className="mt-0.5 flex flex-wrap gap-1.5">
        <span className="text-muted-foreground text-xs">
          {t.feedbackInbox.ticketCount(summary.ticket_count)}
        </span>
        {hasAwaiting && (
          <span
            className="text-xs text-amber-700 dark:text-amber-400"
            data-testid={`inbox-rail-awaiting-${summary.operator_id}`}
          >
            {t.feedbackInbox.awaitingBadge(summary.awaiting_reply_count)}
          </span>
        )}
        {summary.last_activity_at && (
          <span className="text-muted-foreground text-xs">
            {relativeTime(summary.last_activity_at)}
          </span>
        )}
      </div>
    </button>
  )
}

// ---- Timeline event card ----------------------------------------------------

type TimelineEventCardProps = {
  event: InboxTimelineEvent
  isStaffAuthor: boolean
  authorEmail: string | null
  hour12: boolean
}

function TimelineEventCard({
  event,
  isStaffAuthor,
  authorEmail,
  hour12,
}: TimelineEventCardProps) {
  const isTicketOpen = event.kind === 'ticket'
  const isInternal = !isTicketOpen && event.is_internal

  return (
    <div
      className={cn(
        'rounded-md border px-3 py-2.5 text-sm',
        isInternal
          ? 'border-dashed border-amber-400 bg-amber-50/60 dark:bg-amber-950/20'
          : isStaffAuthor
            ? 'border-border bg-muted/30'
            : 'border-border bg-background',
      )}
      data-testid={`inbox-timeline-event-${event.id}`}
    >
      {/* Header row */}
      <div className="flex items-center justify-between gap-2 mb-1.5">
        <div className="flex items-center gap-1.5 min-w-0">
          <UserIcon
            className="size-3 text-muted-foreground shrink-0"
            aria-hidden
          />
          <span className="text-xs font-medium truncate">
            {authorEmail ??
              (isStaffAuthor
                ? t.feedbackInbox.staffLabel
                : t.feedbackInbox.operatorLabel)}
          </span>
          {isStaffAuthor && (
            <InlineBadge variant="outline">
              {t.feedbackInbox.staffLabel}
            </InlineBadge>
          )}
          {isInternal && (
            <InlineBadge variant="internal">
              {t.feedbackInbox.internalNoteLabel}
            </InlineBadge>
          )}
          {isTicketOpen && (
            <InlineBadge variant="outline">
              {t.feedbackInbox.ticketOpenedLabel}
            </InlineBadge>
          )}
        </div>
        <span className="text-muted-foreground text-xs shrink-0">
          {contactDateTime(event.created_at, { hour12 })}
        </span>
      </div>

      {/* Body */}
      {event.body ? (
        <p className="text-sm whitespace-pre-wrap break-words leading-relaxed">
          {event.body}
        </p>
      ) : (
        <p className="text-muted-foreground text-sm italic">
          {t.feedbackInbox.noSubject}
        </p>
      )}
    </div>
  )
}

// ---- Thread card ------------------------------------------------------------

type ThreadCardProps = {
  thread: InboxTicketThread
  isAwaiting: boolean
  hasUnread: boolean
  staffUserIds: ReadonlySet<string>
  assigneeMap: Map<string, AssignableUser>
  hour12: boolean
  onViewOnBoard: (ticketId: string) => void
}

function ThreadCard({
  thread,
  isAwaiting,
  hasUnread,
  staffUserIds,
  assigneeMap,
  hour12,
  onViewOnBoard,
}: ThreadCardProps) {
  const { ticket, timeline } = thread
  const [expanded, setExpanded] = useState(false)

  // Show last 2 events collapsed, all expanded
  const displayedEvents = expanded ? timeline : timeline.slice(-2)
  const hiddenCount = timeline.length - 2

  // Derive comment count from timeline (comment events only)
  const commentCount = timeline.filter((e) => e.kind === 'comment').length

  // Resolved assignee for the status-icon avatar
  const resolvedAssignee = ticket.assignee_id
    ? (assigneeMap.get(ticket.assignee_id) ?? null)
    : null

  return (
    <div
      className={cn(
        'rounded-lg border bg-card text-card-foreground shadow-sm',
        hasUnread && 'ring-2 ring-primary/30',
      )}
      data-testid={`inbox-thread-${ticket.id}`}
    >
      {/* Thread header */}
      <div className="flex items-start justify-between gap-3 px-4 pt-3 pb-2 border-b">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm truncate">{ticket.title}</span>
            {/* landr-7dya.2 — origin chip */}
            <OriginChip
              tier={ticket.origin_tier ?? null}
              operatorLabel={ticket.origin_operator_label ?? null}
              data-testid={`inbox-thread-origin-${ticket.id}`}
            />
            {hasUnread && (
              <span
                className="inline-flex size-2 shrink-0 rounded-full bg-primary"
                aria-label="unread"
                data-testid={`inbox-thread-unread-dot-${ticket.id}`}
              />
            )}
            {isAwaiting && (
              <InlineBadge
                variant="amber"
                testId={`inbox-thread-awaiting-${ticket.id}`}
              >
                awaiting reply
              </InlineBadge>
            )}
          </div>
          <div className="mt-0.5 flex flex-wrap gap-2 text-xs text-muted-foreground">
            <span>{PERCEIVED_IMPACT_LABEL[ticket.perceived_impact]}</span>
            <span>·</span>
            <span>{ticket.status.replace('_', ' ')}</span>
          </div>
          {/* landr-7dya.3 — Trello-style status icons */}
          <CardStatusIcons
            attachmentCount={0}
            isWatching={false}
            assignee={resolvedAssignee}
            priority={ticket.priority}
            commentCount={commentCount}
            moscow={ticket.moscow ?? null}
            blocked={ticket.blocked}
            className="mt-1.5"
            data-testid={`inbox-thread-status-icons-${ticket.id}`}
          />
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="shrink-0 gap-1 text-xs h-7 px-2"
          onClick={() => onViewOnBoard(ticket.id)}
          data-testid={`inbox-thread-view-board-${ticket.id}`}
        >
          <ArrowUpRightIcon className="size-3" aria-hidden />
          {t.feedbackInbox.viewOnBoardLink}
        </Button>
      </div>

      {/* Timeline events */}
      <div className="flex flex-col gap-2 px-4 py-3">
        {hiddenCount > 0 && !expanded && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 self-start"
            onClick={() => setExpanded(true)}
            data-testid={`inbox-thread-expand-${ticket.id}`}
          >
            Show {hiddenCount} earlier message{hiddenCount === 1 ? '' : 's'}
          </button>
        )}
        {displayedEvents.map((event) => {
          const isStaffAuthor =
            event.author_id !== null && staffUserIds.has(event.author_id)
          const author = event.author_id
            ? assigneeMap.get(event.author_id)
            : null
          return (
            <TimelineEventCard
              key={event.id}
              event={event}
              isStaffAuthor={isStaffAuthor}
              authorEmail={author?.email ?? null}
              hour12={hour12}
            />
          )
        })}
        {expanded && hiddenCount > 0 && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 self-start"
            onClick={() => setExpanded(false)}
            data-testid={`inbox-thread-collapse-${ticket.id}`}
          >
            Show less
          </button>
        )}
      </div>
    </div>
  )
}

// ---- Filter bar -------------------------------------------------------------

type FilterBarProps = {
  filter: InboxFilter
  onChange: (f: InboxFilter) => void
  assignableUsers: AssignableUser[]
}

const STATUS_LABEL: Record<TicketStatus, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
}

function FilterBar({ filter, onChange, assignableUsers }: FilterBarProps) {
  const hasFilters =
    filter.status !== null ||
    filter.perceived_impact !== null ||
    filter.unreadOnly ||
    filter.awaitingReplyOnly ||
    filter.assigneeId !== null

  return (
    <div
      className="flex flex-wrap items-center gap-2"
      data-testid="inbox-filter-bar"
    >
      {/* Status */}
      <NativeSelect
        value={filter.status ?? ''}
        onChange={(e) =>
          onChange({
            ...filter,
            status:
              e.target.value === '' ? null : (e.target.value as TicketStatus),
          })
        }
        className="h-7 w-36 text-xs"
        aria-label={t.feedbackInbox.filterStatusLabel}
        data-testid="inbox-filter-status"
      >
        <option value="">{t.feedbackInbox.filterStatusLabel}</option>
        {TICKET_STATUSES.map((s) => (
          <option key={s} value={s}>
            {STATUS_LABEL[s]}
          </option>
        ))}
      </NativeSelect>

      {/* Perceived impact */}
      <NativeSelect
        value={filter.perceived_impact ?? ''}
        onChange={(e) =>
          onChange({
            ...filter,
            perceived_impact:
              e.target.value === ''
                ? null
                : (e.target.value as TicketPerceivedImpact),
          })
        }
        className="h-7 w-36 text-xs"
        aria-label={t.feedbackInbox.filterImpactLabel}
        data-testid="inbox-filter-impact"
      >
        <option value="">{t.feedbackInbox.filterImpactLabel}</option>
        {(
          ['blocking', 'annoying', 'idea'] satisfies TicketPerceivedImpact[]
        ).map((v) => (
          <option key={v} value={v}>
            {PERCEIVED_IMPACT_LABEL[v]}
          </option>
        ))}
      </NativeSelect>

      {/* Assignee */}
      {assignableUsers.length > 0 && (
        <NativeSelect
          value={filter.assigneeId ?? ''}
          onChange={(e) =>
            onChange({
              ...filter,
              assigneeId: e.target.value === '' ? null : e.target.value,
            })
          }
          className="h-7 w-40 text-xs"
          aria-label={t.feedbackInbox.filterAssigneeLabel}
          data-testid="inbox-filter-assignee"
        >
          <option value="">{t.feedbackInbox.filterAssigneeLabel}</option>
          {assignableUsers.map((u) => (
            <option key={u.id} value={u.id}>
              {u.is_claude_agent
                ? `Bot: ${u.email ?? 'Agent'}`
                : (u.email ?? u.id)}
            </option>
          ))}
        </NativeSelect>
      )}

      {/* Toggle chips */}
      <button
        type="button"
        onClick={() => onChange({ ...filter, unreadOnly: !filter.unreadOnly })}
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
          filter.unreadOnly
            ? 'border-primary bg-primary/10 text-primary font-medium'
            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
        )}
        data-testid="inbox-filter-unread-toggle"
      >
        {t.feedbackInbox.filterUnread}
      </button>

      <button
        type="button"
        onClick={() =>
          onChange({
            ...filter,
            awaitingReplyOnly: !filter.awaitingReplyOnly,
          })
        }
        className={cn(
          'inline-flex h-7 items-center gap-1.5 rounded-md border px-2 text-xs transition-colors',
          filter.awaitingReplyOnly
            ? 'border-amber-500 bg-amber-50 dark:bg-amber-950/30 text-amber-700 dark:text-amber-400 font-medium'
            : 'border-border text-muted-foreground hover:text-foreground hover:border-foreground/40',
        )}
        data-testid="inbox-filter-awaiting-toggle"
      >
        {t.feedbackInbox.filterAwaiting}
      </button>

      {/* Clear */}
      {hasFilters && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-muted-foreground"
          onClick={() => onChange(INBOX_FILTER_DEFAULTS)}
          data-testid="inbox-filter-clear"
        >
          {t.feedbackInbox.filterClear}
        </Button>
      )}
    </div>
  )
}

// ---- Gate component (no data hooks — safe to return early) -----------------

export default function FeedbackInbox() {
  const { effectiveIsStaff, isLoading: entLoading } = useEntitlements()

  // Staff route guard. While entitlements are resolving, render a loading
  // placeholder to avoid a flash-redirect. Pattern mirrors Revenue.tsx.
  if (entLoading) {
    return (
      <p className="text-muted-foreground p-6 text-sm">
        {t.feedbackInbox.loading}
      </p>
    )
  }
  if (!effectiveIsStaff) return <Navigate to="/" replace />

  return <FeedbackInboxInner />
}

// ---- Inner component (all data hooks here — no early return before hooks) ---

function FeedbackInboxInner() {
  const { hour12 } = useOperatorCalendarPrefs()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams, setSearchParams] = useSearchParams()

  const [selectedOperatorId, setSelectedOperatorId] = useState<string | null>(
    null,
  )
  const [filter, setFilter] = useState<InboxFilter>(INBOX_FILTER_DEFAULTS)

  // Left-rail summary
  const summaryQuery = useQuery({
    queryKey: ['feedback-inbox-summary'],
    queryFn: fetchOperatorInboxSummaries,
    staleTime: 60 * 1000,
  })

  // Thread list for selected operator
  const threadsQuery = useQuery({
    queryKey: ['feedback-inbox-threads', selectedOperatorId ?? 'none'],
    queryFn: () => fetchInboxThreads(selectedOperatorId!),
    enabled: !!selectedOperatorId,
    staleTime: 30 * 1000,
  })

  // Assignable users (for filter bar + author display)
  const assignableQuery = useQuery({
    queryKey: ['assignable-users'],
    queryFn: fetchAssignableUsers,
    staleTime: 5 * 60 * 1000,
  })

  const summaries = useMemo(() => summaryQuery.data ?? [], [summaryQuery.data])
  const threads = useMemo(() => threadsQuery.data ?? [], [threadsQuery.data])

  // Build a set of staff user IDs for author classification
  const staffUserIds = useMemo<ReadonlySet<string>>(() => {
    const s = new Set<string>()
    for (const u of assignableQuery.data ?? []) {
      if (u.is_landr_staff) s.add(u.id)
    }
    return s
  }, [assignableQuery.data])

  const assigneeMap = useMemo<Map<string, AssignableUser>>(() => {
    const m = new Map<string, AssignableUser>()
    for (const u of assignableQuery.data ?? []) {
      m.set(u.id, u)
    }
    return m
  }, [assignableQuery.data])

  // Derive awaiting-reply and unread sets from thread data
  const awaitingReplyTicketIds = useMemo(
    () => computeAwaitingReplyIds(threads, staffUserIds),
    [threads, staffUserIds],
  )

  // Per-thread unread approximation: if the last timeline event is from a
  // non-staff author, mark the thread as unread (no per-ticket read_at in this
  // surface — the bell + board provide precise per-ticket signal).
  const selectedSummary = useMemo(
    () => summaries.find((s) => s.operator_id === selectedOperatorId) ?? null,
    [summaries, selectedOperatorId],
  )

  const unreadTicketIds = useMemo<ReadonlySet<string>>(() => {
    if (!selectedSummary || selectedSummary.unread_count === 0) return new Set()
    const ids = new Set<string>()
    for (const th of threads) {
      const last = th.timeline[th.timeline.length - 1]
      if (
        last &&
        last.author_id !== null &&
        !staffUserIds.has(last.author_id)
      ) {
        ids.add(th.ticket.id)
      }
    }
    return ids
  }, [threads, selectedSummary, staffUserIds])

  // Apply filters
  const filteredThreads = useMemo(
    () =>
      threads.filter((th) =>
        threadMatchesFilter(
          th,
          filter,
          unreadTicketIds,
          awaitingReplyTicketIds,
        ),
      ),
    [threads, filter, unreadTicketIds, awaitingReplyTicketIds],
  )

  // Bell deep-link: ?open=<ticketId> clears param and keeps current selection
  // if the ticket is already in view, otherwise defers to user to pick rail.
  const openTicketId = searchParams.get('open')

  useEffect(() => {
    if (!openTicketId) return
    setSearchParams(
      (p) => {
        const next = new URLSearchParams(p)
        next.delete('open')
        return next
      },
      { replace: true },
    )
  }, [openTicketId, setSearchParams])

  // Auto-select first operator once summaries load
  if (selectedOperatorId === null && summaries.length > 0) {
    const first = summaries[0]
    if (first) setSelectedOperatorId(first.operator_id)
  }

  function handleViewOnBoard(ticketId: string) {
    void queryClient.invalidateQueries({
      queryKey: ['feedback-inbox-summary'],
    })
    navigate(`/tickets?open=${encodeURIComponent(ticketId)}`)
  }

  return (
    <>
      <PageTitle title={t.feedbackInbox.title} />

      <div className="flex h-full min-h-0 overflow-hidden">
        {/* ---- Left rail --------------------------------------------------- */}
        <aside
          className="flex w-60 shrink-0 flex-col gap-0.5 overflow-y-auto border-r p-2"
          data-testid="inbox-left-rail"
          aria-label={t.feedbackInbox.title}
        >
          {summaryQuery.isPending && (
            <p className="text-muted-foreground px-3 py-4 text-xs text-center">
              {t.feedbackInbox.loading}
            </p>
          )}
          {summaryQuery.isError && (
            <p className="text-destructive px-3 py-4 text-xs text-center">
              {t.feedbackInbox.errorSummary}
            </p>
          )}
          {!summaryQuery.isPending &&
            !summaryQuery.isError &&
            summaries.length === 0 && (
              <div className="flex flex-col items-center gap-2 px-3 py-8 text-center">
                <InboxIcon
                  className="size-8 text-muted-foreground/50"
                  aria-hidden
                />
                <p className="text-muted-foreground text-xs">
                  {t.feedbackInbox.emptyRail}
                </p>
              </div>
            )}
          {summaries.map((summary) => (
            <OperatorRailItem
              key={summary.operator_id}
              summary={summary}
              isSelected={selectedOperatorId === summary.operator_id}
              onClick={() => {
                setSelectedOperatorId(summary.operator_id)
                setFilter(INBOX_FILTER_DEFAULTS)
              }}
            />
          ))}
        </aside>

        {/* ---- Main pane --------------------------------------------------- */}
        <main
          className="flex min-w-0 flex-1 flex-col overflow-y-auto p-4 gap-4"
          data-testid="inbox-main-pane"
        >
          {/* Placeholder when no operator is selected */}
          {selectedOperatorId === null && !summaryQuery.isPending && (
            <div className="flex flex-col items-center gap-3 py-16 text-center">
              <MessageSquareIcon
                className="size-10 text-muted-foreground/40"
                aria-hidden
              />
              <p className="text-muted-foreground text-sm">
                {t.feedbackInbox.subtitle}
              </p>
            </div>
          )}

          {selectedOperatorId !== null && (
            <>
              {/* Operator header row */}
              <div className="flex items-center justify-between gap-2 border-b pb-3">
                <div>
                  <h1 className="text-base font-semibold">
                    {selectedSummary?.operator_name ??
                      selectedSummary?.operator_slug ??
                      selectedOperatorId.slice(0, 8)}
                  </h1>
                  {selectedSummary && (
                    <p className="text-muted-foreground text-xs mt-0.5">
                      {t.feedbackInbox.ticketCount(
                        selectedSummary.ticket_count,
                      )}
                      {selectedSummary.unread_count > 0 && (
                        <>
                          {' · '}
                          <span className="text-primary font-medium">
                            {t.feedbackInbox.unreadBadge(
                              selectedSummary.unread_count,
                            )}
                          </span>
                        </>
                      )}
                      {selectedSummary.awaiting_reply_count > 0 && (
                        <>
                          {' · '}
                          <span className="text-amber-700 dark:text-amber-400">
                            {t.feedbackInbox.awaitingBadge(
                              selectedSummary.awaiting_reply_count,
                            )}
                          </span>
                        </>
                      )}
                    </p>
                  )}
                </div>
              </div>

              {/* Filter bar */}
              <FilterBar
                filter={filter}
                onChange={setFilter}
                assignableUsers={assignableQuery.data ?? []}
              />

              {/* Thread list */}
              {threadsQuery.isPending && (
                <p className="text-muted-foreground text-sm py-8 text-center">
                  {t.feedbackInbox.loading}
                </p>
              )}
              {threadsQuery.isError && (
                <p className="text-destructive text-sm py-8 text-center">
                  {t.feedbackInbox.errorThreads}
                </p>
              )}
              {!threadsQuery.isPending && !threadsQuery.isError && (
                <>
                  {filteredThreads.length === 0 ? (
                    <div className="flex flex-col items-center gap-2 py-12 text-center">
                      <InboxIcon
                        className="size-8 text-muted-foreground/40"
                        aria-hidden
                      />
                      <p className="text-muted-foreground text-sm">
                        {threads.length === 0
                          ? t.feedbackInbox.emptyThreadsNoFilter
                          : t.feedbackInbox.emptyThreads}
                      </p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-4">
                      {filteredThreads.map((thread) => (
                        <ThreadCard
                          key={thread.ticket.id}
                          thread={thread}
                          isAwaiting={awaitingReplyTicketIds.has(
                            thread.ticket.id,
                          )}
                          hasUnread={unreadTicketIds.has(thread.ticket.id)}
                          staffUserIds={staffUserIds}
                          assigneeMap={assigneeMap}
                          hour12={hour12}
                          onViewOnBoard={handleViewOnBoard}
                        />
                      ))}
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  )
}
