// landr-wwhn.13 — Ticket detail sheet.
//
// Opens from the kanban board when an operator or staff clicks a ticket card.
// Architecture follows BookingDetailSheet.tsx: a Sheet shell delegates to a
// body component that is keyed by ticket id, ensuring a clean remount on each
// new ticket open and avoiding stale state.
//
// Tabs: Details | Comments | Timeline | Attachments.
//
// Staff (is_landr_staff) see additional fields:
//   * Details tab: severity, linked_bd_id, sync_status (read via tickets_staff view).
//   * Comments tab: internal notes (is_internal=true) + can post internal comments.
//   * Timeline: internal events (is_internal=true comment_added events).
//
// Per write-routing-convention:
//   * Comment INSERT / watcher toggle / attachment metadata INSERT = direct
//     Supabase REST (plain row writes covered by RLS + audit trigger).
//   * Storage upload = Supabase Storage SDK (client-side, RLS enforced).
//
// Realtime: subscribe to ticket_comments + ticket_events + ticket_attachments
// for the open ticket so the thread stays live.

import { useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Eye, EyeOff, Paperclip, Send } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { supabase } from '@/lib/supabase'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import {
  createComment,
  fetchCurrentPublicUser,
  fetchTicketAttachments,
  fetchTicketComments,
  fetchTicketCommentsStaff,
  fetchTicketEvents,
  fetchTicketStaff,
  fetchTicketWatcher,
  getAttachmentSignedUrl,
  unwatchTicket,
  uploadTicketAttachment,
  watchTicket,
  PERCEIVED_IMPACT_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TOOLTIP,
  TYPE_LABEL,
  type TicketAttachment,
  type TicketComment,
  type TicketEvent,
  type TicketRow,
  type TicketRowStaff,
} from '@/lib/tickets'

// ---- Types ------------------------------------------------------------------

type Tab = 'details' | 'comments' | 'timeline' | 'attachments'

// ---- Public component -------------------------------------------------------

type Props = {
  ticket: TicketRow | null
  onOpenChange: (open: boolean) => void
}

