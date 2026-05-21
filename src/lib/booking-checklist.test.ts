// landr-84n1 — verify the per-(operator, booking) checklist storage:
// default seeding, toggle/add/remove semantics, default-protection, and
// per-scope isolation across operators and bookings.

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_CHECKLIST_ITEMS,
  checklistProgress,
  getChecklist,
  seedState,
  storageKey,
  useBookingChecklist,
} from './booking-checklist'

beforeEach(() => {
  window.localStorage.clear()
})

describe('seedState / getChecklist', () => {
  it('seeds the four operator defaults, all unchecked, when nothing is stored', () => {
    const state = getChecklist('op-1', 'b-1')
    expect(state.items.map((i) => i.label)).toEqual([
      'Called customer',
      'Payment received',
      'Equipment ready',
      'Emailed pickup details',
    ])
    expect(state.items.every((i) => i.done === false)).toBe(true)
  })

  it('returns the seeded state when operator or booking is missing', () => {
    expect(getChecklist(null, 'b-1')).toEqual(seedState())
    expect(getChecklist('op-1', null)).toEqual(seedState())
  })

  it('reads stored state and reconciles missing default items', () => {
    // Simulate a stored state from a previous session that only had two
    // of the four defaults (e.g. defaults were renamed/added in code).
    window.localStorage.setItem(
      storageKey('op-1', 'b-1'),
      JSON.stringify({
        items: [
          { id: 'default-called-customer', label: 'Old label', done: true },
        ],
        lastUpdatedAt: 1,
      }),
    )
    const state = getChecklist('op-1', 'b-1')
    expect(state.items).toHaveLength(DEFAULT_CHECKLIST_ITEMS.length)
    // The stored done flag is preserved for the matching default…
    const called = state.items.find((i) => i.id === 'default-called-customer')
    expect(called?.done).toBe(true)
    // …but the label is refreshed from code (rename support).
    expect(called?.label).toBe('Called customer')
  })

  it('drops stored ids that are no longer in defaults and not customs', () => {
    window.localStorage.setItem(
      storageKey('op-1', 'b-1'),
      JSON.stringify({
        items: [{ id: 'default-retired', label: 'Gone', done: true }],
        lastUpdatedAt: 1,
      }),
    )
    const state = getChecklist('op-1', 'b-1')
    expect(state.items.some((i) => i.id === 'default-retired')).toBe(false)
  })

  it('preserves custom items appended after the defaults', () => {
    window.localStorage.setItem(
      storageKey('op-1', 'b-1'),
      JSON.stringify({
        items: [
          {
            id: 'custom-abc',
            label: 'Sign waiver',
            done: false,
            custom: true,
          },
        ],
        lastUpdatedAt: 1,
      }),
    )
    const state = getChecklist('op-1', 'b-1')
    const last = state.items[state.items.length - 1]
    expect(last.id).toBe('custom-abc')
    expect(last.custom).toBe(true)
  })

  it('falls back to a fresh seed when stored JSON is malformed', () => {
    window.localStorage.setItem(storageKey('op-1', 'b-1'), 'not-json')
    expect(getChecklist('op-1', 'b-1')).toEqual(seedState())
  })
})

describe('checklistProgress', () => {
  it('counts done items vs total', () => {
    const state = seedState()
    expect(checklistProgress(state)).toEqual({ done: 0, total: 4 })
    state.items[0].done = true
    state.items[2].done = true
    expect(checklistProgress(state)).toEqual({ done: 2, total: 4 })
  })
})

describe('useBookingChecklist', () => {
  it('persists toggles under the (operator, booking) key', () => {
    const { result } = renderHook(() => useBookingChecklist('op-1', 'b-1'))
    act(() => result.current.toggle('default-called-customer'))
    expect(result.current.state.items[0].done).toBe(true)

    const raw = window.localStorage.getItem(storageKey('op-1', 'b-1'))
    expect(raw).not.toBeNull()
    const parsed = JSON.parse(raw as string)
    expect(parsed.items[0].done).toBe(true)
    expect(parsed.lastUpdatedAt).toBeGreaterThan(0)
  })

  it('addCustom appends a custom item with custom:true', () => {
    const { result } = renderHook(() => useBookingChecklist('op-1', 'b-1'))
    act(() => result.current.addCustom('Sign waiver'))
    const items = result.current.state.items
    const added = items[items.length - 1]
    expect(added.label).toBe('Sign waiver')
    expect(added.custom).toBe(true)
    expect(added.done).toBe(false)
  })

  it('addCustom ignores empty / whitespace input', () => {
    const { result } = renderHook(() => useBookingChecklist('op-1', 'b-1'))
    act(() => result.current.addCustom('   '))
    expect(result.current.state.items).toHaveLength(
      DEFAULT_CHECKLIST_ITEMS.length,
    )
  })

  it('removeCustom drops custom items but refuses defaults', () => {
    const { result } = renderHook(() => useBookingChecklist('op-1', 'b-1'))
    act(() => result.current.addCustom('Sign waiver'))
    const customId = result.current.state.items.find((i) => i.custom)!.id

    act(() => result.current.removeCustom(customId))
    expect(result.current.state.items.some((i) => i.id === customId)).toBe(
      false,
    )

    // Defaults are protected.
    act(() => result.current.removeCustom('default-called-customer'))
    expect(
      result.current.state.items.some(
        (i) => i.id === 'default-called-customer',
      ),
    ).toBe(true)
  })

  it('isolates checklists across bookings for the same operator', () => {
    const a = renderHook(() => useBookingChecklist('op-1', 'b-1'))
    act(() => a.result.current.toggle('default-payment-received'))

    const b = renderHook(() => useBookingChecklist('op-1', 'b-2'))
    expect(
      b.result.current.state.items.find(
        (i) => i.id === 'default-payment-received',
      )?.done,
    ).toBe(false)
  })

  it('isolates checklists across operators for the same booking', () => {
    const a = renderHook(() => useBookingChecklist('op-1', 'b-1'))
    act(() => a.result.current.toggle('default-equipment-ready'))

    const b = renderHook(() => useBookingChecklist('op-2', 'b-1'))
    expect(
      b.result.current.state.items.find(
        (i) => i.id === 'default-equipment-ready',
      )?.done,
    ).toBe(false)
  })

  it('re-seeds when the scope (booking) changes during the hook lifecycle', () => {
    const { result, rerender } = renderHook(
      ({ id }: { id: string }) => useBookingChecklist('op-1', id),
      { initialProps: { id: 'b-1' } },
    )
    act(() => result.current.toggle('default-called-customer'))

    rerender({ id: 'b-2' })
    expect(result.current.state.items[0].done).toBe(false)

    rerender({ id: 'b-1' })
    expect(result.current.state.items[0].done).toBe(true)
  })

  it('runs in-memory and skips persistence when operatorId is null', () => {
    const { result } = renderHook(() => useBookingChecklist(null, 'b-1'))
    expect(result.current.persisted).toBe(false)
    act(() => result.current.toggle('default-called-customer'))
    expect(result.current.state.items[0].done).toBe(true)
    expect(window.localStorage.length).toBe(0)
  })

  it('exposes a progress count that updates with toggles', () => {
    const { result } = renderHook(() => useBookingChecklist('op-1', 'b-1'))
    expect(result.current.progress).toEqual({ done: 0, total: 4 })
    act(() => result.current.toggle('default-called-customer'))
    expect(result.current.progress).toEqual({ done: 1, total: 4 })
    act(() => result.current.addCustom('Sign waiver'))
    expect(result.current.progress).toEqual({ done: 1, total: 5 })
  })
})
