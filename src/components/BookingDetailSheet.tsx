import type { ReactNode } from 'react'
import { useEffect, useState } from 'react'
import { useMutation, useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { BadgeEuro, CheckCircle, Download, Mail, Printer, Unlock, UserX, XCircle } from 'lucide-react'

import { useAuth } from '@/lib/auth'
import { useOperator } from '@/lib/operator'
import { trackView } from '@/lib/recently-viewed'
import { useEntitlements } from '@/lib/entitlements'
import { useIsMobile } from '@/hooks/use-mobile'
import { cn } from '@/lib/utils'
import {
  mobileSheetContent,
  mobileSheetHeader,
  mobileSheetBody,
  mobileSheetTabStrip,
  mobileSheetFooter,
} from '@/lib/mobile-sheet-classes'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Checkbox } from '@/components/ui/checkbox'
import { TagPicker } from '@/components/tags/TagPicker'
import { setBookingTags } from '@/lib/tags'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetFooter,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Textarea } from '@/components/ui/textarea'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { ConfirmActionDialog } from '@/components/ConfirmActionDialog'
import { CopyLinkButton } from '@/components/CopyLinkButton'
import { CustomerNameLink } from '@/components/CustomerNameLink'
import { BookingChecklist } from '@/components/booking/BookingChecklist'
import { CustomOfferEditorSheet } from '@/components/booking/CustomOfferEditorSheet'
import { BookingCustomerPage } from '@/components/booking/BookingCustomerPage'
import { BookingNotes } from '@/components/booking/BookingNotes'
import {
  bookingNotesQueryKey,
  listBookingNotes,
} from '@/lib/booking-notes'
import { BookingParticipants } from '@/components/booking/BookingParticipants'
import { BookingPayments } from '@/components/booking/BookingPayments'
import { BookingProviderAssignments } from '@/components/booking/BookingProviderAssignments'
import { BookingTimeline } from '@/components/booking/BookingTimeline'
import { DayChips } from '@/components/booking/DayChips'
import { MultiDayPicker } from '@/components/booking/MultiDayPicker'
import { StageBadge } from '@/components/booking/StageBadge'
import {
  customerDisplay,
  fetchBookingStages,
  priceDisplay,
  stageCode,
  type BookingRow,
} from '@/lib/bookings'
import { bookingDayOptions } from '@/lib/providers'
import { t } from '@/lib/strings'
import {
  useBookingActions,
  useSetStage,
  customerDraftFromRow,
  itemDraftsFromRow,
  type CustomerDraft,
  type ItemDraft,
  type MarkAsPaidMethod,
} from '@/lib/booking-actions'

type Props = {
  row: BookingRow | null
  onOpenChange: (open: boolean) => void
  onCustomerClick?: (contactId: string) => void
}

export function BookingDetailSheet({
  row,
  onOpenChange,
  onCustomerClick,
}: Props) {
  const open = row !== null
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* landr-li8e — widen to ~60vw on desktop so operators can review
          line items, participants and customer details without scrolling
          sideways. Keep w-full on mobile (the sm: breakpoint kicks in
          ≥640px) and stay as a Sheet (not modal) so the underlying list
          stays visible. */}
      {/* landr-pztv — data-print-target marks the @media print scope so
          Ctrl+P (or the explicit Print button in the footer) prints the
          open booking detail as a clean receipt. See src/index.css. */}
      {/* landr-3qkr.3 — full-screen below md. */}
      <SheetContent
        data-print-target="booking-detail"
        className={cn(
          'flex w-full flex-col gap-0 sm:max-w-[60vw]',
          mobileSheetContent,
        )}
      >
        {row ? (
          <BookingDetailBody
            key={row.id}
            row={row}
            onClose={() => onOpenChange(false)}
            onCustomerClick={onCustomerClick}
          />
        ) : null}
      </SheetContent>
    </Sheet>
  )
}

type BodyProps = {
  row: BookingRow
  onClose: () => void
  onCustomerClick?: (contactId: string) => void
}

type ActiveTab =
  | 'details'
  | 'participants'
  | 'providers'
  | 'timeline'
  | 'checklist'
  | 'notes'
  | 'payments'
  | 'briefing'

function formatRangeLabel(days: string[]): string | null {
  if (days.length === 0) return null
  const sorted = [...days].sort()
  const start = sorted[0]
  const end = sorted[sorted.length - 1]
  if (start === end) return start
  return `${start} → ${end}`
}

