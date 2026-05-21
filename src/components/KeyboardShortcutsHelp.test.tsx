// landr-kwu9 — global '?' keyboard shortcuts cheat sheet tests.
//
// Covers the four guarantees:
//   - '?' from anywhere on the page opens the cheat-sheet dialog.
//   - Escape closes it.
//   - '?' is ignored when the user is typing into an input/textarea
//     (or any contenteditable surface), so the operator can type '?' into
//     a note without stealing the keypress.
//   - The dialog enumerates the documented shortcuts (Cmd+K, ?, Esc).
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { KeyboardShortcutsHelp } from './KeyboardShortcutsHelp'
import {
  KeyboardShortcutsHelpProvider,
  useKeyboardShortcutsHelp,
} from '@/lib/keyboard-shortcuts-help-context'

// Convenience opener for tests that want to assert on a pre-opened
// dialog without going through the keydown listener.
function OpenButton() {
  const { setOpen } = useKeyboardShortcutsHelp()
  return (
    <button type="button" onClick={() => setOpen(true)}>
      open help
    </button>
  )
}

// A text input rendered inside the provider scope so we can verify the
// '?' keypress is swallowed when the input is focused.
function FocusedInput() {
  return <input data-testid="note-input" type="text" />
}

function renderHelp() {
  return render(
    <KeyboardShortcutsHelpProvider>
      <OpenButton />
      <FocusedInput />
      <KeyboardShortcutsHelp />
    </KeyboardShortcutsHelpProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe("KeyboardShortcutsHelp — '?' hot-key", () => {
  it('is closed by default', () => {
    renderHelp()
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("opens on '?' from a non-editable surface", async () => {
    const user = userEvent.setup()
    renderHelp()
    // Ensure focus is on document.body (no editable target).
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    await user.keyboard('?')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
  })

  it("toggles closed when '?' fires while open", async () => {
    const user = userEvent.setup()
    renderHelp()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    await user.keyboard('?')
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('?')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('closes on Escape', async () => {
    const user = userEvent.setup()
    renderHelp()
    await user.click(screen.getByText('open help'))
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await user.keyboard('{Escape}')
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it("ignores '?' when typing into an input", async () => {
    const user = userEvent.setup()
    renderHelp()
    const input = screen.getByTestId('note-input')
    await user.click(input)
    expect(input).toHaveFocus()
    await user.keyboard('?')
    // The dialog must NOT open — the '?' should be plain text input.
    expect(screen.queryByRole('dialog')).toBeNull()
    // And the keypress should have landed in the input.
    expect((input as HTMLInputElement).value).toBe('?')
  })

  it("ignores Cmd+? / Ctrl+? (those are reserved for the browser/OS)", async () => {
    const user = userEvent.setup()
    renderHelp()
    ;(document.activeElement as HTMLElement | null)?.blur?.()
    await user.keyboard('{Meta>}?{/Meta}')
    expect(screen.queryByRole('dialog')).toBeNull()
    await user.keyboard('{Control>}?{/Control}')
    expect(screen.queryByRole('dialog')).toBeNull()
  })
})

describe('KeyboardShortcutsHelp — sheet contents', () => {
  it('renders the documented shortcuts grouped by category', async () => {
    const user = userEvent.setup()
    renderHelp()
    await user.click(screen.getByText('open help'))
    const dialog = await screen.findByRole('dialog')

    // The three group headings must be present.
    expect(dialog).toHaveTextContent(/global/i)
    expect(dialog).toHaveTextContent(/dialogs/i)
    expect(dialog).toHaveTextContent(/navigation/i)

    // Every documented key glyph should render somewhere in the dialog.
    const kbdGlyphs = Array.from(dialog.querySelectorAll('kbd')).map(
      (el) => (el.textContent ?? '').trim(),
    )
    expect(kbdGlyphs).toEqual(
      expect.arrayContaining(['Cmd', 'Ctrl', 'K', '?', 'B', 'Esc']),
    )

    // And the descriptions cover the four guarantees from the briefing.
    expect(dialog).toHaveTextContent(/command palette/i)
    expect(dialog).toHaveTextContent(/shortcuts sheet/i)
    expect(dialog).toHaveTextContent(/sidebar/i)
    expect(dialog).toHaveTextContent(/close any open dialog/i)
  })
})
