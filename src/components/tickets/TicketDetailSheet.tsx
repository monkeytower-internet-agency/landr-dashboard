// landr-wwhn.13 — Ticket detail sheet.
// landr-wwhn.14 — Send-to-development gateway UI (landr-staff only).
// landr-wwhn.22 — Assignee section: picker for staff, read-only for operators.
// landr-wwhn.24 — @mention parsing + user-search autocomplete in comment composer.
// landr-wwhn.32 — Rework: header who-to-contact, Comments first, read-only
//                 Details, staff actions extracted to TicketTriageCard.
//
// Opens from the kanban board when an operator or staff clicks a ticket card.
// Architecture follows BookingDetailSheet.tsx: a Sheet shell delegates to a
// body component that is keyed by ticket id, ensuring a clean remount on each
// new ticket open and avoiding stale state.
//
// Tabs (in order): Comments | Details | Timeline | Attachments.
//   Comments is primary — the conversation comes first.
//   Details is VIEW-ONLY — no inline edits.
//
// Header shows:
//   - ticket title
//   - operator org name (fetched from `operators` table via operator_id)
//   - reporter email (fetched from `users` table via reporter_id)
//   - Watch toggle
//
// Staff (is_landr_staff) see additional fields:
//   * Details tab: severity, linked_bd_id, sync_status (read via tickets_staff view).
//   * Details tab: TicketTriageCard — assignee picker + GatewayPanel.
//   * Comments tab: internal notes (is_internal=true) + can post internal comments.
//   * Timeline: internal events (is_internal=true comment_added events).
//
// Per write-routing-convention:
//   * Comment INSERT / watcher toggle / attachment metadata INSERT = direct
//     Supabase REST (plain row writes covered by RLS + audit trigger).
//   * Storage upload = Supabase Storage SDK (client-side, RLS enforced).
//   * Gateway promotion → FastAPI POST /api/landr-staff/tickets/{id}/promote
//     (side-effecting orchestration: bd create + stamp back linked_bd_id).
//   * Mention dispatch → FastAPI POST /api/tickets/{id}/notify-mentions
//     (side-effecting: override-quiet bell + echoes for mentioned users).
//
// Realtime: subscribe to ticket_comments + ticket_events + ticket_attachments
// for the open ticket so the thread stays live.
//
// @mention UX (landr-wwhn.24):
//   - Typing @ in the composer opens an autocomplete dropdown.
//   - Suggestions are fetched via searchMentionUsers() (users table, ilike).
//   - Selecting a suggestion inserts "@email-local-part " and closes the dropdown.
//   - After a comment posts successfully, parseMentionHandles() extracts the
//     handles, resolveMentionHandles() maps them to user IDs, and notifyMentions()
//     calls the FastAPI endpoint which override-quiet dispatches to each mentioned
//     user (the ONE event allowed to bypass a silenced ticket per EPIC design).

import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BotIcon, Eye, EyeOff } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { supabase } from '@/lib/supabase'
import { useIsMobile } from '@/hooks/use-mobile'
import {
  mobileSheetContent,
  mobileSheetHeader,
  mobileSheetBody,
  mobileSheetTabStrip,
} from '@/lib/mobile-sheet-classes'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

import {
  fetchAssignableUsers,
  fetchCurrentPublicUser,
  fetchTicketOperator,
  fetchTicketReporter,
  fetchTicketStaff,
  fetchTicketWatcher,
  unwatchTicket,
  watchTicket,
  PERCEIVED_IMPACT_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TOOLTIP,
  TYPE_LABEL,
  type AssignableUser,
  type TicketRow,
  type TicketRowStaff,
} from '@/lib/tickets'

import { TicketTriageCard } from './TicketTriageCard'
import { OriginChip } from './CardVisuals'
import { CommentsPanel } from './CommentsPanel'
import { AttachmentsPanel } from './TicketAttachments'
import { NotifyOverridePanel } from './NotifyOverridePanel'
import { TimelinePanel } from './TicketTimeline'

// ---- Types ------------------------------------------------------------------

type Tab = 'comments' | 'details' | 'timeline' | 'attachments'

// ---- Public component -------------------------------------------------------

type Props = {
  ticket: TicketRow | null
  onOpenChange: (open: boolean) => void
}