function BookingDetailBody({ row, onClose, onCustomerClick }: BodyProps) {
  const { user } = useAuth()
  const isMobile = useIsMobile()
  // landr-84n1 — the checklist tab persists per (operator, booking_id).
  // useOperator returns null when no operator is selected yet (rare
  // outside tests); the checklist hook handles that gracefully.
  const { currentOperatorId } = useOperator()
  const { isEnabled } = useEntitlements()

  // landr — drive the "has notes" dot on the Notes tab. Shares the SAME query
  // key as the BookingNotes panel (bookingNotesQueryKey) so React Query
  // dedupes the fetch and the dot updates live after a note is added/deleted.
  // Until the fetch resolves we fall back to the count embedded in the
  // bookings list row (row.notes) so the dot appears immediately on open.
  const notesQuery = useQuery({
    queryKey: bookingNotesQueryKey(currentOperatorId ?? '_', row.id),
    queryFn: () => listBookingNotes(currentOperatorId as string, row.id),
    enabled: !!currentOperatorId,
  })
  const hasNotes = notesQuery.data
    ? notesQuery.data.length > 0
    : (row.notes?.length ?? 0) > 0

  // ---- Form draft state ----
  const [customer, setCustomer] = useState<CustomerDraft>(() =>
    customerDraftFromRow(row),
  )
  const [items, setItems] = useState<ItemDraft[]>(() => itemDraftsFromRow(row))

  // ---- Dialog open/close state ----
  const [showCancel, setShowCancel] = useState(false)
  const [cancelReason, setCancelReason] = useState('')
  const [showUnblock, setShowUnblock] = useState(false)
  const [showNoShow, setShowNoShow] = useState(false)
  const [chargeCancellationFee, setChargeCancellationFee] = useState(false)
  // landr-hgd4 — general approve / reject from the detail sheet.
  const [showGeneralApprove, setShowGeneralApprove] = useState(false)
  const [showGeneralReject, setShowGeneralReject] = useState(false)
  const [generalApproveNote, setGeneralApproveNote] = useState('')
  const [generalRejectNote, setGeneralRejectNote] = useState('')
  // landr-okxm — Mark-as-paid dialog state. Amount defaults to the
  // booking's outstanding balance so the operator can confirm with one
  // click for full settlement; clearing/lowering the field records a
  // partial payment.
  const [showMarkPaid, setShowMarkPaid] = useState(false)
  const [markPaidMethod, setMarkPaidMethod] = useState<MarkAsPaidMethod>('cash')
  const [markPaidAmount, setMarkPaidAmount] = useState<string>('')
  const [markPaidNote, setMarkPaidNote] = useState<string>('')

  // landr-5f8q — Details vs Timeline tab. Defaults to Details so the most
  // common operator interaction (editing dates / customer) stays one click
  // away. Timeline is read-only.
  const [activeTab, setActiveTab] = useState<ActiveTab>('details')
  // landr-sbhz.2 — open the Custom Offer composer for this booking.
  const [customOfferOpen, setCustomOfferOpen] = useState(false)

  // landr-ne58 — record this open in the sidebar "Recently viewed" trail.
  // BookingDetailBody is keyed by row.id (see parent <BookingDetailSheet>),
  // so the body remounts each time the operator opens a different booking
  // and the effect fires exactly once per open. Re-opening the same row
  // de-duplicates inside trackView() — no flood of writes on re-renders.
  useEffect(() => {
    trackView(
      user?.id ?? null,
      'booking',
      row.id,
      customerDisplay(row),
      `/bookings?open=${row.id}`,
    )
  }, [user?.id, row])

  // ---- All mutations + derived flags ----
  const {
    saveMutation,
    cancelMutation,
    unblockMutation,
    generalApproveMutation,
    generalRejectMutation,
    noShowMutation,
    markPaidMutation,
    clearOverrideMutation,
    invoiceMutation,
    resendConfirmationMutation,
    busy,
    showClearOverride,
    canUnblock,
    canGeneralApprove,
    canNoShow,
    canMarkPaid,
    balanceDue,
    hasMaterialChanges,
    hasPriorConfirmation,
    isDirty,
    invalidateAll,
  } = useBookingActions({
    row,
    customer,
    items,
    onClose,
    setShowCancel,
    setCancelReason,
    cancelReason,
    setShowUnblock,
    setShowNoShow,
    setChargeCancellationFee,
    chargeCancellationFee,
    setShowGeneralApprove,
    setGeneralApproveNote,
    generalApproveNote,
    setShowGeneralReject,
    setGeneralRejectNote,
    generalRejectNote,
    setShowMarkPaid,
    setMarkPaidMethod,
    setMarkPaidAmount,
    setMarkPaidNote,
    markPaidMethod,
    markPaidAmount,
    markPaidNote,
  })

  const code = stageCode(row)

  // landr-uvfg.8 (T8) — free-form set-stage control. Drives a generic stage
  // Select in the Status card; non-canonical jumps come back with
  // requires_confirmation=true, which opens the confirm dialog below.
  const [pendingStageCode, setPendingStageCode] = useState<string | null>(null)
  const [showStageConfirm, setShowStageConfirm] = useState(false)
  const [stageWarning, setStageWarning] = useState<string | null>(null)
  const [stageSideEffects, setStageSideEffects] = useState<string[]>([])

  const stagesQuery = useQuery({
    queryKey: ['booking-lifecycle-stages', currentOperatorId],
    queryFn: () => fetchBookingStages(currentOperatorId!),
    enabled: !!currentOperatorId,
  })

  const setStageMutation = useSetStage(
    currentOperatorId ?? null,
    row.id,
    invalidateAll,
  )

  async function handleStageSelect(targetCode: string) {
    if (!currentOperatorId || targetCode === code) return
    try {
      const result = await setStageMutation.mutateAsync({
        target_stage_code: targetCode,
        force: false,
      })
      if (result.requires_confirmation) {
        setPendingStageCode(targetCode)
        setStageWarning(result.warning)
        setStageSideEffects(result.side_effects_skipped)
        setShowStageConfirm(true)
      } else {
        const stageName =
          stagesQuery.data?.find((s) => s.code === targetCode)?.label ??
          targetCode
        toast.success(t.bookings.setStage.toastSuccess(stageName))
      }
    } catch (err) {
      toast.error(t.bookings.setStage.toastError, {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  async function handleStageConfirm() {
    if (!pendingStageCode) return
    try {
      await setStageMutation.mutateAsync({
        target_stage_code: pendingStageCode,
        force: true,
      })
      const stageName =
        stagesQuery.data?.find((s) => s.code === pendingStageCode)?.label ??
        pendingStageCode
      toast.success(t.bookings.setStage.toastSuccess(stageName))
      setShowStageConfirm(false)
      setPendingStageCode(null)
    } catch (err) {
      toast.error(t.bookings.setStage.toastError, {
        description: err instanceof Error ? err.message : String(err),
      })
    }
  }

  function updateItem(itemId: string, updater: (it: ItemDraft) => ItemDraft) {
    setItems((prev) => prev.map((it) => (it.id === itemId ? updater(it) : it)))
  }

  function toggleDay(itemId: string, day: string) {
    updateItem(itemId, (it) => {
      const has = it.selected_days.includes(day)
      const next = has
        ? it.selected_days.filter((d) => d !== day)
        : [...it.selected_days, day]
      next.sort()
      return { ...it, selected_days: next }
    })
  }

  const cancelReasonReady = cancelReason.trim().length >= 3

  // ---- Tab panel configuration ----
  type TabConfig = {
    key: ActiveTab
    label: string
    testId: string
    render: () => ReactNode
    // landr — optional indicator rendered next to the tab label (e.g. the
    // "has notes" dot on the Notes tab).
    badge?: ReactNode
  }

  // landr — small notification dot shown next to a tab label.
  const tabDot = (label: string) => (
    <span
      data-testid="tab-note-dot"
      aria-label={label}
      className="bg-primary ml-1.5 inline-block size-1.5 shrink-0 rounded-full align-middle"
    />
  )

  const tabPanels: TabConfig[] = [
    {
      key: 'participants',
      label: t.bookings.participants.tabParticipants,
      testId: 'booking-tab-participants',
      render: () => (
        <div
          role="tabpanel"
          aria-label={t.bookings.participants.tabParticipants}
          className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2 pt-3', mobileSheetBody)}
        >
          {/* landr-z4lj — clicking a participant name forwards to the same
              onCustomerClick the booker name in the sheet header uses. The
              parent route (routes/Bookings.tsx etc.) wires that to
              setOpenCustomerId, which stacks a ContactDetailSheet over this
              BookingDetailSheet — Customer 360 pattern (landr-7o2a). */}
          <BookingParticipants
            bookingId={row.id}
            onContactClick={onCustomerClick}
          />
        </div>
      ),
    },
    {
      key: 'briefing',
      label: t.bookings.briefing.tabBriefing,
      testId: 'booking-tab-briefing',
      render: () => (
        <div
          role="tabpanel"
          aria-label={t.bookings.briefing.tabBriefing}
          className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2 pt-3', mobileSheetBody)}
        >
          {/* landr-znzz.2 — Customer page tab. Edits the customer-facing
              briefing ("event") page. */}
          {currentOperatorId ? (
            <BookingCustomerPage
              operatorId={currentOperatorId}
              bookingId={row.id}
              days={bookingDayOptions(row.items)}
              customerPhone={row.customer?.phone ?? null}
            />
          ) : (
            <p className="text-muted-foreground text-xs italic">
              {t.bookings.briefing.loading}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'providers',
      label: t.bookings.timeline.tabProviders,
      testId: 'booking-tab-providers',
      render: () => (
        <div
          role="tabpanel"
          aria-label={t.bookings.timeline.tabProviders}
          className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2 pt-3', mobileSheetBody)}
        >
          {/* landr-funh — Providers tab. Per-booking-day provider assignment. */}
          {currentOperatorId ? (
            <BookingProviderAssignments
              operatorId={currentOperatorId}
              bookingId={row.id}
              items={row.items}
            />
          ) : (
            <p className="text-muted-foreground text-xs italic">
              {t.providers.assignLoading}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'timeline',
      label: t.bookings.timeline.tabTimeline,
      testId: 'booking-tab-timeline',
      render: () => (
        <div
          role="tabpanel"
          aria-label={t.bookings.timeline.tabTimeline}
          className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2 pt-3', mobileSheetBody)}
        >
          <BookingTimeline booking={row} />
        </div>
      ),
    },
    {
      key: 'checklist',
      label: t.bookings.checklist.tabChecklist,
      testId: 'booking-tab-checklist',
      render: () => (
        <div
          role="tabpanel"
          aria-label={t.bookings.checklist.tabChecklist}
          className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2 pt-3', mobileSheetBody)}
        >
          {/* landr-84n1 — Checklist tab. Sits alongside Details/Timeline in
              the same shared Tabs primitive (landr-maat). */}
          <BookingChecklist
            bookingId={row.id}
            operatorId={currentOperatorId}
          />
        </div>
      ),
    },
    {
      key: 'notes',
      label: t.bookings.notes.tabNotes,
      testId: 'booking-tab-notes',
      badge: hasNotes ? tabDot(t.bookings.notes.hasNotesIndicator) : undefined,
      render: () => (
        <div
          role="tabpanel"
          aria-label={t.bookings.notes.tabNotes}
          className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2 pt-3', mobileSheetBody)}
        >
          {/* landr-9qo1 — Notes tab. Operator-internal free-text notes
              per booking; never sent to the customer. */}
          {currentOperatorId ? (
            <BookingNotes
              operatorId={currentOperatorId}
              bookingId={row.id}
            />
          ) : (
            <p className="text-muted-foreground text-xs italic">
              {t.bookings.notes.loading}
            </p>
          )}
        </div>
      ),
    },
    {
      key: 'payments',
      label: t.bookings.payments.tabPayments,
      testId: 'booking-tab-payments',
      render: () => (
        <div
          role="tabpanel"
          aria-label={t.bookings.payments.tabPayments}
          className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2 pt-3', mobileSheetBody)}
        >
          {/* landr-uzup — Payments tab. Lists every payments +
              payment_refunds row for the booking. */}
          <BookingPayments
            operatorId={currentOperatorId}
            bookingId={row.id}
            bookingCurrency={row.currency ?? null}
          />
        </div>
      ),
    },
  ]

  // The active non-details panel (undefined = render the details form).
  const activePanel = tabPanels.find((p) => p.key === activeTab)

  return (
    <>
      {/* landr-3qkr.3 — sticky header below md; pt-safe guards the notch. */}
      <SheetHeader className={cn('p-4', isMobile && mobileSheetHeader)}>
        <div className="flex items-center justify-between gap-2">
          <SheetTitle>{t.bookings.detailsTitle}</SheetTitle>
          {/* landr-a8fg — shareable deep-link to this booking. Mirrors the
              ?open= pattern landr-ne58 uses for the Recently-viewed trail so
              a pasted link opens the same sheet on the next operator's
              screen. */}
          <CopyLinkButton
            path={`/bookings?open=${row.id}`}
            testId="booking-copy-link"
          />
        </div>
        <SheetDescription>
          {row.customer && onCustomerClick ? (
            <span className="inline-flex flex-wrap items-center gap-x-1">
              <CustomerNameLink
                contactId={row.customer.id}
                display={customerDisplay(row)}
                onClick={onCustomerClick}
                className="text-foreground font-medium"
              />
              <span aria-hidden>·</span>
              <span>{`#${row.id.slice(0, 8)} · ${priceDisplay(row)}`}</span>
            </span>
          ) : (
            `#${row.id.slice(0, 8)} · ${priceDisplay(row)}`
          )}
        </SheetDescription>
      </SheetHeader>

      {/* landr-5f8q — Details / Timeline tab strip. Built on the shared
          shadcn Tabs primitive (landr-maat). Panels render conditionally
          below to keep the form/sheet flex layout intact.
          landr-3qkr.3 — horizontally scrollable on mobile so 8 tabs never
          clip off the edge of a 360px screen. */}
      <Tabs
        value={activeTab}
        onValueChange={(next) => setActiveTab(next as ActiveTab)}
        className={cn('mx-4 mt-2 w-fit shrink-0 self-start', mobileSheetTabStrip)}
      >
        <TabsList variant="pill" aria-label={t.bookings.detailsTitle}>
          <TabsTrigger
            variant="pill"
            value="details"
            data-testid="booking-tab-details"
          >
            {t.bookings.timeline.tabDetails}
          </TabsTrigger>
          {tabPanels.map((panel) => (
            <TabsTrigger
              key={panel.key}
              variant="pill"
              value={panel.key}
              data-testid={panel.testId}
            >
              {panel.label}
              {panel.badge}
            </TabsTrigger>
          ))}
        </TabsList>
      </Tabs>

      {activePanel ? (
        activePanel.render()
      ) : (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (isDirty && !busy) saveMutation.mutate()
        }}
        className={cn('flex flex-1 flex-col gap-4 overflow-y-auto px-4 pb-2 pt-3', mobileSheetBody)}
        aria-label={t.bookings.detailsTitle}
        role="tabpanel"
      >
        {/* Status */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t.bookings.detail.sectionStatus}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <StageBadge
              state={row.current_semantic_state}
              stageCode={code}
              className="self-start"
            />
            {/* landr-uvfg.8 (T8) — free-form stage Select on every booking.
                POSTs set-stage with force:false; a non-canonical jump comes
                back with requires_confirmation and opens the confirm dialog
                rendered alongside the other dialogs below. */}
            {currentOperatorId &&
            stagesQuery.data &&
            stagesQuery.data.length > 0 ? (
              <div className="flex flex-col gap-1.5">
                <Label
                  htmlFor="booking-stage-select"
                  className="text-xs text-muted-foreground"
                >
                  {t.bookings.setStage.label}
                </Label>
                <NativeSelect
                  id="booking-stage-select"
                  className="max-w-xs"
                  value={code ?? ''}
                  onChange={(e) => void handleStageSelect(e.target.value)}
                  disabled={busy || setStageMutation.isPending}
                  data-testid="booking-stage-select"
                >
                  {code ? null : (
                    <option value="" disabled>
                      {t.bookings.setStage.selectPlaceholder}
                    </option>
                  )}
                  {stagesQuery.data.map((stage) => (
                    <option key={stage.code} value={stage.code}>
                      {stage.label ?? stage.code}
                    </option>
                  ))}
                </NativeSelect>
              </div>
            ) : null}
            {canUnblock ? (
              <Button
                type="button"
                onClick={() => setShowUnblock(true)}
                disabled={busy}
                className="self-start"
              >
                <Unlock className="size-4" />
                {t.bookings.hotelUnblock.label}
              </Button>
            ) : null}
            {/* landr-hgd4 — general approve / reject buttons. Only shown when
                the booking is awaiting_general_approval. Approve advances the
                booking to confirmed; Reject declines it and closes the sheet
                (same pattern as the GeneralApprovals page). */}
            {canGeneralApprove ? (
              <div className="flex flex-wrap gap-2">
                <Button
                  type="button"
                  onClick={() => setShowGeneralApprove(true)}
                  disabled={busy}
                  className="self-start"
                  data-testid="booking-general-approve-btn"
                >
                  <CheckCircle className="size-4" />
                  {t.bookings.generalApprove.approveAction}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setShowGeneralReject(true)}
                  disabled={busy}
                  className="self-start border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                  data-testid="booking-general-reject-btn"
                >
                  <XCircle className="size-4" />
                  {t.bookings.generalApprove.rejectAction}
                </Button>
              </div>
            ) : null}
          </CardContent>
        </Card>

        {/* landr-iz58 — operator-applied tags. Persisted via the FastAPI
            full-replace endpoint on every toggle (independent of the
            form-level save button — same pattern as ContactTagsField on
            CustomerDetailSheet). */}
        {currentOperatorId ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t.bookings.detail.sectionTags}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <BookingTagsField
                bookingId={row.id}
                operatorId={currentOperatorId}
                initialIds={(row.tags ?? []).map((tag) => tag.id)}
                disabled={busy}
                onSaved={invalidateAll}
              />
            </CardContent>
          </Card>
        ) : null}

        {/* Customer */}
        {row.customer ? (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium">
                {t.bookings.detail.sectionCustomer}
              </CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-first-name">
                  {t.bookings.detail.customerFirstName}
                </Label>
                <Input
                  id="bk-first-name"
                  value={customer.first_name}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, first_name: e.target.value }))
                  }
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-last-name">
                  {t.bookings.detail.customerLastName}
                </Label>
                <Input
                  id="bk-last-name"
                  value={customer.last_name}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, last_name: e.target.value }))
                  }
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-email">
                  {t.bookings.detail.customerEmail}
                </Label>
                <Input
                  id="bk-email"
                  type="email"
                  value={customer.email}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, email: e.target.value }))
                  }
                  disabled={busy}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="bk-phone">
                  {t.bookings.detail.customerPhone}
                </Label>
                <Input
                  id="bk-phone"
                  type="tel"
                  value={customer.phone}
                  onChange={(e) =>
                    setCustomer((c) => ({ ...c, phone: e.target.value }))
                  }
                  disabled={busy}
                />
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Dates / line items */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t.bookings.detail.sectionDates}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-4">
            {items.length === 0 ? (
              <p className="text-muted-foreground text-xs italic">
                {t.bookings.detail.noSelectedDays}
              </p>
            ) : (
              items.map((draft, idx) => {
                const item = row.items[idx]
                const heading = t.bookings.detail.itemHeading(
                  item?.products?.name ?? null,
                  idx,
                )
                const rangeLabel = formatRangeLabel(draft.selected_days)
                return (
                  <div
                    key={draft.id}
                    className="flex flex-col gap-3 rounded-md border p-3"
                  >
                    <div className="text-sm font-medium">{heading}</div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t.bookings.detail.pickerLabel}</Label>
                      <MultiDayPicker
                        value={draft.selected_days}
                        onChange={(next) =>
                          updateItem(draft.id, (it) => ({
                            ...it,
                            selected_days: next,
                          }))
                        }
                        initialMonth={draft.selected_days[0] ?? undefined}
                        disabled={busy}
                      />
                      <p className="text-muted-foreground text-xs">
                        {t.bookings.detail.pickerHint}
                      </p>
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>{t.bookings.detail.selectedDaysLabel}</Label>
                      <DayChips
                        days={draft.selected_days}
                        editable
                        onToggle={(day) => toggleDay(draft.id, day)}
                      />
                      {rangeLabel ? (
                        <p className="text-muted-foreground text-xs">
                          {t.bookings.detail.rangeSummary(rangeLabel)}
                        </p>
                      ) : null}
                    </div>
                  </div>
                )
              })
            )}
          </CardContent>
        </Card>

        {/* Pricing */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium">
              {t.bookings.detail.sectionPricing}
            </CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-1">
            <div className="flex items-baseline justify-between">
              <span className="text-muted-foreground text-xs uppercase tracking-wide">
                {t.bookings.detail.grossTotalLabel}
              </span>
              <span className="text-lg font-semibold">{priceDisplay(row)}</span>
            </div>
            <p className="text-muted-foreground text-xs">
              {t.bookings.detail.recomputeHint}
            </p>
            {/* landr-sbhz.2 — compose a Custom Offer (per-participant
                pricing, >N group discount, commission-free free spots).
                Gated on an operator being selected (the endpoint is
                operator-path-scoped). */}
            {currentOperatorId ? (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2 self-start"
                onClick={() => setCustomOfferOpen(true)}
                disabled={busy}
                data-testid="booking-custom-offer-btn"
              >
                <BadgeEuro className="size-4" />
                {t.bookings.customOffer.action}
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </form>
      )}

      {/* landr-sbhz.2 — Custom Offer editor sheet. Rendered alongside the
          detail body; opens over it. Keyed close resets the form. */}
      {currentOperatorId ? (
        <CustomOfferEditorSheet
          bookingId={customOfferOpen ? row.id : null}
          operatorId={currentOperatorId}
          onClose={() => setCustomOfferOpen(false)}
        />
      ) : null}

      {/* landr-3qkr.3 — sticky bottom bar on mobile with safe-area clearance. */}
      <SheetFooter className={cn(
        'flex flex-row items-center justify-between gap-2 border-t',
        isMobile ? mobileSheetFooter : 'p-4',
      )}>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="destructive"
            onClick={() => setShowCancel(true)}
            disabled={busy}
          >
            {t.bookings.cancel.action}
          </Button>
          {canNoShow ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => setShowNoShow(true)}
              disabled={busy}
              className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
            >
              <UserX className="size-4" />
              {t.bookings.noShow.action}
            </Button>
          ) : null}
          {/* landr-okxm — Mark-as-paid button. Only shown when stage is
              awaiting_payment with a positive balance_due (canMarkPaid). */}
          {canMarkPaid ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => {
                // Prefill the amount with the outstanding balance so a
                // one-click full-settlement is the default path.
                if (balanceDue != null) {
                  setMarkPaidAmount(balanceDue.toFixed(2))
                }
                setShowMarkPaid(true)
              }}
              disabled={busy}
              data-testid="booking-mark-paid-btn"
            >
              <BadgeEuro className="size-4" />
              {t.bookings.markPaid.action}
            </Button>
          ) : null}
          {/* landr-puix — clear an operator-set price override. Visible
              only when the booking has a current override AND an
              operator is selected (the DELETE endpoint is path-scoped). */}
          {showClearOverride ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => clearOverrideMutation.mutate()}
              disabled={busy}
              data-testid="booking-clear-price-override-btn"
            >
              {clearOverrideMutation.isPending
                ? t.bookings.detail.saving
                : t.bookings.inlineEdit.priceClearAction}
            </Button>
          ) : null}
        </div>
        <div className="flex items-center gap-2">
          {/* landr-6629 — resend booking confirmation with old→new diff.
              Highlighted with a dot-badge when material fields changed
              since the last confirmation was sent. Hidden when no operator
              is selected (operator-scoped endpoint).
              landr-tf39 — also hidden until a real confirmation has gone out:
              resending makes no sense before the first confirmation, and the
              server now 409s that case anyway. */}
          {currentOperatorId && hasPriorConfirmation ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => resendConfirmationMutation.mutate()}
              disabled={busy}
              aria-label={t.bookings.resendConfirmation.action}
              title={t.bookings.resendConfirmation.action}
              data-testid="booking-resend-confirmation-btn"
              className="relative"
            >
              <Mail className="size-4" />
              {resendConfirmationMutation.isPending
                ? t.bookings.resendConfirmation.working
                : t.bookings.resendConfirmation.action}
              {hasMaterialChanges ? (
                <span
                  aria-label="Material changes since last confirmation"
                  className="bg-destructive absolute -right-1 -top-1 size-2.5 rounded-full"
                  data-testid="booking-resend-confirmation-dot"
                />
              ) : null}
            </Button>
          ) : null}
          {/* landr-irds — server-rendered invoice PDF download. The button
              fetches the auth-protected endpoint with the bearer token,
              reads the response as a blob, and triggers a download. Hidden
              when no operator is selected (the endpoint requires an
              operator path param), or when the booking_invoice_download
              feature is disabled for this operator (landr-xfcy). */}
          {currentOperatorId && isEnabled('booking_invoice_download') ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => invoiceMutation.mutate()}
              disabled={busy}
              aria-label={t.bookings.invoice.action}
              title={t.bookings.invoice.action}
              data-testid="booking-invoice-btn"
            >
              <Download className="size-4" />
              {invoiceMutation.isPending
                ? t.bookings.invoice.working
                : t.bookings.invoice.action}
            </Button>
          ) : null}
          {/* landr-pztv — explicit print trigger. Ctrl+P already works
              thanks to the @media print stylesheet in src/index.css; this
              button surfaces the affordance for operators who don't know
              the shortcut. Hidden when booking_print feature is disabled
              for this operator (landr-xfcy). Do NOT touch the @media print
              CSS or Ctrl+P — those are unconditional. */}
          {isEnabled('booking_print') ? (
            <Button
              type="button"
              variant="outline"
              onClick={() => window.print()}
              disabled={busy}
              aria-label={t.bookings.detail.print}
              title={t.bookings.detail.print}
              data-testid="booking-print-btn"
            >
              <Printer className="size-4" />
              {t.bookings.detail.print}
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            onClick={onClose}
            disabled={busy}
          >
            {t.bookings.detail.cancel}
          </Button>
          <Button
            type="button"
            onClick={() => saveMutation.mutate()}
            disabled={!isDirty || busy}
            title={!isDirty ? t.bookings.detail.noChanges : undefined}
          >
            {saveMutation.isPending
              ? t.bookings.detail.saving
              : t.bookings.detail.save}
          </Button>
        </div>
      </SheetFooter>

      {/* Cancel-with-reason dialog */}
      <ConfirmActionDialog
        open={showCancel}
        onOpenChange={(next) => {
          if (cancelMutation.isPending) return
          if (!next) setCancelReason('')
          setShowCancel(next)
        }}
        title={t.bookings.cancel.dialogTitle}
        description={t.bookings.cancel.dialogDescription}
        cancelLabel={t.bookings.cancel.cancelAction}
        confirmLabel={t.bookings.cancel.confirmAction}
        confirmingLabel={t.bookings.cancel.cancelling}
        variant="destructive"
        isPending={cancelMutation.isPending}
        confirmDisabled={!cancelReasonReady}
        onConfirm={() => {
          if (!cancelReasonReady) return
          cancelMutation.mutate()
        }}
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bk-cancel-reason">
            {t.bookings.cancel.reasonLabel}
          </Label>
          <Textarea
            id="bk-cancel-reason"
            value={cancelReason}
            onChange={(e) => setCancelReason(e.target.value)}
            placeholder={t.bookings.cancel.reasonPlaceholder}
            disabled={cancelMutation.isPending}
            rows={4}
          />
          {!cancelReasonReady && cancelReason.length > 0 ? (
            <p className="text-destructive text-xs" role="alert">
              {t.bookings.cancel.reasonTooShort}
            </p>
          ) : null}
        </div>
      </ConfirmActionDialog>

      {/* Hotel-unblock confirmation */}
      <ConfirmActionDialog
        open={showUnblock}
        onOpenChange={(next) => {
          if (unblockMutation.isPending) return
          setShowUnblock(next)
        }}
        title={t.bookings.hotelUnblock.label}
        description={t.bookings.hotelUnblock.description}
        cancelLabel={t.bookings.hotelUnblock.cancel}
        confirmLabel={t.bookings.hotelUnblock.confirm}
        confirmingLabel={t.bookings.hotelUnblock.working}
        isPending={unblockMutation.isPending}
        onConfirm={() => unblockMutation.mutate()}
      />

      {/* landr-okxm — Mark-as-paid dialog. Method dropdown + amount input
          (defaults to balance_due) + optional note. */}
      <ConfirmActionDialog
        open={showMarkPaid}
        onOpenChange={(next) => {
          if (markPaidMutation.isPending) return
          if (!next) {
            setMarkPaidMethod('cash')
            setMarkPaidAmount('')
            setMarkPaidNote('')
          }
          setShowMarkPaid(next)
        }}
        title={t.bookings.markPaid.dialogTitle}
        description={t.bookings.markPaid.dialogDescription}
        cancelLabel={t.bookings.markPaid.cancel}
        confirmLabel={t.bookings.markPaid.confirm}
        confirmingLabel={t.bookings.markPaid.working}
        isPending={markPaidMutation.isPending}
        onConfirm={() => markPaidMutation.mutate()}
        confirmTestId="mark-paid-confirm"
      >
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-mark-paid-method">
              {t.bookings.markPaid.methodLabel}
            </Label>
            <NativeSelect
              id="bk-mark-paid-method"
              value={markPaidMethod}
              onChange={(e) =>
                setMarkPaidMethod(e.target.value as MarkAsPaidMethod)
              }
              disabled={markPaidMutation.isPending}
              data-testid="mark-paid-method"
            >
              <option value="cash">{t.bookings.markPaid.methodCash}</option>
              <option value="bank_transfer">
                {t.bookings.markPaid.methodBankTransfer}
              </option>
              <option value="other">{t.bookings.markPaid.methodOther}</option>
            </NativeSelect>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-mark-paid-amount">
              {t.bookings.markPaid.amountLabel} ({row.currency || 'EUR'})
            </Label>
            <Input
              id="bk-mark-paid-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={markPaidAmount}
              onChange={(e) => setMarkPaidAmount(e.target.value)}
              disabled={markPaidMutation.isPending}
              data-testid="mark-paid-amount"
            />
            <p className="text-muted-foreground text-xs">
              {t.bookings.markPaid.amountHint}
            </p>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="bk-mark-paid-note">
              {t.bookings.markPaid.noteLabel}
            </Label>
            <Textarea
              id="bk-mark-paid-note"
              value={markPaidNote}
              onChange={(e) => setMarkPaidNote(e.target.value)}
              placeholder={t.bookings.markPaid.notePlaceholder}
              disabled={markPaidMutation.isPending}
              rows={2}
              data-testid="mark-paid-note"
            />
          </div>
        </div>
      </ConfirmActionDialog>

      {/* landr-ng3m — Mark-as-no-show confirmation */}
      <ConfirmActionDialog
        open={showNoShow}
        onOpenChange={(next) => {
          if (noShowMutation.isPending) return
          if (!next) setChargeCancellationFee(false)
          setShowNoShow(next)
        }}
        title={t.bookings.noShow.dialogTitle}
        description={t.bookings.noShow.dialogDescription}
        cancelLabel={t.bookings.noShow.cancel}
        confirmLabel={t.bookings.noShow.confirm}
        confirmingLabel={t.bookings.noShow.working}
        variant="destructive"
        isPending={noShowMutation.isPending}
        onConfirm={() => noShowMutation.mutate()}
      >
        <div className="flex items-start gap-2">
          <Checkbox
            id="bk-no-show-charge-fee"
            checked={chargeCancellationFee}
            onChange={(e) =>
              setChargeCancellationFee(
                (e.target as HTMLInputElement).checked,
              )
            }
            disabled={noShowMutation.isPending}
            data-testid="no-show-charge-fee"
          />
          <div className="flex flex-col gap-1">
            <Label
              htmlFor="bk-no-show-charge-fee"
              className="text-sm font-normal"
            >
              {t.bookings.noShow.chargeFeeLabel}
            </Label>
            <p className="text-muted-foreground text-xs">
              {t.bookings.noShow.chargeFeeHint}
            </p>
          </div>
        </div>
      </ConfirmActionDialog>

      {/* landr-hgd4 — General approve confirmation */}
      <ConfirmActionDialog
        open={showGeneralApprove}
        onOpenChange={(next) => {
          if (generalApproveMutation.isPending) return
          if (!next) setGeneralApproveNote('')
          setShowGeneralApprove(next)
        }}
        title={t.bookings.generalApprove.approveDialogTitle}
        description={t.bookings.generalApprove.approveDialogDescription}
        cancelLabel={t.bookings.generalApprove.cancel}
        confirmLabel={t.bookings.generalApprove.confirmApprove}
        confirmingLabel={t.bookings.generalApprove.approving}
        isPending={generalApproveMutation.isPending}
        onConfirm={() => generalApproveMutation.mutate()}
        confirmTestId="general-approve-confirm"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bk-general-approve-note">
            {t.bookings.generalApprove.noteLabel}
          </Label>
          <Textarea
            id="bk-general-approve-note"
            value={generalApproveNote}
            onChange={(e) => setGeneralApproveNote(e.target.value)}
            placeholder={t.bookings.generalApprove.notePlaceholder}
            disabled={generalApproveMutation.isPending}
            rows={2}
            data-testid="general-approve-note"
          />
        </div>
      </ConfirmActionDialog>

      {/* landr-hgd4 — General reject confirmation */}
      <ConfirmActionDialog
        open={showGeneralReject}
        onOpenChange={(next) => {
          if (generalRejectMutation.isPending) return
          if (!next) setGeneralRejectNote('')
          setShowGeneralReject(next)
        }}
        title={t.bookings.generalApprove.rejectDialogTitle}
        description={t.bookings.generalApprove.rejectDialogDescription}
        cancelLabel={t.bookings.generalApprove.cancel}
        confirmLabel={t.bookings.generalApprove.confirmReject}
        confirmingLabel={t.bookings.generalApprove.rejecting}
        variant="destructive"
        isPending={generalRejectMutation.isPending}
        onConfirm={() => generalRejectMutation.mutate()}
        confirmTestId="general-reject-confirm"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="bk-general-reject-note">
            {t.bookings.generalApprove.rejectNoteLabel}
          </Label>
          <Textarea
            id="bk-general-reject-note"
            value={generalRejectNote}
            onChange={(e) => setGeneralRejectNote(e.target.value)}
            placeholder={t.bookings.generalApprove.rejectNotePlaceholder}
            disabled={generalRejectMutation.isPending}
            rows={3}
            data-testid="general-reject-note"
          />
        </div>
      </ConfirmActionDialog>

      {/* landr-uvfg.8 (T8) — non-canonical stage transition confirm. Opened
          when set-stage returns requires_confirmation; confirming re-POSTs
          the same target with force:true. */}
      <AlertDialog
        open={showStageConfirm}
        onOpenChange={(next) => {
          if (setStageMutation.isPending) return
          setShowStageConfirm(next)
          if (!next) setPendingStageCode(null)
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {t.bookings.setStage.confirmTitle}
            </AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div>
                {stageWarning}
                {stageSideEffects.length > 0 ? (
                  <div className="mt-2">
                    {t.bookings.setStage.sideEffectsLabel}
                    <ul className="mt-1 list-disc pl-4">
                      {stageSideEffects.map((e) => (
                        <li key={e}>{e}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setShowStageConfirm(false)
                setPendingStageCode(null)
              }}
              disabled={setStageMutation.isPending}
            >
              {t.bookings.setStage.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleStageConfirm()}
              disabled={setStageMutation.isPending}
            >
              {setStageMutation.isPending
                ? t.bookings.setStage.working
                : t.bookings.setStage.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

// ---- TagPicker bridge (landr-iz58) ----------------------------------
//
// Renders a TagPicker pre-populated with the booking's current tag set
// (BookingRow.tags is hydrated by the bookings SELECT's booking_tags
// embed). Toggling fires setBookingTags() immediately — tags persist
// independently of the form-level save button so a tag flip doesn't
// have to ride along with pricing recompute / contact patches.

type BookingTagsFieldProps = {
  bookingId: string
  operatorId: string
  initialIds: string[]
  disabled?: boolean
  onSaved?: () => void
}

function BookingTagsField({
  bookingId,
  operatorId,
  initialIds,
  disabled,
  onSaved,
}: BookingTagsFieldProps) {
  const [selected, setSelected] = useState<string[]>(initialIds)

  const mutation = useMutation({
    mutationFn: (nextIds: string[]) => setBookingTags(operatorId, bookingId, nextIds),
    onSuccess: () => {
      onSaved?.()
    },
    onError: (err: Error) => {
      setSelected(initialIds)
      toast.error(t.bookings.detail.tagsToastError, { description: err.message })
    },
  })

  return (
    <TagPicker
      operatorId={operatorId}
      selectedIds={selected}
      onChange={(next) => {
        setSelected(next)
        mutation.mutate(next)
      }}
      disabled={disabled || mutation.isPending}
      testIdPrefix="booking-tag-picker"
    />
  )
}
