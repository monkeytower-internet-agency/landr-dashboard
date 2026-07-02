// landr-a4pl.2 — /invoicing: Holded invoice transfer status + manual Sync-now.
//
// Operator-scoped surface giving operators (Martin) visibility + manual
// control over Holded invoice transfer, since auto-sync isn't wired yet
// (landr-cpq0). Consumes the epic contract:
//   [A] GET  …/holded/invoices -> { summary, rows }
//   [B] POST …/holded/sync     -> sync result | { holded_not_connected: true }
//
// Surface:
//   • bucket tabs (Transferred / Pending / Failed / Blocked) with the summary
//     counts as badges; pending rows carry a 'due soon' vs 'overdue' sub-flag.
//   • the shared DataTable (desktop + mobile card mode) via InvoicingTable.
//   • a prominent 'Sync due invoices to Holded' button → POST sync → toast →
//     refetch. Disabled with a 'Connect Holded' hint when the API reports
//     holded_not_connected.
//   • per-row Retry on failed rows (re-runs the whole-operator sync pass — the
//     contract has no per-row variant — with a result toast + refetch).

import { useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2Icon, RefreshCwIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { InvoicingTable } from '@/components/InvoicingTable'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { cn } from '@/lib/utils'
import {
  HOLDED_BUCKETS,
  fetchHoldedInvoices,
  isHoldedNotConnected,
  syncHoldedInvoices,
  type HoldedInvoiceBucket,
  type HoldedInvoiceRow,
  type HoldedInvoicesResponse,
  type HoldedSyncResult,
} from '@/lib/holded-invoicing'
import { t } from '@/lib/strings'

// Holded credentials live in Account → Payments & invoicing.
const HOLDED_CONNECT_PATH = '/account/integrations/payments'

const BUCKET_LABEL: Record<HoldedInvoiceBucket, string> = {
  transferred: t.invoicing.bucketTransferred,
  pending: t.invoicing.bucketPending,
  failed: t.invoicing.bucketFailed,
  blocked: t.invoicing.bucketBlocked,
}

export function Invoicing() {
  const { currentOperatorId } = useOperator()
  const queryClient = useQueryClient()
  const [bucket, setBucket] = useState<HoldedInvoiceBucket>('pending')
  // sync_log_id of the row whose Retry button is mid-flight (per-row spinner).
  const [retryingId, setRetryingId] = useState<string | null>(null)
  // Set true once a sync returns holded_not_connected so the button stays
  // disabled with the Connect hint until the operator wires their key.
  const [notConnected, setNotConnected] = useState(false)

  const opId = currentOperatorId ?? 'none'

  const query = useQuery<HoldedInvoicesResponse, Error>({
    queryKey: ['holded-invoices', opId],
    queryFn: () => fetchHoldedInvoices(currentOperatorId as string),
    enabled: !!currentOperatorId,
    staleTime: 1000 * 30,
  })

  const summary = query.data?.summary
  const allRows = useMemo(() => query.data?.rows ?? [], [query.data])
  const bucketRows = useMemo(
    () => allRows.filter((r) => r.bucket === bucket),
    [allRows, bucket],
  )

  // Shared handler for the Sync-now button AND the per-row Retry: both run one
  // operator-scoped sync pass (the contract has no per-row endpoint). The
  // mutation drives the button spinner; retryingId drives the row spinner.
  // The sync can run up to batch_limit=100 sequential Holded API calls server-side,
  // so we override the default 15s timeout with 120s to avoid false "Request timed out"
  // toasts while the server keeps working (landr-y3oj.6).
  const syncMutation = useMutation<HoldedSyncResult, Error, void>({
    mutationFn: () => syncHoldedInvoices(currentOperatorId as string, { timeoutMs: 120000 }),
    onSuccess: (result) => {
      if (isHoldedNotConnected(result)) {
        setNotConnected(true)
        toast.error(t.invoicing.notConnectedTitle, {
          description: t.invoicing.notConnectedHint,
        })
        return
      }
      setNotConnected(false)
      toast.success(
        t.invoicing.syncResult(
          result.succeeded,
          result.failed,
          result.remaining_pending,
        ),
      )
      void queryClient.invalidateQueries({
        queryKey: ['holded-invoices', opId],
      })
    },
    onError: (err) => {
      toast.error(t.invoicing.syncError, {
        description: err instanceof Error ? err.message : undefined,
      })
    },
    onSettled: () => {
      setRetryingId(null)
    },
  })

  function handleSync() {
    if (!currentOperatorId || syncMutation.isPending) return
    syncMutation.mutate()
  }

  function handleRetry(row: HoldedInvoiceRow) {
    if (!currentOperatorId || syncMutation.isPending) return
    setRetryingId(row.sync_log_id)
    syncMutation.mutate()
  }

  // Booking-ref link → open the booking detail sheet on the Bookings page via
  // the existing ?open=<bookingId> deep-link contract (the same mechanism the
  // sidebar Recently-viewed list uses).
  function openBooking(row: HoldedInvoiceRow) {
    window.location.assign(`/bookings?open=${row.booking_id}`)
  }

  const syncBusy = syncMutation.isPending
  // The Sync button spins only for the whole-page sync (not a per-row retry).
  const wholeSyncBusy = syncBusy && retryingId === null
  const syncDisabled = !currentOperatorId || syncBusy || notConnected

  const syncAction = (
    <div className="flex items-center gap-3">
      {notConnected ? (
        <Button asChild variant="outline" size="sm">
          <Link to={HOLDED_CONNECT_PATH} data-testid="invoicing-connect-holded">
            {t.invoicing.connectHolded}
          </Link>
        </Button>
      ) : null}
      <Button
        onClick={handleSync}
        disabled={syncDisabled}
        data-testid="invoicing-sync-button"
        title={notConnected ? t.invoicing.notConnectedHint : undefined}
      >
        {wholeSyncBusy ? (
          <>
            <Loader2Icon className="size-4 animate-spin" />
            {t.invoicing.syncing}
          </>
        ) : (
          <>
            <RefreshCwIcon className="size-4" />
            {t.invoicing.syncButton}
          </>
        )}
      </Button>
    </div>
  )

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.invoicing.title} subtitle={t.invoicing.subtitle} />

      {/* In-page header: the prominent Sync-now action lives here (not only in
          the topbar PageTitle slot) so it is always visible on the page itself
          — including on mobile where the topbar action slot is cramped. */}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
        {syncAction}
      </div>

      {notConnected ? (
        <Card data-testid="invoicing-not-connected">
          <CardHeader>
            <CardTitle>{t.invoicing.notConnectedTitle}</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col items-start gap-3">
            <p className="text-muted-foreground text-sm">
              {t.invoicing.notConnectedHint}
            </p>
            <Button asChild variant="outline" size="sm">
              <Link to={HOLDED_CONNECT_PATH}>{t.invoicing.connectHolded}</Link>
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {query.isError ? (
        <Card>
          <CardHeader>
            <CardTitle>{t.invoicing.errorTitle}</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-muted-foreground text-sm">
              {query.error?.message ?? ''}
            </p>
          </CardContent>
        </Card>
      ) : (
        <Tabs
          value={bucket}
          onValueChange={(next) => setBucket(next as HoldedInvoiceBucket)}
        >
          <TabsList data-testid="invoicing-bucket-tabs">
            {HOLDED_BUCKETS.map((b) => (
              <TabsTrigger
                key={b}
                value={b}
                data-testid={`invoicing-tab-${b}`}
                className="gap-2"
              >
                {BUCKET_LABEL[b]}
                <span
                  className={cn(
                    'bg-muted text-muted-foreground inline-flex min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium',
                  )}
                  data-testid={`invoicing-badge-${b}`}
                >
                  {summary ? summary[b] : 0}
                </span>
              </TabsTrigger>
            ))}
          </TabsList>

          {HOLDED_BUCKETS.map((b) => (
            <TabsContent key={b} value={b} className="mt-4">
              <InvoicingTable
                rows={b === bucket ? bucketRows : []}
                isLoading={query.isPending && !!currentOperatorId}
                onOpenBooking={openBooking}
                onRetry={handleRetry}
                retryingId={retryingId}
                syncBusy={syncBusy}
              />
            </TabsContent>
          ))}
        </Tabs>
      )}
    </div>
  )
}
