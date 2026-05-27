// landr-p600 — Dashboard home revamp. Daily-ops landing page wired to
// the existing data fetchers (no new backend). Layout: 3-column
// responsive grid — today's bookings on the left (largest), summary
// cards top right, recent activity below.
//
// landr-a99u.12 — operator go-live banner. When
// GET /api/operator/release/eligibility returns can_request_golive === true,
// a banner is shown at the top of the dashboard (above the grid) prompting
// the operator to request go-live. The eligibility check is only true on
// staging for signer users, so the backend controls visibility entirely.
// Placement decision: above the dashboard grid (full-width, before the
// 3-column layout) so it's unmissable on staging without disrupting the
// normal operator daily-ops view on production.

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { CheckCircleIcon, ChevronRightIcon, RocketIcon } from 'lucide-react'
import { toast } from 'sonner'

import { BookingDetailSheet } from '@/components/BookingDetailSheet'
import { CapacityCard } from '@/components/dashboard/CapacityCard'
import { CustomerDetailSheet } from '@/components/CustomerDetailSheet'
import { DashboardRevenueSpark } from '@/components/DashboardRevenueSpark'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  fetchSchedulableProducts,
  type ProductForSchedule,
} from '@/lib/availability'
import {
  customerDisplay,
  dateDisplay,
  fetchBookings,
  fetchPendingGeneralApprovals,
  priceDisplay,
  productDisplay,
  type BookingRow,
} from '@/lib/bookings'
import { fetchContacts, type ContactRow } from '@/lib/contacts'
import {
  recentActivity,
  todaysBookings,
  todaysCapacity,
  weekRevenueDaily,
  weekSummary,
  type ActivityEvent,
} from '@/lib/dashboard-home'
import { useOperator, useOperatorCalendarPrefs } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { fetchGoLiveEligibility, requestGoLive } from '@/lib/release-promotion'
import { formatCount, formatCurrency } from '@/lib/reporting'
import { t } from '@/lib/strings'
import { useRealtimeQuery } from '@/lib/useRealtimeQuery'

// ---------------------------------------------------------------------------
// Go-live eligibility query key — module-level so it's stable across renders.
// ---------------------------------------------------------------------------
const GOLIVE_ELIGIBILITY_KEY = ['operator', 'release', 'eligibility'] as const

