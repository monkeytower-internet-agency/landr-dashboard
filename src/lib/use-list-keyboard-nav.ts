// landr-euta — vim-style j/k row navigation for list/table surfaces.
//
// A table that opts in gets the following keyboard contract for free:
//   j        → move focus to the next row (wraps to first if at end? no:
//              clamps so the operator can't "fall off" the bottom and
//              accidentally trigger nothing on the next press)
//   k        → move focus to the previous row (clamps at the top)
//   Enter    → invoke onOpen(index) — opens the row's detail surface
//   x        → invoke onToggleSelect(index) — toggles bulk-select
//
// Why a hook instead of inlining the keydown listener in every table?
// Three tables (Bookings, Contacts, GeneralApprovals) want the same
// shortcuts and the same "ignore when typing into an input" guard. A
// shared hook keeps the listener logic, the editable-target check, and
// the auto-scroll-into-view behaviour in exactly one place.
//
// The hook installs a window-level keydown listener while at least one
// row exists. It deliberately does NOT scope the listener to a specific
// container — there is no obvious focusable wrapper for the table body
// (focus normally lives on the global filter input or nowhere), and
// requiring the operator to click a row first would defeat the point of
// "press j and start triaging". The editable-target guard (mirrors the
// '?' help dialog's guard in lib/keyboard-shortcuts-help-context) keeps
// j/k/x/Enter from stealing keystrokes inside form fields.
//
// Multiple instances on the same page (e.g. the dashboard with both a
// BookingsTable and a side panel) would each install their own listener
// and each move their own cursor on every press. We accept that today —
// the three target routes each render exactly one list — and revisit
// when a second list-bearing surface ships.
import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * True when the event target is a text-entry surface where j/k/x/Enter
 * should be treated as plain typing, not as a navigation shortcut.
 * Mirrors the editable-target check in keyboard-shortcuts-help-context
 * so the two global hot-key surfaces agree on what counts as "typing".
 */
function isEditableTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true
  if (target.isContentEditable) return true
  return false
}

export type UseListKeyboardNavOptions = {
  /**
   * Length of the visible row set. Pass the post-filter/post-sort length
   * so the cursor only walks rows the operator can actually see. When
   * the count drops below the current focusedIndex (e.g. the operator
   * narrows the filter) the index clamps to the new last row.
   */
  rowCount: number
  /** Invoked when the operator presses Enter on the focused row. */
  onOpen?: (index: number) => void
  /** Invoked when the operator presses 'x' on the focused row. */
  onToggleSelect?: (index: number) => void
  /**
   * Optional escape hatch — set false to suspend the listener (e.g.
   * while a modal that should own the keyboard is open). Defaults to
   * true. The listener is also a no-op when rowCount is 0.
   */
  enabled?: boolean
}

export type UseListKeyboardNavResult = {
  /** Currently focused row index, or -1 when no row has been focused yet. */
  focusedIndex: number
  /**
   * Attach to each row's container element. The hook stores the ref so
   * it can scroll the focused row into view, and stamps `data-focused`
   * so consumers can style the active row with a Tailwind variant.
   */
  getRowProps: (index: number) => {
    ref: (el: HTMLElement | null) => void
    'data-focused': boolean | undefined
  }
}

/**
 * Hook: window-level j/k row navigation + Enter/x action keys.
 *
 * Usage (in a table component):
 *
 * ```tsx
 * const nav = useListKeyboardNav({
 *   rowCount: rows.length,
 *   onOpen: (i) => onRowClick(rows[i]),
 *   onToggleSelect: (i) => toggleSelected(rows[i].id),
 * })
 *
 * return rows.map((row, i) => (
 *   <TableRow
 *     key={row.id}
 *     {...nav.getRowProps(i)}
 *     data-focused={nav.focusedIndex === i || undefined}
 *     className="data-[focused]:bg-muted/60"
 *   />
 * ))
 * ```
 */
