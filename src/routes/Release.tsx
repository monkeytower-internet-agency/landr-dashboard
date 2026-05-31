// landr-a99u.6 — /release: dashboard-driven release promotion console
// (STAFF-ONLY originally; landr-7dya.21 widens to is_release_signer customers).
// Implements docs/adr/0004-release-promotion-console.md.
//
// landr-a99u.11 — graceful no-token state: when GET /status fails with HTTP
// 503 (detail === 'promotion_not_configured'), render a friendly disabled card
// instead of surfacing an error toast/crash. api() extracts the FastAPI
// `detail` string, so we can detect it by inspecting err.message.
//
// landr-a99u.12 — staff side: pending staging_to_main proposals now show a
// signoff badge when signoff_source === 'customer', so the approver knows it
// came from a customer UAT request (e.g. "Requested by Para42").
//
// landr-7dya.21 — TIER-AWARE re-shape. The page now switches on BOTH the
// deploy tier (VITE_DEPLOY_TIER or server-reported viewer.tier) AND the
// viewer's role to render exactly the sections that make sense for the
// current env:
//
//   tier=dev     + staff promoter/approver  → ONLY "Promote to staging"
//   tier=staging + staff approver           → pending Martin requests +
//                                             "Approve & promote" + propose
//   tier=staging + staff promoter (no app.) → propose + pending visibility
//   tier=staging + customer signer (Martin) → "Request go-live" card
//   tier=prod    + anyone                   → "No further promotions" card
//
// The INVARIANT: a dev → main promotion path is NEVER rendered, period.
// The dev tier only exposes dev→staging; the staging tier only exposes
// staging→main; prod exposes nothing actionable. Tests assert this directly.
//
// A "promotion" merges one branch into the next (dev → staging, then
// staging → main) across the deployable repos and pushes; the push triggers
// each repo's deploy. dev → staging is a one-click promoter action; staging →
// main is a two-step propose → approve flow.
//
// STAFF GATING (mirrors Revenue.tsx, landr-sbhz.8): this is Landr owner
// tooling, NOT a tenant-entitlement module — it is left OUT of the feature
// registry. STAFF access is gated to is_landr_staff in two places: the route
// self-redirects non-staff to home (unless they're a signer, see below), and
// the FastAPI endpoints return 403 for any non-staff bearer (the real
// enforcement). The individual ACTIONS are then gated on the server-computed
// `viewer` capability block from …/status — NOT raw roles — so the rules
// stay in one place (the backend).
//
// CUSTOMER (landr-7dya.21): non-staff customers with the is_release_signer
// flag (Martin) are permitted onto /release in staging-tier builds to file
// a "Request go-live" relay request. The eligibility endpoint
// (/api/operator/release/eligibility) gates both on the tier (staging-side
// relay only) and on the signer flag, so the route guard treats
// can_request_golive as the customer access lever.
import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { CheckIcon, RefreshCwIcon, RocketIcon, XIcon } from 'lucide-react'

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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { TierBadge } from '@/components/TierBadge'
import { useEntitlements } from '@/lib/entitlements'
import { PageTitle } from '@/lib/page-title'
import {
  approveRun,
  cancelRun,
  fetchGoLiveEligibility,
  kindLabel,
  promoteToStaging,
  proposeToProd,
  rejectRun,
  fetchRuns,
  fetchStatus,
  requestGoLive,
  shortSha,
  type GoLiveEligibility,
  type MergeStatus,
  type PromotionRun,
  type PromotionRunRepo,
  type PromotionStatus,
  type PromotionStatusResponse,
  type RepoStatus,
} from '@/lib/release-promotion'
import { resolveTier, type DeployTier } from '@/lib/tier'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

const STATUS_QUERY_KEY = ['release', 'status'] as const
const RUNS_QUERY_KEY = ['release', 'runs'] as const
const ELIGIBILITY_QUERY_KEY = ['release', 'eligibility'] as const

