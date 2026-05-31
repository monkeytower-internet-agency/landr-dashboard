// landr-a99u.6 — release promotion console data layer (STAFF-ONLY).
// landr-a99u.12 — operator-facing go-live eligibility + request endpoints.
//
// Reads/writes the FastAPI staff promotion endpoints
//   GET  /api/landr-staff/promotions/status
//   GET  /api/landr-staff/promotions
//   GET  /api/landr-staff/promotions/{id}
//   POST /api/landr-staff/promotions/dev-to-staging
//   POST /api/landr-staff/promotions/staging-to-main/propose
//   POST /api/landr-staff/promotions/{id}/approve
//   POST /api/landr-staff/promotions/{id}/reject
//   POST /api/landr-staff/promotions/{id}/cancel
// (landr-api app/routers/landr_staff_promotions.py — built in a sibling PR).
//
// Operator-facing endpoints (landr-a99u.12):
//   GET  /api/operator/release/eligibility
//   POST /api/operator/release/request-golive
//
// A promotion "run" merges one branch into the next (dev → staging, then
// staging → main) across the deployable repos and pushes — the push triggers
// each repo's deploy pipeline. The whole surface is is_landr_staff-gated
// server-side (403 otherwise); Release.tsx is additionally route-guarded and
// gates each action on the server-computed `viewer` capability block (NOT raw
// roles) returned by …/status. See docs/adr/0004-release-promotion-console.md.
import { api } from '@/lib/api-client'

// --- types -----------------------------------------------------------------

/** Which hop a promotion run advances. */
export type PromotionKind = 'dev_to_staging' | 'staging_to_main'

/**
 * Lifecycle of a run. `dev_to_staging` skips `proposed`/`approved` and is
 * created `queued`; `staging_to_main` starts `proposed` and needs an
 * approver to move it to `queued`.
 */
export type PromotionStatus =
  | 'proposed'
  | 'approved'
  | 'queued'
  | 'executing'
  | 'completed'
  | 'failed'
  | 'rejected'
  | 'cancelled'

/** Per-repo merge outcome inside an executed run. */
export type MergeStatus = 'pending' | 'merged' | 'noop' | 'conflict' | 'error'

/** landr-a99u.14: state of the migration stage on this run. */
export type MigrationStatus = 'pending' | 'applied' | 'failed' | 'skipped'

/** One repo's slice of a promotion run, with its pinned head SHA + result. */
export type PromotionRunRepo = {
  repo: string
  base_branch: string
  head_branch: string
  /** Head SHA pinned at request/propose time — what actually ships. */
  head_sha: string
  /** Merge commit SHA once executed (absent until then). */
  merge_sha?: string | null
  merge_status: MergeStatus
  /** Commits the head was ahead of the base when pinned. */
  ahead_by?: number | null
  /** Failure reason for a `conflict`/`error` repo. */
  error?: string | null
}

/** A full promotion run with its per-repo slices. */
export type PromotionRun = {
  id: string
  kind: PromotionKind
  status: PromotionStatus
  requested_by: string
  requested_at: string
  decided_by?: string | null
  decided_at?: string | null
  /** Free-text request/proposal notes. */
  notes?: string | null
  /** Free-text approve/reject notes. */
  decision_notes?: string | null
  repos: PromotionRunRepo[]
  /**
   * landr-a99u.12 — who signed off: 'staff' (a staff member proposed via the
   * /release console) or 'customer' (an operator signer clicked "Request
   * go-live" from their dashboard). Absent on old/dev_to_staging runs.
   */
  signoff_source?: 'staff' | 'customer' | null
  /**
   * Human-readable label for the signoff origin (e.g. the operator name or
   * "Para42"). Only meaningful when signoff_source === 'customer'.
   */
  signoff_by_label?: string | null
  /**
   * landr-a99u.14 — migration stage state. 'pending' on a run currently in
   * flight; 'applied' on success (or no-op); 'failed' means code-merges were
   * SKIPPED — there is nothing for RunRepoList to render. 'skipped' applies
   * to legacy runs predating the migration stage or to runs that proceeded
   * without a configured target DB URL but had nothing pending anyway.
   */
  migration_status?: MigrationStatus | null
  /** landr-a99u.14 — combined stdout+stderr of the migration stage. */
  migration_log?: string | null
  /** landr-a99u.14 — filenames applied this run, in order. */
  migrations_applied?: string[] | null
}

// --- operator-facing types (landr-a99u.12) ----------------------------------

/**
 * Response of GET /api/operator/release/eligibility.
 * True only on staging, only for signer users.
 */
export type GoLiveEligibility = {
  can_request_golive: boolean
}

/** Response of POST /api/operator/release/request-golive. */
export type GoLiveRequestResult = {
  status: 'requested' | 'already_pending'
}