export function Dashboard() {
  const { currentOperator, currentOperatorId } = useOperator()
  const { hour12 } = useOperatorCalendarPrefs()
  const [activeBooking, setActiveBooking] = useState<BookingRow | null>(null)
  const [openContactId, setOpenContactId] = useState<string | null>(null)

  // ---- data: bookings (shared key with /bookings, /reporting) -----------
  const bookingsQuery = useRealtimeQuery<BookingRow[]>({
    queryKey: ['bookings', currentOperatorId ?? 'none'],
    queryFn: () => fetchBookings(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'bookings',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  // ---- data: contacts (shared key with /contacts default sort) ----------
  const contactsQuery = useRealtimeQuery<ContactRow[]>({
    queryKey: [
      'contacts',
      currentOperatorId ?? 'none',
      'created_at_desc',
      'all',
      'no-erased',
    ],
    queryFn: () =>
      fetchContacts(currentOperatorId as string, {
        sort: 'created_at_desc',
        types: [],
        includeErased: false,
      }),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'contacts',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  // ---- data: pending approvals (shared with /approvals/general) ---------
  const approvalsQuery = useRealtimeQuery<BookingRow[]>({
    queryKey: ['bookings', 'general-approvals', currentOperatorId ?? 'none'],
    queryFn: () => fetchPendingGeneralApprovals(currentOperatorId as string),
    enabled: !!currentOperatorId,
    realtime: currentOperatorId
      ? {
          table: 'bookings',
          filter: `operator_id=eq.${currentOperatorId}`,
        }
      : null,
  })

  // ---- data: schedulable products (shared key with /schedule) ----------
  // landr-kav4 — feeds the Today's-capacity card. Same query key as the
  // Schedule route's productsQuery so the two surfaces hit the cache
  // together; no realtime needed (product catalogue changes are rare and
  // a stale render here is acceptable until the next mount).
  const schedulableProductsQuery = useQuery<ProductForSchedule[]>({
    queryKey: ['schedulable-products', currentOperatorId ?? 'none'],
    queryFn: () => fetchSchedulableProducts(currentOperatorId as string),
    enabled: !!currentOperatorId,
  })

  const bookingRows = useMemo(
    () => bookingsQuery.data ?? [],
    [bookingsQuery.data],
  )
  const contactRows = useMemo(
    () => contactsQuery.data ?? [],
    [contactsQuery.data],
  )
  const approvalRows = useMemo(
    () => approvalsQuery.data ?? [],
    [approvalsQuery.data],
  )
  const schedulableProducts = useMemo(
    () => schedulableProductsQuery.data ?? [],
    [schedulableProductsQuery.data],
  )

  const todayRows = useMemo(() => todaysBookings(bookingRows), [bookingRows])
  const capacityRows = useMemo(
    () => todaysCapacity(bookingRows, schedulableProducts),
    [bookingRows, schedulableProducts],
  )
  const summary = useMemo(
    () => weekSummary(bookingRows, contactRows),
    [bookingRows, contactRows],
  )
  const sparkPoints = useMemo(
    () => weekRevenueDaily(bookingRows),
    [bookingRows],
  )
  const activityEvents = useMemo(
    () =>
      recentActivity({
        bookings: bookingRows,
        contacts: contactRows,
        pendingApprovals: approvalRows,
        customerFallback: t.dashboard.customerFallback,
        limit: 10,
      }),
    [bookingRows, contactRows, approvalRows],
  )

  const pendingCount = approvalRows.length
  const errored =
    bookingsQuery.isError ||
    contactsQuery.isError ||
    approvalsQuery.isError ||
    schedulableProductsQuery.isError
  const errorMessage =
    bookingsQuery.error?.message ??
    contactsQuery.error?.message ??
    approvalsQuery.error?.message ??
    schedulableProductsQuery.error?.message ??
    ''

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.nav.dashboard} />
      <header>
        <h1 className="text-xl font-semibold">
          {currentOperator?.name ?? currentOperator?.slug ?? t.dashboard.title}
        </h1>
      </header>

      {/* landr-a99u.12 — go-live banner (staging only, signer users only).
          Renders nothing when eligibility is false/loading/errored. */}
      <GoLiveBanner />

      {errored ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.dashboard.error}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">{errorMessage}</p>
          </CardContent>
        </Card>
      ) : (
        <div
          className="grid grid-cols-1 gap-6 lg:grid-cols-3"
          data-testid="dashboard-grid"
        >
          {/* Left column (2/3 on lg+) — today's bookings + activity stack */}
          <div className="flex flex-col gap-6 lg:col-span-2">
            <TodaysBookingsCard
              rows={todayRows}
              loading={bookingsQuery.isPending && !!currentOperatorId}
              hour12={hour12}
              onRowClick={(row) => setActiveBooking(row)}
            />
            <RecentActivityCard
              events={activityEvents}
              loading={
                (bookingsQuery.isPending ||
                  contactsQuery.isPending ||
                  approvalsQuery.isPending) &&
                !!currentOperatorId
              }
              hour12={hour12}
            />
          </div>

          {/* Right column — summary cards stacked */}
          <div className="flex flex-col gap-4">
            <CapacityCard
              rows={capacityRows}
              loading={
                (bookingsQuery.isPending ||
                  schedulableProductsQuery.isPending) &&
                !!currentOperatorId
              }
            />
            <RevenueSummaryCard
              revenue={summary.revenue}
              currency={summary.currency}
              spark={sparkPoints}
            />
            <BookingsSummaryCard count={summary.bookings} />
            <ContactsSummaryCard count={summary.newContacts} />
            <PendingApprovalsCard count={pendingCount} />
          </div>
        </div>
      )}

      <BookingDetailSheet
        row={activeBooking}
        onOpenChange={(open) => {
          if (!open) setActiveBooking(null)
        }}
        onCustomerClick={(id) => setOpenContactId(id)}
      />
      <CustomerDetailSheet
        contactId={openContactId}
        onOpenChange={(open) => {
          if (!open) setOpenContactId(null)
        }}
      />
    </div>
  )
}

// ---------------------------------------------------------------------------
// Sub-components
// ---------------------------------------------------------------------------

function TodaysBookingsCard({
  rows,
  loading,
  hour12,
  onRowClick,
}: {
  rows: BookingRow[]
  loading: boolean
  hour12: boolean
  onRowClick: (row: BookingRow) => void
}) {
  return (
    <Card data-testid="dashboard-today">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>{t.dashboard.todayHeading}</CardTitle>
        {rows.length > 0 ? (
          <span className="bg-muted text-muted-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium">
            {t.dashboard.todayCount(rows.length)}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">{t.dashboard.loading}</p>
        ) : rows.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.dashboard.todayEmpty}
          </p>
        ) : (
          <ul
            className="divide-border divide-y"
            data-testid="dashboard-today-list"
          >
            {rows.map((row) => (
              <li key={row.id}>
                <button
                  type="button"
                  onClick={() => onRowClick(row)}
                  className="hover:bg-muted/50 -mx-2 flex w-full items-center justify-between gap-3 rounded px-2 py-2 text-left"
                  data-testid={`dashboard-today-row-${row.id}`}
                >
                  <div className="flex min-w-0 flex-col">
                    <span className="truncate text-sm font-medium">
                      {customerDisplay(row)}
                    </span>
                    <span className="text-muted-foreground truncate text-xs">
                      {productDisplay(row)}
                    </span>
                  </div>
                  <div className="flex flex-col items-end">
                    <span className="text-sm font-medium">
                      {priceDisplay(row)}
                    </span>
                    <span className="text-muted-foreground text-xs">
                      {dateDisplay(row.created_at, { hour12 })}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function RevenueSummaryCard({
  revenue,
  currency,
  spark,
}: {
  revenue: number
  currency: string
  spark: ReturnType<typeof weekRevenueDaily>
}) {
  const hasRevenue = revenue > 0
  return (
    <Card data-testid="dashboard-week-revenue">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {t.dashboard.weekRevenueLabel}
        </CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-2">
        <p className="text-2xl font-semibold">
          {hasRevenue
            ? formatCurrency(revenue, currency)
            : t.dashboard.weekRevenueEmpty}
        </p>
        <DashboardRevenueSpark data={spark} />
      </CardContent>
    </Card>
  )
}

function BookingsSummaryCard({ count }: { count: number }) {
  return (
    <Card data-testid="dashboard-week-bookings">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {t.dashboard.weekBookingsLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{formatCount(count)}</p>
      </CardContent>
    </Card>
  )
}

function ContactsSummaryCard({ count }: { count: number }) {
  return (
    <Card data-testid="dashboard-week-contacts">
      <CardHeader>
        <CardTitle className="text-sm font-medium">
          {t.dashboard.weekContactsLabel}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <p className="text-2xl font-semibold">{formatCount(count)}</p>
      </CardContent>
    </Card>
  )
}

function PendingApprovalsCard({ count }: { count: number }) {
  return (
    <Card data-testid="dashboard-pending-approvals">
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle className="text-sm font-medium">
          {t.dashboard.pendingApprovalsLabel}
        </CardTitle>
        {count > 0 ? (
          <span
            className="bg-primary text-primary-foreground inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
            data-testid="dashboard-pending-approvals-badge"
          >
            {t.dashboard.pendingApprovalsCount(count)}
          </span>
        ) : null}
      </CardHeader>
      <CardContent>
        {count === 0 ? (
          <p className="text-muted-foreground text-sm">
            <CheckCircleIcon className="mr-1 inline size-4 align-text-bottom" />
            {t.dashboard.pendingApprovalsEmpty}
          </p>
        ) : (
          <Link
            to="/approvals/general"
            className="text-primary inline-flex items-center gap-1 text-sm font-medium hover:underline"
            data-testid="dashboard-pending-approvals-cta"
          >
            {t.dashboard.pendingApprovalsCta}
            <ChevronRightIcon className="size-4" />
          </Link>
        )}
      </CardContent>
    </Card>
  )
}

function RecentActivityCard({
  events,
  loading,
  hour12,
}: {
  events: ActivityEvent[]
  loading: boolean
  hour12: boolean
}) {
  return (
    <Card data-testid="dashboard-activity">
      <CardHeader>
        <CardTitle>{t.dashboard.activityHeading}</CardTitle>
      </CardHeader>
      <CardContent>
        {loading ? (
          <p className="text-muted-foreground text-sm">{t.dashboard.loading}</p>
        ) : events.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.dashboard.activityEmpty}
          </p>
        ) : (
          <ul
            className="divide-border divide-y"
            data-testid="dashboard-activity-list"
          >
            {events.map((event) => (
              <li
                key={event.id}
                className="flex items-center justify-between gap-3 py-2"
                data-testid={`dashboard-activity-${event.id}`}
              >
                <div className="flex min-w-0 flex-col">
                  <span className="truncate text-sm font-medium">
                    {activityKindLabel(event.kind)}{' '}
                    <span className="text-muted-foreground font-normal">
                      — {event.label}
                    </span>
                  </span>
                  {event.detail ? (
                    <span className="text-muted-foreground truncate text-xs">
                      {event.detail}
                    </span>
                  ) : null}
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-muted-foreground text-xs">
                    {dateDisplay(event.occurredAt, { hour12 })}
                  </span>
                  {event.href ? (
                    <Link
                      to={event.href}
                      className="text-primary text-xs font-medium hover:underline"
                      aria-label={t.dashboard.pendingApprovalsCta}
                    >
                      <ChevronRightIcon className="size-4" />
                    </Link>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}

function activityKindLabel(kind: ActivityEvent['kind']): string {
  switch (kind) {
    case 'booking_created':
      return t.dashboard.activityBookingCreated
    case 'contact_created':
      return t.dashboard.activityContactCreated
    case 'approval_pending':
      return t.dashboard.activityApprovalPending
  }
}

// ---------------------------------------------------------------------------
// landr-a99u.12 — Go-live request banner (operator-facing, staging only)
// ---------------------------------------------------------------------------

/**
 * Polls GET /api/operator/release/eligibility and renders a go-live request
 * banner only when can_request_golive === true (staging + signer user).
 * Renders nothing on production or for non-signer users — entirely
 * backend-controlled, no env detection in the client.
 *
 * Placement: full-width above the dashboard grid so it's unmissable on
 * staging but doesn't interfere with the daily-ops layout on production.
 */
function GoLiveBanner() {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [notes, setNotes] = useState('')
  const [requested, setRequested] = useState(false)

  const eligibilityQuery = useQuery({
    queryKey: GOLIVE_ELIGIBILITY_KEY,
    queryFn: fetchGoLiveEligibility,
    // Infrequent — stale after 5 min. This endpoint is only active on staging.
    staleTime: 1000 * 60 * 5,
    // Don't surface errors — silently hide the banner if the endpoint isn't
    // available (e.g. on a dev build without the route deployed yet).
    retry: false,
  })

  const mutation = useMutation({
    mutationFn: () => requestGoLive(notes.trim() || undefined),
    onSuccess: (data) => {
      if (data.status === 'already_pending') {
        toast.info(t.dashboard.goLiveAlreadyPending)
      } else {
        toast.success(t.dashboard.goLiveSuccessToast)
      }
      setRequested(true)
      setDialogOpen(false)
      setNotes('')
    },
    onError: (err: Error) => {
      toast.error(err.message)
    },
  })

  // Only show when the backend confirms eligibility.
  if (!eligibilityQuery.data?.can_request_golive) return null

  // Post-request: show a calm "requested" state.
  if (requested) {
    return (
      <div
        className="flex items-start gap-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/30"
        data-testid="golive-banner-requested"
      >
        <RocketIcon className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
        <div className="flex flex-col gap-0.5">
          <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
            {t.dashboard.goLiveBannerRequestedTitle}
          </p>
          <p className="text-muted-foreground text-sm">
            {t.dashboard.goLiveBannerRequestedDescription}
          </p>
        </div>
      </div>
    )
  }

  return (
    <>
      <div
        className="flex items-start justify-between gap-4 rounded-lg border border-violet-200 bg-violet-50 px-4 py-3 dark:border-violet-800 dark:bg-violet-950/30"
        data-testid="golive-banner"
      >
        <div className="flex items-start gap-3">
          <RocketIcon className="mt-0.5 size-4 shrink-0 text-violet-600 dark:text-violet-400" />
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-semibold text-violet-900 dark:text-violet-100">
              {t.dashboard.goLiveBannerTitle}
            </p>
            <p className="text-muted-foreground text-sm">
              {t.dashboard.goLiveBannerDescription}
            </p>
          </div>
        </div>
        <Button
          size="sm"
          className="shrink-0"
          onClick={() => setDialogOpen(true)}
          data-testid="golive-banner-cta"
        >
          <RocketIcon className="size-4" />
          {t.dashboard.goLiveBannerButton}
        </Button>
      </div>

      <Dialog
        open={dialogOpen}
        onOpenChange={(o) => {
          if (mutation.isPending) return
          setDialogOpen(o)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.dashboard.goLiveDialogTitle}</DialogTitle>
            <DialogDescription>
              {t.dashboard.goLiveDialogDescription}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="golive-notes">{t.dashboard.goLiveNotesLabel}</Label>
            <Textarea
              id="golive-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.dashboard.goLiveNotesPlaceholder}
              disabled={mutation.isPending}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setDialogOpen(false)}
              disabled={mutation.isPending}
            >
              {/* reuse t.release.keep — "Keep" is universal */}
              Cancel
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              <RocketIcon className="size-4" />
              {t.dashboard.goLiveConfirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
