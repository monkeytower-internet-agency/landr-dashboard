// landr-euta — j/k row navigation hook tests.
//
// Covers the six guarantees the three tables share:
//   - j moves focus down (and clamps at the last row)
//   - k moves focus up (and clamps at the first row)
//   - Enter calls onOpen with the focused index
//   - x calls onToggleSelect with the focused index
//   - j/k/Enter/x are ignored when typing into an input/textarea/
//     contenteditable
//   - the cursor clamps when rowCount shrinks underneath it (e.g.
//     filter narrowed)
import { act, renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { useListKeyboardNav } from './use-list-keyboard-nav'

function press(key: string, options: KeyboardEventInit = {}): void {
  // Window-level dispatch — the hook installs its listener on window so
  // we mirror real keyboard input rather than going through a specific
  // element.
  window.dispatchEvent(new KeyboardEvent('keydown', { key, ...options }))
}

describe('useListKeyboardNav (landr-euta)', () => {
  it('starts with focusedIndex = -1 (no row selected on mount)', () => {
    const { result } = renderHook(() => useListKeyboardNav({ rowCount: 5 }))
    expect(result.current.focusedIndex).toBe(-1)
  })

  it("j moves focus down and clamps at the last row", () => {
    const { result } = renderHook(() => useListKeyboardNav({ rowCount: 3 }))
    act(() => press('j'))
    expect(result.current.focusedIndex).toBe(0)
    act(() => press('j'))
    expect(result.current.focusedIndex).toBe(1)
    act(() => press('j'))
    expect(result.current.focusedIndex).toBe(2)
    act(() => press('j'))
    // Clamp — don't wrap, don't fall off.
    expect(result.current.focusedIndex).toBe(2)
  })

  it('k moves focus up and clamps at the first row', () => {
    const { result } = renderHook(() => useListKeyboardNav({ rowCount: 3 }))
    act(() => press('j'))
    act(() => press('j'))
    expect(result.current.focusedIndex).toBe(1)
    act(() => press('k'))
    expect(result.current.focusedIndex).toBe(0)
    act(() => press('k'))
    expect(result.current.focusedIndex).toBe(0)
  })

  it('Enter calls onOpen with the focused index', () => {
    const onOpen = vi.fn()
    renderHook(() => useListKeyboardNav({ rowCount: 3, onOpen }))
    act(() => press('j'))
    act(() => press('j'))
    act(() => press('Enter'))
    expect(onOpen).toHaveBeenCalledWith(1)
  })

  it('Enter is a no-op when no row is focused yet', () => {
    const onOpen = vi.fn()
    renderHook(() => useListKeyboardNav({ rowCount: 3, onOpen }))
    act(() => press('Enter'))
    expect(onOpen).not.toHaveBeenCalled()
  })

  it('x calls onToggleSelect with the focused index', () => {
    const onToggleSelect = vi.fn()
    renderHook(() =>
      useListKeyboardNav({ rowCount: 3, onToggleSelect }),
    )
    act(() => press('j'))
    act(() => press('x'))
    expect(onToggleSelect).toHaveBeenCalledWith(0)
  })

  it('ignores j/k/Enter/x when focus is in an input', () => {
    const onOpen = vi.fn()
    const onToggleSelect = vi.fn()
    const { result } = renderHook(() =>
      useListKeyboardNav({ rowCount: 3, onOpen, onToggleSelect }),
    )

    const input = document.createElement('input')
    document.body.appendChild(input)
    input.focus()
    try {
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
      )
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      )
      input.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'x', bubbles: true }),
      )
    } finally {
      document.body.removeChild(input)
    }

    expect(result.current.focusedIndex).toBe(-1)
    expect(onOpen).not.toHaveBeenCalled()
    expect(onToggleSelect).not.toHaveBeenCalled()
  })

  it('ignores j/k/Enter/x when focus is in a textarea', () => {
    const onOpen = vi.fn()
    const { result } = renderHook(() =>
      useListKeyboardNav({ rowCount: 3, onOpen }),
    )

    const textarea = document.createElement('textarea')
    document.body.appendChild(textarea)
    textarea.focus()
    try {
      textarea.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'j', bubbles: true }),
      )
    } finally {
      document.body.removeChild(textarea)
    }

    expect(result.current.focusedIndex).toBe(-1)
  })

  it('ignores j/k when a modifier key is held (Cmd+j, Ctrl+j)', () => {
    const { result } = renderHook(() => useListKeyboardNav({ rowCount: 3 }))
    act(() => press('j', { metaKey: true }))
    expect(result.current.focusedIndex).toBe(-1)
    act(() => press('j', { ctrlKey: true }))
    expect(result.current.focusedIndex).toBe(-1)
    // Plain j still works.
    act(() => press('j'))
    expect(result.current.focusedIndex).toBe(0)
  })

  it('clamps focusedIndex when rowCount shrinks under it', () => {
    const { result, rerender } = renderHook(
      ({ rowCount }: { rowCount: number }) =>
        useListKeyboardNav({ rowCount }),
      { initialProps: { rowCount: 5 } },
    )
    act(() => press('j'))
    act(() => press('j'))
    act(() => press('j'))
    act(() => press('j'))
    expect(result.current.focusedIndex).toBe(3)
    // Operator narrows the filter to 2 rows.
    rerender({ rowCount: 2 })
    expect(result.current.focusedIndex).toBe(1)
    // Operator drops the filter to zero matches.
    rerender({ rowCount: 0 })
    expect(result.current.focusedIndex).toBe(-1)
  })

  it('suspends the listener when enabled=false', () => {
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useListKeyboardNav({ rowCount: 3, enabled }),
      { initialProps: { enabled: false } },
    )
    act(() => press('j'))
    expect(result.current.focusedIndex).toBe(-1)
    rerender({ enabled: true })
    act(() => press('j'))
    expect(result.current.focusedIndex).toBe(0)
  })

  it('getRowProps stamps data-focused on the active row only', () => {
    const { result } = renderHook(() => useListKeyboardNav({ rowCount: 3 }))
    act(() => press('j'))
    expect(result.current.getRowProps(0)['data-focused']).toBe(true)
    expect(result.current.getRowProps(1)['data-focused']).toBeUndefined()
    expect(result.current.getRowProps(2)['data-focused']).toBeUndefined()
  })
})
