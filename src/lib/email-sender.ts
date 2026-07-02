// landr-resend-sender — operator "Email sending" data layer.
//
// Talks to the FastAPI per-operator Resend sending-domain router
// (landr-api app/routers/operator_email_sender.py), mounted at
// /api/operator/email-sender. The operator is resolved from the JWT
// (NOT from a URL path param), so none of these calls carry an operator id.
//
//   GET  /api/operator/email-sender                — current config + status + records.
//   GET  /api/operator/email-sender/eligibility   — classify domain path, no side effects.
//   POST /api/operator/email-sender/setup          — create the Resend domain, store
//        + return the required DNS records (manual) or push them via autoDNS.
//   POST /api/operator/email-sender/verify         — re-check Resend verification.
//
// Field names mirror the server's EmailSenderStatus model 1:1 so the wire
// shape and the TS type never drift. The query is scoped by operatorId only
// so the React Query cache invalidates cleanly when the staff "view-as"
// operator changes — the request itself always acts on the JWT's operator.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'

import { api } from '@/lib/api-client'

// --- types -----------------------------------------------------------------

/** Resend verification lifecycle, mirrored onto our own enum server-side. */
export type EmailSenderVerificationStatus =
  | 'unverified'
  | 'pending'
  | 'verified'
  | 'failed'

/**
 * How the required DNS records get published:
 *   - 'autodns'    — Landr manages the zone and pushed the records for the
 *                    operator (one-click); they just wait for verification.
 *   - 'cloudflare' — same idea, Cloudflare-managed zone.
 *   - 'manual'     — the operator must add the records to their own DNS,
 *                    then hit Verify.
 */
export type EmailSenderDnsProvider = 'autodns' | 'manual' | 'cloudflare'

/** One DNS record the operator must publish (verbatim from Resend). */
export type EmailSenderDnsRecord = {
  type: string
  name: string
  value: string
  // Resend records can also carry priority/ttl/status; keep them optional so
  // the table can surface them if present without the type going stale.
  priority?: number | string | null
  ttl?: number | string | null
  status?: string | null
}

/**
 * Response of GET /api/operator/email-sender (and the 200 body of setup /
 * verify). `configured` is false with everything else null/empty until the
 * operator runs setup at least once.
 */
export type EmailSenderConfig = {
  configured: boolean
  sending_domain: string | null
  from_local_part: string | null
  from_name: string | null
  /** `{from_local_part}@{sending_domain}` when configured. */
  from_address: string | null
  verification_status: EmailSenderVerificationStatus | null
  dns_provider: EmailSenderDnsProvider | null
  dns_records: EmailSenderDnsRecord[] | null
  last_error: string | null
}

/**
 * Response of GET /api/operator/email-sender/eligibility (landr-oqrz.6).
 * Tells the operator whether their domain will be set up automatically
 * (path='auto') or requires manual DNS records (path='manual').
 * No side effects — safe to call before the operator commits to setup.
 */
export type EmailSenderEligibility = {
  /** Normalised domain that was classified. */
  domain: string
  /** 'auto' — Landr will set up DNS; 'manual' — operator must publish records. */
  path: 'auto' | 'manual'
  /** Detected DNS provider: 'cloudflare' | 'autodns' | 'manual'. */
  provider: 'cloudflare' | 'autodns' | 'manual'
  /** autoDNS pool probe result; null when not applicable or probe unconfigured. */
  in_pool: boolean | null
}

/**
 * Result of POST /api/operator/email-sender/test (landr-gp0v).
 * Always 200 — use `status` to distinguish success from failure.
 */
export type TestEmailResult = {
  status: 'sent' | 'failed'
  detail: string
  message_id: string | null
  from_address: string | null
}

/** Body of POST /api/operator/email-sender/setup. */
export type SetupEmailSenderBody = {
  /** Root domain to send from, e.g. `para42.com`. */
  sending_domain: string
  /** Local part of the From address; server defaults to `bookings`. */
  from_local_part?: string
  /** Optional From display name. */
  from_name?: string
  /** 'autodns' if Landr manages the zone, else 'manual' (server default). */
  dns_provider?: EmailSenderDnsProvider
}

