// landr-52ik.1 — tests for the Sentry init gate.
//
// Covers the core guarantee the ticket asks for: no VITE_SENTRY_DSN =>
// initSentry() is a complete no-op (Sentry.init never called, reportErrorToSentry
// never calls Sentry.captureException). Also covers the DSN-present path:
// Sentry.init receives the DSN + environment (VITE_DEPLOY_TIER) + release
// (VITE_COMMIT_SHA), and reportErrorToSentry forwards to Sentry.captureException.

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const initSpy = vi.fn()
const captureExceptionSpy = vi.fn()

vi.mock('@sentry/react', () => ({
  init: (...args: unknown[]) => initSpy(...args),
  captureException: (...args: unknown[]) => captureExceptionSpy(...args),
}))

// Imported AFTER the mock so the module under test picks up the mocked
// @sentry/react. Using dynamic import per-test (via resetModules) so each
// test gets a fresh `_enabled` module-level flag.
async function importFresh() {
  vi.resetModules()
  return import('@/lib/sentry')
}

beforeEach(() => {
  initSpy.mockReset()
  captureExceptionSpy.mockReset()
  vi.unstubAllEnvs()
})

afterEach(() => {
  vi.unstubAllEnvs()
})

describe('initSentry — no VITE_SENTRY_DSN', () => {
  it('is a complete no-op: Sentry.init is never called, returns false', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const { initSentry, isSentryEnabled } = await importFresh()

    const result = initSentry()

    expect(result).toBe(false)
    expect(isSentryEnabled()).toBe(false)
    expect(initSpy).not.toHaveBeenCalled()
  })

  it('treats a blank/whitespace DSN identically to unset', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '   ')
    const { initSentry } = await importFresh()

    expect(initSentry()).toBe(false)
    expect(initSpy).not.toHaveBeenCalled()
  })

  it('reportErrorToSentry does not call Sentry.captureException', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', '')
    const { initSentry, reportErrorToSentry } = await importFresh()
    initSentry()

    reportErrorToSentry('boom', { detail: 'x', context: '/y' })

    expect(captureExceptionSpy).not.toHaveBeenCalled()
  })
})

describe('initSentry — VITE_SENTRY_DSN present', () => {
  it('calls Sentry.init with dsn/environment/release and returns true', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o0.ingest.sentry.io/1')
    vi.stubEnv('VITE_DEPLOY_TIER', 'staging')
    vi.stubEnv('VITE_COMMIT_SHA', 'deadbeefcafe')
    const { initSentry, isSentryEnabled } = await importFresh()

    const result = initSentry()

    expect(result).toBe(true)
    expect(isSentryEnabled()).toBe(true)
    expect(initSpy).toHaveBeenCalledTimes(1)
    const [opts] = initSpy.mock.calls[0] as [Record<string, unknown>]
    expect(opts.dsn).toBe('https://abc@o0.ingest.sentry.io/1')
    expect(opts.environment).toBe('staging')
    expect(opts.release).toBe('deadbeefcafe')
  })

  it('defaults environment to "dev" when VITE_DEPLOY_TIER is unset', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o0.ingest.sentry.io/1')
    vi.stubEnv('VITE_DEPLOY_TIER', '')
    const { initSentry } = await importFresh()

    initSentry()

    const [opts] = initSpy.mock.calls[0] as [Record<string, unknown>]
    expect(opts.environment).toBe('dev')
  })

  it('reportErrorToSentry forwards message + detail/context to Sentry.captureException', async () => {
    vi.stubEnv('VITE_SENTRY_DSN', 'https://abc@o0.ingest.sentry.io/1')
    const { initSentry, reportErrorToSentry } = await importFresh()
    initSentry()

    reportErrorToSentry('Could not load bookings', {
      detail: '500 server error',
      context: '/bookings',
    })

    expect(captureExceptionSpy).toHaveBeenCalledOnce()
    const [err, ctx] = captureExceptionSpy.mock.calls[0] as [
      Error,
      { extra: { detail: string; context: string } },
    ]
    expect(err.message).toBe('Could not load bookings')
    expect(ctx.extra.detail).toBe('500 server error')
    expect(ctx.extra.context).toBe('/bookings')
  })
})
