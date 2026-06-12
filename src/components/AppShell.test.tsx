// landr-3qkr.1 — mobile shell: drawer (mobile Sheet) behaviour.
//
// The shadcn Sidebar primitive renders as a slide-in Sheet below md (it
// branches on useIsMobile() internally). AppShell wires a topbar
// <SidebarTrigger className="md:hidden" /> whose onClick → toggleSidebar()
// flips the Sheet's open state when isMobile. This suite pins the integration
// that makes the phone nav reachable:
//   - below md, the trigger opens a drawer
//   - the drawer carries the FULL AppSidebar content (nav links, active pill,
//     account/settings footer) — every route is reachable from a phone
//   - the drawer closes again (trigger toggles, Esc dismisses)
//
// We exercise the real primitives (SidebarProvider + AppSidebar +
// SidebarTrigger) rather than the whole AppShell tree: that keeps the test
// off the ~16 topbar widgets (operator/entitlements/notifications/…) while
// still covering the exact open/close mechanism the shell relies on. The
// breakpoint is forced via a mock of @/hooks/use-mobile so the primitive takes
// its mobile (Sheet) branch deterministically in jsdom.
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// Force the sidebar primitive's mobile (Sheet) branch.
vi.mock('@/hooks/use-mobile', () => ({
  useIsMobile: () => true,
  MOBILE_BREAKPOINT: 768,
}))

// Same lightweight stubs the AppSidebar suite uses so the sidebar renders
// without a full app shell (operator scope, saved views, auth, entitlements).
vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
}))

vi.mock('@/lib/saved-views', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/saved-views')>(
      '@/lib/saved-views',
    )
  return {
    ...actual,
    listSavedViews: vi.fn(async () => []),
  }
})

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'test-user', email: 'test@example.com' },
    loading: false,
    signOut: async () => {},
  }),
}))

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: () => true,
    isLandrStaff: false,
    effectiveIsStaff: false,
    isLoading: false,
  }),
}))

import { AppSidebar } from './AppSidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { SidebarModeProvider } from '@/lib/sidebar-mode-context'
import { landingPathFor } from '@/components/settings/sections'

// Mirror of AppShell's mobile-relevant wiring: provider + sidebar (drawer on
// mobile) + a topbar trigger inside the inset. This is the surface the slice
// repairs; the rest of the AppShell tree (topbar widgets, FABs) is out of
// scope for the drawer behaviour.
function renderMobileShell(initialPath = '/bookings') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <SidebarModeProvider>
          <SidebarProvider>
            <AppSidebar />
            <SidebarInset>
              <header>
                <SidebarTrigger className="md:hidden" />
              </header>
            </SidebarInset>
          </SidebarProvider>
        </SidebarModeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('AppShell mobile drawer (landr-3qkr.1)', () => {
  it('starts with the drawer closed (no nav dialog mounted)', () => {
    renderMobileShell()
    // The mobile Sidebar renders inside a Radix Dialog (Sheet). When closed,
    // the dialog content is not in the DOM.
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('the hamburger trigger opens the drawer', async () => {
    const user = userEvent.setup()
    renderMobileShell()
    const trigger = screen.getByRole('button', { name: /toggle sidebar/i })
    await user.click(trigger)
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument()
    })
  })

  it('the open drawer carries the full nav: links, active pill, footer', async () => {
    const user = userEvent.setup()
    renderMobileShell('/bookings')
    await user.click(screen.getByRole('button', { name: /toggle sidebar/i }))
    const drawer = await screen.findByRole('dialog')

    // Nav groups: a representative spread of primary links is reachable.
    const links = within(drawer).getAllByRole('link')
    const hrefs = new Set(
      links.map((a) => a.getAttribute('href')).filter(Boolean),
    )
    for (const href of [
      '/',
      '/bookings',
      '/calendar',
      '/contacts',
      // account/footer items carry over into the drawer too.
      landingPathFor('account'),
      landingPathFor('settings'),
    ]) {
      expect(hrefs.has(href)).toBe(true)
    }

    // Active pill: the current route (/bookings) is highlighted in the drawer.
    const bookings = links.find((a) => a.getAttribute('href') === '/bookings')
    const bookingsBtn = bookings?.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(bookingsBtn?.getAttribute('data-active')).toBe('true')

    // Footer (sidebar display-mode control) carries over into the drawer.
    expect(
      within(drawer).getByRole('radiogroup', { name: /sidebar display mode/i }),
    ).toBeInTheDocument()
  })

  it('the drawer can be dismissed (Escape closes it)', async () => {
    const user = userEvent.setup()
    renderMobileShell()
    await user.click(screen.getByRole('button', { name: /toggle sidebar/i }))
    await screen.findByRole('dialog')
    await user.keyboard('{Escape}')
    await waitFor(() => {
      expect(screen.queryByRole('dialog')).toBeNull()
    })
  })
})
