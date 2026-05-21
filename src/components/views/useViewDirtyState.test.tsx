// landr-hgtv — useViewDirtyState behaviour.
//
// Verifies:
//   - Personal Views auto-save on config change (debounced 500ms).
//   - Shared Views stage in local state; save() PATCHes; discard() reverts.
//   - Snapshot resets when the View ID changes.

import { act, renderHook, waitFor } from '@testing-library/react'
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from 'vitest'

const { mocks } = vi.hoisted(() => ({
  mocks: { patchSavedView: vi.fn() },
}))

vi.mock('@/lib/saved-views', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/saved-views')>()
  return { ...actual, patchSavedView: mocks.patchSavedView }
})

import { useViewDirtyState } from './useViewDirtyState'
import type { SavedViewWithState } from '@/lib/saved-views'

const OP_ID = '11111111-1111-4111-8111-111111111111'
const VIEW_A = '22222222-2222-4222-8222-22222222aaaa'
const VIEW_B = '22222222-2222-4222-8222-22222222bbbb'
const USER_ID = '33333333-3333-4333-8333-333333333333'

function makeView(
  overrides: Partial<SavedViewWithState> = {},
): SavedViewWithState {
  return {
    id: VIEW_A,
    operator_id: OP_ID,
    creator_user_id: USER_ID,
    entity_type: 'booking',
    visibility: 'personal',
    name: 'My view',
    config: { layout: 'table', filters: [], sort: [] },
    sort_order: 0,
    created_at: '2026-05-21T10:00:00Z',
    updated_at: '2026-05-21T10:00:00Z',
    user_state: { starred: false, hidden: false },
    ...overrides,
  }
}

beforeEach(() => {
  mocks.patchSavedView.mockReset()
  vi.useFakeTimers({ shouldAdvanceTime: true })
})

afterEach(() => {
  vi.useRealTimers()
})

describe('useViewDirtyState (landr-hgtv)', () => {
  it('initialises with the view config as baseline + local', () => {
    const view = makeView()
    const { result } = renderHook(() =>
      useViewDirtyState({ operatorId: OP_ID, view }),
    )
    expect(result.current.config).toEqual(view.config)
    expect(result.current.dirty).toBe(false)
    expect(result.current.mode).toBe('personal')
    expect(result.current.status).toBe('idle')
  })

  it('Personal: auto-saves after the debounce window', async () => {
    const view = makeView({ visibility: 'personal' })
    mocks.patchSavedView.mockResolvedValueOnce({
      ...view,
      config: { layout: 'board', filters: [], sort: [] },
    })
    const { result } = renderHook(() =>
      useViewDirtyState({ operatorId: OP_ID, view }),
    )
    act(() => {
      result.current.setConfig({ layout: 'board', filters: [], sort: [] })
    })
    expect(result.current.dirty).toBe(true)
    expect(mocks.patchSavedView).not.toHaveBeenCalled()
    // Fire the debounce timer.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    await waitFor(() => {
      expect(mocks.patchSavedView).toHaveBeenCalledTimes(1)
    })
    expect(mocks.patchSavedView).toHaveBeenCalledWith(OP_ID, VIEW_A, {
      config: { layout: 'board', filters: [], sort: [] },
    })
    await waitFor(() => {
      expect(result.current.status).toBe('saved')
    })
    expect(result.current.dirty).toBe(false)
  })

  it('Personal: coalesces rapid mutations into a single PATCH', async () => {
    const view = makeView({ visibility: 'personal' })
    mocks.patchSavedView.mockResolvedValue({
      ...view,
      config: { layout: 'calendar', filters: [], sort: [] },
    })
    const { result } = renderHook(() =>
      useViewDirtyState({ operatorId: OP_ID, view }),
    )
    act(() => {
      result.current.setConfig({ layout: 'board', filters: [], sort: [] })
    })
    act(() => {
      result.current.setConfig({ layout: 'calendar', filters: [], sort: [] })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(600)
    })
    await waitFor(() => {
      expect(mocks.patchSavedView).toHaveBeenCalledTimes(1)
    })
    const [, , patch] = mocks.patchSavedView.mock.calls[0]
    expect((patch as { config: { layout: string } }).config.layout).toBe(
      'calendar',
    )
  })

  it('Shared: does NOT auto-save; save() PATCHes on demand', async () => {
    const view = makeView({ visibility: 'shared' })
    mocks.patchSavedView.mockResolvedValueOnce({
      ...view,
      config: { layout: 'board', filters: [], sort: [] },
    })
    const { result } = renderHook(() =>
      useViewDirtyState({ operatorId: OP_ID, view }),
    )
    act(() => {
      result.current.setConfig({ layout: 'board', filters: [], sort: [] })
    })
    expect(result.current.dirty).toBe(true)
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000)
    })
    expect(mocks.patchSavedView).not.toHaveBeenCalled()

    await act(async () => {
      await result.current.save()
    })
    expect(mocks.patchSavedView).toHaveBeenCalledTimes(1)
    expect(result.current.dirty).toBe(false)
    expect(result.current.status).toBe('saved')
  })

  it('Shared: discard() reverts local state to the baseline', () => {
    const view = makeView({ visibility: 'shared' })
    const { result } = renderHook(() =>
      useViewDirtyState({ operatorId: OP_ID, view }),
    )
    act(() => {
      result.current.setConfig({ layout: 'board', filters: [], sort: [] })
    })
    expect(result.current.dirty).toBe(true)
    act(() => {
      result.current.discard()
    })
    expect(result.current.dirty).toBe(false)
    expect(result.current.config).toEqual(view.config)
    expect(mocks.patchSavedView).not.toHaveBeenCalled()
  })

  it('switching to a different View resets local state to its config', () => {
    const viewA = makeView({ id: VIEW_A, config: { layout: 'table' } })
    const viewB = makeView({ id: VIEW_B, config: { layout: 'calendar' } })
    const { result, rerender } = renderHook(
      ({ view }) => useViewDirtyState({ operatorId: OP_ID, view }),
      { initialProps: { view: viewA } },
    )
    act(() => {
      result.current.setConfig({ layout: 'board' })
    })
    expect(result.current.dirty).toBe(true)
    rerender({ view: viewB })
    expect(result.current.config).toEqual({ layout: 'calendar' })
    expect(result.current.dirty).toBe(false)
  })

  it('records errorMessage when the PATCH fails', async () => {
    const view = makeView({ visibility: 'shared' })
    mocks.patchSavedView.mockRejectedValueOnce(new Error('boom'))
    const { result } = renderHook(() =>
      useViewDirtyState({ operatorId: OP_ID, view }),
    )
    act(() => {
      result.current.setConfig({ layout: 'board' })
    })
    await act(async () => {
      await result.current.save()
    })
    expect(result.current.status).toBe('error')
    expect(result.current.errorMessage).toBe('boom')
  })
})
