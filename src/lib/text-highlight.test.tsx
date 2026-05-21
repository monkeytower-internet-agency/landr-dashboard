// landr-11d5 — coverage for the highlight utility used by
// Bookings/Contacts tables. Render to a real DOM via React
// Testing Library so we exercise the actual <mark> tree rather than
// the implementation detail of split-with-capture.

import { render } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { highlightMatch } from './text-highlight'

function renderToHtml(node: ReturnType<typeof highlightMatch>): string {
  const { container } = render(<>{node}</>)
  return container.innerHTML
}

describe('highlightMatch', () => {
  it('returns the text unchanged when query is null', () => {
    expect(renderToHtml(highlightMatch('Alice Cooper', null))).toBe(
      'Alice Cooper',
    )
  })

  it('returns the text unchanged when query is empty or whitespace', () => {
    expect(renderToHtml(highlightMatch('Alice Cooper', ''))).toBe(
      'Alice Cooper',
    )
    expect(renderToHtml(highlightMatch('Alice Cooper', '   '))).toBe(
      'Alice Cooper',
    )
  })

  it('wraps a case-insensitive match in a yellow <mark>', () => {
    const html = renderToHtml(highlightMatch('Alice Cooper', 'ali'))
    expect(html).toContain('<mark')
    expect(html).toContain('bg-yellow-200/40')
    // The matched substring keeps the original casing.
    expect(html).toContain('>Ali</mark>')
    // Surrounding text is preserved.
    expect(html).toContain('ce Cooper')
  })

  it('highlights every occurrence in the text', () => {
    const { container } = render(
      <>{highlightMatch('banana bandana', 'an')}</>,
    )
    const marks = container.querySelectorAll('mark')
    // 'banana' has 2 'an's, 'bandana' has 2 'an's → 4 total.
    expect(marks).toHaveLength(4)
  })

  it('escapes regex special chars in the query', () => {
    // '.' would otherwise match any char — must be treated literally.
    // Only the literal '.' in 'a.b' should match; 'a-b' and 'axb' must not.
    const { container } = render(<>{highlightMatch('a.b a-b axb', '.')}</>)
    const marks = container.querySelectorAll('mark')
    expect(marks).toHaveLength(1)
    expect(marks[0]?.textContent).toBe('.')
    // Surrounding text on either side of the literal '.' is preserved.
    expect(container.textContent).toBe('a.b a-b axb')
  })
})
