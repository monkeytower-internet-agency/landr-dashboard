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

import { useCallback, useEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BellIcon, BellOffIcon, BotIcon, DownloadIcon, Eye, EyeOff, FileIcon, ImageIcon, MailIcon, Paperclip, Send, SmartphoneIcon, UserPlusIcon, XIcon, ZoomInIcon } from 'lucide-react'
import { toast } from 'sonner'

import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { supabase } from '@/lib/supabase'
import {
  fetchNotificationPrefs,
  fetchTicketNotifySettings,
  upsertTicketNotifySettings,
  resolveEffectiveNotifySettings,
  type TicketNotifySettings,
} from '@/lib/notification-prefs'

import { Button } from '@/components/ui/button'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

import {
  createComment,
  fetchAssignableUsers,
  fetchCurrentPublicUser,
  fetchTicketAttachments,
  fetchTicketComments,
  fetchTicketCommentsStaff,
  fetchTicketEvents,
  fetchTicketOperator,
  fetchTicketReporter,
  fetchTicketStaff,
  fetchTicketWatcher,
  getAttachmentSignedUrl,
  notifyMentions,
  parseMentionHandles,
  resolveMentionHandles,
  searchMentionUsers,
  splitMentionSegments,
  unwatchTicket,
  uploadTicketAttachment,
  watchTicket,
  PERCEIVED_IMPACT_LABEL,
  PRIORITY_LABEL,
  PRIORITY_TOOLTIP,
  TYPE_LABEL,
  type AssignableUser,
  type MentionUser,
  type TicketAttachment,
  type TicketComment,
  type TicketEvent,
  type TicketRow,
  type TicketRowStaff,
} from '@/lib/tickets'

