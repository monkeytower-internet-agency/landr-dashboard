// landr-fx2i — PageTitleDisplay renders one of three modes based on
// what the active route declared via <PageTitle/>:
//   - empty   → renders nothing (no h1, no breadcrumb)
//   - title   → plain <h1>
//   - crumbs  → breadcrumb <nav> with parent links + final text segment
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { Button } from '@/components/ui/button'
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

// landr-3qkr.1 — on phones the title cluster must STACK: the title/breadcrumb
// row on top, the primary-action row beneath it (full-width), rather than the
// desktop side-by-side layout that overflows a 360px topbar. jsdom doesn't run
// CSS media queries, so these smoke tests assert on the responsive class
// contract (the column→row switch is gated on `md:`) plus the action being
// rendered and reachable. The breakpoint is the shared 768px `md`.
describe('PageTitleDisplay — mobile stacking (landr-3qkr.1)', () => {
  it('title mode: outer cluster stacks (flex-col) below md, row from md up', () => {
    renderShell(
      <PageTitle
        title="Bookings"
        action={<Button>New booking</Button>}
      />,
    )
    const action = screen.getByTestId('page-title-action')
    // The action's parent is the outer title cluster.
    const cluster = action.parentElement as HTMLElement
    expect(cluster.className).toContain('flex-col')
    expect(cluster.className).toContain('md:flex-row')
  })

  it('breadcrumb mode: outer cluster stacks (flex-col) below md, row from md up', () => {
    renderShell(
      <PageTitle
        crumbs={[{ label: 'Settings', to: '/settings' }, { label: 'Products' }]}
        action={<Button>New product</Button>}
      />,
    )
    const action = screen.getByTestId('page-title-action')
    const cluster = action.parentElement as HTMLElement
    expect(cluster.className).toContain('flex-col')
    expect(cluster.className).toContain('md:flex-row')
  })

  it('action goes full-width on mobile (w-full) and auto-width from md up', () => {
    renderShell(
      <PageTitle title="Bookings" action={<Button>New booking</Button>} />,
    )
    const action = screen.getByTestId('page-title-action')
    // Wrapper fills the row on mobile, reverts to auto/shrink-0 from md.
    expect(action.className).toContain('w-full')
    expect(action.className).toContain('md:w-auto')
    // …and the child button itself stretches full-width on mobile (≥44px
    // tap target) but not on desktop.
    expect(action.className).toContain('[&>*]:w-full')
    expect(action.className).toContain('md:[&>*]:w-auto')
    // The action's content is actually present + reachable.
    expect(
      screen.getByRole('button', { name: /new booking/i }),
    ).toBeInTheDocument()
  })

  it('renders no action wrapper when no action is declared', () => {
    renderShell(<PageTitle title="Bookings" />)
    expect(screen.queryByTestId('page-title-action')).toBeNull()
  })
})