/**
 * landr-a99u.11 — detect the 503 "not configured" state. The FastAPI backend
 * returns HTTP 503 with `detail: "promotion_not_configured"` when the GitHub
 * promotion token has not yet been provisioned. The api() wrapper extracts the
 * `detail` string as err.message, so we check the message here.
 */
function isPromotionNotConfigured(err: Error | null): boolean {
  return !!err && err.message === 'promotion_not_configured'
}

/**
 * landr-7dya.21 — outer guard. Staff get the full console; non-staff with the
 * is_release_signer flag (and on the staging relay side) get the customer
 * Request-go-live console; everyone else redirects to home.
 *
 * We fetch eligibility unconditionally because we need the flag to make the
 * routing decision. The endpoint is cheap (1 row + an env check) and returns
 * {can_request_golive: false} for staff too, so it doesn't double-gate the
 * staff path — it just gives us the signer signal for the customer branch.
 */
export function Release() {
  const { effectiveIsStaff, isLoading: entLoading } = useEntitlements()

  // Always query eligibility — the answer drives the routing decision below.
  // Server returns false for staff/non-signer/wrong-tier; that's the same
  // signal we use to deny the customer branch.
  const eligibilityQuery = useQuery<GoLiveEligibility, Error>({
    queryKey: ELIGIBILITY_QUERY_KEY,
    queryFn: () => fetchGoLiveEligibility(),
    // The endpoint is idempotent and cheap; refetch on focus to pick up role
    // changes within the session.
    staleTime: 1000 * 30,
  })

  if (entLoading || eligibilityQuery.isPending) {
    return (
      <p className="text-muted-foreground p-6 text-sm">{t.release.loading}</p>
    )
  }

  if (effectiveIsStaff) {
    return <StaffReleaseConsole />
  }

  // Non-staff: customer signer on the staging relay side may request go-live.
  if (eligibilityQuery.data?.can_request_golive) {
    return <CustomerReleaseConsole />
  }

  // Neither staff nor a customer signer → not this page.
  return <Navigate to="/" replace />
}

// ===========================================================================
//   STAFF CONSOLE — switches on tier to render only the relevant section
// ===========================================================================

function StaffReleaseConsole() {
  const queryClient = useQueryClient()

  const statusQuery = useQuery<PromotionStatusResponse, Error>({
    queryKey: STATUS_QUERY_KEY,
    queryFn: () => fetchStatus(),
    staleTime: 1000 * 15,
  })
  const runsQuery = useQuery<PromotionRun[], Error>({
    queryKey: RUNS_QUERY_KEY,
    queryFn: () => fetchRuns(),
    staleTime: 1000 * 15,
  })

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY })
  }

  const status = statusQuery.data
  const viewer = status?.viewer
  const repos = status?.repos ?? []
  const runsData = runsQuery.data
  const runs = useMemo(() => runsData ?? [], [runsData])

  // Memoise so the empty-array fallback keeps a stable identity across renders
  // (otherwise the pendingProposals useMemo below re-fires every render).
  const pendingProposals = useMemo(
    () => runs.filter((r) => r.status === 'proposed'),
    [runs],
  )

  // Prefer the server-reported tier (it knows the actual API ENVIRONMENT) and
  // fall back to the build-time VITE_DEPLOY_TIER. Either may be null — in that
  // case the tier-aware switch renders a read-only "tier unknown" card and no
  // action button is exposed (the only safe default).
  const tier = resolveTier(viewer?.tier)

  return (
    <div className="flex flex-col gap-6">
      <PageTitle title={t.release.title} subtitle={t.release.subtitle} />
      <header className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex flex-col gap-1">
          <div className="flex items-center gap-2">
            <h1 className="text-xl font-semibold">{t.release.title}</h1>
            {tier ? <TierBadge tier={tier} showProd /> : null}
          </div>
          <p className="text-muted-foreground max-w-3xl text-sm">
            {t.release.subtitle}
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={invalidateAll}
          disabled={statusQuery.isFetching || runsQuery.isFetching}
        >
          <RefreshCwIcon
            className={cn(
              'size-4',
              (statusQuery.isFetching || runsQuery.isFetching) && 'animate-spin',
            )}
          />
          {t.release.refresh}
        </Button>
      </header>

      {statusQuery.isError ? (
        isPromotionNotConfigured(statusQuery.error) ? (
          // landr-a99u.11 — 503 promotion_not_configured: friendly empty state
          // instead of a crash/toast. The feature is inert without the GitHub
          // token; showing an error here would be misleading for a known state.
          <Card>
            <CardHeader>
              <CardTitle>{t.release.notConfiguredTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {t.release.notConfiguredDescription}
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardHeader>
              <CardTitle>{t.release.errorTitle}</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-muted-foreground text-sm">
                {statusQuery.error?.message ?? ''}
              </p>
            </CardContent>
          </Card>
        )
      ) : statusQuery.isPending ? (
        <p className="text-muted-foreground text-sm">{t.release.loading}</p>
      ) : (
        <>
          {/* The env matrix is read-only context and useful on every tier
              — show it everywhere (dev/staging/prod). */}
          <EnvironmentMatrix repos={repos} />

          <TierAwareSections
            tier={tier}
            repos={repos}
            viewer={viewer}
            proposals={pendingProposals}
            onDone={invalidateAll}
          />

          <HistorySection
            runs={runs}
            isPending={runsQuery.isPending}
            isError={runsQuery.isError}
          />
        </>
      )}
    </div>
  )
}

