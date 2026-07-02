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

// landr-fd5m.1 — mutable persona flags so both the pre-existing mobile-drawer
// suite (ordinary operator) and the new staff-persona topbar suite below can
// share one set of module mocks instead of two conflicting static ones.
// Reset to the ordinary-operator defaults in beforeEach; staff tests flip
// these before rendering.
const { mock } = vi.hoisted(() => ({
  mock: {
    state: {
      isLandrStaff: false,
      effectiveIsStaff: false,
      showModeSwitcher: false,
    },
  },
}))

// landr-fd5m.2 — mutable folded set the mocked useTopbarOverflow returns.
// Reset to empty in beforeEach; the measured-overflow suite flips it per test.
const { hookState } = vi.hoisted(() => ({
  hookState: { folded: new Set<string>() },
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
    // landr-fd5m.1 — OperatorSwitcher's staff-only ViewAsSection reads these;
    // empty/null keeps it a no-op for both personas here. ViewAsSection has
    // its own dedicated coverage elsewhere.
    staffOperators: [],
    staffOperatorsLoading: false,
    viewAsOperator: null,
    enterViewAs: () => {},
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
    isLandrStaff: mock.state.isLandrStaff,
    effectiveIsStaff: mock.state.effectiveIsStaff,
    isLoading: false,
  }),
}))

// landr-fd5m.1 — AppModeSwitcher reads its own context rather than
// entitlements directly; drive its staff gating off the same persona flag.
vi.mock('@/lib/app-mode-context', () => ({
  useAppMode: () => ({
    mode: 'operator',
    capabilities: {
      is_staff: mock.state.showModeSwitcher,
      is_owner: false,
      can_triage_tickets: false,
      can_admin_roles: false,
      can_view_as_operator: mock.state.showModeSwitcher,
      roles: [],
    },
    capabilitiesLoading: false,
    showSwitcher: mock.state.showModeSwitcher,
    enterOperatorMode: () => {},
    enterTicketSystem: () => {},
    enterViewAsMode: () => {},
    viewAsPickerOpen: false,
    closeViewAsPicker: () => {},
  }),
}))

// landr-fd5m.1 — the remaining right-cluster + dialog/banner chrome each pull
// their own providers/queries (realtime, error-log, config-health, embed
// token…) and each already has dedicated test coverage of its own. Stub them
// to testid-bearing placeholders here so this suite stays focused on what
// AppShell itself is responsible for: wiring the right components into the
// right topbar-item-* wrappers for a given persona. Mirrors the same
// stubbing convention TicketSystemShell.test.tsx uses for the same chrome.
vi.mock('@/components/TierBadge', () => ({
  TierBadge: () => <div data-testid="tier-badge-stub" />,
}))
vi.mock('@/components/WidgetButton', () => ({
  WidgetButton: () => <div data-testid="widget-button-stub" />,
}))
vi.mock('@/components/ReportFab', () => ({
  ReportFab: () => <div data-testid="report-fab-stub" />,
}))
vi.mock('@/components/ErrorHistoryBell', () => ({
  ErrorHistoryBell: () => <div data-testid="error-history-bell-stub" />,
}))
vi.mock('@/components/NotificationsBell', () => ({
  NotificationsBell: () => <div data-testid="notifications-bell-stub" />,
}))
vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-toggle-stub" />,
}))
vi.mock('@/components/UserMenu', () => ({
  UserMenu: () => <div data-testid="user-menu-stub" />,
}))
// landr-fd5m.2 — stub reflects the real component's core contract: it renders
// the ⋯ trigger only while at least one item is folded, else null. That lets
// the measured-overflow suite below assert the trigger's presence/absence off
// the mocked hook's folded set without pulling in the menu's internals (which
// have their own dedicated test file).
vi.mock('@/components/topbar/TopbarMoreMenu', () => ({
  TopbarMoreMenu: ({ folded }: { folded: ReadonlySet<string> }) =>
    folded && folded.size > 0 ? (
      <div data-testid="topbar-more-menu-trigger" />
    ) : null,
}))

