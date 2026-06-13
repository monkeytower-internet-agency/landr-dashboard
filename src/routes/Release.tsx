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
import { useCallback, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import {
  CheckIcon,
  ExternalLinkIcon,
  RefreshCwIcon,
  RocketIcon,
  XIcon,
} from 'lucide-react'

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
  fetchLocalWorktree,
  fetchPreviewMigrations,
  kindLabel,
  promoteToStaging,
  proposeToProd,
  rejectRun,
  fetchRuns,
  fetchStatus,
  relativeTime,
  requestGoLive,
  shortSha,
  type GoLiveEligibility,
  type LocalRepoStatus,
  type LocalWorktreeResponse,
  type MergeStatus,
  type PreviewMigrationsResponse,
  type PromotionKind,
  type PromotionRun,
  type PromotionRunRepo,
  type PromotionStatus,
  type PromotionStatusResponse,
  type RepoStatus,
} from '@/lib/release-promotion'
import {
  otherTiers,
  resolveTier,
  urlForTier,
  type DeployTier,
} from '@/lib/tier'
import { fetchAssignableUsers } from '@/lib/tickets'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

const STATUS_QUERY_KEY = ['release', 'status'] as const
const RUNS_QUERY_KEY = ['release', 'runs'] as const
const ELIGIBILITY_QUERY_KEY = ['release', 'eligibility'] as const
const LOCAL_WORKTREE_QUERY_KEY = ['release', 'local-worktree'] as const
const USERS_QUERY_KEY = ['assignable-users'] as const

// landr-agiw — while any run is mid-flight the console polls (below) so the UI
// settles on its own instead of spinning until the user hits Refresh.
const RUN_POLL_MS = 2500

/** Non-terminal: still progressing toward completed/failed/rejected/cancelled. */
function isRunInFlight(run: PromotionRun): boolean {
  return (
    run.status === 'approved' ||
    run.status === 'queued' ||
    run.status === 'executing' ||
    run.migration_status === 'pending'
  )
}

/** When execution began: the approval moment, or the request for auto-run kinds. */
function runStartIso(run: PromotionRun): string {
  return run.decided_at ?? run.requested_at
}

/** Terminal runs carry a meaningful end time (the last state change). */
function runEndIso(run: PromotionRun): string | null {
  const terminal =
    run.status === 'completed' ||
    run.status === 'failed' ||
    run.status === 'rejected' ||
    run.status === 'cancelled'
  return terminal ? (run.updated_at ?? null) : null
}

/** Human-readable elapsed, e.g. "1m 12s" / "2.4s" / "1h 5m". */
function formatDuration(ms: number): string {
  if (!Number.isFinite(ms) || ms < 0) return '—'
  const totalSec = ms / 1000
  if (totalSec < 10) return `${totalSec.toFixed(1)}s`
  const sec = Math.round(totalSec)
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  const remSec = sec % 60
  if (min < 60) return remSec ? `${min}m ${remSec}s` : `${min}m`
  const hr = Math.floor(min / 60)
  const remMin = min % 60
  return remMin ? `${hr}h ${remMin}m` : `${hr}h`
}

function runElapsedLabel(run: PromotionRun): string | null {
  const end = runEndIso(run)
  if (!end) return null
  const ms = new Date(end).getTime() - new Date(runStartIso(run)).getTime()
  return formatDuration(ms)
}

/**
 * landr-agiw — resolve a user UUID to a human label (email) for the promotion
 * actors, instead of showing the raw id. Backed by the assignable_users view
 * (staff + agents; this console is staff-only so proposers/approvers are in it).
 * Falls back to a short id when unknown. react-query dedupes the shared key, so
 * every card calling this triggers a single fetch.
 */
function useUserLabel(): (id: string | null | undefined) => string {
  const { data } = useQuery({
    queryKey: USERS_QUERY_KEY,
    queryFn: fetchAssignableUsers,
    staleTime: 5 * 60 * 1000,
  })
  return useCallback(
    (id: string | null | undefined) => {
      if (!id) return '—'
      const u = data?.find((x) => x.id === id)
      return u?.email ?? `${id.slice(0, 8)}…`
    },
    [data],
  )
}

/** Per-tier label for the jump-link buttons. Source of truth for the icon row. */
const JUMP_LABEL: Record<DeployTier, string> = {
  dev: t.release.tierAware.jumpToTierDev,
  staging: t.release.tierAware.jumpToTierStaging,
  prod: t.release.tierAware.jumpToTierProd,
}

