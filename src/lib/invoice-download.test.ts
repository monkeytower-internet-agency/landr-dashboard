/**
 * Unit tests for the invoice-download helper.
 *
 * landr-irds. Verifies:
 *   - Correct URL composition (operator-scoped path) + bearer auth header.
 *   - Triggers a download with `invoice-<bookingId>.pdf` filename.
 *   - Surfaces server JSON error.detail as Error.message.
 *   - Surfaces HTTP status fallback when body isn't JSON.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  },
}))

import { downloadInvoicePdf } from './invoice-download'

const OPERATOR_ID = 'op-1234'
const BOOKING_ID = 'bk-5678'

describe('downloadInvoicePdf', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('GETs the operator-scoped invoice URL with a bearer token', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(new Uint8Array([0x25, 0x50, 0x44, 0x46]), {
        status: 200,
        headers: { 'content-type': 'application/pdf' },
      }),
    )
    const triggerDownload = vi.fn()

    await downloadInvoicePdf({
      operatorId: OPERATOR_ID,
      bookingId: BOOKING_ID,
      fetchImpl,
      triggerDownload,
    })

    expect(fetchImpl).toHaveBeenCalledOnce()
    const call = fetchImpl.mock.calls[0] as unknown as [string, RequestInit]
    const [url, opts] = call
    expect(url).toContain(
      `/api/staff/operators/${OPERATOR_ID}/bookings/${BOOKING_ID}/invoice.pdf`,
    )
    expect(opts.method).toBe('GET')
    expect((opts.headers as Record<string, string>).Authorization).toBe(
      'Bearer test-token',
    )
  })

  it('triggers a download with invoice-<bookingId>.pdf filename', async () => {
    const pdfBytes = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d]) // %PDF-
    const fetchImpl = vi.fn(async () =>
      new Response(pdfBytes, { status: 200 }),
    )
    const triggerDownload = vi.fn()

    await downloadInvoicePdf({
      operatorId: OPERATOR_ID,
      bookingId: BOOKING_ID,
      fetchImpl,
      triggerDownload,
    })

    expect(triggerDownload).toHaveBeenCalledOnce()
    const dlCall = triggerDownload.mock.calls[0] as unknown as [Blob, string]
    const [blob, filename] = dlCall
    expect(filename).toBe(`invoice-${BOOKING_ID}.pdf`)
    // undici's Blob (used by Node fetch in vitest) is structurally identical
    // to jsdom's Blob but instanceof-checks across realms can be flaky.
    // Duck-type instead.
    expect(typeof blob.size).toBe('number')
    expect(blob.size).toBe(pdfBytes.length)
  })

  it('surfaces a JSON detail.error message on failure', async () => {
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ detail: { error: 'booking_not_found' } }), {
        status: 404,
        headers: { 'content-type': 'application/json' },
      }),
    )

    await expect(
      downloadInvoicePdf({
        operatorId: OPERATOR_ID,
        bookingId: BOOKING_ID,
        fetchImpl,
        triggerDownload: vi.fn(),
      }),
    ).rejects.toThrow('booking_not_found')
  })

  it('falls back to HTTP status when error body is not JSON', async () => {
    const fetchImpl = vi.fn(
      async () => new Response('Internal Server Error', { status: 500 }),
    )

    await expect(
      downloadInvoicePdf({
        operatorId: OPERATOR_ID,
        bookingId: BOOKING_ID,
        fetchImpl,
        triggerDownload: vi.fn(),
      }),
    ).rejects.toThrow(/HTTP 500/)
  })
})
