// landr-11d5 — search-highlight utility. When the user filters via a
// free-text search input on Bookings/Contacts tables, we want to wrap
// the matching substring inside each visible cell in a soft-yellow
// <mark>. Case-insensitive, escape regex special chars, return the
// raw text untouched when there is no query (so consumers don't pay
// a render cost for an unfiltered table).

import type { ReactNode } from 'react'

// landr-11d5 — escape any regex special chars from the user's query so a
// stray '.' or '(' doesn't turn into a wildcard or syntax error. Source:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Guide/Regular_expressions#escaping
function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Wrap every case-insensitive match of `query` inside `text` in a
 * `<mark>` styled with bg-yellow-200/40 (soft yellow). Returns the
 * raw text unchanged when the query is null, empty, or whitespace —
 * callers can use this for every cell without an extra guard.
 *
 * @example
 *   highlightMatch('Alice Cooper', 'ali')
 *   // => ['', <mark>Ali</mark>, 'ce Cooper']
 */
export function highlightMatch(
  text: string,
  query: string | null,
): ReactNode {
  if (!query) return text
  const trimmed = query.trim()
  if (!trimmed) return text
  if (!text) return text

  const pattern = new RegExp(`(${escapeRegex(trimmed)})`, 'gi')
  const parts = text.split(pattern)
  // split with a capturing group yields [before, match, after, match, ...].
  // Even indices are non-matching, odd indices are matches.
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <mark
        key={i}
        className="rounded bg-yellow-200/40 px-0.5 dark:bg-yellow-500/30"
      >
        {part}
      </mark>
    ) : (
      part
    ),
  )
}
