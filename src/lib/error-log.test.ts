// landr-52ik.1 — addError() forwards every capture to Sentry.
//
// error-log.ts is the single choke point captureError()/notifyError() both
// funnel through (src/lib/notify.ts). This test proves the landr-52ik.1
// wiring: addError() calls reportErrorToSentry() with the stored entry's
// message/detail/context. The no-op behaviour itself (VITE_SENTRY_DSN
// unset => reportErrorToSentry is a no-op) is covered in sentry.test.ts;
// here @/lib/sentry is mocked so we only assert the call, not Sentry's
// internal gating.

import { afterEach, describe, expect, it, vi } from 'vitest'

const reportErrorToSentrySpy = vi.fn()

vi.mock('@/lib/sentry', () => ({
  reportErrorToSentry: (...args: unknown[]) => reportErrorToSentrySpy(...args),
}))

import { addError, clearErrors, listErrors } from '@/lib/error-log'

afterEach(() => {
  clearErrors()
  reportErrorToSentrySpy.mockReset()
})

describe('addError', () => {
  it('stores the entry and forwards it to reportErrorToSentry', () => {
    const entry = addError({
      message: 'Could not load bookings',
      detail: '500 server error',
      context: '/bookings',
    })

    expect(listErrors()).toHaveLength(1)
    expect(listErrors()[0]).toBe(entry)

    expect(reportErrorToSentrySpy).toHaveBeenCalledOnce()
    expect(reportErrorToSentrySpy).toHaveBeenCalledWith('Could not load bookings', {
      detail: '500 server error',
      context: '/bookings',
    })
  })

  it('forwards entries with no detail as undefined', () => {
    addError({ message: 'plain error', context: '/x' })

    expect(reportErrorToSentrySpy).toHaveBeenCalledWith('plain error', {
      detail: undefined,
      context: '/x',
    })
  })
})
