// landr-7dya.5 — Tests for useReducedMotion.
//
// Covers:
//   - returns false when prefers-reduced-motion is NOT set
//   - returns true when prefers-reduced-motion IS set
//   - reacts to live changes via the MediaQueryList change event

import { renderHook, act } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useReducedMotion } from './use-reduced-motion'

// ---- matchMedia mock --------------------------------------------------------

type ChangeHandler = (e: MediaQueryListEvent) => void

let mockMatches = false
const changeHandlers: ChangeHandler[] = []

const mockMql = {
  get matches() {
    return mockMatches
  },
  addEventListener: vi.fn((_type: string, cb: ChangeHandler) => {
    changeHandlers.push(cb)
  }),
  removeEventListener: vi.fn((_type: string, cb: ChangeHandler) => {
    const idx = changeHandlers.indexOf(cb)
    if (idx !== -1) changeHandlers.splice(idx, 1)
  }),
}

function fireChange(matches: boolean) {
  mockMatches = matches
  const event = { matches } as MediaQueryListEvent
  for (const h of [...changeHandlers]) h(event)
}

beforeEach(() => {
  mockMatches = false
  changeHandlers.length = 0
  vi.stubGlobal('matchMedia', vi.fn(() => mockMql))
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

// ---- tests ------------------------------------------------------------------

describe('useReducedMotion', () => {
  it('returns false when prefers-reduced-motion is not active', () => {
    mockMatches = false
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)
  })

  it('returns true when prefers-reduced-motion is active on mount', () => {
    mockMatches = true
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)
  })

  it('updates to true when the media query fires a change event', () => {
    mockMatches = false
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(false)

    act(() => {
      fireChange(true)
    })

    expect(result.current).toBe(true)
  })

  it('updates back to false when motion preference is removed', () => {
    mockMatches = true
    const { result } = renderHook(() => useReducedMotion())
    expect(result.current).toBe(true)

    act(() => {
      fireChange(false)
    })

    expect(result.current).toBe(false)
  })

  it('removes the event listener on unmount', () => {
    const { unmount } = renderHook(() => useReducedMotion())
    expect(mockMql.addEventListener).toHaveBeenCalled()
    unmount()
    expect(mockMql.removeEventListener).toHaveBeenCalled()
  })
})