/** One repo row in the environment matrix. */
export type RepoStatus = {
  repo: string
  dev_sha: string
  staging_sha: string
  main_sha: string
  /** Commits dev is ahead of staging. */
  dev_to_staging_ahead_by: number
  /** Commits staging is ahead of main. */
  staging_to_main_ahead_by: number

  // --- OPTIONAL decoration (landr — release matrix commit metadata) ---------
  // All fields below are added by a sibling landr-api PR. They are OPTIONAL so
  // an older/not-yet-deployed backend (which omits them) degrades gracefully:
  // the matrix still renders the ahead counts, just without the commit detail
  // or links.

  /** Head commit of `dev` (source branch of the dev→staging hop). */
  dev_head_message?: string | null
  dev_head_author?: string | null
  /** ISO-8601 author date of dev's head commit. */
  dev_head_date?: string | null
  /** github.com html_url of dev's head commit. */
  dev_head_url?: string | null

  /** Head commit of `staging` (source branch of the staging→main hop). */
  staging_head_message?: string | null
  staging_head_author?: string | null
  /** ISO-8601 author date of staging's head commit. */
  staging_head_date?: string | null
  /** github.com html_url of staging's head commit. */
  staging_head_url?: string | null

  /** GitHub compare view for the dev→staging ahead range (staging...dev). */
  dev_to_staging_compare_url?: string | null
  /** GitHub compare view for the staging→main ahead range (main...staging). */
  staging_to_main_compare_url?: string | null
  /** GitHub full commit-history view for the `dev` branch. */
  dev_history_url?: string | null
  /** GitHub full commit-history view for the `staging` branch. */
  staging_history_url?: string | null
}

/**
 * Server-computed capability block. The dashboard gates buttons on THESE,
 * not on raw roles, so the rules stay in one place (the backend).
 *
 * landr-7dya.21 — the API enforcement worker may extend `viewer` with an
 * optional `tier` field reporting the deploy tier the API itself is serving.
 * When present, the dashboard prefers it over the static-build VITE_DEPLOY_TIER
 * (via `resolveTier()` in @/lib/tier). Absent on older API revisions; the
 * dashboard falls back to the build env then to null in that case.
 */
export type PromotionViewer = {
  can_promote_staging: boolean
  can_propose_prod: boolean
  can_approve_prod: boolean
  /** Optional server-reported deploy tier (landr-7dya.21). */
  tier?: 'dev' | 'staging' | 'prod' | null
}

/** Response of GET …/status — env matrix + the viewer's capabilities. */
export type PromotionStatusResponse = {
  repos: RepoStatus[]
  viewer: PromotionViewer
}

/** Request bodies. */
export type PromoteToStagingBody = {
  /** Optional repo allow-list; omitted ⇒ all repos with changes. */
  repos?: string[]
  notes?: string
}
export type ProposeToProdBody = {
  repos?: string[]
  /** Proposal notes are required for the staging → main hop. */
  notes: string
}
export type DecisionBody = {
  notes?: string
}
export type RejectBody = {
  /** Rejection requires a reason. */
  notes: string
}

// --- reads -----------------------------------------------------------------

/** Fetch the environment matrix + the viewer's promotion capabilities. */
export async function fetchStatus(): Promise<PromotionStatusResponse> {
  return api<PromotionStatusResponse>('GET', '/api/landr-staff/promotions/status')
}

/** Fetch the recent promotion runs (history, newest first).
 *
 * The backend wraps the list in `{"runs": [...]}` (landr_staff_promotions.list_runs
 * returns a dict, not a bare array). Unwrap here so callers receive the array
 * the type promises — otherwise `runs.filter(...)` in Release.tsx throws
 * "runs.filter is not a function" and /release blank-pages (was silently black
 * before landr-7dya.18's RouteErrorBoundary made it visible). Tolerates either
 * shape (bare array OR `{runs}`) + null/missing for future-proofing.
 */
export async function fetchRuns(): Promise<PromotionRun[]> {
  const res = await api<{ runs: PromotionRun[] } | PromotionRun[] | null>(
    'GET',
    '/api/landr-staff/promotions',
  )
  if (Array.isArray(res)) return res
  if (res && Array.isArray(res.runs)) return res.runs
  return []
}

/** Fetch a single run with its per-repo slices. */
export async function fetchRun(id: string): Promise<PromotionRun> {
  return api<PromotionRun>(
    'GET',
    `/api/landr-staff/promotions/${encodeURIComponent(id)}`,
  )
}

/**
 * Response of GET …/promotions/preview-migrations?kind=…
 * (landr-a99u.14.3 — shipped on landr-api dev).
 */
export type PreviewMigrationsResponse = {
  pending_count: number
  files: string[]
}

