// landr-znzz.8 — /retrieve route: the operator retrieve board.
//
// For one operator + one day, lists every check-in grouped by status:
//   in_progress        -> "Still out" (overdue-risk; highlighted, shown first)
//   arrived_elsewhere  -> "Landed elsewhere" (dropped pin + map link)
//   arrived_designated -> "Landed at the LZ" (already home)
// Each row carries the participant name, a status chip, the customer note,
// and an inline operator control to set the retrieve_state (one-tap chips:
// pending / driver_assigned / collected) + an optional free-text retrieve
// note. Writes go through the staff PATCH endpoint (landr-znzz.4) via a
// TanStack mutation that invalidates the day query so the board refreshes.
//
// Phone-friendly: the guide uses this in the field (single column on small
// screens, large tap targets, dropped-pin map links open the device map).

import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { cn } from '@/lib/utils'
import {
  RETRIEVE_STATES,
  checkinDisplayName,
  coordsLabel,
  fetchCheckins,
  mapUrl,
  patchCheckinRetrieve,
  sortCheckinsForBoard,
  statusMeta,
  todayIso,
  type Checkin,
} from '@/lib/checkins'
import { t } from '@/lib/strings'

export function RetrieveBoard() {
  const { currentOperatorId } = useOperator()
  const queryClient = useQueryClient()
  const [dayDate, setDayDate] = useState<string>(() => todayIso())

  const query = useQuery<Checkin[], Error>({
    queryKey: ['checkins', currentOperatorId ?? 'none', dayDate],
    queryFn: () => fetchCheckins(currentOperatorId as string, dayDate),
    enabled: !!currentOperatorId,
  })

  const sorted = useMemo(
    () => sortCheckinsForBoard(query.data ?? []),
    [query.data],
  )

  // Tracks which row is mid-write so the affected chips/buttons disable.
  const [pendingId, setPendingId] = useState<string | null>(null)

  const mutation = useMutation({
    mutationFn: (vars: {
      checkinId: string
      retrieve_state?: string | null
      retrieve_note?: string | null
    }) => {
      const { checkinId, ...patch } = vars
      return patchCheckinRetrieve(
        currentOperatorId as string,
        checkinId,
        patch,
      )
    },
    onMutate: (vars) => setPendingId(vars.checkinId),
    onSuccess: () => {
      toast.success(t.retrieve.toastSaved)
      void queryClient.invalidateQueries({
        queryKey: ['checkins', currentOperatorId ?? 'none', dayDate],
      })
    },
    onError: (err: Error) => {
      toast.error(t.retrieve.toastError, { description: err.message })
    },
    onSettled: () => setPendingId(null),
  })

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.retrieve.title} subtitle={t.retrieve.subtitle} />
      <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-end">
        <label className="flex flex-col gap-1 text-xs">
          <span className="text-muted-foreground">{t.retrieve.dayLabel}</span>
          <Input
            type="date"
            aria-label={t.retrieve.dayLabel}
            value={dayDate}
            onChange={(e) => setDayDate(e.target.value)}
            className="h-9 w-[12rem]"
          />
        </label>
      </header>

      {query.isError ? (
        <Card>
          <CardContent className="py-6">
            <p className="text-destructive text-sm font-medium">
              {t.retrieve.error}
            </p>
            <p className="text-muted-foreground mt-1 text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : query.isPending && currentOperatorId ? (
        <p className="text-muted-foreground text-sm">{t.retrieve.loading}</p>
      ) : sorted.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center">
            <p className="text-muted-foreground text-sm">{t.retrieve.empty}</p>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3" data-testid="retrieve-board">
          <p className="text-muted-foreground text-xs">
            {t.retrieve.countLabel(sorted.length)}
          </p>
          {sorted.map((checkin) => (
            <CheckinRow
              key={checkin.id}
              checkin={checkin}
              busy={pendingId === checkin.id && mutation.isPending}
              onSetRetrieveState={(state) =>
                mutation.mutate({
                  checkinId: checkin.id,
                  retrieve_state: state,
                })
              }
              onSaveRetrieveNote={(noteText) =>
                mutation.mutate({
                  checkinId: checkin.id,
                  retrieve_note: noteText,
                })
              }
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CheckinRow({
  checkin,
  busy,
  onSetRetrieveState,
  onSaveRetrieveNote,
}: {
  checkin: Checkin
  busy: boolean
  onSetRetrieveState: (state: string | null) => void
  onSaveRetrieveNote: (note: string) => void
}) {
  const meta = statusMeta(checkin.status)
  const map = mapUrl(checkin)
  const coords = coordsLabel(checkin)
  const [noteDraft, setNoteDraft] = useState<string>(checkin.retrieve_note ?? '')
  const noteDirty = noteDraft.trim() !== (checkin.retrieve_note ?? '').trim()

  return (
    <Card
      data-testid="checkin-row"
      data-status={checkin.status}
      className={cn(meta.isOverdueRisk && 'border-amber-400 dark:border-amber-700')}
    >
      <CardContent className="flex flex-col gap-3 py-4">
        {/* Top line: name + status chip */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-medium">{checkinDisplayName(checkin)}</span>
          <span
            data-testid="status-chip"
            className={cn(
              'inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium',
              meta.chipClass,
            )}
          >
            {meta.label}
          </span>
        </div>

        {/* Overdue hint for still-out rows */}
        {meta.isOverdueRisk ? (
          <p className="text-amber-700 dark:text-amber-300 text-xs">
            {t.retrieve.overdueHint}
          </p>
        ) : null}

        {/* Dropped-pin coords + map link */}
        {coords ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <span className="text-muted-foreground font-mono text-xs">
              {coords}
            </span>
            {map ? (
              <a
                href={map}
                target="_blank"
                rel="noreferrer noopener"
                className="text-primary text-xs font-medium underline underline-offset-2"
              >
                {t.retrieve.mapLink}
              </a>
            ) : null}
          </div>
        ) : null}

        {/* Customer note */}
        {checkin.note && checkin.note.trim() !== '' ? (
          <p className="text-sm">
            <span className="text-muted-foreground">
              {t.retrieve.noteLabel}:{' '}
            </span>
            {checkin.note}
          </p>
        ) : null}

        {/* Operator retrieve controls */}
        <div className="border-t pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-muted-foreground text-xs">
              {t.retrieve.retrieveStateLabel}:
            </span>
            {RETRIEVE_STATES.map((state) => {
              const active = checkin.retrieve_state === state
              return (
                <button
                  key={state}
                  type="button"
                  disabled={busy}
                  aria-pressed={active}
                  onClick={() => onSetRetrieveState(active ? null : state)}
                  className={cn(
                    'rounded-full border px-2.5 py-1 text-xs transition-colors disabled:opacity-50',
                    active
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-input hover:bg-accent hover:text-accent-foreground',
                  )}
                >
                  {state.replace(/_/g, ' ')}
                </button>
              )
            })}
            {/* Tolerate a free-text value set outside our chip set: show it. */}
            {checkin.retrieve_state &&
            !RETRIEVE_STATES.includes(
              checkin.retrieve_state as (typeof RETRIEVE_STATES)[number],
            ) ? (
              <span className="bg-muted text-muted-foreground rounded-full px-2.5 py-1 text-xs">
                {checkin.retrieve_state}
              </span>
            ) : null}
          </div>

          <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-start">
            <Textarea
              aria-label={t.retrieve.retrieveNoteLabel}
              placeholder={t.retrieve.retrieveNotePlaceholder}
              value={noteDraft}
              onChange={(e) => setNoteDraft(e.target.value)}
              rows={2}
              className="min-h-0 flex-1 text-sm"
            />
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy || !noteDirty}
              onClick={() => onSaveRetrieveNote(noteDraft.trim())}
            >
              {t.retrieve.saveRetrieveNote}
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}

// landr-znzz.8 — default export so the route can be lazy-loaded via
// React.lazy(() => import('@/routes/RetrieveBoard')) in App.tsx. Named export
// stays for direct test imports.
export default RetrieveBoard
