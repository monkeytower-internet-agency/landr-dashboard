// landr-kwu9 — global '?' keyboard shortcuts cheat sheet.
//
// A single shadcn Dialog enumerating every globally-bound shortcut so the
// operator can discover Cmd+K, sidebar toggle, etc. without reading docs.
// Open state lives in KeyboardShortcutsHelpProvider (the '?' window
// listener is installed there; see lib/keyboard-shortcuts-help-context).
// AppShell mounts the provider + this dialog at the protected-shell level
// so the hot-key works from every route.
//
// We deliberately keep the data table here (rather than scraping listeners
// dynamically) — the cheat sheet is operator-facing documentation: a code
// search for any shortcut should hit this file first, and adding a new
// shortcut should be a two-line change here + a real implementation
// elsewhere.
import { Fragment } from 'react'

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { useKeyboardShortcutsHelp } from '@/lib/keyboard-shortcuts-help-context'
import { t } from '@/lib/strings'

// A single visible key glyph (e.g. "K" or "Esc"). Rendered as <kbd> so
// assistive tech announces it as a key and so it stays styled when copied.
function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-6 min-w-6 items-center justify-center rounded border bg-muted px-1.5 font-mono text-xs font-medium text-muted-foreground shadow-sm">
      {children}
    </kbd>
  )
}

// A chord is an array of strings: ['Cmd', 'K'] renders as "Cmd + K".
// We render the '+' separator outside the <kbd> so screen readers don't
// announce a literal plus inside the key glyph.
function Chord({ keys }: { keys: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {keys.map((key, idx) => (
        <Fragment key={`${key}-${idx}`}>
          {idx > 0 ? (
            <span aria-hidden className="text-xs text-muted-foreground">
              +
            </span>
          ) : null}
          <Kbd>{key}</Kbd>
        </Fragment>
      ))}
    </span>
  )
}

type Shortcut = {
  // Array-of-chords: the outer array is "either of these key combos works"
  // (e.g. Cmd+K _or_ Ctrl+K). The inner array is the chord itself.
  chords: string[][]
  description: string
}

type ShortcutGroup = {
  heading: string
  shortcuts: Shortcut[]
}

// Source of truth for every globally-bound shortcut. When you add a new
// global key handler anywhere in the app, mirror it here. Listed by
// frequency-of-use rather than alphabetically — the most useful row first
// inside each group.
const GROUPS: ShortcutGroup[] = [
  {
    heading: t.keyboardShortcuts.groupGlobal,
    shortcuts: [
      {
        // landr-wmsc — command palette accepts either Cmd+K (macOS) or
        // Ctrl+K (every other platform).
        chords: [
          ['Cmd', 'K'],
          ['Ctrl', 'K'],
        ],
        description: t.keyboardShortcuts.shortcuts.commandPalette,
      },
      {
        chords: [['?']],
        description: t.keyboardShortcuts.shortcuts.keyboardHelp,
      },
      {
        // Sidebar toggle is installed by the shadcn sidebar primitive
        // (src/components/ui/sidebar.tsx: SIDEBAR_KEYBOARD_SHORTCUT='b').
        chords: [
          ['Cmd', 'B'],
          ['Ctrl', 'B'],
        ],
        description: t.keyboardShortcuts.shortcuts.toggleSidebar,
      },
    ],
  },
  {
    heading: t.keyboardShortcuts.groupDialogs,
    shortcuts: [
      {
        chords: [['Esc']],
        description: t.keyboardShortcuts.shortcuts.closeOverlay,
      },
    ],
  },
  {
    heading: t.keyboardShortcuts.groupNavigation,
    shortcuts: [
      {
        // Calendar prev/next is driven by FullCalendar's toolbar buttons;
        // we document it here so operators know where to look.
        chords: [['←'], ['→']],
        description: t.keyboardShortcuts.shortcuts.calendarPrevNext,
      },
      {
        chords: [['Enter']],
        description: t.keyboardShortcuts.shortcuts.sortColumn,
      },
    ],
  },
]

export function KeyboardShortcutsHelp() {
  const { open, setOpen } = useKeyboardShortcutsHelp()

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t.keyboardShortcuts.dialogTitle}</DialogTitle>
          <DialogDescription>
            {t.keyboardShortcuts.dialogDescription}
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-6">
          {GROUPS.map((group) => (
            <section
              key={group.heading}
              aria-labelledby={`kbd-help-group-${group.heading}`}
            >
              <h3
                id={`kbd-help-group-${group.heading}`}
                className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground"
              >
                {group.heading}
              </h3>
              <ul className="flex flex-col gap-2">
                {group.shortcuts.map((shortcut) => (
                  <li
                    key={shortcut.description}
                    className="flex items-center justify-between gap-4"
                  >
                    <span className="text-sm">{shortcut.description}</span>
                    <span className="flex items-center gap-2">
                      {shortcut.chords.map((chord, idx) => (
                        <Fragment key={chord.join('+')}>
                          {idx > 0 ? (
                            <span className="text-xs text-muted-foreground">
                              /
                            </span>
                          ) : null}
                          <Chord keys={chord} />
                        </Fragment>
                      ))}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  )
}
