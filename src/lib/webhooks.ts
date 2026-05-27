// landr-ah9u — Settings → Webhooks (v1 localStorage).
//
// Per-operator webhook configuration stored under
// `landr.dashboard.webhooks.<operatorId>`. v1 is UI-only: the operator
// configures URL + event subscriptions + a generated shared secret, and
// the dashboard persists the list to localStorage. v2 will graduate the
// store to the server (operator_webhooks table) and a background worker
// that POSTs delivery payloads. The shape here is forward-compatible
// with the eventual server row so the v2 migration is a one-shot import.

export type WebhookEvent =
  | 'booking.created'
  | 'booking.approved'
  | 'booking.cancelled'
  | 'booking.completed'
  | 'payment.received'

export const WEBHOOK_EVENTS: ReadonlyArray<WebhookEvent> = [
  'booking.created',
  'booking.approved',
  'booking.cancelled',
  'booking.completed',
  'payment.received',
] as const

export type Webhook = {
  id: string
  url: string
  events: WebhookEvent[]
  secret: string
  created_at: string
}

export type WebhookInput = {
  url: string
  events: WebhookEvent[]
  secret?: string
}

const STORAGE_PREFIX = 'landr.dashboard.webhooks.'

export function storageKey(operatorId: string): string {
  return `${STORAGE_PREFIX}${operatorId}`
}

// ---- validation -----------------------------------------------------

export function isHttpsUrl(value: string): boolean {
  const trimmed = value.trim()
  if (trimmed.length === 0) return false
  try {
    const parsed = new URL(trimmed)
    return parsed.protocol === 'https:'
  } catch {
    return false
  }
}

function isWebhookEvent(value: unknown): value is WebhookEvent {
  return (
    typeof value === 'string' &&
    (WEBHOOK_EVENTS as ReadonlyArray<string>).includes(value)
  )
}

function isWebhook(value: unknown): value is Webhook {
  if (typeof value !== 'object' || value === null) return false
  const w = value as Record<string, unknown>
  return (
    typeof w.id === 'string' &&
    typeof w.url === 'string' &&
    Array.isArray(w.events) &&
    w.events.every(isWebhookEvent) &&
    typeof w.secret === 'string' &&
    typeof w.created_at === 'string'
  )
}

// ---- id + secret generation ----------------------------------------

// Use crypto.randomUUID when available (all modern browsers + jsdom).
// Fall back to a Math.random-based id so the helpers never throw in
// exotic environments — the value is non-cryptographic but v1 is local-
// only, so collision risk is negligible per-operator.
function makeId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID()
  }
  const rand = Math.random().toString(36).slice(2, 10)
  return `wh-${Date.now().toString(36)}-${rand}`
}

/**
 * Generate a fresh shared secret for a webhook. Format: 48 hex chars
 * (24 random bytes) — long enough for HMAC-SHA256 use without being
 * unwieldy in the copy-button UX. Uses crypto.getRandomValues so the
 * value is cryptographically strong in every supported browser.
 */
export function generateSecret(): string {
  const len = 24
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    const bytes = new Uint8Array(len)
    crypto.getRandomValues(bytes)
    let out = ''
    for (const b of bytes) {
      out += b.toString(16).padStart(2, '0')
    }
    return out
  }
  // Fallback: Math.random hex string. v1 is local-only so this never
  // reaches a server; v2 will replace this branch with a server-side
  // generator.
  let out = ''
  for (let i = 0; i < len; i++) {
    out += Math.floor(Math.random() * 256)
      .toString(16)
      .padStart(2, '0')
  }
  return out
}

// ---- read / write ---------------------------------------------------

/**
 * Read all webhooks for an operator. Returns [] when storage is empty,
 * unavailable, or the stored payload is corrupt — never throws so the
 * Settings UI can mount even after a manual localStorage tamper.
 */
export function readWebhooks(operatorId: string): Webhook[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = window.localStorage.getItem(storageKey(operatorId))
    if (!raw) return []
    const parsed: unknown = JSON.parse(raw)
    if (!Array.isArray(parsed)) return []
    return parsed.filter(isWebhook)
  } catch {
    return []
  }
}

function writeWebhooks(operatorId: string, hooks: Webhook[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(
      storageKey(operatorId),
      JSON.stringify(hooks),
    )
  } catch {
    /* silently ignore — quota / disabled storage. */
  }
}

// ---- mutations ------------------------------------------------------

/**
 * Append a new webhook. Generates id + secret + created_at if not
 * provided. Returns the freshly-stored row so callers can show the new
 * secret in the success toast / copy affordance.
 */
export function addWebhook(
  operatorId: string,
  input: WebhookInput,
): Webhook {
  const hook: Webhook = {
    id: makeId(),
    url: input.url.trim(),
    events: [...input.events],
    secret: input.secret ?? generateSecret(),
    created_at: new Date().toISOString(),
  }
  const next = [...readWebhooks(operatorId), hook]
  writeWebhooks(operatorId, next)
  return hook
}

/**
 * Patch an existing webhook (URL and/or events). The secret stays
 * stable across edits — callers that need a fresh secret should delete
 * and re-add the webhook so downstream consumers notice the change.
 * Returns the updated row, or null when the id is not found.
 */
export function updateWebhook(
  operatorId: string,
  id: string,
  patch: Partial<Pick<Webhook, 'url' | 'events'>>,
): Webhook | null {
  const hooks = readWebhooks(operatorId)
  const idx = hooks.findIndex((h) => h.id === id)
  if (idx === -1) return null
  const current = hooks[idx]
  const updated: Webhook = {
    ...current,
    url: patch.url !== undefined ? patch.url.trim() : current.url,
    events: patch.events !== undefined ? [...patch.events] : current.events,
  }
  const next = [...hooks]
  next[idx] = updated
  writeWebhooks(operatorId, next)
  return updated
}

/**
 * Remove a webhook by id. No-op when the id is not found — the caller
 * has already shown the row, so a missing-id case usually means a
 * concurrent tab deleted it; surfacing an error is worse than silent.
 */
export function deleteWebhook(operatorId: string, id: string): void {
  const hooks = readWebhooks(operatorId)
  const next = hooks.filter((h) => h.id !== id)
  if (next.length === hooks.length) return
  writeWebhooks(operatorId, next)
}