// --- constants -------------------------------------------------------------

/** Default From local part the server falls back to when none is supplied. */
export const DEFAULT_FROM_LOCAL_PART = 'bookings'

const BASE = '/api/operator/email-sender'

// --- reads / writes --------------------------------------------------------

export async function fetchEmailSenderConfig(): Promise<EmailSenderConfig> {
  return api<EmailSenderConfig>('GET', BASE)
}

/**
 * Classify whether a domain will be set up automatically (path='auto') or
 * requires manual DNS records (path='manual'). No side effects — safe to call
 * at any time before the operator commits to setup.
 */
export async function fetchEmailSenderEligibility(
  domain: string,
): Promise<EmailSenderEligibility> {
  const params = new URLSearchParams({ domain })
  return api<EmailSenderEligibility>('GET', `${BASE}/eligibility?${params}`)
}

export async function setupEmailSender(
  body: SetupEmailSenderBody,
): Promise<EmailSenderConfig> {
  return api<EmailSenderConfig>('POST', `${BASE}/setup`, body)
}

export async function verifyEmailSender(): Promise<EmailSenderConfig> {
  return api<EmailSenderConfig>('POST', `${BASE}/verify`)
}

// --- react-query hooks -----------------------------------------------------

/**
 * Query key scoped by the current operator id. The endpoint reads the
 * operator off the JWT, but keying by id means a staff "view-as" switch
 * (which swaps the effective operator) gets its own cache slot instead of
 * showing the previous operator's config.
 */
export const EMAIL_SENDER_QUERY_KEY = (operatorId: string | null) =>
  ['operator-email-sender', operatorId ?? 'none'] as const

/**
 * Read the operator's current sending-domain config + verification status.
 * Disabled until an operator is selected. While verification is `pending`
 * (Resend is still propagating DNS) the query polls every 15s so the badge
 * flips to verified without a manual refresh.
 */
export function useEmailSenderConfig(operatorId: string | null) {
  return useQuery({
    queryKey: EMAIL_SENDER_QUERY_KEY(operatorId),
    queryFn: fetchEmailSenderConfig,
    enabled: !!operatorId,
    refetchInterval: (query) =>
      query.state.data?.verification_status === 'pending' ? 15_000 : false,
  })
}

/**
 * Create the Resend sending domain and persist its DNS records. On success
 * the returned config (with `dns_records` + `dns_provider`) is written
 * straight into the cache so the UI flips to the "publish these records"
 * step without a round-trip.
 */
export function useSetupEmailSender(operatorId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: SetupEmailSenderBody) => setupEmailSender(body),
    onSuccess: (config) => {
      qc.setQueryData(EMAIL_SENDER_QUERY_KEY(operatorId), config)
    },
    // Always refetch the config after the attempt settles. Setup can take a
    // few seconds (SES identity create + DNS provisioning); on a flaky link the
    // POST may commit server-side while the client never sees the response —
    // without this the UI would sit on the setup form until a manual reload.
    onSettled: () => {
      qc.invalidateQueries({ queryKey: EMAIL_SENDER_QUERY_KEY(operatorId) })
    },
  })
}

/** Re-check Resend verification and refresh the cached config + records. */
export function useVerifyEmailSender(operatorId: string | null) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: () => verifyEmailSender(),
    onSuccess: (config) => {
      qc.setQueryData(EMAIL_SENDER_QUERY_KEY(operatorId), config)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: EMAIL_SENDER_QUERY_KEY(operatorId) })
    },
  })
}

/**
 * Send a test email from the operator's verified sending domain (landr-gp0v).
 * Always resolves to a `TestEmailResult` — never rejects for business failures
 * (the API returns 200 with status='failed' for those).
 */
export async function sendEmailSenderTest(to: string): Promise<TestEmailResult> {
  return api<TestEmailResult>('POST', `${BASE}/test`, { to })
}

/**
 * Mutation hook for sending a test email (landr-gp0v).
 * Mirrors the shape of useSetupEmailSender / useVerifyEmailSender.
 */
export function useSendEmailSenderTest(_operatorId: string | null) {
  return useMutation({
    mutationFn: (to: string) => sendEmailSenderTest(to),
  })
}
