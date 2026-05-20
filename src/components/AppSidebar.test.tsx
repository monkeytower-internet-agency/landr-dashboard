import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'

import { AppSidebar } from './AppSidebar'
import { SidebarProvider } from '@/components/ui/sidebar'

// landr-sydf — Products is no longer a top-level sidebar item. The
// assertions below pin both the removal (no Products top-level link) and
// the daily-use cluster that should still be there.
function renderSidebar() {
  return render(
    <MemoryRouter>
      <SidebarProvider>
        <AppSidebar />
      </SidebarProvider>
    </MemoryRouter>,
  )
}

describe('AppSidebar (landr-sydf)', () => {
  it('does NOT render a top-level Products entry', () => {
    renderSidebar()
    // shadcn Sidebar renders multiple visual variants (off-canvas + mobile
    // sheet); both list the same primaryItems. Querying the full document
    // for links + de-duping by href gives a stable assertion regardless of
    // which variant is mounted in jsdom.
    const links = screen.queryAllByRole('link')
    const hrefs = new Set(
      links.map((a) => a.getAttribute('href')).filter(Boolean),
    )
    expect(hrefs.has('/products')).toBe(false)
    // /settings is fine as a top-level nav, but /settings/products must
    // NOT appear in the top-level sidebar — it lives in the sub-sidebar.
    expect(hrefs.has('/settings/products')).toBe(false)
    const productLink = links.find(
      (a) => (a.textContent ?? '').trim().toLowerCase() === 'products',
    )
    expect(productLink).toBeUndefined()
  })

  it('still renders the daily-use primary items + Settings', () => {
    renderSidebar()
    const hrefs = new Set(
      screen
        .queryAllByRole('link')
        .map((a) => a.getAttribute('href'))
        .filter(Boolean),
    )
    for (const href of [
      '/',
      '/bookings',
      '/schedule',
      '/calendar',
      '/contacts',
      '/reporting',
      '/approvals/general',
      '/settings',
    ]) {
      expect(hrefs.has(href)).toBe(true)
    }
  })
})
