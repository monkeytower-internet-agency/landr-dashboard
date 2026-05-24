// landr-wwhn.23 — /tickets/planning MoSCoW release-planning overlay.
//
// A milestone-scoping view for feature tickets. Staff can tag each ticket
// Must/Should/Could/Won't; operators can view the tags (read-only).
//
// Architecture:
//   - Reuses the same tickets fetch (fetchTickets / fetchTicketsStaff) as the
//     board so TanStack Query serves from cache when the board was visited first.
//   - Grouping logic lives in src/lib/moscow-planning.ts (pure functions, not in
//     this file) so react-refresh/only-export-components is satisfied.
//   - MoSCoW write goes to FastAPI PATCH /api/landr-staff/tickets/{id}/moscow
//     (service-role; no INSERT/UPDATE grant for authenticated on moscow column).
//   - Per write-routing-convention: patchTicketMoscow() in tickets.ts.
//
// Accessibility:
//   - Each bucket is a <section> with aria-label.
//   - Select pickers carry aria-label.
//   - Staff-only sections have a visually distinct amber border.

import { useMemo, useState } from 'react'
import { toast } from 'sonner'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { PageTitle } from '@/lib/page-title'
import { useOperator } from '@/lib/operator'
import { useAuth } from '@/lib/auth'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import {
  MOSCOW_DESCRIPTION,
  MOSCOW_LABEL,
  MOSCOW_VALUES,
  TYPE_LABEL,
  fetchCurrentPublicUser,
  fetchTickets,
  patchTicketMoscow,
  type TicketMoscow,
  type TicketRow,
} from '@/lib/tickets'
import { buildMoscowBuckets, computeMoscowStats } from '@/lib/moscow-planning'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'

// ---- colour tokens per MoSCoW category --------------------------------------

const MOSCOW_TONE: Record<TicketMoscow, string> = {
  must: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300',
  should: 'bg-amber-100 text-amber-900 dark:bg-amber-950/40 dark:text-amber-300',
  could: 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-300',
  wont: 'bg-muted text-muted-foreground',
}

const MOSCOW_BORDER: Record<TicketMoscow, string> = {
  must: 'border-red-300 dark:border-red-700',
  should: 'border-amber-300 dark:border-amber-700',
  could: 'border-blue-300 dark:border-blue-700',
  wont: 'border-border',
}

// ---- main component ---------------------------------------------------------