export function TicketDetailSheet({ ticket, onOpenChange }: Props) {
  const open = ticket !== null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="flex w-full flex-col gap-0 sm:max-w-[52rem]">
        {ticket ? (
          <TicketDetailBody
            key={ticket.id}
            ticket={ticket}
            onClose={() => onOpenChange(false)}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

// ---- Body -------------------------------------------------------------------

type BodyProps = {
  ticket: TicketRow
  onClose: () => void
}

function TicketDetailBody({ ticket, onClose }: BodyProps) {
  const { user: authUser } = useAuth()
  const qc = useQueryClient()
  const [activeTab, setActiveTab] = useState<Tab>('details')

  // Fetch current public user row to gate is_landr_staff features.
  const { data: publicUser } = useQuery({
    queryKey: ['current-public-user', authUser?.id ?? 'anon'],
    queryFn: () => fetchCurrentPublicUser(authUser!.id),
    enabled: !!authUser?.id,
    staleTime: 5 * 60 * 1000,
  })
  const isStaff = publicUser?.is_landr_staff === true
  const publicUserId = publicUser?.id ?? null

  // Staff detail (severity, linked_bd_id, etc.) — only fetched for staff.
  const staffDetailQuery = useQuery({
    queryKey: ['ticket-staff', ticket.id],
    queryFn: () => fetchTicketStaff(ticket.id),
    enabled: isStaff,
  })
  const staffDetail: TicketRowStaff | null = staffDetailQuery.data ?? null

  // Realtime: subscribe to comments + events + attachments for this ticket.
  useEffect(() => {
    const channel = supabase
      .channel(`ticket-detail:${ticket.id}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_comments',
          filter: `ticket_id=eq.${ticket.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ['ticket-comments', ticket.id] })
          void qc.invalidateQueries({
            queryKey: ['ticket-comments-staff', ticket.id],
          })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_events',
          filter: `ticket_id=eq.${ticket.id}`,
        },
        () => {
          void qc.invalidateQueries({ queryKey: ['ticket-events', ticket.id] })
        },
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'ticket_attachments',
          filter: `ticket_id=eq.${ticket.id}`,
        },
        () => {
          void qc.invalidateQueries({
            queryKey: ['ticket-attachments', ticket.id],
          })
        },
      )
      .subscribe()

    return () => {
      void supabase.removeChannel(channel)
    }
  }, [ticket.id, qc])

  return (
    <>
      <SheetHeader>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <SheetTitle className="line-clamp-2 text-base leading-snug">
              {ticket.title}
            </SheetTitle>
            <SheetDescription className="mt-0.5">
              {t.ticketDetail.sheetDescription(ticket.id)}
              {' · '}
              {TYPE_LABEL[ticket.type]}
            </SheetDescription>
          </div>
          <WatchToggle
            ticketId={ticket.id}
            publicUserId={publicUserId}
          />
        </div>
      </SheetHeader>

      {/* Tab strip */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as Tab)}
        className="mx-4 mt-2 w-fit shrink-0 self-start"
      >
        <TabsList variant="pill" aria-label={t.ticketDetail.sheetTitle}>
          <TabsTrigger
            variant="pill"
            value="details"
            data-testid="ticket-detail-tab-details"
          >
            {t.ticketDetail.tabDetails}
          </TabsTrigger>
          <TabsTrigger
            variant="pill"
            value="comments"
            data-testid="ticket-detail-tab-comments"
          >
            {t.ticketDetail.tabComments}
          </TabsTrigger>
          <TabsTrigger
            variant="pill"
            value="timeline"
            data-testid="ticket-detail-tab-timeline"
          >
            {t.ticketDetail.tabTimeline}
          </TabsTrigger>
          <TabsTrigger
            variant="pill"
            value="attachments"
            data-testid="ticket-detail-tab-attachments"
          >
            {t.ticketDetail.tabAttachments}
          </TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Tab panels */}
      {activeTab === 'details' ? (
        <div
          role="tabpanel"
          aria-label={t.ticketDetail.tabDetails}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3"
        >
          <DetailsPanel
            ticket={ticket}
            staffDetail={isStaff ? staffDetail : null}
            isStaff={isStaff}
          />
        </div>
      ) : activeTab === 'comments' ? (
        <div
          role="tabpanel"
          aria-label={t.ticketDetail.tabComments}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <CommentsPanel
            ticketId={ticket.id}
            isStaff={isStaff}
          />
        </div>
      ) : activeTab === 'timeline' ? (
        <div
          role="tabpanel"
          aria-label={t.ticketDetail.tabTimeline}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3"
        >
          <TimelinePanel ticketId={ticket.id} />
        </div>
      ) : (
        <div
          role="tabpanel"
          aria-label={t.ticketDetail.tabAttachments}
          className="flex flex-1 flex-col overflow-hidden"
        >
          <AttachmentsPanel
            ticketId={ticket.id}
            publicUserId={publicUserId}
          />
        </div>
      )}

      {/* Close button in the footer */}
      <div className="flex shrink-0 justify-end border-t px-4 py-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          data-testid="ticket-detail-close-btn"
        >
          Close
        </Button>
      </div>
    </>
  )
}

// ---- WatchToggle ------------------------------------------------------------

type WatchToggleProps = {
  ticketId: string
  publicUserId: string | null
}

function WatchToggle({ ticketId, publicUserId }: WatchToggleProps) {
  const qc = useQueryClient()

  const watchQuery = useQuery({
    queryKey: ['ticket-watcher', ticketId, publicUserId ?? 'none'],
    queryFn: () => fetchTicketWatcher(ticketId, publicUserId!),
    enabled: !!publicUserId,
    staleTime: 30_000,
  })
  const isWatching = !!watchQuery.data

  const mutation = useMutation({
    mutationFn: async () => {
      if (!publicUserId) return
      if (isWatching) {
        await unwatchTicket(ticketId, publicUserId)
      } else {
        await watchTicket(ticketId, publicUserId)
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({
        queryKey: ['ticket-watcher', ticketId, publicUserId ?? 'none'],
      })
      toast.success(
        isWatching ? t.ticketDetail.watchToastOff : t.ticketDetail.watchToastOn,
      )
    },
    onError: () => {
      toast.error(t.ticketDetail.watchToastError)
    },
  })

  if (!publicUserId) return null

  return (
    <Button
      type="button"
      variant={isWatching ? 'default' : 'outline'}
      size="sm"
      className="shrink-0 gap-1.5 text-xs"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending || watchQuery.isPending}
      data-testid="ticket-watch-toggle"
      title={isWatching ? t.ticketDetail.watchingLabel : t.ticketDetail.watchLabel}
    >
      {isWatching ? (
        <Eye className="size-3.5" aria-hidden />
      ) : (
        <EyeOff className="size-3.5" aria-hidden />
      )}
      {isWatching ? t.ticketDetail.watchingLabel : t.ticketDetail.watchLabel}
    </Button>
  )
}

