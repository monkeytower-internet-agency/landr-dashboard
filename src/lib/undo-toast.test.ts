// landr-v6aq — coverage for the shared delete-undo toast helper. The helper
// wraps sonner with a 5s window that fires the staff_trash restore route on
// Undo, then invalidates every registered query key so the row reappears.
//
// Covers:
//   - shape of the success toast (message + Undo action label)
//   - clicking Undo posts to /api/staff/operators/{op}/trash/{kind}/{id}/restore
//   - successful restore fires a second toast and invalidates every key
//   - failed restore surfaces an error toast and does NOT invalidate

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { QueryClient } from '@tanstack/react-query'

// --- mocks ----------------------------------------------------------------

const toastMock = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
}))
vi.mock('sonner', () => ({ toast: toastMock }))

const apiCalls: Array<{ method: string; path: string; body?: unknown }> = []
let apiResponse: unknown = { id: 'row-1', deleted_at: null }
let apiThrow: Error | null = null
vi.mock('@/lib/api-client', () => ({
  api: vi.fn(async (method: string, path: string, body?: unknown) => {
    apiCalls.push({ method, path, body })
    if (apiThrow) throw apiThrow
    return apiResponse
  }),
}))

import { showDeleteUndoToast } from './undo-toast'

// --- harness --------------------------------------------------------------

beforeEach(() => {
  toastMock.success.mockClear()
  toastMock.error.mockClear()
  apiCalls.length = 0
  apiResponse = { id: 'row-1', deleted_at: null }
  apiThrow = null
})

afterEach(() => {
  vi.clearAllMocks()
})

type ActionToast = {
  action: { label: string; onClick: () => void }
}

function lastSuccessCall(): [string, ActionToast] {
  const calls = toastMock.success.mock.calls
  return calls[calls.length - 1] as [string, ActionToast]
}

// --- success path ---------------------------------------------------------

describe('showDeleteUndoToast', () => {
  it('renders a success toast with an Undo action', () => {
    const qc = new QueryClient()

    showDeleteUndoToast({
      operatorId: 'op-1',
      kind: 'bookings',
      rowId: 'b-1',
      message: 'Deleted booking — Marie Curie',
      queryClient: qc,
      invalidateQueryKeys: [['bookings']],
    })

    expect(toastMock.success).toHaveBeenCalledOnce()
    const [message, options] = lastSuccessCall()
    expect(message).toBe('Deleted booking — Marie Curie')
    expect(options.action.label).toBe('Undo')
    // No request should fire until the operator clicks Undo.
    expect(apiCalls).toEqual([])
  })

  it('clicking Undo POSTs to the staff_trash restore route for the chosen kind', async () => {
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    showDeleteUndoToast({
      operatorId: 'op-1',
      kind: 'products',
      rowId: 'p-99',
      message: 'Deleted product — Tandem Flight',
      queryClient: qc,
      invalidateQueryKeys: [
        ['products', 'op-1'],
        ['product-kind-counts', 'op-1'],
      ],
    })

    const [, options] = lastSuccessCall()
    options.action.onClick()

    // The onClick handler kicks off an async chain; flush microtasks so
    // the api mock runs to completion before we assert on its calls.
    await vi.waitFor(() => expect(apiCalls).toHaveLength(1))
    expect(apiCalls[0]).toEqual({
      method: 'POST',
      path: '/api/staff/operators/op-1/trash/products/p-99/restore',
      body: undefined,
    })

    await vi.waitFor(() =>
      expect(toastMock.success).toHaveBeenCalledTimes(2),
    )
    // The second success toast is the post-restore confirmation.
    expect(toastMock.success.mock.calls[1]?.[0]).toBe('Restored.')

    // Both registered keys are invalidated so the row reappears in any
    // surface that depended on it.
    const invalidatedKeys = invalidateSpy.mock.calls.map(
      (call) => (call[0] as { queryKey: unknown[] }).queryKey,
    )
    expect(invalidatedKeys).toContainEqual(['products', 'op-1'])
    expect(invalidatedKeys).toContainEqual(['product-kind-counts', 'op-1'])
  })

  it('surfaces an error toast when the restore POST fails and does NOT invalidate caches', async () => {
    apiThrow = new Error('row_not_found')
    const qc = new QueryClient()
    const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

    showDeleteUndoToast({
      operatorId: 'op-1',
      kind: 'bookings',
      rowId: 'b-99',
      message: 'Deleted booking — Marie Curie',
      queryClient: qc,
      invalidateQueryKeys: [['bookings']],
    })

    const [, options] = lastSuccessCall()
    options.action.onClick()

    await vi.waitFor(() => expect(toastMock.error).toHaveBeenCalledOnce())
    const [errMessage, errOptions] = toastMock.error.mock.calls[0] as [
      string,
      { description: string },
    ]
    expect(errMessage).toMatch(/could not undo/i)
    expect(errOptions.description).toBe('row_not_found')

    // No invalidates — we don't want to hide a server-side rejection by
    // re-fetching and "fixing" the cache to a state that doesn't reflect
    // the failed undo.
    expect(invalidateSpy).not.toHaveBeenCalled()
  })

  it('routes by trash kind — operator_tags + pricing_schemes wire correctly too', async () => {
    const qc = new QueryClient()

    showDeleteUndoToast({
      operatorId: 'op-7',
      kind: 'operator_tags',
      rowId: 't-1',
      message: 'Deleted tag — VIP',
      queryClient: qc,
      invalidateQueryKeys: [['tags', 'op-7']],
    })
    lastSuccessCall()[1].action.onClick()

    await vi.waitFor(() => expect(apiCalls).toHaveLength(1))
    expect(apiCalls[0].path).toBe(
      '/api/staff/operators/op-7/trash/operator_tags/t-1/restore',
    )

    showDeleteUndoToast({
      operatorId: 'op-7',
      kind: 'pricing_schemes',
      rowId: 'ps-1',
      message: 'Deleted pricing scheme — Standard',
      queryClient: qc,
      invalidateQueryKeys: [['pricing_schemes', 'op-7']],
    })
    lastSuccessCall()[1].action.onClick()

    await vi.waitFor(() => expect(apiCalls).toHaveLength(2))
    expect(apiCalls[1].path).toBe(
      '/api/staff/operators/op-7/trash/pricing_schemes/ps-1/restore',
    )
  })
})
