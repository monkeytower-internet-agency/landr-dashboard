// landr-1lj — verifies per-operator persistence + isolation of the
// BookingsCalendar default view.

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_CALENDAR_VIEW,
  storageKey,
  useCalendarView,
} from './calendar-view-memory'

beforeEach(() => {
  window.localStorage.clear()
})

describe('useCalendarView', () => {
  it('returns the default view when nothing is stored', () => {
    const { result } = renderHook(() => useCalendarView('op-1'))
    expect(result.current.view).toBe(DEFAULT_CALENDAR_VIEW)
  })

  it('persists a chosen view to localStorage under the operator key', () => {
    const { result } = renderHook(() => useCalendarView('op-1'))
    act(() => result.current.setView('dayGridMonth'))
    expect(result.current.view).toBe('dayGridMonth')
    expect(window.localStorage.getItem(storageKey('op-1'))).toBe('dayGridMonth')
  })

  it('restores a stored view on a fresh mount', () => {
    window.localStorage.setItem(storageKey('op-1'), 'timeGridDay')
    const { result } = renderHook(() => useCalendarView('op-1'))
    expect(result.current.view).toBe('timeGridDay')
  })

  it('falls back to default when the stored value is unrecognised', () => {
    window.localStorage.setItem(storageKey('op-1'), 'fooBar')
    const { result } = renderHook(() => useCalendarView('op-1'))
    expect(result.current.view).toBe(DEFAULT_CALENDAR_VIEW)
  })

  it('switches stored value when operator changes', () => {
    // op-1 has month stored, op-2 has day stored.
    window.localStorage.setItem(storageKey('op-1'), 'dayGridMonth')
    window.localStorage.setItem(storageKey('op-2'), 'timeGridDay')

    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useCalendarView(id),
      { initialProps: { id: 'op-1' } },
    )
    expect(result.current.view).toBe('dayGridMonth')

    rerender({ id: 'op-2' })
    expect(result.current.view).toBe('timeGridDay')
  })

  it('writes per-operator, not per-user — switching operators preserves both stores', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useCalendarView(id),
      { initialProps: { id: 'op-1' } },
    )
    act(() => result.current.setView('dayGridMonth'))

    rerender({ id: 'op-2' })
    act(() => result.current.setView('timeGridDay'))

    expect(window.localStorage.getItem(storageKey('op-1'))).toBe('dayGridMonth')
    expect(window.localStorage.getItem(storageKey('op-2'))).toBe('timeGridDay')
  })

  it('returns the default when operatorId is null and skips persistence', () => {
    const { result } = renderHook(() => useCalendarView(null))
    expect(result.current.view).toBe(DEFAULT_CALENDAR_VIEW)
    act(() => result.current.setView('dayGridMonth'))
    // setView still updates local state but does not persist.
    expect(result.current.view).toBe('dayGridMonth')
    expect(window.localStorage.length).toBe(0)
  })
})
