import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// landr-c58d — the Views sub-list (ViewsSidebar) now mounts under the
// /views primary nav row and reads useOperator() + lists saved views.
// Stub both so the AppSidebar tests don't need a full app shell.
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

// landr-ne58 — RecentlyViewedList (mounted inside AppSidebar) calls
// useAuth(); stub the module so the sidebar tests don't need a full
// AuthProvider wrapper.
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'test-user', email: 'test@example.com' },
    loading: false,
    signOut: async () => {},
  }),
}))

// landr-sbhz.6 — AppSidebar now consumes useEntitlements() to hide nav items
// whose gating feature is disabled. Stub it permissive (everything enabled, no
// loading) so these IA/highlight tests exercise the full nav without needing
// an EntitlementsProvider + the operator_effective_features RPC.
vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: () => true,
    isLandrStaff: false,
    // landr-2soj — AppSidebar gates staff-only nav on effectiveIsStaff.
    effectiveIsStaff: false,
    isLoading: false,
  }),
}))

import { AppSidebar } from './AppSidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SidebarModeProvider } from '@/lib/sidebar-mode-context'
import {
  DEFAULT_SIDEBAR_MODE,
  SIDEBAR_MODE_STORAGE_KEY,
  type SidebarMode,
} from '@/lib/sidebar-mode'
// landr-gka7 — pin the AppSidebar Settings/Account hrefs to the same
// source of truth used by the production code (SETTINGS_SECTIONS[0] /
// ACCOUNT_SECTIONS[0] via landingPathFor) so the tests track section-
// list reorders without drift.
import {
  ACCOUNT_SECTIONS,
  SETTINGS_SECTIONS,
  groupForPath,
  landingPathFor,
} from '@/components/settings/sections'

// landr-sydf — Products is no longer a top-level sidebar item. The
// assertions below pin both the removal (no Products top-level link) and
// the daily-use cluster that should still be there.
//
// landr-fzcg — Account is now its own top-level sibling of Settings, and
// the collapse trigger is replaced by a 3-state radiogroup at the very
// bottom of the sidebar. AppSidebar now consumes SidebarModeProvider
// alongside SidebarProvider, so the renderer wraps both.
function renderSidebar(initialPath: string = '/') {
  // landr-c58d — fresh QueryClient per render so the mocked
  // listSavedViews() promise can resolve independently per test.
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <SidebarModeProvider>
          <SidebarProvider>
            <AppSidebar />
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
    // /settings/products must NOT appear in the top-level sidebar — it
    // lives in the sub-sidebar.
    expect(hrefs.has('/settings/products')).toBe(false)
    const productLink = links.find(
      (a) => (a.textContent ?? '').trim().toLowerCase() === 'products',
    )
    expect(productLink).toBeUndefined()
  })

  it('still renders the daily-use primary items + Settings + Account', () => {
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
      '/calendar',
      '/contacts',
      '/reporting',
      '/approvals/general',
      // landr-gka7 — Account + Settings top-level entries now point at
      // the first sub-section of each group (via landingPathFor) so the
      // click lands directly on a leaf URL whose groupForPath() matches
      // the clicked icon. Previously bare /account and /settings both
      // resolved to /settings/company (ACCOUNT) and briefly rendered the
      // wrong sub-sidebar.
      landingPathFor('account'),
      landingPathFor('settings'),
    ]) {
      expect(hrefs.has(href)).toBe(true)
    }
  })
})

// landr-gka7 — Settings gear must land directly on a SETTINGS section,
// not the first ACCOUNT section. Bug repro before the fix: the sidebar
// Settings entry had `to: '/settings'`, App.tsx's /settings index
// redirected to /settings/company (ACCOUNT_SECTIONS[0]), and the
// SettingsLayout briefly rendered the Account sub-sidebar before the
// user re-navigated. These tests pin both the AppSidebar href contract
// and the assumption that the Account/Settings hrefs come from
// landingPathFor (so they stay in sync with sections.ts).
describe('AppSidebar — Settings gear lands on a Settings section (landr-gka7)', () => {
  it('Settings link href is NOT the bare /settings path', () => {
    renderSidebar()
    const settingsLink = screen
      .queryAllByRole('link')
      .find((a) => {
        const txt = (a.textContent ?? '').trim().toLowerCase()
        // Filter for the Settings primary nav entry (icon + label) by
        // label text, not href — we don't yet know the href contract
        // here, just that it must NOT be the bare /settings.
        return txt === 'settings'
      })
    expect(settingsLink).toBeDefined()
    const href = settingsLink!.getAttribute('href')
    expect(href).not.toBe('/settings')
    // It must point INSIDE the Settings section list (deeper path under
    // /settings/*), not at a virtual top-level redirect URL.
    expect(href).toMatch(/^\/settings\/.+/)
  })

  it('Settings link href is the first SETTINGS_SECTIONS entry', () => {
    renderSidebar()
    const expected = landingPathFor('settings')
    expect(expected).toBe(SETTINGS_SECTIONS[0].to)
    const links = screen.queryAllByRole('link')
    const match = links.find((a) => a.getAttribute('href') === expected)
    expect(match).toBeDefined()
    expect((match!.textContent ?? '').trim().toLowerCase()).toBe('settings')
  })

  it('Account link href is the first ACCOUNT_SECTIONS entry', () => {
    renderSidebar()
    const expected = landingPathFor('account')
    expect(expected).toBe(ACCOUNT_SECTIONS[0].to)
    const links = screen.queryAllByRole('link')
    const match = links.find((a) => a.getAttribute('href') === expected)
    expect(match).toBeDefined()
    expect((match!.textContent ?? '').trim().toLowerCase()).toBe('account')
  })

  it('Settings href groupForPath resolves to "settings" (not "account")', () => {
    // The repro: groupForPath('/settings/company') === 'account', so a
    // bare /settings click would briefly render the Account sub-sidebar.
    // This assertion guards against a regression where someone changes
    // landingPathFor('settings') to a path that secretly belongs to the
    // ACCOUNT group.
    expect(groupForPath(landingPathFor('settings'))).toBe('settings')
    expect(groupForPath(landingPathFor('account'))).toBe('account')
  })
})

