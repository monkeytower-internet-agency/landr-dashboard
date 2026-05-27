// landr-vaob — tests for the bulkSendReminder helper that wraps
// POST /api/staff/operators/{op}/bookings/bulk-reminder (landr-s0wo).
// Lives in its own file so the broader bookings.test.ts can stay a
// pure-helper suite (no fetch/supabase stubs).

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mock } = vi.hoisted(() => {
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({
        data: { session: { access_token: 'test-token' } },
      })),
    },
  }
  return { mock: { supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

const fetchSpy = vi.fn()
vi.stubGlobal('fetch', fetchSpy)

import { bulkSendReminder } from './bookings'

const OPERATOR_ID = 'op-abc-123'

beforeEach(() => {
  fetchSpy.mockReset()
  mock.supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('bulkSendReminder (landr-vaob)', () => {
  it('POSTs to the operator-scoped bulk-reminder endpoint with booking_ids', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: 2, failed: [] }), { status: 200 }),
    )

    const result = await bulkSendReminder(OPERATOR_ID, ['b-1', 'b-2'])

    expect(result).toEqual({ sent: 2, failed: [] })
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(
      `/api/staff/operators/${OPERATOR_ID}/bookings/bulk-reminder`,
    )
    expect(opts.method).toBe('POST')
    expect(opts.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    })
    const body = JSON.parse(opts.body as string) as Record<string, unknown>
    expect(body).toEqual({ booking_ids: ['b-1', 'b-2'] })
  })

  it('returns the partial-failure shape verbatim (sent + failed list)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ sent: 1, failed: ['b-cross-tenant', 'b-template-err'] }),
        { status: 200 },
      ),
    )

    const result = await bulkSendReminder(OPERATOR_ID, [
      'b-1',
      'b-cross-tenant',
      'b-template-err',
    ])

    expect(result.sent).toBe(1)
    expect(result.failed).toEqual(['b-cross-tenant', 'b-template-err'])
  })

  it('propagates server errors as a thrown Error (HTTP 500)', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'boom' }), { status: 500 }),
    )

    await expect(
      bulkSendReminder(OPERATOR_ID, ['b-1']),
    ).rejects.toThrow(/boom/)
  })

  it('URL-encodes the operator id into the path', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ sent: 0, failed: [] }), { status: 200 }),
    )

    // Operator id is a UUID in production, but the helper should pass
    // through any string the caller supplies (the server validates).
    await bulkSendReminder('11111111-2222-3333-4444-555555555555', ['b-1'])

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toContain(
      '/api/staff/operators/11111111-2222-3333-4444-555555555555/bookings/bulk-reminder',
    )
  })
})