export function TicketDetailSheet({ ticket, onOpenChange }: Props) {
  const open = ticket !== null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* landr-3qkr.3 — full-screen below md. */}
      <SheetContent
        className={cn(
          'flex w-full flex-col gap-0 sm:max-w-[52rem]',
          mobileSheetContent,
        )}
      >
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
  const isMobile = useIsMobile()
  // Comments is the primary tab — open first.
  const [activeTab, setActiveTab] = useState<Tab>('comments')

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

  // Operator name for the header.
  const { data: ticketOperator } = useQuery({
    queryKey: ['ticket-operator', ticket.operator_id],
    queryFn: () => fetchTicketOperator(ticket.operator_id),
    staleTime: 10 * 60 * 1000,
  })

  // Reporter email for the header.
  const { data: ticketReporter } = useQuery({
    queryKey: ['ticket-reporter', ticket.reporter_id ?? 'none'],
    queryFn: () =>
      ticket.reporter_id ? fetchTicketReporter(ticket.reporter_id) : null,
    enabled: !!ticket.reporter_id,
    staleTime: 10 * 60 * 1000,
  })

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
      {/* landr-3qkr.3 — sticky header below md with notch clearance. */}
      <SheetHeader className={cn('p-4', isMobile && mobileSheetHeader)}>
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <div className="flex items-start gap-2 flex-wrap">
              <SheetTitle className="line-clamp-2 text-base leading-snug">
                {ticket.title}
              </SheetTitle>
              {/* landr-7dya.2 — origin chip. For staff: from tickets_staff (has
                  staging relay context). For operators: from the public ticket
                  row (operators also see the chip on their own staging tickets). */}
              {(staffDetail?.origin_tier ?? ticket.origin_tier) && (
                <OriginChip
                  tier={staffDetail?.origin_tier ?? ticket.origin_tier}
                  operatorLabel={
                    staffDetail?.origin_operator_label ??
                    ticket.origin_operator_label
                  }
                  className="mt-0.5 shrink-0"
                  data-testid="ticket-detail-origin-chip"
                />
              )}
            </div>
            {/* Who-to-contact meta: org name + reporter */}
            <SheetDescription className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5">
              <span data-testid="ticket-header-ticket-id">
                {t.ticketDetail.sheetDescription(ticket.id)}
                {' · '}
                {TYPE_LABEL[ticket.type]}
              </span>
              <span
                className="text-muted-foreground/60"
                aria-hidden
              >
                ·
              </span>
              <span
                className="flex items-center gap-1"
                data-testid="ticket-header-operator"
              >
                <span className="font-medium text-foreground/70">
                  {t.ticketDetail.headerOperatorLabel}:
                </span>
                <span>
                  {ticketOperator?.name ?? t.ticketDetail.headerOperatorUnknown}
                </span>
              </span>
              {ticket.reporter_id && (
                <>
                  <span className="text-muted-foreground/60" aria-hidden>
                    ·
                  </span>
                  <span
                    className="flex items-center gap-1"
                    data-testid="ticket-header-reporter"
                  >
                    <span className="font-medium text-foreground/70">
                      {t.ticketDetail.headerReporterLabel}:
                    </span>
                    <span>
                      {ticketReporter?.email ??
                        t.ticketDetail.headerReporterUnknown}
                    </span>
                  </span>
                </>
              )}
            </SheetDescription>
          </div>
          <WatchToggle
            ticketId={ticket.id}
            publicUserId={publicUserId}
          />
        </div>
      </SheetHeader>

      {/* Tab strip — Comments first.
          landr-3qkr.3 — horizontally scrollable on mobile. */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as Tab)}
        className={cn('mx-4 mt-2 w-fit shrink-0 self-start', mobileSheetTabStrip)}
      >
        <TabsList variant="pill" aria-label={t.ticketDetail.sheetTitle}>
          <TabsTrigger
            variant="pill"
            value="comments"
            data-testid="ticket-detail-tab-comments"
          >
            {t.ticketDetail.tabComments}
          </TabsTrigger>
          <TabsTrigger
            variant="pill"
            value="details"
            data-testid="ticket-detail-tab-details"
          >
            {t.ticketDetail.tabDetails}
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

      {/* Tab panels — landr-3qkr.3: mobileSheetBody adds pb-safe on phones. */}
      {activeTab === 'comments' ? (
        <div
          role="tabpanel"
          aria-label={t.ticketDetail.tabComments}
          className={cn('flex flex-1 flex-col overflow-hidden', mobileSheetBody)}
        >
          <CommentsPanel
            ticketId={ticket.id}
            isStaff={isStaff}
          />
        </div>
      ) : activeTab === 'details' ? (
        <div
          role="tabpanel"
          aria-label={t.ticketDetail.tabDetails}
          className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3', mobileSheetBody)}
        >
          <DetailsPanel
            ticket={ticket}
            staffDetail={isStaff ? staffDetail : null}
            isStaff={isStaff}
            publicUserId={publicUserId}
            onPromoteSuccess={() => {
              void qc.invalidateQueries({ queryKey: ['ticket-staff', ticket.id] })
              void qc.invalidateQueries({ queryKey: ['ticket-events', ticket.id] })
            }}
            onAssigneeChange={() => {
              void qc.invalidateQueries({ queryKey: ['tickets', ticket.operator_id] })
              void qc.invalidateQueries({ queryKey: ['ticket-events', ticket.id] })
            }}
          />
        </div>
      ) : activeTab === 'timeline' ? (
        <div
          role="tabpanel"
          aria-label={t.ticketDetail.tabTimeline}
          className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3', mobileSheetBody)}
        >
          <TimelinePanel ticketId={ticket.id} />
        </div>
      ) : (
        <div
          role="tabpanel"
          aria-label={t.ticketDetail.tabAttachments}
          className={cn('flex flex-1 flex-col overflow-hidden', mobileSheetBody)}
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
      // Guard: publicUserId must be resolved before the mutation can run.
      // The button is disabled while watchQuery is pending, but double-check
      // here to avoid acting on stale closure state.
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
    onError: (err: Error) => {
      // Surface the real error so it's visible in the toast and debuggable in
      // the console — not just a generic "could not update" fallback.
      console.error('[WatchToggle] watch mutation failed:', err)
      toast.error(t.ticketDetail.watchToastError, { description: err.message })
    },
  })

  if (!publicUserId) return null

  // Disable the button while the watch-status query is loading OR in error
  // state (can't determine current watch state, so a click would be a guess).
  const isQueryBusy = watchQuery.isPending || watchQuery.isError

  return (
    <Button
      type="button"
      variant={isWatching ? 'default' : 'outline'}
      size="sm"
      className="shrink-0 gap-1.5 text-xs"
      onClick={() => mutation.mutate()}
      disabled={mutation.isPending || isQueryBusy}
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
//
// VIEW-ONLY: displays ticket fields. No inline editing.
// Staff additionally see: internal fields card + TicketTriageCard (actions).

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
  publicUserId: string | null
  onPromoteSuccess: () => void
  onAssigneeChange: () => void
}