import { TicketTriageCard } from './TicketTriageCard'
import { OriginChip } from './CardVisuals'

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
      <SheetHeader>
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

      {/* Tab strip — Comments first */}
      <Tabs
        value={activeTab}
        onValueChange={(v) => setActiveTab(v as Tab)}
        className="mx-4 mt-2 w-fit shrink-0 self-start"
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

      {/* Tab panels */}
      {activeTab === 'comments' ? (
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
      ) : activeTab === 'details' ? (
        <div
          role="tabpanel"
          aria-label={t.ticketDetail.tabDetails}
          className="flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-4 pt-3"
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

// ---- NotifyOverridePanel (landr-wwhn.16) ------------------------------------
//
// Per-ticket notification override. Shows:
//   - Effective setting (resolved from per-ticket override + global default).
//   - "Following your global default" badge OR "Custom for this ticket" badge.
//   - Channel toggles (bell / email / push) that write nullable-inherit rows:
//       NULL  = follow global (live)
//       bool  = explicit pin
//   - "Reset to global default" button removes the override row.
//
// Loads two queries: global prefs + per-ticket settings. When a per-ticket
// row exists, the toggle shows the per-ticket value; otherwise it shows the
// resolved effective value (which equals the global default when no override).
// Saving a toggle marks that single channel as explicitly set; the other
// channels remain as they were (null = still following global).
//
// Design: all-null per-ticket row → DELETE → pure inheritance. Implemented in
// upsertTicketNotifySettings() in the data layer.

type NotifyOverridePanelProps = {
  ticketId: string
  userId: string
}

// Outer loader: fetches global prefs + per-ticket override, then mounts the
// keyed editor so draft state initialises from the server data without needing
// useEffect+setState (which the React Compiler flags as a cascade risk).
function NotifyOverridePanel({ ticketId, userId }: NotifyOverridePanelProps) {
  const globalQuery = useQuery({
    queryKey: ['notification-prefs', userId],
    queryFn: () => fetchNotificationPrefs(userId),
    staleTime: 60_000,
  })

  const overrideQuery = useQuery({
    queryKey: ['ticket-notify-settings', ticketId, userId],
    queryFn: () => fetchTicketNotifySettings(ticketId, userId),
    staleTime: 30_000,
  })

  // Wait until both queries have settled before rendering the editor.
  // While pending, show nothing (the sheet already has a loading skeleton).
  if (globalQuery.isPending || overrideQuery.isPending) return null

  const globalPrefs = globalQuery.data ?? null
  const override: TicketNotifySettings | null = overrideQuery.data ?? null

  // Key the editor on the serialised override row: when the server row changes
  // after a save/clear the editor remounts with fresh initialState, avoiding
  // the need for useEffect+setState.
  const editorKey = JSON.stringify(override)

  return (
    <NotifyOverrideEditor
      key={editorKey}
      ticketId={ticketId}
      userId={userId}
      globalPrefs={globalPrefs}
      override={override}
    />
  )
}

type NotifyOverrideEditorProps = {
  ticketId: string
  userId: string
  globalPrefs: import('@/lib/notification-prefs').NotificationPrefs | null
  override: TicketNotifySettings | null
}

function NotifyOverrideEditor({
  ticketId,
  userId,
  globalPrefs,
  override,
}: NotifyOverrideEditorProps) {
  const qc = useQueryClient()

  // Draft mirrors the OVERRIDE row (nullable), not the resolved effective value.
  // null = "follow global" for that channel.
  const [draftBell, setDraftBell] = useState<boolean | null>(override?.bell ?? null)
  const [draftEmail, setDraftEmail] = useState<boolean | null>(override?.email ?? null)
  const [draftPush, setDraftPush] = useState<boolean | null>(override?.push ?? null)

  const hasOverride =
    override !== null &&
    (override.bell !== null || override.email !== null || override.push !== null)

  const dirty =
    draftBell !== (override?.bell ?? null) ||
    draftEmail !== (override?.email ?? null) ||
    draftPush !== (override?.push ?? null)

  const saveMutation = useMutation({
    mutationFn: () =>
      upsertTicketNotifySettings(ticketId, userId, {
        bell: draftBell,
        email: draftEmail,
        push: draftPush,
      }),
    onSuccess: () => {
      toast.success(t.notificationPrefs.overrideToastSaved)
      void qc.invalidateQueries({
        queryKey: ['ticket-notify-settings', ticketId, userId],
      })
    },
    onError: (err: Error) => {
      toast.error(t.notificationPrefs.overrideToastError, {
        description: err.message,
      })
    },
  })

  const clearMutation = useMutation({
    mutationFn: () =>
      upsertTicketNotifySettings(ticketId, userId, {
        bell: null,
        email: null,
        push: null,
      }),
    onSuccess: () => {
      toast.success(t.notificationPrefs.overrideToastCleared)
      void qc.invalidateQueries({
        queryKey: ['ticket-notify-settings', ticketId, userId],
      })
    },
    onError: (err: Error) => {
      toast.error(t.notificationPrefs.overrideToastError, {
        description: err.message,
      })
    },
  })

  const isPending = saveMutation.isPending || clearMutation.isPending

  // Effective values for display in each toggle (resolved from draft + global).
  const resolved = resolveEffectiveNotifySettings(
    globalPrefs,
    // Build a synthetic settings object from draft for display purposes.
    {
      ticket_id: ticketId,
      user_id: userId,
      bell: draftBell,
      email: draftEmail,
      push: draftPush,
      delivery_mode: null,
      created_at: '',
      updated_at: '',
    },
  )

  return (
    <Card data-testid="notify-override-panel">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-sm font-medium">
            {t.notificationPrefs.perTicketSectionTitle}
          </CardTitle>
          {hasOverride ? (
            <span
              className="inline-flex items-center rounded-full bg-blue-100 px-2 py-0.5 text-[10px] font-medium text-blue-800 dark:bg-blue-950/40 dark:text-blue-300"
              data-testid="notify-override-badge-custom"
            >
              {t.notificationPrefs.customForTicket}
            </span>
          ) : (
            <span
              className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground"
              data-testid="notify-override-badge-following"
            >
              {t.notificationPrefs.followingGlobal}
            </span>
          )}
        </div>
        {hasOverride && (
          <p className="text-muted-foreground mt-0.5 text-xs">
            {t.notificationPrefs.customHint}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {/* Channel toggles */}
        <div className="flex flex-col gap-2">
          <NotifyChannelRow
            icon={<BellIcon className="size-3.5" aria-hidden />}
            label={t.notificationPrefs.bellLabel}
            effective={resolved.bell}
            pinned={draftBell}
            onToggle={(v) => setDraftBell(v)}
            disabled={isPending}
            testId="notify-override-bell"
          />
          <NotifyChannelRow
            icon={<MailIcon className="size-3.5" aria-hidden />}
            label={t.notificationPrefs.emailLabel}
            effective={resolved.email}
            pinned={draftEmail}
            onToggle={(v) => setDraftEmail(v)}
            disabled={isPending}
            testId="notify-override-email"
          />
          <NotifyChannelRow
            icon={<SmartphoneIcon className="size-3.5" aria-hidden />}
            label={t.notificationPrefs.pushLabel}
            effective={resolved.push}
            pinned={draftPush}
            onToggle={(v) => setDraftPush(v)}
            disabled={isPending}
            testId="notify-override-push"
          />
        </div>

        {/* Action buttons */}
        <div className="flex items-center justify-between gap-2 pt-1">
          {hasOverride ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
              onClick={() => clearMutation.mutate()}
              disabled={isPending}
              title={t.notificationPrefs.followGlobalDesc}
              data-testid="notify-override-clear"
            >
              <BellOffIcon className="size-3" aria-hidden />
              {t.notificationPrefs.followGlobalAction}
            </Button>
          ) : (
            <span />
          )}
          {dirty && (
            <Button
              type="button"
              size="sm"
              className="h-7 px-3 text-xs"
              onClick={() => saveMutation.mutate()}
              disabled={isPending}
              data-testid="notify-override-save"
            >
              {saveMutation.isPending
                ? t.notificationPrefs.saving
                : t.notificationPrefs.saveAction}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ---- NotifyChannelRow -------------------------------------------------------

type NotifyChannelRowProps = {
  icon: React.ReactNode
  label: string
  /** The RESOLVED effective value (for display when following global). */
  effective: boolean
  /** The current draft value for this channel (null = not pinned). */
  pinned: boolean | null
  onToggle: (v: boolean | null) => void
  disabled: boolean
  testId: string
}

function NotifyChannelRow({
  icon,
  label,
  effective,
  pinned,
  onToggle,
  disabled,
  testId,
}: NotifyChannelRowProps) {
  // Display value: use pinned if explicitly set, otherwise fall back to
  // effective (which is the resolved global default).
  const displayValue = pinned !== null ? pinned : effective
  const isPinned = pinned !== null

  function handleClick() {
    if (!isPinned) {
      // First click: pin to the OPPOSITE of the current effective value.
      onToggle(!effective)
    } else {
      // Subsequent clicks: flip the pinned value.
      onToggle(!pinned)
    }
  }

  return (
    <div className="flex items-center justify-between gap-2 rounded px-1 py-0.5">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        {icon}
        <span className="text-xs">{label}</span>
        {isPinned && (
          <span className="text-[10px] font-medium text-blue-700 dark:text-blue-400">
            (custom)
          </span>
        )}
      </div>
      <Switch
        size="sm"
        checked={displayValue}
        onClick={handleClick}
        disabled={disabled}
        data-testid={testId}
      />
    </div>
  )
}

// ---- CommentsPanel ----------------------------------------------------------
//
// landr-wwhn.24: @mention autocomplete + override-quiet notification dispatch.
// When the user types "@" in the composer, we show a dropdown with matching
// users (searched via searchMentionUsers). Selecting a suggestion inserts the
// email local-part. After a successful comment post, we parse @handles from the
// body, resolve them to user IDs, and call notifyMentions (FastAPI) so those
// users receive a bell record even if their ticket settings are otherwise silent.

type CommentsPanelProps = {
  ticketId: string
  isStaff: boolean
}

function CommentsPanel({ ticketId, isStaff }: CommentsPanelProps) {
  const qc = useQueryClient()
  const [body, setBody] = useState('')
  const [isInternal, setIsInternal] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  // landr-7dya.9 — reply-with-CC: explicitly notify additional staff on this
  // reply. CC == an explicit notify target, dispatched through the SAME
  // notify-mentions fan-out (bell override-quiet + push/email echo). Selected
  // staff are merged with any parsed @mentions on submit.
  const [ccUserIds, setCcUserIds] = useState<Set<string>>(new Set())
  const ccStaffQuery = useQuery({
    queryKey: ['assignable-users'],
    queryFn: fetchAssignableUsers,
    staleTime: 5 * 60 * 1000,
  })
  // CC targets are human staff — a Claude agent isn't a meaningful "reply CC".
  const ccCandidates: AssignableUser[] = (ccStaffQuery.data ?? []).filter(
    (u) => u.is_landr_staff && !u.is_claude_agent,
  )
  const ccSelected: AssignableUser[] = ccCandidates.filter((u) =>
    ccUserIds.has(u.id),
  )

  function toggleCc(userId: string) {
    setCcUserIds((prev) => {
      const next = new Set(prev)
      if (next.has(userId)) next.delete(userId)
      else next.add(userId)
      return next
    })
  }

  // @mention autocomplete state
  const [mentionQuery, setMentionQuery] = useState<string | null>(null)
  const [mentionSuggestions, setMentionSuggestions] = useState<MentionUser[]>([])
  const [mentionLoading, setMentionLoading] = useState(false)
  const [mentionSelectedIdx, setMentionSelectedIdx] = useState(0)
  // Track the start offset of the current @-token so we can replace it on select.
  const mentionStartRef = useRef<number>(-1)
  const fetchAbortRef = useRef<AbortController | null>(null)

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

  // Fetch mention suggestions when mentionQuery changes.
  const fetchSuggestions = useCallback(async (q: string) => {
    // Cancel any in-flight fetch.
    fetchAbortRef.current?.abort()
    const ac = new AbortController()
    fetchAbortRef.current = ac
    setMentionLoading(true)
    try {
      const results = await searchMentionUsers(q)
      if (!ac.signal.aborted) {
        setMentionSuggestions(results)
        setMentionSelectedIdx(0)
      }
    } catch {
      if (!ac.signal.aborted) setMentionSuggestions([])
    } finally {
      if (!ac.signal.aborted) setMentionLoading(false)
    }
    // setState dispatchers are stable; listed so React Compiler's
    // preserve-manual-memoization inference matches the manual dep array.
  }, [setMentionLoading, setMentionSuggestions, setMentionSelectedIdx])

  useEffect(() => {
    // Debounce: schedule fetch after 200 ms idle. When mentionQuery is null,
    // we still schedule a timer so state updates happen asynchronously (the
    // React Compiler forbids synchronous setState in effect bodies).
    const timer = setTimeout(() => {
      if (mentionQuery === null) {
        setMentionSuggestions([])
        setMentionLoading(false)
        return
      }
      void fetchSuggestions(mentionQuery)
    }, mentionQuery === null ? 0 : 200)
    return () => clearTimeout(timer)
  }, [mentionQuery, fetchSuggestions])

  /** Detect whether the cursor is inside an @-token and update mention state. */
  function handleBodyChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const val = e.target.value
    setBody(val)
    const cursor = e.target.selectionStart ?? val.length
    // Walk backwards from cursor to find the last @ before any whitespace.
    let i = cursor - 1
    while (i >= 0 && !/\s/.test(val[i]!)) {
      if (val[i] === '@') {
        // Found an @-token starting at i.
        mentionStartRef.current = i
        setMentionQuery(val.slice(i + 1, cursor))
        return
      }
      i--
    }
    // No @-token in the current word — close dropdown.
    mentionStartRef.current = -1
    setMentionQuery(null)
  }

  /** Insert the selected user's email local-part at the @-token position. */
  function selectMentionUser(user: MentionUser) {
    const localPart = (user.email ?? '').split('@')[0] ?? ''
    const start = mentionStartRef.current
    if (start < 0) return
    const cursor = textareaRef.current?.selectionStart ?? body.length
    const newBody = `${body.slice(0, start)}@${localPart} ${body.slice(cursor)}`
    setBody(newBody)
    mentionStartRef.current = -1
    setMentionQuery(null)
    // Restore focus + move cursor past the inserted mention.
    setTimeout(() => {
      const ta = textareaRef.current
      if (ta) {
        ta.focus()
        const pos = start + localPart.length + 2 // '@' + localPart + ' '
        ta.setSelectionRange(pos, pos)
      }
    }, 0)
  }

  const showDropdown =
    mentionQuery !== null && (mentionLoading || mentionSuggestions.length > 0)

  const createMutation = useMutation({
    mutationFn: () =>
      createComment({
        ticket_id: ticketId,
        body: body.trim(),
        is_internal: isStaff ? isInternal : false,
      }),
    onSuccess: (comment) => {
      const postedBody = body.trim()
      // Snapshot the CC selection before clearing the composer state.
      const ccIds = Array.from(ccUserIds)
      setBody('')
      setIsInternal(false)
      setMentionQuery(null)
      setCcUserIds(new Set())
      void qc.invalidateQueries({ queryKey: ['ticket-comments', ticketId] })
      void qc.invalidateQueries({ queryKey: ['ticket-comments-staff', ticketId] })
      // Notify dispatch: @mentions (landr-7dya.12) + reply CC (landr-7dya.9) go
      // through the SAME override-quiet fan-out. Fire-and-forget; errors are
      // non-fatal (the comment is already posted — bell is best-effort). The
      // backend de-dupes and excludes the actor, so merging is safe.
      void (async () => {
        try {
          const handles = parseMentionHandles(postedBody)
          const mentionIds = handles.size
            ? Array.from((await resolveMentionHandles(handles)).values()).map(
                (u) => u.id,
              )
            : []
          // Merge mentions + CC, de-duplicated.
          const userIds = Array.from(new Set([...mentionIds, ...ccIds]))
          if (userIds.length > 0) {
            await notifyMentions(ticketId, comment.id, userIds, postedBody)
          }
        } catch {
          // Notify dispatch failure is non-fatal — the comment is already posted.
        }
      })()
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
            <Switch
              checked={isInternal}
              onClick={() => setIsInternal((v) => !v)}
              data-testid="comment-internal-toggle"
              className={cn(
                isInternal &&
                  'bg-amber-500 border-amber-500 dark:bg-amber-600 dark:border-amber-600',
              )}
            />
            <label
              className="cursor-pointer select-none text-xs font-medium"
              onClick={() => setIsInternal((v) => !v)}
            >
              {t.ticketDetail.commentInternalToggle}
            </label>
          </div>
        )}

        {/* Reply-with-CC picker (landr-7dya.9) — staff only. Lets the author
            notify additional staff on this reply via the mention dispatch. */}
        {isStaff && (
          <div
            className="mb-2 flex flex-wrap items-center gap-1.5"
            data-testid="cc-picker"
          >
            <span className="text-muted-foreground inline-flex items-center text-xs font-medium">
              {t.ticketDetail.ccLabel}:
            </span>
            {ccSelected.map((u) => (
              <span
                key={u.id}
                className="inline-flex items-center gap-1 rounded-full bg-blue-100 py-0.5 pl-2 pr-1 text-[11px] font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
                data-testid={`cc-chip-${u.id}`}
              >
                {u.email?.split('@')[0] ?? u.id}
                <button
                  type="button"
                  className="inline-flex size-3.5 items-center justify-center rounded-full hover:bg-blue-200 dark:hover:bg-blue-900"
                  onClick={() => toggleCc(u.id)}
                  aria-label={t.ticketDetail.ccRemove(u.email ?? u.id)}
                  data-testid={`cc-chip-remove-${u.id}`}
                >
                  <XIcon className="size-2.5" aria-hidden />
                </button>
              </span>
            ))}
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="h-6 gap-1 px-2 text-xs text-muted-foreground"
                  data-testid="cc-add-btn"
                >
                  <UserPlusIcon className="size-3" aria-hidden />
                  {t.ticketDetail.ccAddLabel}
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent
                align="start"
                className="max-h-60 w-56 overflow-y-auto"
                data-testid="cc-menu"
              >
                <DropdownMenuLabel className="text-xs">
                  {t.ticketDetail.ccPickerPlaceholder}
                </DropdownMenuLabel>
                <DropdownMenuSeparator />
                {ccCandidates.length === 0 ? (
                  <div className="text-muted-foreground px-2 py-1.5 text-xs">
                    {t.ticketDetail.ccNoStaff}
                  </div>
                ) : (
                  ccCandidates.map((u) => (
                    <DropdownMenuCheckboxItem
                      key={u.id}
                      checked={ccUserIds.has(u.id)}
                      // Keep the menu open across multiple selections.
                      onSelect={(e) => e.preventDefault()}
                      onCheckedChange={() => toggleCc(u.id)}
                      className="text-xs"
                      data-testid={`cc-option-${u.id}`}
                    >
                      {u.email ?? u.id}
                    </DropdownMenuCheckboxItem>
                  ))
                )}
              </DropdownMenuContent>
            </DropdownMenu>
            {ccSelected.length > 0 && (
              <span className="text-muted-foreground/70 w-full text-[10px]">
                {t.ticketDetail.ccHint}
              </span>
            )}
          </div>
        )}

        {/* @mention autocomplete dropdown */}
        {showDropdown && (
          <MentionDropdown
            loading={mentionLoading}
            suggestions={mentionSuggestions}
            selectedIdx={mentionSelectedIdx}
            onSelect={selectMentionUser}
            data-testid="mention-dropdown"
          />
        )}

        <div className="flex gap-2">
          <Textarea
            ref={textareaRef}
            value={body}
            onChange={handleBodyChange}
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
              // Keyboard navigation for the mention dropdown.
              if (showDropdown) {
                if (e.key === 'ArrowDown') {
                  e.preventDefault()
                  setMentionSelectedIdx((i) =>
                    Math.min(i + 1, mentionSuggestions.length - 1),
                  )
                  return
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault()
                  setMentionSelectedIdx((i) => Math.max(i - 1, 0))
                  return
                }
                if (e.key === 'Enter' && !e.shiftKey) {
                  const user = mentionSuggestions[mentionSelectedIdx]
                  if (user) {
                    e.preventDefault()
                    selectMentionUser(user)
                    return
                  }
                }
                if (e.key === 'Escape') {
                  setMentionQuery(null)
                  return
                }
              }
              if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && canPost) {
                e.preventDefault()
                createMutation.mutate()
              }
            }}
            disabled={createMutation.isPending}
            data-testid="comment-body-input"
            aria-autocomplete="list"
            aria-expanded={showDropdown}
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

// ---- MentionDropdown --------------------------------------------------------

type MentionDropdownProps = {
  loading: boolean
  suggestions: MentionUser[]
  selectedIdx: number
  onSelect: (user: MentionUser) => void
  'data-testid'?: string
}

function MentionDropdown({
  loading,
  suggestions,
  selectedIdx,
  onSelect,
  'data-testid': testId,
}: MentionDropdownProps) {
  return (
    <div
      role="listbox"
      aria-label="Mention suggestions"
      className="bg-popover border-border mb-1 max-h-40 overflow-y-auto rounded-md border shadow-md"
      data-testid={testId ?? 'mention-dropdown'}
    >
      {loading ? (
        <div className="text-muted-foreground px-3 py-2 text-xs">
          {t.ticketDetail.mentionSearching}
        </div>
      ) : suggestions.length === 0 ? (
        <div className="text-muted-foreground px-3 py-2 text-xs">
          {t.ticketDetail.mentionNoResults}
        </div>
      ) : (
        suggestions.map((u, idx) => (
          <button
            key={u.id}
            type="button"
            role="option"
            aria-selected={idx === selectedIdx}
            className={cn(
              'flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors',
              idx === selectedIdx
                ? 'bg-accent text-accent-foreground'
                : 'hover:bg-muted',
            )}
            onMouseDown={(e) => {
              // mousedown fires before textarea blur; prevent default so we
              // can still read the cursor position and insert the mention.
              e.preventDefault()
              onSelect(u)
            }}
            data-testid={`mention-option-${u.id}`}
          >
            <span className="font-medium">{u.email?.split('@')[0]}</span>
            <span className="text-muted-foreground truncate">{u.email}</span>
          </button>
        ))
      )}
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
      <p className="whitespace-pre-wrap" data-testid={`comment-body-${comment.id}`}>
        {/* landr-7dya.12 — highlight @mentions in the displayed body. */}
        {splitMentionSegments(comment.body).map((seg, i) =>
          seg.type === 'mention' ? (
            <span
              key={i}
              className="rounded bg-blue-100 px-0.5 font-medium text-blue-800 dark:bg-blue-950/50 dark:text-blue-300"
              data-testid="comment-mention"
            >
              {seg.value}
            </span>
          ) : (
            <span key={i}>{seg.value}</span>
          ),
        )}
      </p>
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

// ---- AttachmentLightbox --------------------------------------------------------
//
// landr-7dya.4 — Full-screen zoomable lightbox for image attachments.
// Pan: click-and-drag. Zoom: scroll wheel / pinch. Keyboard: Esc to close.
// The lightbox renders into a portal so it floats above the Sheet z-stack.

type LightboxProps = {
  src: string
  alt: string
  onClose: () => void
}

function AttachmentLightbox({ src, alt, onClose }: LightboxProps) {
  const [scale, setScale] = useState(1)
  const [offset, setOffset] = useState({ x: 0, y: 0 })
  const [isDragging, setIsDragging] = useState(false)
  const dragRef = useRef<{ startX: number; startY: number; ox: number; oy: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  // Close on Escape.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // Prevent body scroll while open.
  useEffect(() => {
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = prev }
  }, [])

  function handleWheel(e: React.WheelEvent) {
    e.preventDefault()
    const delta = e.deltaY > 0 ? -0.15 : 0.15
    setScale((s) => Math.max(0.5, Math.min(10, s + delta)))
  }

  function handleMouseDown(e: React.MouseEvent) {
    if (e.button !== 0) return
    e.preventDefault()
    dragRef.current = { startX: e.clientX, startY: e.clientY, ox: offset.x, oy: offset.y }
    setIsDragging(true)
    function onMove(ev: MouseEvent) {
      if (!dragRef.current) return
      setOffset({
        x: dragRef.current.ox + (ev.clientX - dragRef.current.startX),
        y: dragRef.current.oy + (ev.clientY - dragRef.current.startY),
      })
    }
    function onUp() {
      dragRef.current = null
      setIsDragging(false)
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
  }

  function handleBackdropClick(e: React.MouseEvent) {
    // Close only when clicking the backdrop itself, not the image.
    if (e.target === containerRef.current) onClose()
  }

  function resetZoom() {
    setScale(1)
    setOffset({ x: 0, y: 0 })
  }

  return (
    <div
      ref={containerRef}
      className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80"
      onClick={handleBackdropClick}
      data-testid="attachment-lightbox-backdrop"
      role="dialog"
      aria-modal="true"
      aria-label={`Image preview: ${alt}`}
    >
      {/* Controls row */}
      <div className="absolute top-3 right-3 flex items-center gap-2 z-10">
        <button
          type="button"
          className="rounded-md bg-white/10 px-2 py-1 text-xs text-white/80 hover:bg-white/20 transition-colors"
          onClick={resetZoom}
          data-testid="lightbox-reset-zoom"
        >
          Reset
        </button>
        <button
          type="button"
          aria-label="Close preview"
          className="rounded-md bg-white/10 p-1.5 text-white/80 hover:bg-white/20 transition-colors"
          onClick={onClose}
          data-testid="lightbox-close"
        >
          <XIcon className="size-4" aria-hidden />
        </button>
      </div>

      {/* Zoom hint */}
      <p className="absolute bottom-3 left-1/2 -translate-x-1/2 text-[10px] text-white/40 select-none pointer-events-none">
        Scroll to zoom · Drag to pan · Esc to close
      </p>

      {/* Image */}
      <div
        style={{
          transform: `translate(${offset.x}px, ${offset.y}px) scale(${scale})`,
          transformOrigin: 'center center',
          cursor: isDragging ? 'grabbing' : 'grab',
          userSelect: 'none',
        }}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        data-testid="lightbox-image-wrapper"
      >
        <img
          src={src}
          alt={alt}
          className="max-h-[85vh] max-w-[85vw] rounded shadow-2xl"
          draggable={false}
          data-testid="lightbox-image"
        />
      </div>
    </div>
  )
}

// ---- AttachmentRow ----------------------------------------------------------
//
// landr-7dya.4 — images show a thumbnail preview; clicking opens the lightbox.
// Non-images show a file icon. All attachments keep a download affordance.

type AttachmentRowProps = {
  attachment: TicketAttachment
}

function AttachmentRow({ attachment }: AttachmentRowProps) {
  const isImage = attachment.content_type.startsWith('image/')

  const [signingUrl, setSigningUrl] = useState(false)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [lightboxOpen, setLightboxOpen] = useState(false)
  // Start as `true` for images so the skeleton renders immediately without
  // a synchronous setState in the effect body.
  const [fetchingPreview, setFetchingPreview] = useState(isImage)
  const sizeKB = Math.ceil(attachment.size_bytes / 1024)

  // Lazy-load a signed URL for the image thumbnail on mount (images only).
  // fetchingPreview is initialised to `true` for images so the skeleton
  // renders on first paint; the effect only flips it to false after the fetch
  // resolves (success or failure), avoiding a synchronous setState-in-effect
  // that the React Compiler flags.
  useEffect(() => {
    if (!isImage) return
    let cancelled = false
    getAttachmentSignedUrl(attachment.storage_path)
      .then((url) => {
        if (!cancelled) {
          setPreviewUrl(url)
          setFetchingPreview(false)
        }
      })
      .catch(() => {
        if (!cancelled) setFetchingPreview(false)
      })
    return () => { cancelled = true }
  }, [isImage, attachment.storage_path])

  async function handleDownload() {
    setSigningUrl(true)
    try {
      const url = previewUrl ?? await getAttachmentSignedUrl(attachment.storage_path)
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

  return (
    <>
      <div
        className="bg-card border-input flex items-start gap-3 rounded-md border px-3 py-2 text-sm"
        data-testid={`attachment-row-${attachment.id}`}
      >
        {/* Thumbnail (images) or icon (non-images) */}
        <div className="shrink-0 mt-0.5">
          {isImage ? (
            fetchingPreview ? (
              <div
                className="size-10 rounded bg-muted animate-pulse"
                aria-hidden
              />
            ) : previewUrl ? (
              <button
                type="button"
                className="relative size-10 overflow-hidden rounded border border-border focus-visible:outline-2 focus-visible:outline-ring group"
                onClick={() => setLightboxOpen(true)}
                aria-label={`Preview ${attachment.filename}`}
                data-testid={`attachment-thumbnail-${attachment.id}`}
              >
                <img
                  src={previewUrl}
                  alt={attachment.filename}
                  className="size-full object-cover"
                />
                <span className="absolute inset-0 flex items-center justify-center bg-black/0 group-hover:bg-black/30 transition-colors">
                  <ZoomInIcon className="size-4 text-white opacity-0 group-hover:opacity-100 transition-opacity" aria-hidden />
                </span>
              </button>
            ) : (
              <ImageIcon className="size-5 text-muted-foreground" aria-hidden />
            )
          ) : (
            <FileIcon className="size-5 text-muted-foreground" aria-hidden />
          )}
        </div>

        {/* Metadata */}
        <span className="min-w-0 flex-1">
          <span className="block truncate font-medium">{attachment.filename}</span>
          <span className="text-muted-foreground text-xs">
            {isImage ? 'Image' : attachment.content_type} · {sizeKB} KB
          </span>
        </span>

        {/* Actions */}
        <div className="flex shrink-0 items-center gap-1">
          {isImage && previewUrl && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 w-7 p-0"
              onClick={() => setLightboxOpen(true)}
              aria-label={`Full-screen preview of ${attachment.filename}`}
              data-testid={`attachment-preview-btn-${attachment.id}`}
            >
              <ZoomInIcon className="size-3.5" aria-hidden />
            </Button>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0"
            onClick={handleDownload}
            disabled={signingUrl}
            aria-label={`Download ${attachment.filename}`}
            data-testid={`attachment-download-${attachment.id}`}
          >
            {signingUrl ? (
              <span className="text-xs">…</span>
            ) : (
              <DownloadIcon className="size-3.5" aria-hidden />
            )}
          </Button>
        </div>
      </div>

      {/* Lightbox (images only) */}
      {lightboxOpen && previewUrl ? (
        <AttachmentLightbox
          src={previewUrl}
          alt={attachment.filename}
          onClose={() => setLightboxOpen(false)}
        />
      ) : null}
    </>
  )
}