/**
 * Cross-tier jump links in the /release header. Renders one button per OTHER
 * tier (dev / staging / main) so a staff promoter can hop between the three
 * consoles with one click instead of editing the hostname. Opens each link
 * in a new tab so the current session stays anchored on the tier the user
 * is acting from. Renders nothing when the current tier is unknown.
 *
 * The destination dashboards apply their own /release route guard; jumping
 * to a tier the viewer can't reach simply bounces them home on arrival —
 * we don't try to gate visibility here.
 */
function TierJumpLinks({ currentTier }: { currentTier: DeployTier | null }) {
  const targets = otherTiers(currentTier)
  if (targets.length === 0) return null
  return (
    <div
      className="flex flex-wrap items-center gap-1"
      data-testid="tier-jump-links"
    >
      {targets.map((target) => (
        <Button key={target} asChild variant="outline" size="sm">
          <a
            href={urlForTier(target, '/release')}
            target="_blank"
            rel="noopener noreferrer"
            aria-label={t.release.tierAware.jumpToTierAria(JUMP_LABEL[target])}
            data-testid={`tier-jump-${target}`}
          >
            <ExternalLinkIcon className="size-3.5" aria-hidden />
            <span>{JUMP_LABEL[target]}</span>
          </a>
        </Button>
      ))}
    </div>
  )
}

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

  // landr-agiw — auto-refresh while a run is mid-flight. The runs query polls
  // itself off its own data; the status query (env SHA matrix, which also moves
  // when a run completes) polls off the runs' in-flight state. Both stop the
  // moment everything settles, so an idle console makes no background requests.
  const runsQuery = useQuery<PromotionRun[], Error>({
    queryKey: RUNS_QUERY_KEY,
    queryFn: () => fetchRuns(),
    staleTime: 1000 * 15,
    refetchInterval: (query) =>
      (query.state.data ?? []).some(isRunInFlight) ? RUN_POLL_MS : false,
  })
  const anyRunInFlight = (runsQuery.data ?? []).some(isRunInFlight)
  const statusQuery = useQuery<PromotionStatusResponse, Error>({
    queryKey: STATUS_QUERY_KEY,
    queryFn: () => fetchStatus(),
    staleTime: 1000 * 15,
    refetchInterval: anyRunInFlight ? RUN_POLL_MS : false,
  })

  // landr local-worktree — DEV/Trillian-only. The backend returns
  // {enabled:false} on every Cloud Run (staging/prod) deployment, so this query
  // resolves cleanly everywhere; the matrix simply hides the column off-dev.
  // retry:false so a transient hiccup doesn't spam the error log for a console
  // affordance that's allowed to be absent.
  const localWorktreeQuery = useQuery<LocalWorktreeResponse, Error>({
    queryKey: LOCAL_WORKTREE_QUERY_KEY,
    queryFn: () => fetchLocalWorktree(),
    staleTime: 1000 * 15,
    retry: false,
  })

  const invalidateAll = () => {
    void queryClient.invalidateQueries({ queryKey: STATUS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: RUNS_QUERY_KEY })
    void queryClient.invalidateQueries({ queryKey: LOCAL_WORKTREE_QUERY_KEY })
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
          {tier ? <TierBadge tier={tier} showProd /> : null}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {/* Cross-tier jump links so staff can bounce between dev / staging
              / main consoles with one click. Renders ALL other tiers (up to
              two), so the user always has a one-click hop in either
              direction. */}
          <TierJumpLinks currentTier={tier} />
          <Button
            variant="outline"
            size="sm"
            onClick={invalidateAll}
            disabled={statusQuery.isFetching || runsQuery.isFetching}
          >
            <RefreshCwIcon
              className={cn(
                'size-4',
                (statusQuery.isFetching || runsQuery.isFetching) &&
                  'animate-spin',
              )}
            />
            {t.release.refresh}
          </Button>
        </div>
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
              — show it everywhere (dev/staging/prod). The Local (Trillian)
              column only materialises on dev (enabled:false elsewhere). */}
          <EnvironmentMatrix repos={repos} local={localWorktreeQuery.data} />

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

/** Shared props for an outbound GitHub link — always opens a safe new tab. */
const EXTERNAL_LINK_PROPS = {
  target: '_blank',
  rel: 'noopener noreferrer',
} as const