export function TicketPlanning() {
  const { currentOperatorId } = useOperator()
  const { user: authUser } = useAuth()
  const qc = useQueryClient()

  const [typeFilter, setTypeFilter] = useState<'feature' | 'all'>('feature')

  // Resolve is_landr_staff for the current user (gates the write controls).
  const { data: publicUser } = useQuery({
    queryKey: ['current-public-user', authUser?.id ?? 'anon'],
    queryFn: () => fetchCurrentPublicUser(authUser!.id),
    enabled: !!authUser?.id,
    staleTime: 5 * 60 * 1000,
  })
  const isStaff = publicUser?.is_landr_staff === true

  // Tickets — same query key as TicketBoard so the cache is shared.
  const ticketQuery = useRealtimeQuery<TicketRow[]>({
    queryKey: ['tickets', currentOperatorId ?? 'none'],
    queryFn: () => fetchTickets(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? { table: 'tickets', filter: `operator_id=eq.${currentOperatorId}` }
      : null,
  })

  const tickets = useMemo(() => ticketQuery.data ?? [], [ticketQuery.data])
  const buckets = useMemo(
    () => buildMoscowBuckets(tickets, typeFilter),
    [tickets, typeFilter],
  )
  const stats = useMemo(() => computeMoscowStats(
    typeFilter === 'feature' ? tickets.filter((tk) => tk.type === 'feature') : tickets,
  ), [tickets, typeFilter])

  // Shared mutation — called from each MoscowRow.
  // The optimistic update is handled at the ticket-list level via TanStack Query
  // cache mutation (avoids needing a local override map at route level).
  const mutation = useMutation({
    mutationFn: ({ ticketId, moscow }: { ticketId: string; moscow: TicketMoscow | null }) =>
      patchTicketMoscow(ticketId, moscow),
    onMutate: async ({ ticketId, moscow }) => {
      // Cancel any in-flight fetches for this query key.
      await qc.cancelQueries({ queryKey: ['tickets', currentOperatorId ?? 'none'] })
      // Snapshot for rollback.
      const previous = qc.getQueryData<TicketRow[]>(['tickets', currentOperatorId ?? 'none'])
      // Optimistic update.
      qc.setQueryData<TicketRow[]>(
        ['tickets', currentOperatorId ?? 'none'],
        (old) => old?.map((tk) => tk.id === ticketId ? { ...tk, moscow } : tk) ?? [],
      )
      return { previous }
    },
    onError: (_err, _vars, context) => {
      // Rollback on error.
      if (context?.previous) {
        qc.setQueryData(['tickets', currentOperatorId ?? 'none'], context.previous)
      }
      toast.error(t.ticketPlanning.errorToast)
    },
    onSettled: () => {
      void qc.invalidateQueries({ queryKey: ['tickets', currentOperatorId ?? 'none'] })
    },
    onSuccess: (_data, { ticketId, moscow }, context) => {
      // Find the ticket title from the pre-mutation snapshot (the optimistic
      // update has already replaced the moscow value in the cache).
      const prevTickets = context?.previous ?? []
      const ticket = prevTickets.find((tk) => tk.id === ticketId)
      const title = ticket?.title ?? 'Ticket'
      if (moscow) {
        toast.success(t.ticketPlanning.saveToast(title, MOSCOW_LABEL[moscow]))
      } else {
        toast.success(t.ticketPlanning.clearToast(title))
      }
    },
  })

  // ---- error state ----------------------------------------------------------

  if (ticketQuery.isError) {
    return (
      <div className="flex flex-col gap-6">
        <PageTitle title={t.ticketPlanning.pageTitle} />
        <header>
          <h1 className="text-xl font-semibold">{t.ticketPlanning.pageTitle}</h1>
        </header>
        <Card>
          <CardHeader>
            <CardTitle>Failed to load tickets</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {ticketQuery.error instanceof Error ? ticketQuery.error.message : ''}
            </p>
          </CardContent>
        </Card>
      </div>
    )
  }

  // ---- render ---------------------------------------------------------------

  const ticketCount = typeFilter === 'feature'
    ? tickets.filter((tk) => tk.type === 'feature').length
    : tickets.length

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={t.ticketPlanning.pageTitle}
        subtitle={
          ticketQuery.isPending
            ? undefined
            : `${ticketCount} ticket${ticketCount === 1 ? '' : 's'} · ${stats.planned} planned · ${stats.unplanned} unplanned`
        }
      />

      <header className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-xl font-semibold">{t.ticketPlanning.pageTitle}</h1>
          {/* Type filter */}
          <select
            aria-label="Filter by ticket type"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value as 'feature' | 'all')}
            className="border-input bg-background rounded-md border px-2 py-1.5 text-sm focus-visible:outline-2 focus-visible:outline-ring"
            data-testid="planning-type-filter"
          >
            <option value="feature">{t.ticketPlanning.filterFeatures}</option>
            <option value="all">{t.ticketPlanning.filterAll}</option>
          </select>
        </div>
        <p className="text-muted-foreground text-sm">{t.ticketPlanning.pageSubtitle}</p>

        {/* Operator read-only banner */}
        {!isStaff && !ticketQuery.isPending && (
          <div
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
            data-testid="planning-readonly-banner"
          >
            {t.ticketPlanning.staffOnlyBanner}
          </div>
        )}

        {/* Stats summary chips */}
        {!ticketQuery.isPending && (
          <div className="flex flex-wrap gap-2" data-testid="planning-stats">
            {MOSCOW_VALUES.map((key) => (
              <span
                key={key}
                className={cn(
                  'inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium',
                  MOSCOW_TONE[key],
                )}
                data-testid={`planning-stat-${key}`}
              >
                {MOSCOW_LABEL[key]}
                <span className="font-bold">{stats.byTag[key]}</span>
              </span>
            ))}
          </div>
        )}
      </header>

      {/* Loading skeleton */}
      {ticketQuery.isPending ? (
        <div className="flex flex-col gap-4">
          {Array.from({ length: 4 }, (_, i) => (
            <div
              key={i}
              className="bg-muted h-32 animate-pulse rounded-md"
              data-testid={`planning-skeleton-${i}`}
            />
          ))}
        </div>
      ) : tickets.length === 0 ? (
        <p
          className="text-muted-foreground text-sm italic"
          data-testid="planning-empty-all"
        >
          {t.ticketPlanning.emptyAll}
        </p>
      ) : (
        <div className="flex flex-col gap-6" data-testid="planning-buckets">
          {buckets.map((bucket) => (
            <MoscowSection
              key={bucket.key ?? '__unplanned__'}
              bucketKey={bucket.key}
              label={bucket.label}
              tickets={bucket.tickets}
              isStaff={isStaff}
              isPending={mutation.isPending}
              onSetMoscow={(ticketId, moscow) => mutation.mutate({ ticketId, moscow })}
            />
          ))}
        </div>
      )}
    </div>
  )
}

export default TicketPlanning

// ---- MoscowSection ----------------------------------------------------------

type MoscowSectionProps = {
  bucketKey: TicketMoscow | null
  label: string
  tickets: TicketRow[]
  isStaff: boolean
  isPending: boolean
  onSetMoscow: (ticketId: string, moscow: TicketMoscow | null) => void
}

