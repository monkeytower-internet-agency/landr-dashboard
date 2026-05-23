// landr-funh — per-booking-day provider assignment picker inside
// BookingDetailSheet. One row per booking-day; each row carries the
// already-assigned providers (with an unassign button) plus a picker to
// add another provider for that day.
//
// Booking-days are derived from the booking's line items (date_range or
// selected_days) via bookingDayOptions — exactly the days the server's
// date-range guard will accept on POST.

import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'
import { XIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import {
  bookingDayOptions,
  createAssignment,
  deleteAssignment,
  fetchBookingAssignments,
  fetchProviderRoster,
  type Provider,
  type ProviderAssignment,
} from '@/lib/providers'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
  bookingId: string
  items: ReadonlyArray<{
    date_range_start: string | null
    date_range_end: string | null
    selected_days: string[] | null
  }>
}

const ASSIGNMENTS_KEY = 'booking-provider-assignments'
const ROSTER_KEY = 'provider-roster'

export function BookingProviderAssignments({
  operatorId,
  bookingId,
  items,
}: Props) {
  const queryClient = useQueryClient()

  const days = bookingDayOptions(items)

  const assignmentsQuery = useQuery<ProviderAssignment[]>({
    queryKey: [ASSIGNMENTS_KEY, operatorId, bookingId],
    queryFn: () => fetchBookingAssignments(operatorId, bookingId),
    enabled: !!operatorId && !!bookingId,
  })

  const rosterQuery = useQuery<Provider[]>({
    queryKey: [ROSTER_KEY, operatorId],
    queryFn: () => fetchProviderRoster(operatorId),
    enabled: !!operatorId,
  })

  const assignments = assignmentsQuery.data ?? []
  const roster = (rosterQuery.data ?? []).filter((p) => p.active)

  const providerName = (id: string): string =>
    roster.find((p) => p.id === id)?.display_name ??
    assignments.find((a) => a.provider_id === id)?.provider_id ??
    id

  const invalidate = () => {
    queryClient.invalidateQueries({
      queryKey: [ASSIGNMENTS_KEY, operatorId, bookingId],
    })
  }

  const addMutation = useMutation({
    mutationFn: ({ day, providerId }: { day: string; providerId: string }) =>
      createAssignment(operatorId, bookingId, {
        provider_id: providerId,
        assignment_date: day,
      }),
    onSuccess: () => {
      toast.success(t.providers.assignToastAdded)
      invalidate()
    },
    onError: (err: Error) =>
      toast.error(t.providers.assignToastError, { description: err.message }),
  })

  const removeMutation = useMutation({
    mutationFn: (assignmentId: string) => deleteAssignment(assignmentId),
    onSuccess: () => {
      toast.success(t.providers.assignToastRemoved)
      invalidate()
    },
    onError: (err: Error) =>
      toast.error(t.providers.assignToastError, { description: err.message }),
  })

  const busy = addMutation.isPending || removeMutation.isPending

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium">
          {t.providers.assignSectionTitle}
        </CardTitle>
        <p className="text-muted-foreground text-xs">
          {t.providers.assignSectionHint}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {assignmentsQuery.isError || rosterQuery.isError ? (
          <p className="text-destructive text-xs" role="alert">
            {assignmentsQuery.error?.message ??
              rosterQuery.error?.message ??
              t.providers.assignError}
          </p>
        ) : assignmentsQuery.isPending || rosterQuery.isPending ? (
          <p className="text-muted-foreground text-xs italic">
            {t.providers.assignLoading}
          </p>
        ) : days.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            {t.providers.assignNoDays}
          </p>
        ) : roster.length === 0 ? (
          <p className="text-muted-foreground text-xs italic">
            {t.providers.assignNoProviders}
          </p>
        ) : (
          days.map((day) => {
            const dayAssignments = assignments.filter(
              (a) => a.assignment_date === day,
            )
            const assignedIds = new Set(
              dayAssignments.map((a) => a.provider_id),
            )
            const available = roster.filter((p) => !assignedIds.has(p.id))
            return (
              <DayRow
                key={day}
                day={day}
                dayAssignments={dayAssignments}
                available={available}
                providerName={providerName}
                busy={busy}
                onAssign={(providerId) =>
                  addMutation.mutate({ day, providerId })
                }
                onUnassign={(assignmentId) =>
                  removeMutation.mutate(assignmentId)
                }
              />
            )
          })
        )}
      </CardContent>
    </Card>
  )
}

type DayRowProps = {
  day: string
  dayAssignments: ProviderAssignment[]
  available: Provider[]
  providerName: (id: string) => string
  busy: boolean
  onAssign: (providerId: string) => void
  onUnassign: (assignmentId: string) => void
}

function DayRow({
  day,
  dayAssignments,
  available,
  providerName,
  busy,
  onAssign,
  onUnassign,
}: DayRowProps) {
  const [pick, setPick] = useState('')

  function handleAdd() {
    if (!pick || busy) return
    onAssign(pick)
    setPick('')
  }

  return (
    <div className="flex flex-col gap-2 rounded-md border p-3">
      <div className="text-sm font-medium">{day}</div>
      <div className="flex flex-wrap items-center gap-1.5">
        {dayAssignments.length === 0 ? null : (
          dayAssignments.map((a) => (
            <span
              key={a.id}
              className="bg-accent text-foreground inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs"
              data-testid={`assignment-chip-${a.id}`}
            >
              {t.providers.assignedBadge(providerName(a.provider_id))}
              <button
                type="button"
                onClick={() => onUnassign(a.id)}
                disabled={busy}
                aria-label={t.providers.assignRemoveAria(
                  providerName(a.provider_id),
                  day,
                )}
                title={t.providers.assignRemoveAria(
                  providerName(a.provider_id),
                  day,
                )}
                className="hover:text-destructive disabled:opacity-50"
              >
                <XIcon className="size-3" />
              </button>
            </span>
          ))
        )}
      </div>
      <div className="flex items-center gap-2">
        <NativeSelect
          value={pick}
          onChange={(e) => setPick(e.target.value)}
          disabled={busy || available.length === 0}
          aria-label={t.providers.assignDayLabel(day)}
          data-testid={`assign-select-${day}`}
          className="flex-1"
        >
          <option value="">{t.providers.assignProviderPlaceholder}</option>
          {available.map((p) => (
            <option key={p.id} value={p.id}>
              {p.display_name}
            </option>
          ))}
        </NativeSelect>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={handleAdd}
          disabled={!pick || busy}
          data-testid={`assign-add-${day}`}
        >
          {busy ? t.providers.assignAdding : t.providers.assignAdd}
        </Button>
      </div>
    </div>
  )
}