/**
 * The ahead-count for one hop. When the backend supplied a compare URL it
 * becomes a link to the GitHub compare view for the ahead range; otherwise it
 * is plain text (older backend). "up to date" when nothing is ahead.
 */
function AheadCount({
  ahead,
  compareUrl,
}: {
  ahead: number
  compareUrl?: string | null
}) {
  if (ahead <= 0) {
    return (
      <span className="text-muted-foreground text-sm">{t.release.upToDate}</span>
    )
  }
  const label = t.release.commitsAhead(ahead)
  if (compareUrl) {
    return (
      <a
        href={compareUrl}
        {...EXTERNAL_LINK_PROPS}
        className="text-sm font-medium tabular-nums underline-offset-2 hover:underline"
        title={t.release.compareTitle}
      >
        {label}
      </a>
    )
  }
  return (
    <span className="text-sm font-medium tabular-nums">{label}</span>
  )
}

/**
 * One hop's cell: the ahead-count (linking to the compare view when available)
 * plus the source branch's head commit — first-line message (truncated), short
 * SHA, author and relative date — and a small "history" link. All commit
 * detail and links are OPTIONAL: when the backend omits them the cell falls
 * back to just the ahead-count, matching the pre-decoration behaviour.
 */
function HopCell({
  ahead,
  compareUrl,
  headMessage,
  headSha,
  headAuthor,
  headDate,
  headUrl,
  historyUrl,
}: {
  ahead: number
  compareUrl?: string | null
  headMessage?: string | null
  headSha?: string | null
  headAuthor?: string | null
  headDate?: string | null
  headUrl?: string | null
  historyUrl?: string | null
}) {
  const rel = relativeTime(headDate)
  const hasHead = Boolean(headMessage || headSha)
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <AheadCount ahead={ahead} compareUrl={compareUrl} />
        {historyUrl ? (
          <a
            href={historyUrl}
            {...EXTERNAL_LINK_PROPS}
            className="text-muted-foreground hover:text-foreground text-xs underline-offset-2 hover:underline"
          >
            {t.release.historyLink}
          </a>
        ) : null}
      </div>
      {hasHead ? (
        <div className="text-muted-foreground flex flex-col gap-0.5 text-xs">
          {headMessage ? (
            headUrl ? (
              <a
                href={headUrl}
                {...EXTERNAL_LINK_PROPS}
                className="hover:text-foreground line-clamp-1 max-w-[20rem] underline-offset-2 hover:underline"
                title={headMessage}
              >
                {headMessage}
              </a>
            ) : (
              <span
                className="line-clamp-1 max-w-[20rem]"
                title={headMessage ?? undefined}
              >
                {headMessage}
              </span>
            )
          ) : null}
          <span className="flex flex-wrap items-center gap-x-1.5 gap-y-0.5">
            {headSha ? (
              <span className="font-mono">{shortSha(headSha)}</span>
            ) : null}
            {headAuthor ? <span>· {headAuthor}</span> : null}
            {rel ? <span>· {rel}</span> : null}
          </span>
        </div>
      ) : null}
    </div>
  )
}

/**
 * landr local-worktree — DEV/Trillian-only cell: surfaces uncommitted/unpushed
 * work in the box's working tree that the GitHub-tip matrix can't see. Highlights
 * (amber) when dirty or unpushed; muted "clean" when the tree is in sync;
 * degrades to "unavailable (reason)" if that repo couldn't be read. Returns
 * "—" when no row exists for the repo (shouldn't happen — same registry).
 */
function LocalCell({ row }: { row: LocalRepoStatus | undefined }) {
  if (!row) return <span className="text-muted-foreground text-sm">—</span>
  if (row.error) {
    return (
      <span className="text-muted-foreground text-xs">
        {t.release.localError(row.error)}
      </span>
    )
  }

  const parts: string[] = []
  if (row.uncommitted_count > 0) {
    parts.push(t.release.localUncommitted(row.uncommitted_count))
  }
  if (row.ahead > 0) parts.push(t.release.localUnpushed(row.ahead))
  if (row.behind > 0) parts.push(t.release.localBehind(row.behind))

  const attention = row.dirty || row.ahead > 0
  if (parts.length === 0) {
    return (
      <span className="text-muted-foreground text-sm">{t.release.localClean}</span>
    )
  }
  return (
    <div className="flex flex-col gap-0.5">
      <span
        className={cn(
          'text-sm font-medium tabular-nums',
          attention ? 'text-amber-700 dark:text-amber-400' : undefined,
        )}
      >
        {parts.join(' · ')}
      </span>
      {row.branch ? (
        <span className="text-muted-foreground font-mono text-xs">
          {row.branch}
        </span>
      ) : null}
    </div>
  )
}

