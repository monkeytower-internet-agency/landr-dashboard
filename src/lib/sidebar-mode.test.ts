import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_SIDEBAR_MODE,
  SIDEBAR_MODE_STORAGE_KEY,
  openFor,
  useSidebarMode,
} from './sidebar-mode'

describe('openFor()', () => {
  it('returns true for expanded regardless of hover', () => {
    expect(openFor('expanded', false)).toBe(true)
    expect(openFor('expanded', true)).toBe(true)
  })

  it('returns false for collapsed regardless of hover', () => {
    expect(openFor('collapsed', false)).toBe(false)
    expect(openFor('collapsed', true)).toBe(false)
  })

  it('mirrors hover for hover-expand', () => {
    expect(openFor('hover-expand', false)).toBe(false)
    expect(openFor('hover-expand', true)).toBe(true)
  })
})

describe('useSidebarMode()', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    window.localStorage.clear()
  })

  it('starts at the default mode when localStorage is empty', () => {
    const { result } = renderHook(() => useSidebarMode())
    expect(result.current.mode).toBe(DEFAULT_SIDEBAR_MODE)
  })

  it('hydrates from localStorage when a valid value is present', () => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, 'collapsed')
    const { result } = renderHook(() => useSidebarMode())
    expect(result.current.mode).toBe('collapsed')
  })

  it('falls back to default on an invalid stored value', () => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, 'lol-nope')
    const { result } = renderHook(() => useSidebarMode())
    expect(result.current.mode).toBe(DEFAULT_SIDEBAR_MODE)
  })

  it('setMode persists to localStorage', () => {
    const { result } = renderHook(() => useSidebarMode())
    act(() => result.current.setMode('hover-expand'))
    expect(result.current.mode).toBe('hover-expand')
    expect(window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)).toBe(
      'hover-expand',
    )
  })

  it('cycle advances through collapsed → expanded → hover-expand → collapsed', () => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, 'collapsed')
    const { result } = renderHook(() => useSidebarMode())
    expect(result.current.mode).toBe('collapsed')

    act(() => result.current.cycle())
    expect(result.current.mode).toBe('expanded')

    act(() => result.current.cycle())
    expect(result.current.mode).toBe('hover-expand')

    act(() => result.current.cycle())
    expect(result.current.mode).toBe('collapsed')
  })

  it('responds to cross-tab storage events', () => {
    const { result } = renderHook(() => useSidebarMode())
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SIDEBAR_MODE_STORAGE_KEY,
          newValue: 'collapsed',
        }),
      )
    })
    expect(result.current.mode).toBe('collapsed')
  })

  it('ignores storage events for other keys', () => {
    const { result } = renderHook(() => useSidebarMode())
    const before = result.current.mode
    act(() => {
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: 'some.other.key',
          newValue: 'collapsed',
        }),
      )
    })
    expect(result.current.mode).toBe(before)
  })
})