/**
 * landr-7dya.21 — central tier+role switch. THIS is the function that enforces
 * the "never dev→main" invariant: the dev branch never renders ProductionSection,
 * and the staging branch never renders PromoteToStagingSection. There is no
 * branch that renders both staging-to-main controls outside of staging tier.
 */
function TierAwareSections({
  tier,
  repos,
  viewer,
  proposals,
  onDone,
}: {
  tier: DeployTier | null
  repos: RepoStatus[]
  viewer: PromotionStatusResponse['viewer'] | undefined
  proposals: PromotionRun[]
  onDone: () => void
}) {
  if (tier === null) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t.release.tierAware.unknownTierTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {t.release.tierAware.unknownTierDescription}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (tier === 'prod') {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t.release.tierAware.prodNoActionsTitle}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">
            {t.release.tierAware.prodNoActionsDescription}
          </p>
        </CardContent>
      </Card>
    )
  }

  if (tier === 'dev') {
    // dev-tier console: ONLY the dev→staging promote section. Never propose
    // to production from here — that's a staging-tier action.
    return (
      <PromoteToStagingSection
        repos={repos}
        canPromote={!!viewer?.can_promote_staging}
        onDone={onDone}
      />
    )
  }

  // tier === 'staging': production promotion section only. Promoter sees the
  // "Propose" button + the pending list; approver additionally sees Approve/
  // Reject controls. NO dev→staging button here — that's a dev-tier action.
  return (
    <ProductionSection
      repos={repos}
      canPropose={!!viewer?.can_propose_prod}
      canApprove={!!viewer?.can_approve_prod}
      proposals={proposals}
      onDone={onDone}
    />
  )
}

// ===========================================================================
//   CUSTOMER CONSOLE — Martin's "Request go-live" surface (staging only)
// ===========================================================================

/**
 * landr-7dya.21 — the customer signer console. Reached only when the route
 * guard sees a non-staff user with can_request_golive=true. The eligibility
 * endpoint already gates on tier (staging-side relay only) and the
 * is_release_signer flag — so by the time we render here, the only question
 * left is: is there already a pending request? `requestGoLive` returns
 * `already_pending` instead of erroring in that case, and we toast + flip
 * the card into a "pending" state so the customer knows their previous
 * request is still in flight.
 */