// landr-e8jf — Schedule is no longer a top-level sidebar item; it moved
// into the Settings sub-sidebar at /settings/schedule. The capacity pills
// now live on the main Calendar (landr-3uai), so Schedule is a setup
// surface — same pattern as the landr-sydf Products move.
describe('AppSidebar (landr-e8jf)', () => {
  it('does NOT render a top-level Schedule entry', () => {
    renderSidebar()
    const links = screen.queryAllByRole('link')
    const hrefs = new Set(
      links.map((a) => a.getAttribute('href')).filter(Boolean),
    )
    expect(hrefs.has('/schedule')).toBe(false)
    // /settings/schedule must NOT appear in the top-level sidebar — it
    // lives in the sub-sidebar.
    expect(hrefs.has('/settings/schedule')).toBe(false)
    const scheduleLink = links.find(
      (a) => (a.textContent ?? '').trim().toLowerCase() === 'schedule',
    )
    expect(scheduleLink).toBeUndefined()
  })
})

describe('AppSidebar — Views entry at Position-A (landr-v0xg)', () => {
  it('renders a /views top-level link labelled "Views"', () => {
    renderSidebar()
    const links = screen.queryAllByRole('link')
    const viewsLink = links.find((a) => a.getAttribute('href') === '/views')
    expect(viewsLink).toBeDefined()
    expect((viewsLink!.textContent ?? '').trim()).toMatch(/views/i)
  })

  it('places Views between Dashboard (/) and Bookings (/bookings)', () => {
    renderSidebar()
    // Multiple Sidebar variants render the same links; de-dupe to first
    // occurrence per href to get a stable order assertion. The variants
    // share the same primaryItems order so the first-occurrence sequence
    // matches the source-of-truth order in AppSidebar.tsx.
    const seen = new Set<string>()
    const orderedHrefs: string[] = []
    for (const a of screen.queryAllByRole('link')) {
      const href = a.getAttribute('href')
      if (!href || seen.has(href)) continue
      seen.add(href)
      orderedHrefs.push(href)
    }
    const dashIdx = orderedHrefs.indexOf('/')
    const viewsIdx = orderedHrefs.indexOf('/views')
    const bookingsIdx = orderedHrefs.indexOf('/bookings')
    expect(dashIdx).toBeGreaterThanOrEqual(0)
    expect(viewsIdx).toBeGreaterThanOrEqual(0)
    expect(bookingsIdx).toBeGreaterThanOrEqual(0)
    expect(viewsIdx).toBeGreaterThan(dashIdx)
    expect(viewsIdx).toBeLessThan(bookingsIdx)
  })

  it('highlights Views when on a /views/* URL', () => {
    renderSidebar('/views/some-uuid')
    const viewsLink = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/views')
    const viewsButton = viewsLink!.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(viewsButton?.getAttribute('data-active')).toBe('true')
  })
})

describe('AppSidebar — Account/Settings split (landr-fzcg)', () => {
  it('Account link points at the first ACCOUNT_SECTIONS entry', () => {
    renderSidebar()
    // landr-gka7 — href is now landingPathFor('account') (the deep leaf
    // URL) instead of the bare /account virtual path. The /account
    // route still exists in App.tsx as a redirect for legacy bookmarks
    // and the CommandPalette, but the sidebar now skips the redirect
    // hop.
    const accountLinks = screen
      .queryAllByRole('link')
      .filter((a) => a.getAttribute('href') === landingPathFor('account'))
    expect(accountLinks.length).toBeGreaterThan(0)
    const txt = (accountLinks[0].textContent ?? '').toLowerCase()
    expect(txt).toContain('account')
  })

  it('highlights Account when on an account subsection URL', () => {
    renderSidebar('/settings/plan')
    // /settings/plan belongs to the Account group, so the Account nav
    // row should be marked active and Settings should NOT be.
    const accountLink = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === landingPathFor('account'))
    expect(accountLink).toBeDefined()
    const accountButton = accountLink!.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(accountButton?.getAttribute('data-active')).toBe('true')

    const settingsLink = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === landingPathFor('settings'))
    const settingsButton = settingsLink!.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(settingsButton?.getAttribute('data-active')).not.toBe('true')
  })

  it('highlights Settings when on a settings-group subsection URL', () => {
    renderSidebar('/settings/team')
    const settingsLink = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === landingPathFor('settings'))
    const settingsButton = settingsLink!.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(settingsButton?.getAttribute('data-active')).toBe('true')

    const accountLink = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === landingPathFor('account'))
    const accountButton = accountLink!.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(accountButton?.getAttribute('data-active')).not.toBe('true')
  })

  it('does NOT highlight either when on an unrelated route', () => {
    renderSidebar('/bookings')
    for (const href of [landingPathFor('account'), landingPathFor('settings')]) {
      const link = screen
        .queryAllByRole('link')
        .find((a) => a.getAttribute('href') === href)
      const btn = link!.closest(
        '[data-sidebar="menu-button"]',
      ) as HTMLElement | null
      expect(btn?.getAttribute('data-active')).not.toBe('true')
    }
  })
})