function EnvironmentMatrix({
  repos,
  local,
}: {
  repos: RepoStatus[]
  local: LocalWorktreeResponse | undefined
}) {
  // Only render the Local (Trillian) column when the backend reports the
  // dev-only reader is enabled (i.e. this is the dev/Trillian console). On
  // staging/prod `enabled` is false and the column is hidden entirely.
  const showLocal = local?.enabled === true
  const localByRepo = useMemo(() => {
    const m = new Map<string, LocalRepoStatus>()
    for (const r of local?.repos ?? []) m.set(r.repo, r)
    return m
  }, [local])

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
          // landr-3qkr.6 — overflow-x-auto so the promotion matrix (repo +
          // dev→staging + staging→main + local cols) scrolls horizontally on a
          // 360px phone instead of being clipped by the page overflow-x-guard.
          <div className="overflow-x-auto rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.release.columnRepo}</TableHead>
                  <TableHead>{t.release.columnDevToStaging}</TableHead>
                  <TableHead>{t.release.columnStagingToMain}</TableHead>
                  {showLocal ? (
                    <TableHead title={t.release.localStaleTitle}>
                      {t.release.columnLocal}
                    </TableHead>
                  ) : null}
                </TableRow>
              </TableHeader>
              <TableBody>
                {repos.map((r) => (
                  <TableRow
                    key={r.repo}
                    data-testid="release-matrix-row"
                    className="align-top"
                  >
                    <TableCell className="font-medium">
                      <span className="font-mono text-sm">{r.repo}</span>
                    </TableCell>
                    <TableCell>
                      <HopCell
                        ahead={r.dev_to_staging_ahead_by}
                        compareUrl={r.dev_to_staging_compare_url}
                        headMessage={r.dev_head_message}
                        headSha={r.dev_sha}
                        headAuthor={r.dev_head_author}
                        headDate={r.dev_head_date}
                        headUrl={r.dev_head_url}
                        historyUrl={r.dev_history_url}
                      />
                    </TableCell>
                    <TableCell>
                      <HopCell
                        ahead={r.staging_to_main_ahead_by}
                        compareUrl={r.staging_to_main_compare_url}
                        headMessage={r.staging_head_message}
                        headSha={r.staging_sha}
                        headAuthor={r.staging_head_author}
                        headDate={r.staging_head_date}
                        headUrl={r.staging_head_url}
                        historyUrl={r.staging_history_url}
                      />
                    </TableCell>
                    {showLocal ? (
                      <TableCell data-testid="release-local-cell">
                        <LocalCell row={localByRepo.get(r.repo)} />
                      </TableCell>
                    ) : null}
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
          <MigrationsPreview kind="dev_to_staging" />
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
          <MigrationsPreview kind="staging_to_main" />
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
  const userLabel = useUserLabel()

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
          {t.release.proposedBy(userLabel(run.requested_by), run.requested_at)}
        </p>
        {run.notes ? (
          <p className="text-sm">
            <span className="text-muted-foreground">
              {t.release.notesLabel}:{' '}
            </span>
            {run.notes}
          </p>
        ) : null}
        <RunMigrationsSection run={run} />
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
  const userLabel = useUserLabel()
  const end = runEndIso(run)
  return (
    <div className="rounded-md border p-4">
      <div className="flex items-center justify-between gap-2">
        <span className="font-mono text-sm font-medium">
          {kindLabel(run.kind)}
        </span>
        <StatusBadge status={run.status} />
      </div>
      <p className="text-muted-foreground mt-1 text-xs">
        {t.release.proposedBy(userLabel(run.requested_by), run.requested_at)}
      </p>
      {run.decided_by && run.decided_at ? (
        <p className="text-muted-foreground text-xs">
          {t.release.decidedBy(userLabel(run.decided_by), run.decided_at)}
        </p>
      ) : null}
      {/* landr-agiw — execution window: start → end (elapsed). End/elapsed only
          once the run reaches a terminal status; otherwise it reads "running…". */}
      <p className="text-muted-foreground text-xs" data-testid="run-timing">
        {t.release.runTiming(runStartIso(run), end, runElapsedLabel(run))}
      </p>
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
        <RunMigrationsSection run={run} />
      </div>
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

/**
 * landr-a99u.14.6 — preview of pending Supabase migrations for the dialog
 * the user just opened. Always-on per the parent contract (landr-a99u.14):
 * informational only, NEVER blocks the submit button. The executor
 * (landr-a99u.14.4) is the actual gate.
 *
 * Mounted INSIDE the <Dialog open> tree so the query only fires when the
 * user actually opens the dialog (react-query enabled-by-mount), keeping
 * the staff endpoint quiet otherwise.
 *
 * Error contract from the API (landr-a99u.14.3):
 *   - 503 detail='migration_target_not_configured' → env not provisioned
 *     yet → amber warning, doesn't block.
 *   - 502 'migration_target_unreachable: …'        → connection failure →
 *     destructive xs error, doesn't block.
 *
 * api() surfaces the FastAPI `detail` string as err.message.
 */
function MigrationsPreview({ kind }: { kind: PromotionKind }) {
  const query = useQuery<PreviewMigrationsResponse, Error>({
    queryKey: ['release', 'preview-migrations', kind],
    queryFn: () => fetchPreviewMigrations(kind),
    staleTime: 1000 * 30,
    // 503/502 should surface immediately, not retry — they're informational.
    retry: false,
  })

  if (query.isPending) {
    return (
      <p className="text-muted-foreground text-sm">
        Checking pending migrations…
      </p>
    )
  }
  if (query.isError) {
    const msg = query.error.message
    if (msg === 'migration_target_not_configured') {
      return (
        <div
          className="rounded-md border border-amber-500/40 bg-amber-50/40 p-2 text-xs text-amber-700 dark:bg-amber-950/30 dark:text-amber-300"
          data-testid="migrations-preview-not-configured"
        >
          Migrations check is not configured for this tier. The promotion will
          still attempt to apply migrations if any are pending.
        </div>
      )
    }
    return (
      <p
        className="text-destructive text-xs"
        data-testid="migrations-preview-error"
      >
        Could not load pending migrations: {msg}
      </p>
    )
  }
  const { pending_count, files } = query.data
  if (pending_count === 0) {
    return (
      <p
        className="text-muted-foreground text-sm"
        data-testid="migrations-preview-empty"
      >
        No pending migrations.
      </p>
    )
  }
  return (
    <details
      className="bg-muted/30 rounded-md border p-2 text-sm"
      data-testid="migrations-preview"
    >
      <summary className="cursor-pointer font-medium">
        This run will apply {pending_count} migration
        {pending_count === 1 ? '' : 's'}:
      </summary>
      <ul className="mt-2 list-none space-y-0.5 font-mono text-xs">
        {files.map((f) => (
          <li key={f}>{f}</li>
        ))}
      </ul>
    </details>
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

/**
 * landr-a99u.14.7 — Migration stage block shown on a run's detail surface,
 * ABOVE the per-repo merge list. Renders one of four states:
 *
 *   pending  → spinner + "Applying migrations…"
 *   applied  → green check + "Applied N migration(s)" + collapsed file list
 *              + a "View log" toggle showing migration_log
 *   failed   → red x + "Migrations failed" + applied-before-failure list +
 *              full log visible by default (no toggle — operators need it
 *              immediately while triaging)
 *   skipped  → muted "—" (legacy runs predating 14.1, or no-op runs that
 *              proceeded without a configured target DB URL but had nothing
 *              pending anyway)
 *
 * No action buttons (no inline retry — operator creates a fresh run, same
 * pattern as today's code-merge-failure path).
 */
/**
 * landr-agiw — one row of the migration waterfall (boot-log style): a status
 * glyph + the migration filename. `state` picks the glyph: done ✓, running ⟳,
 * failed ✗.
 */
function MigrationStepRow({
  file,
  state,
}: {
  file: string
  state: 'done' | 'running' | 'failed'
}) {
  return (
    <li className="flex items-center gap-2 font-mono text-xs">
      {state === 'done' ? (
        <CheckIcon className="size-3.5 shrink-0 text-emerald-600" aria-hidden />
      ) : state === 'failed' ? (
        <XIcon className="text-destructive size-3.5 shrink-0" aria-hidden />
      ) : (
        <span
          className="inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
          aria-hidden
        />
      )}
      <span className={state === 'failed' ? 'text-destructive' : undefined}>
        {file}
      </span>
    </li>
  )
}

function RunMigrationsSection({ run }: { run: PromotionRun }) {
  const status = run.migration_status ?? 'skipped'
  const applied = run.migrations_applied ?? []
  const log = run.migration_log ?? ''

  if (status === 'skipped') {
    // Legacy runs / silent no-op. Render a faint dash so the column lines up
    // with the per-repo list but doesn't shout for attention.
    return (
      <div
        className="text-muted-foreground text-xs"
        data-testid="run-migrations-skipped"
      >
        —
      </div>
    )
  }

  if (status === 'pending') {
    // migration_status defaults to 'pending' the instant a run row is created,
    // but the executor only runs the migration stage once a run is QUEUED
    // (proposed→queued happens on approval for staging→main). So a run that
    // isn't actually executing has applied NOTHING yet — show a static line, not
    // a spinner, so the UI never implies work is happening pre-approval.
    if (run.status !== 'executing') {
      return (
        <div
          className="text-muted-foreground text-xs"
          data-testid="run-migrations-awaiting"
        >
          {t.release.migrationsAwaiting}
        </div>
      )
    }
    // Executing → genuine in-flight boot-log waterfall: any migrations reported
    // applied so far show with a ✓ (live-fills once the executor streams
    // progress — landr-agiw.7 follow-up), then a spinner for the stage in flight.
    return (
      <div
        className="bg-muted/30 rounded-md border p-2 text-sm"
        data-testid="run-migrations-pending"
      >
        <ul className="list-none space-y-0.5">
          {applied.map((f) => (
            <MigrationStepRow key={f} file={f} state="done" />
          ))}
          <li className="text-muted-foreground flex items-center gap-2 text-sm">
            <span
              className="inline-block size-3 shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent"
              aria-hidden
            />
            {t.release.migrationsApplyingTitle}
          </li>
        </ul>
      </div>
    )
  }

  if (status === 'applied') {
    return (
      <div
        className="bg-muted/30 rounded-md border p-2 text-sm"
        data-testid="run-migrations-applied"
      >
        <div className="font-medium">
          <CheckIcon
            className="mr-1 inline size-4 text-emerald-600"
            aria-hidden
          />
          {t.release.migrationsAppliedTitle(applied.length)}
        </div>
        {applied.length > 0 ? (
          <ul className="mt-2 list-none space-y-0.5">
            {applied.map((f) => (
              <MigrationStepRow key={f} file={f} state="done" />
            ))}
          </ul>
        ) : null}
        {log ? (
          <details className="mt-2 text-xs">
            <summary className="text-muted-foreground cursor-pointer">
              {t.release.migrationsViewLog}
            </summary>
            <pre className="bg-background mt-1 overflow-x-auto rounded p-2 font-mono text-[11px] leading-snug">
              {log}
            </pre>
          </details>
        ) : null}
      </div>
    )
  }

  // status === 'failed' — log visible by default. No collapse: operators need
  // this immediately while triaging.
  return (
    <div
      className="border-destructive/40 bg-destructive/5 rounded-md border p-2 text-sm"
      data-testid="run-migrations-failed"
    >
      <div className="text-destructive flex items-center gap-1 font-medium">
        <XIcon className="size-4" aria-hidden />
        {t.release.migrationsFailedTitle}
      </div>
      {applied.length > 0 ? (
        <p className="text-muted-foreground mt-1 text-xs">
          {t.release.migrationsAppliedBeforeFailure(applied.length)}
        </p>
      ) : null}
      {applied.length > 0 ? (
        <ul className="mt-1 list-none space-y-0.5">
          {applied.map((f) => (
            <MigrationStepRow key={f} file={f} state="done" />
          ))}
        </ul>
      ) : null}
      {log ? (
        <pre className="bg-background mt-2 overflow-x-auto rounded p-2 font-mono text-[11px] leading-snug">
          {log}
        </pre>
      ) : (
        <p className="text-muted-foreground mt-1 text-xs">
          {t.release.migrationsNoLog}
        </p>
      )}
    </div>
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