// ---- DetailsPanel -----------------------------------------------------------

const SEVERITY_LABEL: Record<string, string> = {
  blocker: 'Blocker',
  critical: 'Critical',
  major: 'Major',
  minor: 'Minor',
  trivial: 'Trivial',
}

const STATUS_LABEL: Record<string, string> = {
  backlog: 'Backlog',
  ready: 'Ready',
  in_progress: 'In progress',
  in_review: 'In review',
  done: 'Done',
}

const PRIORITY_TONE: Record<string, string> = {
  p0: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  p1: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  p2: 'bg-muted text-muted-foreground',
}

const SYNC_STATUS_LABEL: Record<string, string> = {
  pending: 'Pending',
  synced: 'Synced',
  drift: 'Drifted',
  error: 'Error',
}

type DetailsPanelProps = {
  ticket: TicketRow
  staffDetail: TicketRowStaff | null
  isStaff: boolean
}

function DetailsPanel({ ticket, staffDetail, isStaff }: DetailsPanelProps) {
  const dateFormatter = new Intl.DateTimeFormat('en-IE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  return (
    <div className="flex flex-col gap-4">
      {/* Core fields */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.ticketDetail.sectionStatus}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {STATUS_LABEL[ticket.status] ?? ticket.status}
            </span>
            {ticket.blocked && (
              <span className="inline-flex items-center rounded-full bg-red-600 px-2 py-0.5 text-[10px] font-semibold text-white dark:bg-red-700">
                Blocked
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
            <div>
              <dt className="text-muted-foreground text-xs">
                {t.ticketDetail.sectionType}
              </dt>
              <dd className="mt-0.5 font-medium">{TYPE_LABEL[ticket.type]}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t.ticketDetail.sectionImpact}
              </dt>
              <dd className="mt-0.5 font-medium">
                {PERCEIVED_IMPACT_LABEL[ticket.perceived_impact]}
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t.ticketDetail.sectionPriority}
              </dt>
              <dd className="mt-0.5">
                <span
                  className={cn(
                    'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
                    PRIORITY_TONE[ticket.priority] ?? PRIORITY_TONE.p2,
                  )}
                  title={PRIORITY_TOOLTIP[ticket.priority]}
                >
                  {PRIORITY_LABEL[ticket.priority]}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-muted-foreground text-xs">
                {t.ticketDetail.createdAt}
              </dt>
              <dd className="mt-0.5 text-xs">
                {dateFormatter.format(new Date(ticket.created_at))}
              </dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {/* Description */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.ticketDetail.sectionBody}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {ticket.body ? (
            <p className="whitespace-pre-wrap text-sm">{ticket.body}</p>
          ) : (
            <p className="text-muted-foreground text-sm italic">
              {t.ticketDetail.noBody}
            </p>
          )}
        </CardContent>
      </Card>

      {/* Staff-only internal fields */}
      {isStaff && (
        <Card className="border-amber-300 dark:border-amber-700">
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-sm font-medium">
              {t.ticketDetail.sectionInternal}
              <span className="inline-flex items-center rounded-full border border-amber-500 px-1.5 py-0.5 text-[10px] font-medium text-amber-700 dark:text-amber-400">
                Staff only
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {staffDetail ? (
              <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
                <div>
                  <dt className="text-muted-foreground text-xs">
                    {t.ticketDetail.severityLabel}
                  </dt>
                  <dd className="mt-0.5 font-medium">
                    {staffDetail.severity
                      ? (SEVERITY_LABEL[staffDetail.severity] ?? staffDetail.severity)
                      : '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">
                    {t.ticketDetail.linkedBdLabel}
                  </dt>
                  <dd className="mt-0.5 font-mono text-xs">
                    {staffDetail.linked_bd_id ?? '—'}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground text-xs">
                    {t.ticketDetail.syncStatusLabel}
                  </dt>
                  <dd className="mt-0.5 text-xs">
                    {staffDetail.sync_status
                      ? (SYNC_STATUS_LABEL[staffDetail.sync_status] ??
                        staffDetail.sync_status)
                      : '—'}
                  </dd>
                </div>
                {staffDetail.last_synced_at && (
                  <div>
                    <dt className="text-muted-foreground text-xs">
                      Last synced
                    </dt>
                    <dd className="mt-0.5 text-xs">
                      {dateFormatter.format(new Date(staffDetail.last_synced_at))}
                    </dd>
                  </div>
                )}
              </dl>
            ) : (
              <p className="text-muted-foreground text-xs italic">
                Loading internal fields…
              </p>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  )
}

// ---- CommentsPanel ----------------------------------------------------------

type CommentsPanelProps = {
  ticketId: string
  isStaff: boolean
}

function CommentsPanel({ ticketId, isStaff }: CommentsPanelProps) {
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)

  // Staff fetch (incl. internal); operator fetch (public only).
  const staffQuery = useQuery({
    queryKey: ['ticket-comments-staff', ticketId],
    queryFn: () => fetchTicketCommentsStaff(ticketId),
    enabled: isStaff,
  })
  const publicQuery = useQuery({
    queryKey: ['ticket-comments', ticketId],
    queryFn: () => fetchTicketComments(ticketId),
    enabled: !isStaff,
  })

  const comments: TicketComment[] = isStaff
    ? (staffQuery.data ?? [])
    : (publicQuery.data ?? [])

  const isPending = isStaff ? staffQuery.isPending : publicQuery.isPending

  const createMutation = useMutation({
    mutationFn: () =>
      createComment({
        ticket_id: ticketId,
        body: body.trim(),
        is_internal: isStaff ? isInternal : false,
      }),
    onSuccess: () => {
      setBody('')
      setIsInternal(false)
      void qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] })
      void qc.invalidateQueries({ queryKey: ['ticket-comments-staff', ticketId] })
    },
    onError: (err: Error) => {
      toast.error(`${t.ticketDetail.commentToastError} (${err.message})`)
    },
  })

  const bodyTrimmed = body.trim()
  const canPost = bodyTrimmed.length > 0 && !createMutation.isPending

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Scrollable comment list */}
      <div
        className="flex flex-1 flex-col gap-3 overflow-y-auto px-4 pb-2 pt-3"
        data-testid="ticket-comments-list"
      >
        {isPending ? (
          <div className="space-y-3">
            {Array.from({ length: 3 }, (_, i) => (
              <div
                key={i}
                className="bg-muted h-16 animate-pulse rounded-md"
              />
            ))}
          </div>
        ) : comments.length === 0 ? (
          <p
            className="text-muted-foreground text-sm italic"
            data-testid="ticket-comments-empty"
          >
            {t.ticketDetail.noComments}
          </p>
        ) : (
          comments.map((c) => (
            <CommentBubble key={c.id} comment={c} />
          ))
        )}
      </div>

      {/* Compose area — pinned to the bottom */}
      <div className="shrink-0 border-t px-4 pb-4 pt-3">
        {/* Staff internal toggle */}
        {isStaff && (
          <div className="mb-2 flex items-center gap-2">
            <button
              type="button"
              role="switch"
              aria-checked={isInternal}
              className={cn(
                'inline-flex h-5 w-9 cursor-pointer items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-ring',
                isInternal
                  ? 'bg-amber-500 dark:bg-amber-600'
                  : 'bg-input',
              )}
              onClick={() => setIsInternal((v) => !v)}
              data-testid="comment-internal-toggle"
            >
              <span
                className={cn(
                  'block h-4 w-4 rounded-full bg-white shadow transition-transform',
                  isInternal ? 'translate-x-4.5' : 'translate-x-0.5',
                )}
              />
            </button>
            <label
              className="cursor-pointer select-none text-xs font-medium"
              onClick={() => setIsInternal((v) => !v)}
            >
              {t.ticketDetail.commentInternalToggle}
            </label>
          </div>
        )}

        <div className="flex gap-2">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder={
              isInternal
                ? t.ticketDetail.commentInternalPlaceholder
                : t.ticketDetail.commentPlaceholder
            }
            className={cn(
              'min-h-[72px] flex-1 resize-none',
              isInternal && 'border-amber-300 focus-visible:ring-amber-400 dark:border-amber-700',
            )}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canPost) {
                e.preventDefault()
                createMutation.mutate()
              }
            }}
            disabled={createMutation.isPending}
            data-testid="comment-body-input"
          />
          <Button
            type="button"
            size="sm"
            onClick={() => createMutation.mutate()}
            disabled={!canPost}
            className="self-end"
            data-testid="comment-submit-btn"
          >
            <Send className="size-3.5" aria-hidden />
            {createMutation.isPending
              ? t.ticketDetail.commentSubmitting
              : t.ticketDetail.commentSubmit}
          </Button>
        </div>
      </div>
    </div>
  )
}