export function useListKeyboardNav({
  rowCount,
  onOpen,
  onToggleSelect,
  enabled = true,
}: UseListKeyboardNavOptions): UseListKeyboardNavResult {
  const [rawFocusedIndex, setFocusedIndex] = useState<number>(-1)
  // Refs to each row DOM node so we can scrollIntoView when the cursor
  // moves. A Map keyed by row index keeps this O(1) without forcing the
  // table to wire a single ref through every row.
  const rowRefs = useRef<Map<number, HTMLElement>>(new Map())

  // Derive the visible-bounds-clamped index during render so a shrinking
  // row set (filter narrowed, row deleted) doesn't strand the cursor on
  // a row that no longer exists. We deliberately do NOT setState inside
  // an effect here — React Compiler / react-hooks/set-state-in-effect
  // flags that as a cascading re-render. Computing during render keeps
  // the "displayed focus" honest without an extra render pass; the raw
  // state catches up when the next keypress lands.
  const focusedIndex: number =
    rowCount === 0
      ? -1
      : rawFocusedIndex < 0
        ? -1
        : Math.min(rawFocusedIndex, rowCount - 1)

  // Re-bind the window listener whenever the closed-over values change.
  // The cost is a single add/removeEventListener pair per keypress, which
  // is negligible — and it sidesteps the React Compiler complaints about
  // ref mutation during render (react-hooks/refs) and setState in
  // effects (react-hooks/set-state-in-effect) that the stale-closure
  // workarounds would otherwise trip.
  useEffect(() => {
    if (!enabled || rowCount === 0) return
    function handler(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return
      if (isEditableTarget(event.target)) return

      const key = event.key
      if (key === 'j') {
        event.preventDefault()
        setFocusedIndex((prev) => {
          // Clamp the previous value against the live row count before
          // stepping — protects against the focused index lagging a
          // shrinking row set by one render.
          const start =
            prev < 0 ? -1 : Math.min(prev, rowCount - 1)
          if (start < 0) return 0
          return Math.min(start + 1, rowCount - 1)
        })
        return
      }
      if (key === 'k') {
        event.preventDefault()
        setFocusedIndex((prev) => {
          const start =
            prev < 0 ? -1 : Math.min(prev, rowCount - 1)
          if (start < 0) return 0
          return Math.max(start - 1, 0)
        })
        return
      }
      if (key === 'Enter') {
        if (focusedIndex < 0) return
        // Only preventDefault when our cursor actually owns a row;
        // otherwise we'd swallow Enter on unrelated focused buttons.
        event.preventDefault()
        onOpen?.(focusedIndex)
        return
      }
      if (key === 'x' || key === 'X') {
        if (focusedIndex < 0) return
        event.preventDefault()
        onToggleSelect?.(focusedIndex)
        return
      }
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [enabled, rowCount, focusedIndex, onOpen, onToggleSelect])

  // Auto-scroll the focused row into view. `block: 'nearest'` keeps the
  // viewport stable when the row is already visible (no jitter) and
  // scrolls minimally otherwise. We deliberately skip the initial -1
  // case so we don't scroll on mount.
  useEffect(() => {
    if (focusedIndex < 0) return
    const el = rowRefs.current.get(focusedIndex)
    if (!el) return
    // jsdom's scrollIntoView is stubbed in test/setup.ts so tests can
    // safely exercise this path without throwing.
    el.scrollIntoView({ block: 'nearest', inline: 'nearest' })
  }, [focusedIndex])

  const getRowProps = useCallback(
    (index: number) => ({
      ref: (el: HTMLElement | null) => {
        if (el) rowRefs.current.set(index, el)
        else rowRefs.current.delete(index)
      },
      'data-focused':
        focusedIndex === index ? (true as const) : (undefined as undefined),
    }),
    [focusedIndex],
  )

  return { focusedIndex, getRowProps }
}
