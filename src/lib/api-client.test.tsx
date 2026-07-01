/**
 * Tests for the centralised api() wrapper + session-expired handler
 * registration. See landr-fr2.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ---------------------------------------------------------------------------
// Mocks — hoisted so vi.mock() picks them up before module evaluation
// ---------------------------------------------------------------------------

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

import {
  ApiTimeoutError,
  AuthExpiredError,
  REQUEST_TIMEOUT_MS,
  api,
  apiBase,
  registerSessionExpiredHandler,
} from './api-client'

/**
 * Simulates a real `fetch` reacting to the `AbortSignal` passed by `api()` —
 * the plain `vi.fn()` mock used elsewhere never resolves/rejects on its own,
 * so timeout tests need a fetch stub that actually listens for `abort`.
 */
function neverResolvingUntilAborted(_url: string, opts: RequestInit) {
  return new Promise<Response>((_resolve, reject) => {
    opts.signal?.addEventListener('abort', () => {
      const abortErr = new Error('The operation was aborted')
      abortErr.name = 'AbortError'
      reject(abortErr)
    })
  })
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  fetchSpy.mockReset()
  mock.supabase.auth.getSession.mockResolvedValue({
    data: { session: { access_token: 'test-token' } },
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('api()', () => {
  it('attaches bearer + returns parsed JSON on 200', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ id: 'op-1', name: 'Para42' }), { status: 200 }),
    )

    const result = await api<{ id: string; name: string }>(
      'GET',
      '/api/staff/operators/op-1',
    )

    expect(result).toEqual({ id: 'op-1', name: 'Para42' })
    expect(fetchSpy).toHaveBeenCalledOnce()
    const [url, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(url).toBe(`${apiBase()}/api/staff/operators/op-1`)
    expect(opts.method).toBe('GET')
    expect(opts.headers).toMatchObject({ Authorization: 'Bearer test-token' })
    // GET has no body → no Content-Type header
    expect((opts.headers as Record<string, string>)['Content-Type']).toBeUndefined()
  })

  it('attaches Content-Type and serialises body on POST', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ ok: true }), { status: 200 }),
    )

    await api('POST', '/api/staff/widgets', { name: 'x' })

    const [, opts] = fetchSpy.mock.calls[0] as [string, RequestInit]
    expect(opts.method).toBe('POST')
    expect(opts.headers).toMatchObject({
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
    })
    expect(opts.body).toBe(JSON.stringify({ name: 'x' }))
  })

  it('returns undefined on 204 No Content', async () => {
    fetchSpy.mockResolvedValueOnce(new Response(null, { status: 204 }))
    const result = await api('DELETE', '/api/staff/widgets/1')
    expect(result).toBeUndefined()
  })

  it('throws Error with parsed detail string on non-auth 4xx', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Widget not found' }), { status: 404 }),
    )

    await expect(api('GET', '/api/staff/widgets/missing')).rejects.toThrow(
      'Widget not found',
    )
  })

  it('throws Error with parsed detail.error on FastAPI structured errors', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: { error: 'capacity_exceeded' } }),
        { status: 409 },
      ),
    )

    await expect(api('POST', '/api/staff/availability', {})).rejects.toThrow(
      'capacity_exceeded',
    )
  })

  it('throws fallback HTTP n message when body has no detail', async () => {
    fetchSpy.mockResolvedValueOnce(new Response('', { status: 500 }))
    await expect(api('GET', '/whatever')).rejects.toThrow('HTTP 500')
  })

  it('throws AuthExpiredError + triggers handler on 401 invalid_authentication_credentials', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(
        JSON.stringify({ detail: 'Invalid authentication credentials' }),
        { status: 401 },
      ),
    )
    const handler = vi.fn()
    const unregister = registerSessionExpiredHandler(handler)

    await expect(api('GET', '/api/staff/operators/op-1')).rejects.toBeInstanceOf(
      AuthExpiredError,
    )
    // Handler is fire-and-forget, but vi awaits microtasks before assertions.
    expect(handler).toHaveBeenCalledOnce()

    unregister()
  })

  it('does NOT trigger session-expired handler on 401 with a different reason', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'forbidden_role' }), {
        status: 401,
      }),
    )
    const handler = vi.fn()
    const unregister = registerSessionExpiredHandler(handler)

    await expect(api('GET', '/api/staff/admin')).rejects.toThrow('forbidden_role')
    expect(handler).not.toHaveBeenCalled()

    unregister()
  })

  it('throws if there is no bearer token', async () => {
    mock.supabase.auth.getSession.mockResolvedValueOnce({
      data: { session: null },
    } as unknown as { data: { session: { access_token: string } } })

    await expect(api('GET', '/foo')).rejects.toThrow('Not authenticated')
    expect(fetchSpy).not.toHaveBeenCalled()
  })

  it('aborts and throws ApiTimeoutError once the default 15s timeout elapses', async () => {
    vi.useFakeTimers()
    try {
      fetchSpy.mockImplementationOnce(neverResolvingUntilAborted)

      const promise = api('GET', '/api/staff/slow')
      const assertion = expect(promise).rejects.toBeInstanceOf(ApiTimeoutError)
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not time out a request that resolves before the deadline', async () => {
    vi.useFakeTimers()
    try {
      fetchSpy.mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }))
      const result = await api('GET', '/api/staff/fast')
      expect(result).toEqual({ ok: true })
      // Advancing past the timeout afterwards must not blow up (timer was cleared).
      await vi.advanceTimersByTimeAsync(REQUEST_TIMEOUT_MS)
    } finally {
      vi.useRealTimers()
    }
  })

  it('respects a per-call timeoutMs override, firing before the 15s default', async () => {
    vi.useFakeTimers()
    try {
      fetchSpy.mockImplementationOnce(neverResolvingUntilAborted)

      const promise = api('GET', '/api/staff/slow', undefined, { timeoutMs: 100 })
      const assertion = expect(promise).rejects.toBeInstanceOf(ApiTimeoutError)
      await vi.advanceTimersByTimeAsync(100)
      await assertion
    } finally {
      vi.useRealTimers()
    }
  })

  it('propagates a plain network failure unchanged, distinguishable from a timeout', async () => {
    const networkErr = new TypeError('Failed to fetch')
    fetchSpy.mockRejectedValueOnce(networkErr)

    await expect(api('GET', '/api/staff/unreachable')).rejects.toBe(networkErr)
  })
})

describe('registerSessionExpiredHandler', () => {
  it('replaces a previously-registered handler with the latest one', async () => {
    fetchSpy.mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Invalid authentication credentials' }), {
        status: 401,
      }),
    )
    const first = vi.fn()
    const second = vi.fn()
    registerSessionExpiredHandler(first)
    const unregister = registerSessionExpiredHandler(second)

    await expect(api('GET', '/x')).rejects.toBeInstanceOf(AuthExpiredError)

    expect(first).not.toHaveBeenCalled()
    expect(second).toHaveBeenCalledOnce()

    unregister()
  })

  it('unregister tears down the handler so future 401s do not fire it', async () => {
    fetchSpy
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Invalid authentication credentials' }), {
          status: 401,
        }),
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ detail: 'Invalid authentication credentials' }), {
          status: 401,
        }),
      )

    const handler = vi.fn()
    const unregister = registerSessionExpiredHandler(handler)

    await expect(api('GET', '/a')).rejects.toBeInstanceOf(AuthExpiredError)
    unregister()
    await expect(api('GET', '/b')).rejects.toBeInstanceOf(AuthExpiredError)

    expect(handler).toHaveBeenCalledOnce()
  })
})
