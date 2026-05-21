// landr-8j1x — a11y sweep. Icon-only buttons must always carry an
// accessible name so screen readers can announce them on focus. This
// asserts the ThemeToggle's accessible-name (the visible icon swaps
// between sun + moon, which carry no semantic label on their own).

import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { ThemeToggle } from './ThemeToggle'
import { ThemeProvider } from '@/lib/theme'

describe('ThemeToggle a11y (landr-8j1x)', () => {
  it('exposes an aria-label since the trigger is icon-only', () => {
    render(
      <ThemeProvider>
        <ThemeToggle />
      </ThemeProvider>,
    )
    // The toggle has no visible text — getByRole('button') will fail
    // without an accessible name. Asserting via name regex pins the
    // contract that the label exists AND describes the action.
    const btn = screen.getByRole('button', { name: /switch to (light|dark)/i })
    expect(btn).toBeInTheDocument()
    expect(btn).toHaveAttribute('aria-label')
  })
})
