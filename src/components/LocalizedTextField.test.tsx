/**
 * LocalizedTextField unit tests (landr-14s4) — locale tab switching, the
 * override badge, the empty-strip behaviour, and the inherits hint.
 */
import { useState } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { LocalizedTextField } from './LocalizedTextField'

// Controlled harness — mirrors how the form callsites wire the component
// (own the base + localized state, forward onChange). Exposes the latest
// localized object to assertions via the spy.
function Harness({
  initialBase = '',
  initialLocalized = null,
  multiline = false,
  onChange,
}: {
  initialBase?: string
  initialLocalized?: Record<string, string> | null
  multiline?: boolean
  onChange?: (base: string, localized: Record<string, string> | null) => void
}) {
  const [base, setBase] = useState(initialBase)
  const [localized, setLocalized] = useState<Record<string, string> | null>(
    initialLocalized,
  )
  return (
    <LocalizedTextField
      label="Name"
      multiline={multiline}
      base={base}
      localized={localized}
      onChange={(b, l) => {
        setBase(b)
        setLocalized(l)
        onChange?.(b, l)
      }}
    />
  )
}

describe('LocalizedTextField (landr-14s4)', () => {
  it('shows the base editor first and switches to the DE override tab', async () => {
    const user = userEvent.setup()
    render(<Harness initialBase="Courses" />)

    // Base editor is visible and carries the field aria-label.
    const baseInput = screen.getByTestId('locale-input-base') as HTMLInputElement
    expect(baseInput.value).toBe('Courses')
    // DE override editor is not mounted until its tab is selected.
    expect(screen.queryByTestId('locale-input-de')).not.toBeInTheDocument()

    await user.click(screen.getByTestId('locale-tab-de'))

    // DE editor now visible, empty, with the inherits hint.
    expect(screen.getByTestId('locale-input-de')).toBeInTheDocument()
    expect(screen.getByTestId('locale-inherits-hint-de')).toBeInTheDocument()
    expect(screen.queryByTestId('locale-input-base')).not.toBeInTheDocument()
  })

  it('shows an override badge only for locales that carry a translation', () => {
    render(
      <Harness
        initialBase="Courses"
        initialLocalized={{ de: 'Kurse' }}
      />,
    )
    // DE has an override → badge present.
    expect(
      screen.getByTestId('locale-override-badge-de'),
    ).toBeInTheDocument()
  })

  it('does not render the badge when the DE override is absent', () => {
    render(<Harness initialBase="Courses" />)
    expect(
      screen.queryByTestId('locale-override-badge-de'),
    ).not.toBeInTheDocument()
  })

  it('stores a non-empty DE override and surfaces the badge', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<Harness initialBase="Courses" onChange={onChange} />)

    await user.click(screen.getByTestId('locale-tab-de'))
    await user.type(screen.getByTestId('locale-input-de'), 'Kurse')

    // Last onChange call carries the DE override in the localized map.
    const [, lastLocalized] = onChange.mock.calls.at(-1)!
    expect(lastLocalized).toEqual({ de: 'Kurse' })
    // Badge now shows on the DE tab; inherits hint is gone.
    expect(screen.getByTestId('locale-override-badge-de')).toBeInTheDocument()
    expect(
      screen.queryByTestId('locale-inherits-hint-de'),
    ).not.toBeInTheDocument()
  })

  it('strips an emptied DE override to null (absent key) so the base fallback works', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Harness
        initialBase="Courses"
        initialLocalized={{ de: 'Kurse' }}
        onChange={onChange}
      />,
    )

    await user.click(screen.getByTestId('locale-tab-de'))
    await user.clear(screen.getByTestId('locale-input-de'))

    // Clearing the only override yields null (no empty-string key stored).
    const [, lastLocalized] = onChange.mock.calls.at(-1)!
    expect(lastLocalized).toBeNull()
    // Inherits hint returns; badge disappears.
    expect(screen.getByTestId('locale-inherits-hint-de')).toBeInTheDocument()
    expect(
      screen.queryByTestId('locale-override-badge-de'),
    ).not.toBeInTheDocument()
  })

  it('editing the base value preserves existing overrides (stripped)', async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(
      <Harness
        initialBase="Course"
        initialLocalized={{ de: 'Kurs' }}
        onChange={onChange}
      />,
    )

    await user.type(screen.getByTestId('locale-input-base'), 's')

    const [lastBase, lastLocalized] = onChange.mock.calls.at(-1)!
    expect(lastBase).toBe('Courses')
    expect(lastLocalized).toEqual({ de: 'Kurs' })
  })

  it('renders a textarea when multiline is set', async () => {
    const user = userEvent.setup()
    render(<Harness initialBase="Long body" multiline />)
    expect(
      screen.getByTestId('locale-input-base').tagName.toLowerCase(),
    ).toBe('textarea')
    await user.click(screen.getByTestId('locale-tab-de'))
    expect(
      screen.getByTestId('locale-input-de').tagName.toLowerCase(),
    ).toBe('textarea')
  })
})