// landr-fd5m.2 — mock the measured-overflow hook so folding is deterministic in
// jsdom (the real hook measures 0-width boxes → folds nothing; here we drive
// `hookState.folded` explicitly). Default empty ⇒ the slice-.1 assertions above
// (every wrapper present, nothing hidden) are unaffected.
vi.mock('@/hooks/use-topbar-overflow', () => ({
  useTopbarOverflow: () => ({
    headerRef: () => {},
    titleRef: () => {},
    registerItem: () => () => {},
    folded: hookState.folded,
  }),
  TOPBAR_FOLD_ORDER: ['theme', 'widget', 'tier', 'report'],
}))
vi.mock('@/components/ConfigHealthBanners', () => ({
  ConfigHealthBanners: () => null,
}))
vi.mock('@/components/OnboardingBanner', () => ({
  OnboardingBanner: () => null,
}))
vi.mock('@/components/EmailSenderNudgeBanner', () => ({
  EmailSenderNudgeBanner: () => null,
}))
vi.mock('@/components/ViewAsBanner', () => ({
  ViewAsBanner: () => null,
}))
vi.mock('@/components/ViewAsOperatorPicker', () => ({
  ViewAsOperatorPicker: () => null,
}))
vi.mock('@/components/CommandPalette', () => ({
  CommandPalette: () => null,
}))
vi.mock('@/components/KeyboardShortcutsHelp', () => ({
  KeyboardShortcutsHelp: () => null,
}))
vi.mock('@/components/GlobalErrorCapture', () => ({
  GlobalErrorCapture: () => null,
}))

import { AppSidebar } from './AppSidebar'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { SidebarModeProvider } from '@/lib/sidebar-mode-context'
import { landingPathFor } from '@/components/settings/sections'
import { AppShell } from './AppShell'

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
  // landr-fd5m.1 — default every test to the ordinary-operator persona;
  // the staff-persona suite below opts in per test.
  mock.state.isLandrStaff = false
  mock.state.effectiveIsStaff = false
  mock.state.showModeSwitcher = false
  // landr-fd5m.2 — default: nothing folded (jsdom fail-safe / desktop).
  hookState.folded = new Set<string>()
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
      within(drawer).getByRole('radiogroup', { name: /sidebar style/i }),
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

// landr-fd5m.1 — full AppShell render (the real component, not the mobile-
// drawer mirror above) so the staff-persona topbar cluster is under test.
// Root cause: this suite previously only ever mocked `effectiveIsStaff:
// false`, so the staff chrome (AppModeSwitcher + the wider right cluster it
// pushes past the fold) was never exercised here — landr-3qkr's 360px QA
// pass missed the staff overflow as a direct result. AppModeSwitcher and
// OperatorSwitcher render for real (the two components this slice touches);
// the rest of the right-cluster/banner/dialog chrome is stubbed to testid
// placeholders — each has its own dedicated test file, so re-asserting their
// internals here would just duplicate that coverage.
function renderAppShell(initialPath = '/bookings') {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initialPath]}>
        <AppShell>
          <div data-testid="page-content">content</div>
        </AppShell>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

