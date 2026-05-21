/**
 * Invoice-PDF download helper.
 *
 * landr-irds. Fetches the server-rendered invoice PDF for a booking and
 * triggers a browser download. The endpoint requires an auth bearer
 * (operator membership check) so a plain <a href> can't be used — we
 * `fetch` with the Supabase session token, read the response as a blob,
 * and use `createObjectURL` + a synthetic <a> click to surface the file.
 *
 * Endpoint:
 *   GET /api/staff/operators/{op}/bookings/{id}/invoice.pdf
 *     -> application/pdf, Content-Disposition: attachment;filename=invoice-<id>.pdf
 *
 * Why not reuse `api<T>()` from `@/lib/api-client`? That wrapper assumes
 * a JSON body — calling `JSON.parse` on PDF bytes corrupts the file.
 * Instead we lean on the same `getBearerToken` + `apiBase` building
 * blocks so auth + base-URL behaviour stays identical.
 */

import { apiBase, getBearerToken } from '@/lib/api-client'

export type DownloadInvoicePdfArgs = {
  operatorId: string
  bookingId: string
  /** Override for unit tests; falls back to global `fetch`. */
  fetchImpl?: typeof fetch
  /** Override for unit tests; falls back to `document` + `window.URL`. */
  triggerDownload?: (blob: Blob, filename: string) => void
}

function defaultTriggerDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob)
  const anchor = document.createElement('a')
  anchor.href = url
  anchor.download = filename
  // Append to DOM so Firefox honours the synthetic click (Chrome is laxer
  // but appending is harmless and matches the cross-browser recipe).
  document.body.appendChild(anchor)
  anchor.click()
  document.body.removeChild(anchor)
  // Revoke async to let the browser actually start the download first.
  setTimeout(() => window.URL.revokeObjectURL(url), 0)
}

/**
 * Fetch + trigger a download of the invoice PDF for a booking.
 *
 * Throws a plain `Error` with the server's `detail` (if the response was
 * JSON) or the HTTP status text on failure. Callers should surface this
 * via a toast.
 */
export async function downloadInvoicePdf({
  operatorId,
  bookingId,
  fetchImpl,
  triggerDownload,
}: DownloadInvoicePdfArgs): Promise<void> {
  const token = await getBearerToken()
  const f = fetchImpl ?? fetch
  const url = `${apiBase()}/api/staff/operators/${operatorId}/bookings/${bookingId}/invoice.pdf`
  const res = await f(url, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!res.ok) {
    // Server errors are JSON ({ detail: { error: "..." } } per FastAPI).
    let message = `HTTP ${res.status}`
    try {
      const body = (await res.json()) as { detail?: unknown }
      const detail = body.detail
      if (typeof detail === 'string') {
        message = detail
      } else if (detail && typeof detail === 'object') {
        const inner = (detail as { error?: unknown }).error
        if (typeof inner === 'string') message = inner
      }
    } catch {
      // Non-JSON error body — keep the HTTP status message.
    }
    throw new Error(message)
  }
  const blob = await res.blob()
  const filename = `invoice-${bookingId}.pdf`
  ;(triggerDownload ?? defaultTriggerDownload)(blob, filename)
}
