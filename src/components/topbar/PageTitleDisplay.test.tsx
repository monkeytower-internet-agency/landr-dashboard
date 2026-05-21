// landr-fx2i — PageTitleDisplay renders one of three modes based on
// what the active route declared via <PageTitle/>:
//   - empty   → renders nothing (no h1, no breadcrumb)
//   - title   → plain <h1>
//   - crumbs  → breadcrumb <nav> with parent links + final text segment
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { PageTitle, PageTitleProvider } from '@/lib/page-title'
import { PageTitleDisplay } from './PageTitleDisplay'

function renderShell(children: React.ReactNode) {
  return render(
    <MemoryRouter>
      <PageTitleProvider>
        {children}
        <PageTitleDisplay />
      </PageTitleProvider>
    </MemoryRouter>,
  )
}

describe('PageTitleDisplay (landr-fx2i)', () => {
  it('renders nothing when no title or crumbs are declared', () => {
    const { container } = renderShell(null)
    // The provider + display + memory-router still render wrapper DOM,
    // but the display itself should be empty.
    expect(screen.queryByRole('heading')).toBeNull()
    expect(screen.queryByRole('navigation', { name: /breadcrumb/i })).toBeNull()
    // PageTitleDisplay returns null entirely; the only thing inside is
    // its provider wrapper (no h1, no nav).
    expect(container.querySelector('h1')).toBeNull()
    expect(container.querySelector('nav')).toBeNull()
  })

  it('renders plain title as <h1> when only `title` is declared', () => {
    renderShell(<PageTitle title="Bookings" />)
    const h1 = screen.getByRole('heading', { level: 1 })
    expect(h1.textContent).toBe('Bookings')
  })

  it('renders breadcrumb when `crumbs` are declared (parent link + final text)', () => {
    renderShell(
      <PageTitle
        crumbs={[
          { label: 'Settings', to: '/settings' },
          { label: 'Products', to: '/settings/products' },
          { label: 'Hot Air Balloon Day' },
        ]}
      />,
    )

    // Breadcrumb nav exists.
    const nav = screen.getByRole('navigation', { name: /breadcrumb/i })
    expect(nav).toBeInTheDocument()

    // Parent segments are clickable <a>.
    const settingsLink = screen.getByRole('link', { name: 'Settings' })
    expect(settingsLink).toHaveAttribute('href', '/settings')
    const productsLink = screen.getByRole('link', { name: 'Products' })
    expect(productsLink).toHaveAttribute('href', '/settings/products')

    // Last segment is plain text — NOT a link — and marked aria-current.
    expect(
      screen.queryByRole('link', { name: 'Hot Air Balloon Day' }),
    ).toBeNull()
    const last = screen.getByText('Hot Air Balloon Day')
    expect(last).toHaveAttribute('aria-current', 'page')

    // No <h1> is rendered in breadcrumb mode (we don't double up).
    expect(screen.queryByRole('heading', { level: 1 })).toBeNull()
  })

  it('crumbs without `to` render as plain text even when not last', () => {
    // Pinned: a parent crumb without a `to` is still text-only — we
    // don't want to render an <a> with no href and a misleading hover
    // affordance.
    renderShell(
      <PageTitle
        crumbs={[
          { label: 'Settings' /* no `to` */ },
          { label: 'Pricing' },
        ]}
      />,
    )
    expect(screen.queryByRole('link', { name: 'Settings' })).toBeNull()
    expect(screen.getByText('Settings')).toBeInTheDocument()
  })
})
