/**
 * Centralised authenticated fetch wrapper.
 *
 * Replaces the ad-hoc `fetch(url, { headers: { Authorization: 'Bearer …' } })`
 * boilerplate that was scattered across src/lib/*.ts. Provides:
 *
 *   - Automatic bearer-token attachment from the current Supabase session.
 *   - `Content-Type: application/json` for write methods that carry a body.
 *   - JSON parsing of responses (204 No Content returns undefined).
 *   - Error throwing that preserves the legacy `detail` and `detail.error`
 *     shapes used by FastAPI.
 *   - 401 + "Invalid authentication credentials" interception: triggers the
 *     session-expired handler (registered by AuthProvider) and throws
 *     {@link AuthExpiredError} so callers can short-circuit cleanly.
 *
 * The session-expired handler must be registered by the AuthProvider
 * (because it needs react-router's `navigate` + the toast UI). Until it
 * registers, 401s still throw `AuthExpiredError` — the user just doesn't
 * get auto-redirected. This keeps the module SSR-safe and dependency-free.
 *
 * landr-fr2.
 */

import { supabase } from '@/lib/supabase'
import { notifyError } from '@/lib/notify'

export type HttpMethod = 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE'

/** Thrown when the server reports the JWT is invalid/expired. */
export class AuthExpiredError extends Error {
  constructor(message = 'Session expired') {
    super(message)
    this.name = 'AuthExpiredError'
  }
}

// --- session-expired handler registration ---------------------------------

type SessionExpiredHandler = () => void | Promise<void>

let registeredHandler: SessionExpiredHandler | null = null

/**
 * Register the function that should run when a 401 + invalid_authentication_credentials
 * is observed. The AuthProvider registers a handler that signs out, toasts, and navigates
 * to /login. Returns an unregister function so AuthProvider can clean up on unmount.
 */
export function registerSessionExpiredHandler(handler: SessionExpiredHandler): () => void {
  registeredHandler = handler
  return () => {
    if (registeredHandler === handler) registeredHandler = null
  }
}

// --- helpers --------------------------------------------------------------

export function apiBase(): string {
  return (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? ''
}

export async function getBearerToken(): Promise<string> {
  const {
    data: { session },
  } = await supabase.auth.getSession()
  const token = session?.access_token
  if (!token) throw new Error('Not authenticated')
  return token
}

const INVALID_AUTH_NEEDLE = 'invalid authentication credentials'

function looksLikeInvalidAuth(detail: unknown): boolean {
  if (typeof detail === 'string') {
    return detail.toLowerCase().includes(INVALID_AUTH_NEEDLE)
  }
  if (detail && typeof detail === 'object') {
    const inner = (detail as { error?: unknown }).error
    if (typeof inner === 'string') {
      return inner.toLowerCase().includes(INVALID_AUTH_NEEDLE)
    }
  }
  return false
}

function errorMessageFromDetail(detail: unknown, fallback: string): string {
  if (typeof detail === 'string') return detail
  if (detail && typeof detail === 'object') {
    const inner = (detail as { error?: unknown }).error
    if (typeof inner === 'string') return inner
  }
  return fallback
}

// --- main wrapper ---------------------------------------------------------

/**
 * Authenticated JSON-over-HTTP call to the FastAPI backend.
 *
 * @param method  HTTP method
 * @param path    Path beginning with `/` — joined to {@link apiBase}.
 * @param body    Optional payload — serialised as JSON for write methods.
 * @returns Parsed JSON response (typed as `T`), or `undefined` cast to `T`
 *          for 204 No Content. Throws `AuthExpiredError` on 401-invalid-auth,
 *          or `Error` with the parsed server detail otherwise.
 */
export async function api<T = unknown>(
  method: HttpMethod,
  path: string,
  body?: unknown,
): Promise<T> {
  const token = await getBearerToken()
  const headers: Record<string, string> = {
    Authorization: `Bearer ${token}`,
  }
  const hasBody = body !== undefined && body !== null
  if (hasBody) headers['Content-Type'] = 'application/json'

  const res = await fetch(`${apiBase()}${path}`, {
    method,
    headers,
    body: hasBody ? JSON.stringify(body) : undefined,
  })

  if (res.status === 401) {
    const detail = await res
      .json()
      .then((d: unknown) => (d as { detail?: unknown }).detail)
      .catch(() => undefined)
    if (looksLikeInvalidAuth(detail)) {
      // Fire-and-forget — we don't want a slow toast/navigate to delay the throw.
      if (registeredHandler) {
        void Promise.resolve(registeredHandler()).catch(() => {
          /* never let handler errors mask the original 401 */
        })
      }
      throw new AuthExpiredError(
        typeof detail === 'string' ? detail : 'Invalid authentication credentials',
      )
    }
    // Some other 401 (e.g. missing role) — surface as a normal error so the
    // caller can display it inline (no auto-redirect, otherwise we'd kick the
    // user out for routine permission errors).
    // landr-40x0: capture into the error log so operators can copy/report.
    {
      const msg = errorMessageFromDetail(detail, `HTTP ${res.status}`)
      notifyError(msg, { detail: `${method} ${path} → 401` })
      throw new Error(msg)
    }
  }

  if (!res.ok) {
    const detail = await res
      .json()
      .then((d: unknown) => (d as { detail?: unknown }).detail)
      .catch(() => undefined)
    // landr-40x0: capture into the error log so operators can copy/report.
    const msg = errorMessageFromDetail(detail, `HTTP ${res.status}`)
    notifyError(msg, { detail: `${method} ${path} → ${res.status}` })
    throw new Error(msg)
  }

  if (res.status === 204) {
    return undefined as T
  }

  // Some endpoints return empty body on 200 — guard against that too.
  const text = await res.text()
  if (text === '') return undefined as T
  return JSON.parse(text) as T
}