type CommentBubbleProps = {
  comment: TicketComment
}

function CommentBubble({ comment }: CommentBubbleProps) {
  const dateFormatter = new Intl.DateTimeFormat('en-IE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  return (
    <div
      className={cn(
        'rounded-md border p-3 text-sm',
        comment.is_internal
          ? 'border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/30'
          : 'bg-card border-input',
      )}
      data-testid={`comment-${comment.id}`}
    >
      <div className="mb-1.5 flex items-center gap-2">
        <span className="text-muted-foreground text-xs">
          {dateFormatter.format(new Date(comment.created_at))}
        </span>
        {comment.is_internal && (
          <span className="inline-flex items-center rounded-full border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
            Internal
          </span>
        )}
      </div>
      <p className="whitespace-pre-wrap">{comment.body}</p>
    </div>
  )
}

// ---- TimelinePanel ----------------------------------------------------------

type TimelinePanelProps = {
  ticketId: string
}

function TimelinePanel({ ticketId }: TimelinePanelProps) {
  const { data: events, isPending } = useQuery({
    queryKey: ['ticket-events', ticketId],
    queryFn: () => fetchTicketEvents(ticketId),
  })

  const dateFormatter = new Intl.DateTimeFormat('en-IE', {
    dateStyle: 'short',
    timeStyle: 'short',
  })

  if (isPending) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} className="bg-muted h-10 animate-pulse rounded-md" />
        ))}
      </div>
    )
  }

  if (!events || events.length === 0) {
    return (
      <p
        className="text-muted-foreground text-sm italic"
        data-testid="ticket-timeline-empty"
      >
        {t.ticketDetail.noEvents}
      </p>
    )
  }

  return (
    <ol className="flex flex-col gap-1" data-testid="ticket-timeline-list">
      {events.map((ev) => (
        <li
          key={ev.id}
          className={cn(
            'flex items-start gap-3 rounded-md px-2 py-2 text-sm',
            ev.is_internal && 'bg-amber-50 dark:bg-amber-950/20',
          )}
          data-testid={`timeline-event-${ev.id}`}
        >
          <span className="text-muted-foreground mt-0.5 min-w-[112px] text-xs">
            {dateFormatter.format(new Date(ev.created_at))}
          </span>
          <span className="flex-1">
            {renderEventLabel(ev)}
            {ev.is_internal && (
              <span className="ml-1.5 inline-flex items-center rounded-full border border-amber-400 bg-amber-100 px-1.5 py-0.5 text-[10px] font-medium text-amber-800 dark:bg-amber-950/50 dark:text-amber-300">
                Internal
              </span>
            )}
          </span>
        </li>
      ))}
    </ol>
  )
}

