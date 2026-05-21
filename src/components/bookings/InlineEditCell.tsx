// landr-n2j2 — Inline-edit primitive for table cells.
//
// One click on the display surface flips the cell into edit mode. The control
// (dropdown / date input) takes focus; Enter commits, Escape reverts,
// blur commits. The actual write is supplied by the caller (`onCommit`)
// because the cell doesn't know which endpoint to hit — it just owns the
// view <-> edit toggle + keyboard contract.
//
// Cell click MUST NOT bubble to the surrounding row click handler (which
// opens BookingDetailSheet) — the wrapping <span> stops propagation for
// both pointer + key events.

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type KeyboardEvent,
  type ReactElement,
  type ReactNode,
} from 'react'

import { NativeSelect } from '@/components/ui/native-select'
import { Input } from '@/components/ui/input'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'

export type InlineEditOption = {
  value: string
  label: string
}

type CommonProps = {
  /** Rendered while not editing. Clicking it flips to edit mode. */
  display: ReactNode
  /** Edit hint shown on the wrapping span — read by screen readers. */
  ariaLabel: string
  /** Test id seed; the wrapper exposes `<seed>-display` and `<seed>-edit`. */
  testId?: string
  /** When true, the cell renders the display only — no click handlers. */
  readOnly?: boolean
  className?: string
}

type SelectProps = CommonProps & {
  kind: 'select'
  value: string
  options: ReadonlyArray<InlineEditOption>
  onCommit: (next: string) => void | Promise<void>
}

type DateProps = CommonProps & {
  kind: 'date'
  /** ISO YYYY-MM-DD or empty string for "no date". */
  value: string
  onCommit: (next: string) => void | Promise<void>
  /** Optional native min/max bounds passed to the date input. */
  min?: string
  max?: string
}

export type InlineEditCellProps = SelectProps | DateProps

/**
 * View / edit toggle for a single table cell.
 *
 * - Click display → editor mounts with focus.
 * - Enter or blur → commit (only if value changed; equal values are a no-op).
 * - Escape → revert + exit edit mode without firing onCommit.
 *
 * The caller's `onCommit` should handle optimistic UI + rollback (the
 * inline-edit booking-write hook below wires the canonical pattern).
 */
export function InlineEditCell(props: InlineEditCellProps): ReactElement {
  const { display, ariaLabel, testId, readOnly, className } = props
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<string>(props.value)
  // Refs for select / input so we can focus on mount and read the current
  // draft value on blur without React re-render races.
  const selectRef = useRef<HTMLSelectElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  // No upstream-resync effect: the draft only matters while editing, and
  // `enterEdit` always re-seeds it from the latest props.value. Avoiding
  // the effect side-steps the react-hooks/set-state-in-effect rule and the
  // cascading-render hazard it flags. A server invalidation that lands
  // while the cell is in edit mode will be re-applied on the next
  // enterEdit; live-overwriting an in-progress edit would be more
  // surprising than dropping the in-flight server value.

  // Auto-focus the editor when entering edit mode.
  useEffect(() => {
    if (!editing) return
    if (props.kind === 'select') selectRef.current?.focus()
    else inputRef.current?.focus()
  }, [editing, props.kind])

  const enterEdit = useCallback(() => {
    if (readOnly) return
    setDraft(props.value)
    setEditing(true)
  }, [readOnly, props.value])

  const cancelEdit = useCallback(() => {
    setDraft(props.value)
    setEditing(false)
  }, [props.value])

  const commitEdit = useCallback(
    (next: string) => {
      setEditing(false)
      // No-op when the value didn't actually change — keeps the optimistic
      // cache + audit log quiet.
      if (next === props.value) return
      void props.onCommit(next)
    },
    [props],
  )

  function onKeyDownDisplay(e: KeyboardEvent<HTMLSpanElement>): void {
    if (readOnly) return
    // Enter / Space act as "click" on the display wrapper for keyboard users.
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      e.stopPropagation()
      enterEdit()
    }
  }

  function onKeyDownEditor(
    e: KeyboardEvent<HTMLSelectElement | HTMLInputElement>,
  ): void {
    e.stopPropagation()
    if (e.key === 'Escape') {
      e.preventDefault()
      cancelEdit()
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const value =
        props.kind === 'select'
          ? selectRef.current?.value ?? draft
          : inputRef.current?.value ?? draft
      commitEdit(value)
    }
  }

  if (!editing || readOnly) {
    return (
      <span
        role={readOnly ? undefined : 'button'}
        tabIndex={readOnly ? undefined : 0}
        onClick={(e) => {
          if (readOnly) return
          e.stopPropagation()
          enterEdit()
        }}
        onKeyDown={onKeyDownDisplay}
        aria-label={readOnly ? undefined : ariaLabel}
        title={readOnly ? undefined : t.bookings.inlineEdit.clickToEdit}
        data-testid={testId ? `${testId}-display` : undefined}
        className={cn(
          !readOnly &&
            'hover:bg-accent/40 focus-visible:bg-accent/40 cursor-pointer rounded px-1 -mx-1',
          className,
        )}
      >
        {display}
      </span>
    )
  }

  if (props.kind === 'select') {
    return (
      <span
        className="inline-block min-w-[10rem]"
        onClick={(e) => e.stopPropagation()}
        data-testid={testId ? `${testId}-edit` : undefined}
      >
        <NativeSelect
          ref={selectRef}
          value={draft}
          onChange={(e: ChangeEvent<HTMLSelectElement>) => {
            // Commit on change for selects — the dropdown's own value-change
            // is the user signal; blur isn't always reliable cross-browser.
            const next = e.currentTarget.value
            setDraft(next)
            commitEdit(next)
          }}
          onBlur={() => {
            // If the user tabs away without changing, just exit edit mode.
            if (draft === props.value) {
              setEditing(false)
              return
            }
            commitEdit(draft)
          }}
          onKeyDown={onKeyDownEditor}
          aria-label={ariaLabel}
        >
          {props.options.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </NativeSelect>
      </span>
    )
  }

  // date
  return (
    <span
      className="inline-block"
      onClick={(e) => e.stopPropagation()}
      data-testid={testId ? `${testId}-edit` : undefined}
    >
      <Input
        ref={inputRef}
        type="date"
        value={draft}
        min={props.min}
        max={props.max}
        onChange={(e: ChangeEvent<HTMLInputElement>) => {
          setDraft(e.currentTarget.value)
        }}
        onBlur={() => commitEdit(draft)}
        onKeyDown={onKeyDownEditor}
        aria-label={ariaLabel}
        className="h-8 w-[10rem] text-sm"
      />
    </span>
  )
}