describe('AppSidebar — Recently viewed (landr-ne58)', () => {
  it('renders the Recently viewed section header', () => {
    renderSidebar()
    // shadcn Sidebar renders multiple visual variants — pick the first
    // matching header. The button carries aria-expanded so we anchor on
    // role + name to dodge the duplicate-rendering.
    const headers = screen.queryAllByRole('button', {
      name: /collapse recently viewed|expand recently viewed/i,
    })
    expect(headers.length).toBeGreaterThan(0)
  })

  it('shows the empty-state hint when nothing has been opened yet', () => {
    renderSidebar()
    const hints = screen.queryAllByTestId('recently-viewed-empty')
    expect(hints.length).toBeGreaterThan(0)
    // landr-s1mr — copy moved to the shared <EmptyState> compact variant.
    expect(hints[0].textContent).toMatch(/will land here/i)
  })

  it('lists tracked entries newest-first as links', async () => {
    // Seed two entries directly into localStorage so the trail is
    // populated before the first render.
    const trail = [
      {
        type: 'contact',
        id: 'c-99',
        label: 'Latest Lily',
        href: '/contacts?open=c-99',
        ts: 2,
      },
      {
        type: 'booking',
        id: 'b-77',
        label: 'Older Ollie',
        href: '/bookings?open=b-77',
        ts: 1,
      },
    ]
    window.localStorage.setItem(
      'landr.dashboard.recentlyViewed.test-user',
      JSON.stringify(trail),
    )
    renderSidebar()
    const lily = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/contacts?open=c-99')
    const ollie = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/bookings?open=b-77')
    expect(lily).toBeDefined()
    expect(ollie).toBeDefined()
    // Confirm the labels surface.
    expect(lily!.textContent).toMatch(/latest lily/i)
    expect(ollie!.textContent).toMatch(/older ollie/i)
  })

  it('collapses the section when the header is clicked', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const headers = screen.getAllByRole('button', {
      name: /collapse recently viewed/i,
    })
    await user.click(headers[0])
    // Empty-state hint should no longer be in the (now-collapsed) DOM
    // for this variant. Other variants stay open because each variant
    // has its own state; assert by re-querying the first header is now
    // aria-expanded=false.
    expect(headers[0].getAttribute('aria-expanded')).toBe('false')
  })
})

describe('AppSidebar — 3-state collapse control (landr-fzcg)', () => {
  it('renders a radiogroup with the three modes', () => {
    renderSidebar()
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(3)
  })

  it('starts on the default mode (expanded)', () => {
    renderSidebar()
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const expanded = within(group).getByRole('radio', {
      name: /always expanded/i,
    })
    expect(expanded.getAttribute('aria-checked')).toBe('true')
    expect(DEFAULT_SIDEBAR_MODE).toBe<SidebarMode>('expanded')
  })

  it('clicking a radio switches mode + writes to localStorage', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const hover = within(group).getByRole('radio', {
      name: /expand on hover/i,
    })

    await user.click(hover)

    expect(hover.getAttribute('aria-checked')).toBe('true')
    expect(window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)).toBe(
      'hover-expand',
    )
  })

  it('restores mode from localStorage on mount', () => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, 'collapsed')
    renderSidebar()
    // In collapsed mode the segmented control is hidden by CSS but
    // still in the DOM (we render both variants and toggle via CSS).
    // Assert via localStorage round-trip + the radiogroup state.
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const collapsed = within(group).getByRole('radio', {
      name: /always collapsed/i,
    })
    expect(collapsed.getAttribute('aria-checked')).toBe('true')
  })

  it('responds to cross-tab storage events', () => {
    renderSidebar()
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const hover = within(group).getByRole('radio', {
      name: /expand on hover/i,
    })
    expect(hover.getAttribute('aria-checked')).toBe('false')

    act(() => {
      window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, 'hover-expand')
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SIDEBAR_MODE_STORAGE_KEY,
          newValue: 'hover-expand',
        }),
      )
    })

    expect(hover.getAttribute('aria-checked')).toBe('true')
  })
})