function CustomerReleaseConsole() {
  const [pending, setPending] = useState(false)
  const [notes, setNotes] = useState('')

  const mutation = useMutation({
    mutationFn: () => requestGoLive(notes.trim() || undefined),
    onSuccess: (result) => {
      if (result.status === 'already_pending') {
        toast.info(t.release.tierAware.requestAlreadyPendingToast)
      } else {
        toast.success(t.release.tierAware.requestSentToast)
      }
      setPending(true)
      setNotes('')
    },
    onError: (err: Error) => {
      toast.error(t.release.tierAware.requestErrorTitle, {
        description: err.message,
      })
    },
  })

  return (
    <div className="flex flex-col gap-6">
      <PageTitle
        title={t.release.title}
        subtitle={t.release.tierAware.requestGoLiveDescription}
      />
      <header className="flex flex-col gap-1">
        <div className="flex items-center gap-2">
          <h1 className="text-xl font-semibold">{t.release.title}</h1>
          <TierBadge tier="staging" />
        </div>
      </header>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t.release.tierAware.requestGoLiveTitle}
          </CardTitle>
          <p className="text-muted-foreground text-sm">
            {t.release.tierAware.requestGoLiveDescription}
          </p>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          {pending ? (
            <p
              className="text-muted-foreground text-sm"
              data-testid="customer-request-pending"
            >
              {t.release.tierAware.customerRequestPendingLabel}
            </p>
          ) : (
            <>
              <div className="flex flex-col gap-1.5">
                <Label htmlFor="customer-request-notes">
                  {t.release.tierAware.requestGoLiveNotesLabel}
                </Label>
                <Textarea
                  id="customer-request-notes"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder={
                    t.release.tierAware.requestGoLiveNotesPlaceholder
                  }
                  disabled={mutation.isPending}
                />
              </div>
              <div>
                <Button
                  onClick={() => mutation.mutate()}
                  disabled={mutation.isPending}
                >
                  <RocketIcon className="size-4" />
                  {mutation.isPending
                    ? t.release.tierAware.requestGoLiveSubmitting
                    : t.release.tierAware.requestGoLiveButton}
                </Button>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

// --- environment matrix ----------------------------------------------------

function AheadCell({ ahead }: { ahead: number }) {
  if (ahead <= 0) {
    return (
      <span className="text-muted-foreground text-sm">{t.release.upToDate}</span>
    )
  }
  return (
    <span className="text-sm font-medium tabular-nums">
      {t.release.commitsAhead(ahead)}
    </span>
  )
}

function EnvironmentMatrix({ repos }: { repos: RepoStatus[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.release.matrixTitle}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t.release.matrixSubtitle}
        </p>
      </CardHeader>
      <CardContent>
        {repos.length === 0 ? (
          <p className="text-muted-foreground text-sm">{t.release.matrixEmpty}</p>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.release.columnRepo}</TableHead>
                  <TableHead>{t.release.columnDevToStaging}</TableHead>
                  <TableHead>{t.release.columnStagingToMain}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {repos.map((r) => (
                  <TableRow key={r.repo} data-testid="release-matrix-row">
                    <TableCell className="font-medium">
                      <span className="font-mono text-sm">{r.repo}</span>
                    </TableCell>
                    <TableCell>
                      <AheadCell ahead={r.dev_to_staging_ahead_by} />
                    </TableCell>
                    <TableCell>
                      <AheadCell ahead={r.staging_to_main_ahead_by} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  )
}

// --- promote to staging ----------------------------------------------------

function PromoteToStagingSection({
  repos,
  canPromote,
  onDone,
}: {
  repos: RepoStatus[]
  canPromote: boolean
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')

  const changedRepos = useMemo(
    () => repos.filter((r) => r.dev_to_staging_ahead_by > 0),
    [repos],
  )
  const hasChanges = changedRepos.length > 0

  const mutation = useMutation({
    mutationFn: () =>
      promoteToStaging({
        // Pin the explicit set of repos that have changes so the request
        // matches the checklist the user just confirmed.
        repos: changedRepos.map((r) => r.repo),
        notes: notes.trim() || undefined,
      }),
    onSuccess: () => {
      toast.success(t.release.stagingToast)
      onDone()
      setOpen(false)
      setNotes('')
    },
    onError: (err: Error) => {
      toast.error(t.release.errorTitle, { description: err.message })
    },
  })

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.release.stagingTitle}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t.release.stagingSubtitle}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {!canPromote ? (
          <p className="text-muted-foreground text-sm">
            {t.release.stagingNoPermission}
          </p>
        ) : !hasChanges ? (
          <p className="text-muted-foreground text-sm">
            {t.release.stagingNothing}
          </p>
        ) : null}
        <div>
          <Button
            onClick={() => setOpen(true)}
            disabled={!canPromote || !hasChanges}
          >
            <RocketIcon className="size-4" />
            {t.release.stagingButton}
          </Button>
        </div>
      </CardContent>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (mutation.isPending) return
          setOpen(o)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.release.stagingConfirmTitle}</DialogTitle>
            <DialogDescription>
              {t.release.stagingConfirmDescription}
            </DialogDescription>
          </DialogHeader>
          <RepoChecklist
            items={changedRepos.map((r) => ({
              repo: r.repo,
              ahead: r.dev_to_staging_ahead_by,
              head_sha: r.dev_sha,
            }))}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="staging-notes">{t.release.stagingNotesLabel}</Label>
            <Textarea
              id="staging-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.release.stagingNotesPlaceholder}
              disabled={mutation.isPending}
            />
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              {t.release.keep}
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending}
            >
              <RocketIcon className="size-4" />
              {t.release.stagingConfirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}

// --- production: propose + pending proposals -------------------------------

function ProductionSection({
  repos,
  canPropose,
  canApprove,
  proposals,
  onDone,
}: {
  repos: RepoStatus[]
  canPropose: boolean
  canApprove: boolean
  proposals: PromotionRun[]
  onDone: () => void
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.release.prodTitle}</CardTitle>
        <p className="text-muted-foreground text-sm">{t.release.prodSubtitle}</p>
      </CardHeader>
      <CardContent className="flex flex-col gap-6">
        {canPropose ? (
          <ProposeToProdControl repos={repos} onDone={onDone} />
        ) : null}

        <div className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">{t.release.pendingTitle}</h3>
          {proposals.length === 0 ? (
            <p className="text-muted-foreground text-sm">
              {t.release.pendingEmpty}
            </p>
          ) : (
            proposals.map((run) => (
              <ProposalCard
                key={run.id}
                run={run}
                canApprove={canApprove}
                onDone={onDone}
              />
            ))
          )}
        </div>
      </CardContent>
    </Card>
  )
}

function ProposeToProdControl({
  repos,
  onDone,
}: {
  repos: RepoStatus[]
  onDone: () => void
}) {
  const [open, setOpen] = useState(false)
  const [notes, setNotes] = useState('')

  const changedRepos = useMemo(
    () => repos.filter((r) => r.staging_to_main_ahead_by > 0),
    [repos],
  )
  const hasChanges = changedRepos.length > 0

  const mutation = useMutation({
    mutationFn: () =>
      proposeToProd({
        repos: changedRepos.map((r) => r.repo),
        notes: notes.trim(),
      }),
    onSuccess: () => {
      toast.success(t.release.proposeToast)
      onDone()
      setOpen(false)
      setNotes('')
    },
    onError: (err: Error) => {
      toast.error(t.release.errorTitle, { description: err.message })
    },
  })

  const notesEmpty = notes.trim().length === 0

  return (
    <div className="flex flex-col gap-2">
      {!hasChanges ? (
        <p className="text-muted-foreground text-sm">{t.release.prodNothing}</p>
      ) : null}
      <div>
        <Button onClick={() => setOpen(true)} disabled={!hasChanges}>
          <RocketIcon className="size-4" />
          {t.release.proposeButton}
        </Button>
      </div>

      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (mutation.isPending) return
          setOpen(o)
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t.release.proposeConfirmTitle}</DialogTitle>
            <DialogDescription>
              {t.release.proposeConfirmDescription}
            </DialogDescription>
          </DialogHeader>
          <RepoChecklist
            items={changedRepos.map((r) => ({
              repo: r.repo,
              ahead: r.staging_to_main_ahead_by,
              head_sha: r.staging_sha,
            }))}
          />
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="propose-notes">{t.release.proposeNotesLabel}</Label>
            <Textarea
              id="propose-notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder={t.release.proposeNotesPlaceholder}
              disabled={mutation.isPending}
              aria-invalid={notesEmpty}
            />
            {notesEmpty ? (
              <p className="text-destructive text-xs">
                {t.release.proposeNotesRequired}
              </p>
            ) : null}
          </div>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setOpen(false)}
              disabled={mutation.isPending}
            >
              {t.release.keep}
            </Button>
            <Button
              onClick={() => mutation.mutate()}
              disabled={mutation.isPending || notesEmpty}
            >
              <RocketIcon className="size-4" />
              {t.release.proposeConfirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

type ProposalAction = 'approve' | 'reject' | 'cancel'

function ProposalCard({
  run,
  canApprove,
  onDone,
}: {
  run: PromotionRun
  canApprove: boolean
  onDone: () => void
}) {
  const [action, setAction] = useState<ProposalAction | null>(null)
  const [notes, setNotes] = useState('')

  const mutation = useMutation({
    mutationFn: async () => {
      if (action === 'approve') {
        await approveRun(run.id, { notes: notes.trim() || undefined })
      } else if (action === 'reject') {
        await rejectRun(run.id, { notes: notes.trim() })
      } else if (action === 'cancel') {
        await cancelRun(run.id)
      }
    },
    onSuccess: () => {
      toast.success(
        action === 'approve'
          ? t.release.approveToast
          : action === 'reject'
            ? t.release.rejectToast
            : t.release.cancelToast,
      )
      onDone()
      closeDialog()
    },
    onError: (err: Error) => {
      toast.error(t.release.errorTitle, { description: err.message })
    },
  })

  function openDialog(a: ProposalAction) {
    setNotes('')
    setAction(a)
  }
  function closeDialog() {
    if (mutation.isPending) return
    setAction(null)
    setNotes('')
  }

  const rejectNotesEmpty = notes.trim().length === 0

  return (
    <div className="rounded-md border p-4">
      <div className="flex flex-col gap-2">
        <div className="flex items-center justify-between gap-2">
          <span className="font-mono text-sm font-medium">
            {kindLabel(run.kind)}
          </span>
          <div className="flex items-center gap-2">
            {/* landr-a99u.12 — show who signed off so the approver knows
                whether this came from a customer UAT request or a staff member */}
            {run.signoff_source === 'customer' ? (
              <SignoffBadge label={run.signoff_by_label ?? undefined} />
            ) : null}
            <StatusBadge status={run.status} />
          </div>
        </div>
        <p className="text-muted-foreground text-xs">
          {t.release.proposedBy(run.requested_by, run.requested_at)}
        </p>
        {run.notes ? (
          <p className="text-sm">
            <span className="text-muted-foreground">
              {t.release.notesLabel}:{' '}
            </span>
            {run.notes}
          </p>
        ) : null}
        <RunRepoList repos={run.repos} />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        {canApprove ? (
          <>
            <Button size="sm" onClick={() => openDialog('approve')}>
              <CheckIcon className="size-4" />
              {t.release.approveButton}
            </Button>
            <Button
              size="sm"
              variant="destructive"
              onClick={() => openDialog('reject')}
            >
              <XIcon className="size-4" />
              {t.release.rejectButton}
            </Button>
          </>
        ) : null}
        {/* The proposer can always withdraw their own proposal. The backend
            enforces ownership; if the viewer is not the proposer the cancel
            call 403s and we surface it as a toast. */}
        <Button
          size="sm"
          variant="outline"
          onClick={() => openDialog('cancel')}
        >
          {t.release.cancelButton}
        </Button>
      </div>

      <Dialog open={action !== null} onOpenChange={(o) => !o && closeDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {action === 'approve'
                ? t.release.approveConfirmTitle
                : action === 'reject'
                  ? t.release.rejectConfirmTitle
                  : t.release.cancelConfirmTitle}
            </DialogTitle>
            {action === 'approve' ? (
              <DialogDescription>
                {t.release.approveConfirmDescription}
              </DialogDescription>
            ) : action === 'cancel' ? (
              <DialogDescription>
                {t.release.cancelConfirmDescription}
              </DialogDescription>
            ) : null}
          </DialogHeader>

          {action === 'approve' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`approve-notes-${run.id}`}>
                {t.release.approveNotesLabel}
              </Label>
              <Textarea
                id={`approve-notes-${run.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.release.approveNotesPlaceholder}
                disabled={mutation.isPending}
              />
            </div>
          ) : action === 'reject' ? (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`reject-notes-${run.id}`}>
                {t.release.rejectNotesLabel}
              </Label>
              <Textarea
                id={`reject-notes-${run.id}`}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder={t.release.rejectNotesPlaceholder}
                disabled={mutation.isPending}
                aria-invalid={rejectNotesEmpty}
              />
              {rejectNotesEmpty ? (
                <p className="text-destructive text-xs">
                  {t.release.rejectNotesRequired}
                </p>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button
              variant="outline"
              onClick={closeDialog}
              disabled={mutation.isPending}
            >
              {t.release.keep}
            </Button>
            <Button
              variant={action === 'reject' ? 'destructive' : 'default'}
              onClick={() => mutation.mutate()}
              disabled={
                mutation.isPending ||
                (action === 'reject' && rejectNotesEmpty)
              }
            >
              {action === 'approve'
                ? t.release.approveConfirmAction
                : action === 'reject'
                  ? t.release.rejectConfirmAction
                  : t.release.cancelConfirmAction}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// --- history ---------------------------------------------------------------

function HistorySection({
  runs,
  isPending,
  isError,
}: {
  runs: PromotionRun[]
  isPending: boolean
  isError: boolean
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{t.release.historyTitle}</CardTitle>
        <p className="text-muted-foreground text-sm">
          {t.release.historySubtitle}
        </p>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        {isError ? (
          <p className="text-muted-foreground text-sm">{t.release.errorTitle}</p>
        ) : isPending ? (
          <p className="text-muted-foreground text-sm">{t.release.loading}</p>
        ) : runs.length === 0 ? (
          <p className="text-muted-foreground text-sm">
            {t.release.historyEmpty}
          </p>
        ) : (
          runs.map((run) => <HistoryRow key={run.id} run={run} />)
        )}
      </CardContent>
    </Card>
  )
}

function HistoryRow({ run }: { run: PromotionRun }) {
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium">
          {kindLabel(run.kind)}
        </span>
        <StatusBadge status={run.status} />
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {t.release.proposedBy(run.requested_by, run.requested_at)}
      </p>
      {run.decided_by && run.decided_at ? (
        <p className="text-muted-foreground text-xs">
          {t.release.decidedBy(run.decided_by, run.decided_at)}
        </p>
      ) : null}
      {run.notes ? (
        <p className="mt-1 text-sm">
          <span className="text-muted-foreground">{t.release.notesLabel}: </span>
          {run.notes}
        </p>
      ) : null}
      {run.decision_notes ? (
        <p className="text-sm">
          <span className="text-muted-foreground">
            {t.release.decisionNotesLabel}:{' '}
          </span>
          {run.decision_notes}
        </p>
      ) : null}
      <div className="mt-2">
        <RunRepoList repos={run.repos} />
      </div>
    </div>
  )
}

// --- shared pieces ---------------------------------------------------------

/**
 * landr-a99u.12 — badge shown on pending staging_to_main proposals when the
 * go-live was requested by a customer (operator signer) rather than a staff
 * member. Helps the approver understand the context at a glance.
 */
function SignoffBadge({ label }: { label?: string }) {
  return (
    <span className="inline-flex items-center rounded-full bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800 dark:bg-violet-950 dark:text-violet-300">
      {label
        ? t.release.signoffByCustomer(label)
        : t.release.signoffByStaff}
    </span>
  )
}

/** Per-repo confirm checklist used in the promote/propose dialogs. */
function RepoChecklist({
  items,
}: {
  items: { repo: string; ahead: number; head_sha: string }[]
}) {
  return (
    <ul className="flex flex-col gap-1 rounded-md border p-3">
      {items.map((it) => (
        <li
          key={it.repo}
          className="flex items-center justify-between gap-3 text-sm"
        >
          <span className="font-mono">{it.repo}</span>
          <span className="text-muted-foreground flex items-center gap-2 tabular-nums">
            <span>{t.release.commitsAhead(it.ahead)}</span>
            <span className="font-mono">@ {shortSha(it.head_sha)}</span>
          </span>
        </li>
      ))}
    </ul>
  )
}

/** Per-repo merge result list shown on proposal + history cards.
 *  Tolerates undefined (the list-runs API doesn't hydrate per-run repos —
 *  they come from the singular fetchRun({id}); passing `run.repos` directly
 *  from a list item used to crash with "Cannot read properties of undefined
 *  (reading 'length')"). */
function RunRepoList({ repos }: { repos: PromotionRunRepo[] | undefined }) {
  if (!repos || repos.length === 0) return null
  return (
    <ul className="flex flex-col gap-1">
      {repos.map((r) => (
        <li
          key={r.repo}
          className="flex flex-wrap items-center justify-between gap-2 text-sm"
        >
          <span className="flex items-center gap-2">
            <span className="font-mono">{r.repo}</span>
            <span className="text-muted-foreground font-mono text-xs">
              {shortSha(r.head_sha)}
              {r.merge_sha ? ` → ${shortSha(r.merge_sha)}` : ''}
            </span>
          </span>
          <span className="flex items-center gap-2">
            {r.error ? (
              <span className="text-destructive text-xs">{r.error}</span>
            ) : null}
            <MergeBadge status={r.merge_status} />
          </span>
        </li>
      ))}
    </ul>
  )
}

const STATUS_BADGE: Record<
  PromotionStatus,
  { label: string; className: string }
> = {
  proposed: {
    label: t.release.statusProposed,
    className: 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300',
  },
  approved: {
    label: t.release.statusApproved,
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  queued: {
    label: t.release.statusQueued,
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  executing: {
    label: t.release.statusExecuting,
    className: 'bg-sky-100 text-sky-800 dark:bg-sky-950 dark:text-sky-300',
  },
  completed: {
    label: t.release.statusCompleted,
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  failed: {
    label: t.release.statusFailed,
    className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
  rejected: {
    label: t.release.statusRejected,
    className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
  cancelled: {
    label: t.release.statusCancelled,
    className: 'bg-muted text-muted-foreground',
  },
}

function StatusBadge({ status }: { status: PromotionStatus }) {
  const cfg = STATUS_BADGE[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium',
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  )
}

const MERGE_BADGE: Record<MergeStatus, { label: string; className: string }> = {
  pending: { label: t.release.mergePending, className: 'bg-muted text-muted-foreground' },
  merged: {
    label: t.release.mergeMerged,
    className:
      'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300',
  },
  noop: { label: t.release.mergeNoop, className: 'bg-muted text-muted-foreground' },
  conflict: {
    label: t.release.mergeConflict,
    className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
  error: {
    label: t.release.mergeError,
    className: 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300',
  },
}

function MergeBadge({ status }: { status: MergeStatus }) {
  const cfg = MERGE_BADGE[status]
  return (
    <span
      className={cn(
        'inline-flex items-center rounded px-1.5 py-0.5 text-xs font-medium',
        cfg.className,
      )}
    >
      {cfg.label}
    </span>
  )
}

// Default export so the route can be lazy-loaded via
// React.lazy(() => import('@/routes/Release')) in App.tsx (staff-rare surface,
// keeps it off the initial bundle). Named export stays for direct test imports.
export default Release
