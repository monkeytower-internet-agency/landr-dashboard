// landr-znzz.2 — "Customer page" tab inside BookingDetailSheet.
//
// Lets the guide (Martin) customise the customer-facing briefing ("event")
// page for a booking:
//   * a private share link (copy / WhatsApp / preview) + reset-link action
//   * a Publish toggle (the whole page is private until published)
//   * page content: title, welcome note, tone, review nudge
//   * a per-day "tonight's update": conditions verdict + plan + meeting point,
//     each with its own Publish toggle (the nightly-update workflow)
//
// Pickup times/locations are NOT edited here — they live in the day /
// attendance editor and surface on the page automatically. The hint copy
// makes that explicit.
//
// Data flow mirrors the other booking tabs: one TanStack Query keyed on
// (operator, booking) for the briefing, and mutations that invalidate it.
// PUT /days returns only the single day row, so day mutations invalidate the
// whole briefing query to fold the change back in.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  createBriefing,
  fetchBriefing,
} from '@/lib/booking-briefing'
import {
  fetchOperator,
} from '@/lib/operatorSettings'
import { OPERATOR_QUERY_KEY } from '@/routes/settings/_shared'
import { t } from '@/lib/strings'
import { BriefingEditor, briefingQueryKey } from './BriefingEditor'

type Props = {
  operatorId: string
  bookingId: string
  /** Distinct booking-days (ISO YYYY-MM-DD, sorted) derived by the parent
   *  from the booking's line items via bookingDayOptions(). */
  days: string[]
  /** Customer phone (E.164-ish) for the WhatsApp deep-link, if known. */
  customerPhone?: string | null
}

export function BookingCustomerPage({
  operatorId,
  bookingId,
  days,
  customerPhone,
}: Props) {
  const queryClient = useQueryClient()

  const briefingQuery = useQuery({
    queryKey: briefingQueryKey(operatorId, bookingId),
    queryFn: () => fetchBriefing(operatorId, bookingId),
    enabled: !!operatorId && !!bookingId,
  })

  // landr-znzz.7 — fetch operator settings to know if weather hint is enabled.
  // Keyed on OPERATOR_QUERY_KEY so this dedupes with any concurrent Settings
  // page query — no extra round-trip if the operator just saved weather settings.
  const operatorQuery = useQuery({
    queryKey: OPERATOR_QUERY_KEY(operatorId),
    queryFn: () => fetchOperator(operatorId),
    enabled: !!operatorId,
    staleTime: 60_000, // 1 min — operator settings change rarely
  })
  const weatherEnabled = operatorQuery.data?.weather_enabled ?? false

  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: briefingQueryKey(operatorId, bookingId),
    })

  const createMutation = useMutation({
    mutationFn: () => createBriefing(operatorId, bookingId),
    onSuccess: (created) => {
      queryClient.setQueryData(
        briefingQueryKey(operatorId, bookingId),
        created,
      )
    },
    onError: (err: Error) =>
      toast.error(t.bookings.briefing.createError, {
        description: err.message,
      }),
  })

  // ---- loading / error / empty states ----
  if (briefingQuery.isPending) {
    return (
      <p className="text-muted-foreground text-xs italic">
        {t.bookings.briefing.loading}
      </p>
    )
  }
  if (briefingQuery.isError) {
    return (
      <p className="text-destructive text-xs" role="alert">
        {briefingQuery.error?.message ?? t.bookings.briefing.loadError}
      </p>
    )
  }

  const briefing = briefingQuery.data
  if (!briefing) {
    return (
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-medium">
            {t.bookings.briefing.emptyTitle}
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-3">
          <p className="text-muted-foreground text-sm">
            {t.bookings.briefing.emptyBody}
          </p>
          <Button
            type="button"
            onClick={() => createMutation.mutate()}
            disabled={createMutation.isPending}
            data-testid="briefing-create"
          >
            {createMutation.isPending
              ? t.bookings.briefing.createWorking
              : t.bookings.briefing.createAction}
          </Button>
        </CardContent>
      </Card>
    )
  }

  return (
    // Keyed on updated_at so any server-side change to the briefing row
    // (rotate-token refetch, a PATCH, another operator's edit) remounts the
    // editor and reseeds its useState drafts — the repo's no-useEffect
    // reseed convention (see StaffEditSheet), which dodges the
    // react-hooks/set-state-in-effect rule and the cascading-render hazard.
    <BriefingEditor
      key={briefing.updated_at}
      operatorId={operatorId}
      bookingId={bookingId}
      briefing={briefing}
      days={days}
      customerPhone={customerPhone}
      invalidate={invalidate}
      weatherEnabled={weatherEnabled}
    />
  )
}