function renderEventLabel(ev: TicketEvent): string {
  const p = ev.payload
  switch (ev.event_type) {
    case 'created':
      return t.ticketDetail.eventCreated
    case 'status_changed':
      return t.ticketDetail.eventStatusChanged(
        String(p.from ?? '?'),
        String(p.to ?? '?'),
      )
    case 'assigned':
      return t.ticketDetail.eventAssigned
    case 'unassigned':
      return t.ticketDetail.eventUnassigned
    case 'blocked':
      return t.ticketDetail.eventBlocked
    case 'unblocked':
      return t.ticketDetail.eventUnblocked
    case 'comment_added':
      return p.is_internal
        ? t.ticketDetail.eventCommentInternal
        : t.ticketDetail.eventCommentAdded
    case 'label_added':
      return t.ticketDetail.eventLabelAdded
    case 'label_removed':
      return t.ticketDetail.eventLabelRemoved
    case 'promoted':
      return t.ticketDetail.eventPromoted(String(p.linked_bd_id ?? '?'))
    case 'shipped':
      return t.ticketDetail.eventShipped(String(p.release_ref ?? '?'))
    default:
      return t.ticketDetail.eventUnknown
  }
}

// ---- AttachmentsPanel -------------------------------------------------------

type AttachmentsPanelProps = {
  ticketId: string
  publicUserId: string | null
}