function MoscowSection({
  bucketKey,
  label,
  tickets,
  isStaff,
  isPending,
  onSetMoscow,
}: MoscowSectionProps) {
  const isEmpty = tickets.length === 0
  const isUnplanned = bucketKey === null

  return (
    <section
      aria-label={`${label} (${tickets.length})`}
      data-testid={`planning-section-${bucketKey ?? 'unplanned'}`}
    >
      <div className="mb-2 flex items-center gap-2">
        {bucketKey ? (
          <span
            className={cn(
              'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold',
              MOSCOW_TONE[bucketKey],
            )}
          >
            {label}
          </span>
        ) : (
          <span className="text-muted-foreground text-sm font-medium">{label}</span>
        )}
        <span className="text-muted-foreground text-xs">{tickets.length}</span>
        {bucketKey && (
          <span className="text-muted-foreground text-xs italic">
            {MOSCOW_DESCRIPTION[bucketKey]}
          </span>
        )}
      </div>

      {isEmpty ? (
        <p
          className="text-muted-foreground rounded-md border border-dashed px-4 py-3 text-xs italic"
          data-testid={`planning-section-empty-${bucketKey ?? 'unplanned'}`}
        >
          {isUnplanned ? t.ticketPlanning.emptyUnplanned : `No tickets tagged "${label}".`}
        </p>
      ) : (
        <div
          className={cn(
            'rounded-md border',
            bucketKey ? MOSCOW_BORDER[bucketKey] : 'border-border',
          )}
        >
          <ul role="list">
            {tickets.map((ticket, idx) => (
              <MoscowRow
                key={ticket.id}
                ticket={ticket}
                isStaff={isStaff}
                isPending={isPending}
                onSetMoscow={onSetMoscow}
                isLast={idx === tickets.length - 1}
              />
            ))}
          </ul>
        </div>
      )}
    </section>
  )
}

// ---- MoscowRow --------------------------------------------------------------

type MoscowRowProps = {
  ticket: TicketRow
  isStaff: boolean
  isPending: boolean
  onSetMoscow: (ticketId: string, moscow: TicketMoscow | null) => void
  isLast: boolean
}

function MoscowRow({ ticket, isStaff, isPending, onSetMoscow, isLast }: MoscowRowProps) {
  return (
    <li
      className={cn(
        'flex items-center gap-3 px-3 py-2.5 text-sm',
        !isLast && 'border-b',
      )}
      data-testid={`planning-row-${ticket.id}`}
    >
      {/* Type chip */}
      <span
        className={cn(
          'inline-flex shrink-0 items-center rounded px-1.5 py-0.5 text-[10px] font-medium',
          ticket.type === 'feature'
            ? 'bg-blue-100 text-blue-900 dark:bg-blue-950/40 dark:text-blue-300'
            : 'bg-muted text-muted-foreground',
        )}
        data-testid={`planning-row-type-${ticket.id}`}
      >
        {TYPE_LABEL[ticket.type]}
      </span>

      {/* Title */}
      <span className="min-w-0 flex-1 truncate font-medium" title={ticket.title}>
        {ticket.title}
      </span>

      {/* MoSCoW badge or selector */}
      {isStaff ? (
        <StaffMoscowPicker
          ticketId={ticket.id}
          currentMoscow={ticket.moscow}
          isPending={isPending}
          onSetMoscow={onSetMoscow}
        />
      ) : (
        ticket.moscow ? (
          <span
            className={cn(
              'inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-medium',
              MOSCOW_TONE[ticket.moscow],
            )}
            data-testid={`planning-row-tag-${ticket.id}`}
          >
            {MOSCOW_LABEL[ticket.moscow]}
          </span>
        ) : (
          <span
            className="text-muted-foreground shrink-0 text-[10px] italic"
            data-testid={`planning-row-tag-${ticket.id}`}
          >
            —
          </span>
        )
      )}
    </li>
  )
}

// ---- StaffMoscowPicker ------------------------------------------------------

type StaffMoscowPickerProps = {
  ticketId: string
  currentMoscow: TicketMoscow | null
  isPending: boolean
  onSetMoscow: (ticketId: string, moscow: TicketMoscow | null) => void
}

function StaffMoscowPicker({
  ticketId,
  currentMoscow,
  isPending,
  onSetMoscow,
}: StaffMoscowPickerProps) {
  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <select
        aria-label="Set MoSCoW tag"
        value={currentMoscow ?? ''}
        onChange={(e) => {
          const val = e.target.value
          onSetMoscow(ticketId, val === '' ? null : (val as TicketMoscow))
        }}
        disabled={isPending}
        className="border-input bg-background rounded border px-1.5 py-0.5 text-[11px] focus-visible:outline-2 focus-visible:outline-ring disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={`planning-row-picker-${ticketId}`}
      >
        <option value="">— Unplanned —</option>
        {MOSCOW_VALUES.map((key) => (
          <option key={key} value={key}>
            {MOSCOW_LABEL[key]}
          </option>
        ))}
      </select>
      {currentMoscow && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 px-1.5 text-[10px] text-muted-foreground"
          onClick={() => onSetMoscow(ticketId, null)}
          disabled={isPending}
          title={t.ticketPlanning.clearLabel}
          data-testid={`planning-row-clear-${ticketId}`}
        >
          ×
        </Button>
      )}
    </div>
  )
}