describe('AppShell topbar right cluster (landr-fd5m.1)', () => {
  it('ordinary operators: no mode switcher, but every other cluster item is present', () => {
    renderAppShell()

    // Staff-only mode switch stays absent for non-staff — non-staff chrome
    // is unchanged by this slice.
    expect(screen.queryByTestId('app-mode-switcher-trigger')).toBeNull()

    // The rest of the right cluster is unconditional — present regardless
    // of persona — and each item is now measured via a topbar-item-*
    // wrapper (slice .2 attaches refs to these; pure markup here).
    for (const id of [
      'tier',
      'widget',
      'report',
      'errorbell',
      'notifbell',
      'theme',
      'usermenu',
    ]) {
      expect(screen.getByTestId(`topbar-item-${id}`)).toBeInTheDocument()
    }
  })

  it('staff persona: the full staff cluster renders — mode switcher, tier badge, both bells, user menu', () => {
    mock.state.isLandrStaff = true
    mock.state.effectiveIsStaff = true
    mock.state.showModeSwitcher = true

    renderAppShell()

    // landr-7dya.10 — staff-only workspace mode switch. This is the control
    // that silently disappeared off-screen pre-fix; its presence here is the
    // whole point of this fixture.
    expect(
      screen.getByTestId('app-mode-switcher-trigger'),
    ).toBeInTheDocument()

    // Operator scope switcher (real component — staff always get the
    // dropdown per landr-2soj, even with a single operator).
    expect(
      screen.getByRole('button', { name: /operator/i }),
    ).toBeInTheDocument()

    // Full right cluster, each in its measuring wrapper.
    expect(screen.getByTestId('topbar-item-tier')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-item-widget')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-item-report')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-item-errorbell')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-item-notifbell')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-item-theme')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-item-usermenu')).toBeInTheDocument()

    // NEVER-fold items (per the epic's fold order — ErrorHistoryBell +
    // NotificationsBell own their own Radix DropdownMenus and UserMenu is
    // the account exit hatch) are unconditionally reachable.
    expect(
      within(screen.getByTestId('topbar-item-errorbell')).getByTestId(
        'error-history-bell-stub',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('topbar-item-notifbell')).getByTestId(
        'notifications-bell-stub',
      ),
    ).toBeInTheDocument()
    expect(
      within(screen.getByTestId('topbar-item-usermenu')).getByTestId(
        'user-menu-stub',
      ),
    ).toBeInTheDocument()
  })
})

// landr-fd5m.2 — measured priority-overflow wiring. The hook is mocked (above)
// so folding is deterministic; here we assert the shell reacts to a folded set:
// the folded items' wrappers get `hidden`, the ⋯ trigger appears, and the
// never-fold items (both bells + user menu) stay inline and un-hidden.
describe('AppShell measured overflow (landr-fd5m.2)', () => {
  it('nothing folded: no ⋯ trigger, and no wrapper is hidden', () => {
    mock.state.isLandrStaff = true
    mock.state.effectiveIsStaff = true
    mock.state.showModeSwitcher = true
    // hookState.folded defaults to empty.
    renderAppShell()

    expect(screen.queryByTestId('topbar-more-menu-trigger')).toBeNull()
    for (const id of ['theme', 'widget', 'tier', 'report']) {
      expect(screen.getByTestId(`topbar-item-${id}`).className).not.toContain(
        'hidden',
      )
    }
  })

  it('a folded set hides exactly those wrappers, surfaces ⋯, keeps bells + user menu inline', () => {
    mock.state.isLandrStaff = true
    mock.state.effectiveIsStaff = true
    mock.state.showModeSwitcher = true
    hookState.folded = new Set(['theme', 'widget', 'tier'])
    renderAppShell()

    // Folded wrappers stay MOUNTED but carry `hidden`.
    for (const id of ['theme', 'widget', 'tier']) {
      const wrapper = screen.getByTestId(`topbar-item-${id}`)
      expect(wrapper).toBeInTheDocument()
      expect(wrapper.className).toContain('hidden')
    }
    // Kept foldable (report) is NOT hidden.
    expect(screen.getByTestId('topbar-item-report').className).not.toContain(
      'hidden',
    )
    // The ⋯ trigger appears once something folds.
    expect(screen.getByTestId('topbar-more-menu-trigger')).toBeInTheDocument()
    // Never-fold items are always inline and never hidden.
    for (const id of ['errorbell', 'notifbell', 'usermenu']) {
      expect(screen.getByTestId(`topbar-item-${id}`).className).not.toContain(
        'hidden',
      )
    }
  })
})