function AttachmentsPanel({ ticketId, publicUserId }: AttachmentsPanelProps) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const { data: attachments, isPending } = useQuery({
    queryKey: ['ticket-attachments', ticketId],
    queryFn: () => fetchTicketAttachments(ticketId),
  })

  const uploadMutation = useMutation({
    mutationFn: (file: File) =>
      uploadTicketAttachment(ticketId, file, publicUserId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['ticket-attachments', ticketId] })
    },
    onError: (err: Error, file: File) => {
      toast.error(t.ticketDetail.attachmentToastError(file.name), {
        description: err.message,
      })
    },
  })

  function handleFiles(files: FileList | null) {
    if (!files) return
    for (const file of Array.from(files)) {
      uploadMutation.mutate(file)
    }
  }

  // Clipboard paste handler (image blobs)
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    function onPaste(e: ClipboardEvent) {
      const items = e.clipboardData?.items
      if (!items) return
      for (const item of Array.from(items)) {
        if (item.kind === 'file') {
          const file = item.getAsFile()
          if (file) uploadMutation.mutate(file)
        }
      }
    }
    // Listen on the document so the user can paste from anywhere in the panel.
    document.addEventListener('paste', onPaste)
    return () => document.removeEventListener('paste', onPaste)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ticketId, publicUserId])

  return (
    <div
      ref={containerRef}
      className="flex flex-1 flex-col overflow-hidden"
      data-testid="ticket-attachments-panel"
    >
      {/* Attachment list */}
      <div className="flex flex-1 flex-col gap-2 overflow-y-auto px-4 pb-2 pt-3">
        {isPending ? (
          <div className="space-y-2">
            {Array.from({ length: 3 }, (_, i) => (
              <div key={i} className="bg-muted h-10 animate-pulse rounded" />
            ))}
          </div>
        ) : !attachments || attachments.length === 0 ? (
          <p
            className="text-muted-foreground text-sm italic"
            data-testid="ticket-attachments-empty"
          >
            {t.ticketDetail.noAttachments}
          </p>
        ) : (
          attachments.map((a) => (
            <AttachmentRow key={a.id} attachment={a} />
          ))
        )}
      </div>

      {/* Upload controls */}
      <div className="shrink-0 border-t px-4 pb-4 pt-3">
        <p className="text-muted-foreground mb-2 text-xs">
          {t.ticketDetail.attachmentPasteHint}
        </p>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          className="sr-only"
          aria-label={t.ticketDetail.attachmentUploadLabel}
          onChange={(e) => handleFiles(e.target.files)}
          data-testid="attachment-file-input"
        />
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="gap-1.5"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploadMutation.isPending || !publicUserId}
          data-testid="attachment-upload-btn"
        >
          <Paperclip className="size-3.5" aria-hidden />
          {uploadMutation.isPending
            ? t.ticketDetail.attachmentUploading
            : t.ticketDetail.attachmentUploadLabel}
        </Button>
      </div>
    </div>
  )
}

type AttachmentRowProps = {
  attachment: TicketAttachment
}

function AttachmentRow({ attachment }: AttachmentRowProps) {
  const [signingUrl, setSigningUrl] = useState(false)

  async function handleDownload() {
    setSigningUrl(true)
    try {
      const url = await getAttachmentSignedUrl(attachment.storage_path)
      const a = document.createElement('a')
      a.href = url
      a.download = attachment.filename
      a.click()
    } catch (err) {
      toast.error(
        t.ticketDetail.attachmentToastError(attachment.filename),
        {
          description: err instanceof Error ? err.message : undefined,
        },
      )
    } finally {
      setSigningUrl(false)
    }
  }

  const sizeKB = Math.ceil(attachment.size_bytes / 1024)
  const isImage = attachment.content_type.startsWith('image/')

  return (
    <div
      className="bg-card border-input flex items-center gap-3 rounded-md border px-3 py-2 text-sm"
      data-testid={`attachment-row-${attachment.id}`}
    >
      <Paperclip className="text-muted-foreground size-3.5 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium">{attachment.filename}</span>
        <span className="text-muted-foreground text-xs">
          {isImage ? 'Image' : attachment.content_type} · {sizeKB} KB
        </span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="shrink-0 text-xs"
        onClick={handleDownload}
        disabled={signingUrl}
        data-testid={`attachment-download-${attachment.id}`}
      >
        {signingUrl ? '…' : t.ticketDetail.attachmentDownload}
      </Button>
    </div>
  )
}
