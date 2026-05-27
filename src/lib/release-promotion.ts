// landr-a99u.6 — release promotion console data layer (STAFF-ONLY).
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
}

/** One repo row in the environment matrix. */
export type RepoStatus = {
  repo: string
  dev_sha: string
  staging_sha: string
  main_sha: string
  /** Commits dev is ahead of staging. */
  dev_to_staging_ahead: number
  /** Commits staging is ahead of main. */
  staging_to_main_ahead: number
}

/**
 * Server-computed capability block. The dashboard gates buttons on THESE,
 * not on raw roles, so the rules stay in one place (the backend).
 */
export type PromotionViewer = {
  can_promote_staging: boolean
  can_propose_prod: boolean
  can_approve_prod: boolean
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

/** Fetch the recent promotion runs (history, newest first). */
export async function fetchRuns(): Promise<PromotionRun[]> {
  return api<PromotionRun[]>('GET', '/api/landr-staff/promotions')
}

/** Fetch a single run with its per-repo slices. */
export async function fetchRun(id: string): Promise<PromotionRun> {
  return api<PromotionRun>(
    'GET',
    `/api/landr-staff/promotions/${encodeURIComponent(id)}`,
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