function DetailsPanel({
  ticket,
  staffDetail,
  isStaff,
  publicUserId,
  onPromoteSuccess,
  onAssigneeChange,
}: DetailsPanelProps) {
  const dateFormatter = new Intl.DateTimeFormat('en-IE', {
    dateStyle: 'medium',
    timeStyle: 'short',
  })

  // Fetch assignable users for the read-only assignee display (operators).
  // For staff the full picker is in TicketTriageCard; we still need the
  // resolved name here for the read-only operator view.
  const assignableQuery = useQuery({
    queryKey: ['assignable-users'],
    queryFn: fetchAssignableUsers,
    staleTime: 5 * 60 * 1000,
  })
  const assignableUsers: AssignableUser[] = assignableQuery.data ?? []
  const currentAssignee: AssignableUser | null =
    ticket.assignee_id
      ? (assignableUsers.find((u) => u.id === ticket.assignee_id) ?? null)
      : null

  return (
    <div className="flex flex-col gap-4">
      {/* Status card */}
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

      {/* Core fields — view-only */}
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

      {/* Assignee — read-only display for operators. Staff see the picker in TicketTriageCard. */}
      {!isStaff && (
        <Card data-testid="assignee-section">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t.ticketDetail.assigneeSectionTitle}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {ticket.assignee_id && currentAssignee ? (
              <AssigneeDisplay assignee={currentAssignee} />
            ) : (
              <span
                className="text-muted-foreground text-sm italic"
                data-testid="assignee-unassigned"
              >
                {t.ticketDetail.assigneeUnassigned}
              </span>
            )}
          </CardContent>
        </Card>
      )}

      {/* Description — view-only */}
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

      {/* Notification preferences override (landr-wwhn.16) */}
      {publicUserId && (
        <NotifyOverridePanel
          ticketId={ticket.id}
          userId={publicUserId}
        />
      )}

      {/* Staff triage/actions card (landr-wwhn.32) — assignee picker + gateway */}
      {isStaff && (
        <TicketTriageCard
          ticket={ticket}
          staffDetail={staffDetail}
          onAssigneeChange={onAssigneeChange}
          onPromoteSuccess={onPromoteSuccess}
        />
      )}
    </div>
  )
}

// ---- AssigneeDisplay --------------------------------------------------------
//
// Read-only display of the current assignee. Used by DetailsPanel for
// the operator view (staff see the picker inside TicketTriageCard).

type AssigneeDisplayProps = {
  assignee: AssignableUser
}

function AssigneeDisplay({ assignee }: AssigneeDisplayProps) {
  return (
    <div
      className="flex items-center gap-2"
      data-testid="assignee-display"
    >
      {assignee.is_claude_agent ? (
        <span className="inline-flex size-6 items-center justify-center rounded-full bg-indigo-100 text-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-300">
          <BotIcon className="size-3.5" aria-hidden />
        </span>
      ) : (
        <span className="bg-emerald-100 inline-flex size-6 items-center justify-center rounded-full text-[10px] font-semibold text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          {(() => {
            const local = (assignee.email ?? '').split('@')[0] ?? ''
            const parts = local.split(/[._-]/).filter(Boolean)
            const initials = parts.length >= 2
              ? `${parts[0][0]}${parts[1][0]}`.toUpperCase()
              : local.slice(0, 2).toUpperCase()
            return initials || '?'
          })()}
        </span>
      )}
      <div className="flex flex-col">
        <span className="text-sm font-medium">
          {assignee.email ?? (assignee.is_claude_agent ? 'Claude agent' : assignee.id)}
        </span>
        <span className="text-muted-foreground text-xs">
          {assignee.is_claude_agent
            ? t.ticketDetail.assigneeAgentBadge
            : t.ticketDetail.assigneeStaffBadge}
        </span>
      </div>
    </div>
  )
}

