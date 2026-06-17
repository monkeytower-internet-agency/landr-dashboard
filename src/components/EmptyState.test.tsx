// landr-s1mr — Component tests for the shared EmptyState card.
// landr-hxnb.5 — Extended with illustration slot + accentHue prop tests.
//
// Covers:
//   - Renders icon + title + optional description + testid.
//   - Celebratory tone applies the `data-tone` attribute (used by Approvals
//     to show the "all caught up" green variant).
//   - Action with onClick fires a button.
//   - Action with internal href renders a router Link.
//   - Action with external href renders an anchor with rel/target.
//   - illustration prop renders the illustration slot (not the icon) in card mode.
//   - illustration prop is ignored in compact mode (icon still renders).
//   - accentHue prop applies the correct hue class to the wrapper.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { CalendarIcon, PartyPopperIcon } from 'lucide-react'
import { describe, expect, it, vi } from 'vitest'

import { EmptyState } from './EmptyState'

function withRouter(ui: React.ReactElement) {
  return <MemoryRouter>{ui}</MemoryRouter>
}

describe('<EmptyState>', () => {
  it('renders the title, description, and testid; defaults to neutral tone', () => {
    render(
      withRouter(
        <EmptyState
          icon={CalendarIcon}
          title="No bookings yet"
          description="When a customer books, you will see them here."
          data-testid="bookings-empty"
        />,
      ),
    )
    const node = screen.getByTestId('bookings-empty')
    expect(node).toBeInTheDocument()
    expect(node.getAttribute('data-tone')).toBe('default')
    expect(
      screen.getByRole('heading', { name: /no bookings yet/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByText(/when a customer books/i),
    ).toBeInTheDocument()
  })

  it('renders the celebratory tone variant', () => {
    render(
      withRouter(
        <EmptyState
          icon={PartyPopperIcon}
          title="All caught up"
          tone="celebratory"
          data-testid="approvals-empty"
        />,
      ),
    )
    expect(screen.getByTestId('approvals-empty').getAttribute('data-tone')).toBe(
      'celebratory',
    )
  })

  it('fires the action onClick when the CTA button is clicked', async () => {
    const onClick = vi.fn()
    const user = userEvent.setup()
    render(
      withRouter(
        <EmptyState
          icon={CalendarIcon}
          title="No products yet"
          action={{ label: 'Create product', onClick }}
        />,
      ),
    )
    await user.click(screen.getByRole('button', { name: /create product/i }))
    expect(onClick).toHaveBeenCalledTimes(1)
  })

  it('renders an internal href as a router Link (relative href)', () => {
    render(
      withRouter(
        <EmptyState
          icon={CalendarIcon}
          title="No views yet"
          action={{ label: 'Go to views', href: '/views' }}
        />,
      ),
    )
    const link = screen.getByRole('link', { name: /go to views/i })
    expect(link.getAttribute('href')).toBe('/views')
    expect(link.getAttribute('target')).toBeNull()
  })

  it('renders an external href with target=_blank and rel safety', () => {
    render(
      withRouter(
        <EmptyState
          icon={CalendarIcon}
          title="Need help?"
          action={{ label: 'Read docs', href: 'https://docs.example.com' }}
        />,
      ),
    )
    const link = screen.getByRole('link', { name: /read docs/i })
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
  })

  it('renders the illustration slot instead of the icon in card mode', () => {
    render(
      withRouter(
        <EmptyState
          icon={CalendarIcon}
          illustration={<svg data-testid="test-scene" aria-hidden />}
          title="Illustrated empty"
          data-testid="card-with-illustration"
        />,
      ),
    )
    // The illustration should be present
    expect(screen.getByTestId('test-scene')).toBeInTheDocument()
    // The icon wrapper should NOT be rendered (it's replaced by the illustration)
    expect(
      screen.queryByRole('img', { hidden: true }),
    ).not.toBeInTheDocument()
  })

  it('ignores the illustration prop in compact mode (icon renders instead)', () => {
    render(
      withRouter(
        <EmptyState
          icon={CalendarIcon}
          illustration={<svg data-testid="compact-scene" aria-hidden />}
          title="Compact"
          size="compact"
          data-testid="compact-empty"
        />,
      ),
    )
    // In compact mode the scene is suppressed
    expect(screen.queryByTestId('compact-scene')).not.toBeInTheDocument()
    // The wrapper renders correctly
    expect(screen.getByTestId('compact-empty').getAttribute('data-size')).toBe('compact')
  })

  it('applies the hue-bookings soft-bg class when accentHue="bookings"', () => {
    render(
      withRouter(
        <EmptyState
          icon={CalendarIcon}
          title="Bookings"
          accentHue="bookings"
          data-testid="hue-test"
        />,
      ),
    )
    const node = screen.getByTestId('hue-test')
    expect(node.className).toMatch(/hue-bookings/)
  })
})