/**
 * landr-a99u.14.6 — preview of pending migrations for a promotion kind.
 * Reads the staff-only endpoint that the executor (landr-a99u.14.4) will
 * apply BEFORE the code-merge stage. Used by the propose/promote dialogs
 * to render "this run will apply N migrations" without committing to a
 * run. 503 / 502 from the server surface as Error("migration_target_…") —
 * callers should treat those as informational (do NOT block the submit),
 * per the always-on contract on landr-a99u.14.
 */
export async function fetchPreviewMigrations(
  kind: PromotionKind,
): Promise<PreviewMigrationsResponse> {
  return api<PreviewMigrationsResponse>(
    'GET',
    `/api/landr-staff/promotions/preview-migrations?kind=${encodeURIComponent(kind)}`,
  )
}

// --- writes ----------------------------------------------------------------

/** Promote dev → staging (creates a `queued` run; no approval gate). */
export async function promoteToStaging(
  body: PromoteToStagingBody = {},
): Promise<PromotionRun> {
  return api<PromotionRun>(
    'POST',
    '/api/landr-staff/promotions/dev-to-staging',
    body,
  )
}

/** Propose staging → main (creates a `proposed` run; notifies approvers). */
export async function proposeToProd(
  body: ProposeToProdBody,
): Promise<PromotionRun> {
  return api<PromotionRun>(
    'POST',
    '/api/landr-staff/promotions/staging-to-main/propose',
    body,
  )
}

/** Approve a proposed prod run (`proposed → queued`). Approver only. */
export async function approveRun(
  id: string,
  body: DecisionBody = {},
): Promise<PromotionRun> {
  return api<PromotionRun>(
    'POST',
    `/api/landr-staff/promotions/${encodeURIComponent(id)}/approve`,
    body,
  )
}

/** Reject a proposed prod run (`proposed → rejected`). Approver only. */
export async function rejectRun(
  id: string,
  body: RejectBody,
): Promise<PromotionRun> {
  return api<PromotionRun>(
    'POST',
    `/api/landr-staff/promotions/${encodeURIComponent(id)}/reject`,
    body,
  )
}

/** Cancel one's own proposed run (`proposed → cancelled`). */
export async function cancelRun(id: string): Promise<PromotionRun> {
  return api<PromotionRun>(
    'POST',
    `/api/landr-staff/promotions/${encodeURIComponent(id)}/cancel`,
  )
}

// --- operator-facing reads/writes (landr-a99u.12) --------------------------

/**
 * Check whether the current operator user is eligible to request go-live.
 * The backend only returns true on staging, for signer users — so the UI can
 * render purely on this flag without separate env detection.
 */
export async function fetchGoLiveEligibility(): Promise<GoLiveEligibility> {
  return api<GoLiveEligibility>('GET', '/api/operator/release/eligibility')
}

/**
 * Request go-live (staging → main) on behalf of the operator.
 * Returns 'requested' on first call, 'already_pending' if a request is
 * already waiting for staff review.
 */
export async function requestGoLive(
  notes?: string,
): Promise<GoLiveRequestResult> {
  return api<GoLiveRequestResult>(
    'POST',
    '/api/operator/release/request-golive',
    notes ? { notes } : {},
  )
}

// --- display helpers -------------------------------------------------------

/** Short 7-char SHA for matrix / repo display. Empty string passes through. */
export function shortSha(sha: string | null | undefined): string {
  if (!sha) return '—'
  return sha.slice(0, 7)
}

/** Human label for a kind. */
export function kindLabel(kind: PromotionKind): string {
  return kind === 'dev_to_staging' ? 'dev → staging' : 'staging → main'
}

/**
 * Compact relative time ("3h ago", "2d ago", "just now") for the env-matrix
 * commit dates. Uses Intl.RelativeTimeFormat so it's locale-aware and needs no
 * date library. Returns '' for null/invalid input so callers can skip it.
 */
export function relativeTime(iso: string | null | undefined): string {
  if (!iso) return ''
  const then = new Date(iso).getTime()
  if (Number.isNaN(then)) return ''
  const diffMs = then - Date.now()
  const rtf = new Intl.RelativeTimeFormat(undefined, { numeric: 'auto' })
  const units: [Intl.RelativeTimeFormatUnit, number][] = [
    ['year', 365 * 24 * 3600_000],
    ['month', 30 * 24 * 3600_000],
    ['day', 24 * 3600_000],
    ['hour', 3600_000],
    ['minute', 60_000],
  ]
  for (const [unit, ms] of units) {
    if (Math.abs(diffMs) >= ms) {
      return rtf.format(Math.round(diffMs / ms), unit)
    }
  }
  return rtf.format(0, 'second') // "now"
}
