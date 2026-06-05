import {
  render as rtlRender,
  screen,
  within,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

import type { OperatorSettings, GmailStatus } from '@/lib/operatorSettings'

// ---------------------------------------------------------------------------
// Fixtures + mocks
// ---------------------------------------------------------------------------

const OPERATOR_FIXTURE: OperatorSettings = {
  id: 'op-1',
  name: 'Para42',
  legal_name: 'Para42 GmbH',
  slug: 'para42',
  tax_id: 'DE123456789',
  tax_id_kind: 'de_ust_idnr',
  phone: '+49 1234 567890',
  street: 'Hauptstr. 1',
  city: 'Berlin',
  postal_code: '10115',
  region: 'Berlin',
  country: 'DE',
  timezone: 'Europe/Berlin',
  default_locale: 'de',
  onboarded_at: '2026-05-01T00:00:00Z',
}

const GMAIL_NOT_CONNECTED: GmailStatus = { connected: false }

const { mocks } = vi.hoisted(() => ({
  mocks: {
    fetchOperator: vi.fn<(id: string) => Promise<OperatorSettings>>(),
    patchOperator: vi.fn<
      (id: string, patch: Partial<OperatorSettings>) => Promise<OperatorSettings>
    >(),
    fetchGmailStatus: vi.fn<(id: string) => Promise<GmailStatus>>(),
    fetchGmailInstallUrl:
      vi.fn<(id: string) => Promise<{ install_url: string; state: string }>>(),
    disconnectGmail: vi.fn<(id: string) => Promise<void>>(),
  },
}))

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: mocks.fetchOperator,
    patchOperator: mocks.patchOperator,
    fetchGmailStatus: mocks.fetchGmailStatus,
    fetchGmailInstallUrl: mocks.fetchGmailInstallUrl,
    disconnectGmail: mocks.disconnectGmail,
  }
})

// useOperator hook — the layout + subsections rely on the active operator.
vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: 'op-1',
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    operators: [],
    setCurrentOperatorId: vi.fn(),
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

// Mute realtime subscriptions in subsections that pull supabase tables
// directly (Staff, EmailTemplates). Those subsections are rendered as
// route targets in this test only to assert routing — their internals
// don't need to fetch real data for the assertions below.
vi.mock('@/lib/supabase', () => ({
  supabase: {
    channel: vi.fn(() => ({
      on: vi.fn().mockReturnThis(),
      subscribe: vi.fn().mockReturnThis(),
      unsubscribe: vi.fn(),
    })),
    removeChannel: vi.fn(),
    auth: {
      getUserIdentities: vi.fn(async () => ({
        data: { identities: [] },
        error: null,
      })),
    },
    from: vi.fn(() => {
      const builder: Record<string, unknown> = {}
      const chain = () => builder
      ;[
        'select',
        'eq',
        'in',
        'order',
        'limit',
        'maybeSingle',
        'single',
        'insert',
        'update',
        'delete',
      ].forEach((m) => {
        builder[m] = vi.fn(chain)
      })
      builder.then = (
        resolve: (v: { data: never[]; error: null }) => void,
      ) => {
        resolve({ data: [] as never[], error: null })
        return Promise.resolve({ data: [] as never[], error: null })
      }
      return builder
    }),
  },
  getSupabase: () => ({}),
}))

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function render(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
    ...options,
  })
}

// Renders just the settings sub-tree by mounting the same Routes
// declaration in isolation. The full <App /> needs auth + onboarding
// state which would balloon the test surface; this keeps us focused on
// the structural assertions.
import { Navigate, Outlet } from 'react-router-dom'
import { SettingsLayout } from './SettingsLayout'
import { CompanySettings } from './settings/CompanySettings'
import { CalendarDisplaySettings } from './settings/CalendarDisplaySettings'
import { DisplayPreferencesSettings } from './settings/DisplayPreferencesSettings'
import { IntegrationsGmailSettings } from './settings/IntegrationsGmailSettings'
import { ConnectedAccountsSettings } from './settings/ConnectedAccountsSettings'
import { PlanSettings } from './settings/PlanSettings'
import { Staff } from './Staff'
import { EmailTemplates } from './EmailTemplates'
import { PickupLocations } from './PickupLocations'

// landr-gka7 — index redirect now resolves via landingPathFor('settings')
// in App.tsx, not a hard-coded /account/company. We mirror that here so
// the routing test exercises the same redirect target as the real app.
import { landingPathFor } from '@/components/settings/sections'

function renderSettingsTree(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Outlet />}>
          <Route path="/account" element={<SettingsLayout />}>
            <Route
              index
              element={<Navigate to={landingPathFor('account')} replace />}
            />
            <Route path="company" element={<CompanySettings />} />
            <Route
              path="connected-accounts"
              element={<ConnectedAccountsSettings />}
            />
            <Route
              path="integrations/gmail"
              element={<IntegrationsGmailSettings />}
            />
            <Route path="plan" element={<PlanSettings />} />
          </Route>
          <Route path="/settings" element={<SettingsLayout />}>
            <Route
              index
              element={<Navigate to={landingPathFor('settings')} replace />}
            />
            <Route path="calendar-display" element={<CalendarDisplaySettings />} />
            <Route
              path="display-preferences"
              element={<DisplayPreferencesSettings />}
            />
            <Route path="team" element={<Staff />} />
            <Route path="pickup-locations" element={<PickupLocations />} />
            {/* landr-e8jf — Schedule mounted under Settings now. The
                component is heavy (FullCalendar + query subtree), so the
                routing test only needs a placeholder; the Schedule.test
                file owns the page's behavioural coverage. */}
            <Route
              path="schedule"
              element={<div data-testid="schedule-placeholder" />}
            />
            <Route path="email-templates" element={<EmailTemplates />} />
          </Route>
          <Route
            path="/staff"
            element={<Navigate to="/settings/team" replace />}
          />
          <Route
            path="/pickup-locations"
            element={<Navigate to="/settings/pickup-locations" replace />}
          />
          <Route
            path="/email-templates"
            element={<Navigate to="/settings/email-templates" replace />}
          />
        </Route>
      </Routes>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

beforeEach(() => {
  mocks.fetchOperator.mockResolvedValue({ ...OPERATOR_FIXTURE })
  mocks.patchOperator.mockResolvedValue({ ...OPERATOR_FIXTURE })
  mocks.fetchGmailStatus.mockResolvedValue({ ...GMAIL_NOT_CONNECTED })
  mocks.fetchGmailInstallUrl.mockResolvedValue({
    install_url: 'https://example.test/oauth',
    state: 'abc',
  })
  mocks.disconnectGmail.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SettingsLayout', () => {
  // landr-gka7 — /settings index redirect now resolves to
  // landingPathFor('settings'), i.e. SETTINGS_SECTIONS[0].to
  // (calendar-display today). The previous hard-coded /account/company
  // landed users on an ACCOUNT section, which is precisely the bug that
  // ticket fixed — clicking the Settings gear briefly rendered the
  // Account sub-sidebar before re-navigating. We assert on the Settings
  // sub-sidebar (group resolved by groupForPath) instead of the deeper
  // CalendarDisplaySettings form so the test stays stable as the first
  // SETTINGS_SECTIONS entry changes.
  it('redirects /settings to the first SETTINGS section (landr-gka7)', async () => {
    renderSettingsTree('/settings')
    const nav = await screen.findByRole('navigation', {
      name: /settings sections/i,
    })
    expect(nav).toBeInTheDocument()
  })

  it('renders the Account sub-sidebar when on an account URL (landr-fzcg)', () => {
    renderSettingsTree('/account/company')
    // /account/company belongs to the Account group, so the sub-sidebar
    // renders ACCOUNT_SECTIONS (Company, Connected accounts, Security, Gmail,
    // Calendar feed, Payments & invoicing, Plan, Notifications).
    // landr-6ybs added Calendar feed; landr-wwhn.16 added Notifications;
    // landr-1nwu.2 added Payments & invoicing; landr added Security
    // (change password).
    const nav = screen.getByRole('navigation', { name: /account sections/i })
    const links = nav.querySelectorAll('a')
    expect(links).toHaveLength(8)
    expect(nav).toHaveTextContent(/company/i)
    expect(nav).toHaveTextContent(/connected accounts/i)
    expect(nav).toHaveTextContent(/security/i)
    expect(nav).toHaveTextContent(/gmail/i)
    expect(nav).toHaveTextContent(/calendar feed/i)
    expect(nav).toHaveTextContent(/payments & invoicing/i)
    expect(nav).toHaveTextContent(/plan/i)
    expect(nav).toHaveTextContent(/notifications/i)
    // Settings-group items must NOT appear in the Account sub-sidebar.
    expect(nav).not.toHaveTextContent(/calendar & display/i)
    expect(nav).not.toHaveTextContent(/team/i)
    expect(nav).not.toHaveTextContent(/email templates/i)
  })

  it('renders the Settings sub-sidebar when on a settings-group URL (landr-fzcg)', () => {
    renderSettingsTree('/settings/team')
    // landr-yp8x — Branding joined Settings → 9 sections (was 8).
    // landr-iz58 — Tags joined Settings → 10 sections.
    // landr-qg4q — Email log joined Settings → 11 sections.
    // landr-r87i — Operations joined Settings → 12 sections.
    // landr-ah9u — Webhooks joined Settings → 13 sections.
    // landr-9n0l — Commissions joined Settings → 14 sections.
    // landr-1tqx — Service roles joined Settings → 15 sections.
    // landr-sp4r — Campaigns joined Settings → 16 sections.
    // landr-v198 — Vouchers joined Settings → 17 sections.
    // landr-funh — Providers joined Settings → 18 sections.
    // landr-up1b — Categories + Embed joined Settings → 20 sections.
    // landr-znzz.5 — Upsells & offers joined Settings → 21 sections.
    // landr-znzz.7 — Weather forecast hint joined Settings → 22 sections.
    // landr-jb1k — Booking widget configurator joined Settings → 23 sections.
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    const links = nav.querySelectorAll('a')
    expect(links).toHaveLength(23)
    expect(nav).toHaveTextContent(/calendar & display/i)
    expect(nav).toHaveTextContent(/display preferences/i)
    expect(nav).toHaveTextContent(/branding/i)
    expect(nav).toHaveTextContent(/booking widget/i)
    expect(nav).toHaveTextContent(/weather/i)
    expect(nav).toHaveTextContent(/team/i)
    expect(nav).toHaveTextContent(/providers/i)
    expect(nav).toHaveTextContent(/pickup locations/i)
    expect(nav).toHaveTextContent(/products/i)
    expect(nav).toHaveTextContent(/categories/i)
    expect(nav).toHaveTextContent(/embed/i)
    expect(nav).toHaveTextContent(/upsells & offers/i)
    expect(nav).toHaveTextContent(/schedule/i)
    expect(nav).toHaveTextContent(/email templates/i)
    expect(nav).toHaveTextContent(/email log/i)
    expect(nav).toHaveTextContent(/pricing/i)
    expect(nav).toHaveTextContent(/commissions/i)
    expect(nav).toHaveTextContent(/vouchers/i)
    expect(nav).toHaveTextContent(/tags/i)
    expect(nav).toHaveTextContent(/service roles/i)
    expect(nav).toHaveTextContent(/campaigns/i)
    expect(nav).toHaveTextContent(/operations/i)
    expect(nav).toHaveTextContent(/webhooks/i)
    // Account-group items must NOT appear here.
    expect(nav).not.toHaveTextContent(/connected accounts/i)
    expect(nav).not.toHaveTextContent(/gmail/i)
    expect(nav).not.toHaveTextContent(/plan/i)
    expect(nav).not.toHaveTextContent(/company/i)
  })

  it('navigates to the calendar-display subsection when its sidebar link is clicked', async () => {
    const user = userEvent.setup()
    // Start on a Settings-group URL so the sub-sidebar shows the
    // settings list (which contains the calendar-display link).
    renderSettingsTree('/settings/team')

    await user.click(screen.getByRole('link', { name: /calendar & display/i }))

    // Calendar subsection mounts work-hours form fields.
    expect(
      await screen.findByLabelText(/work hours — start/i),
    ).toBeInTheDocument()
  })

  // landr-m4zq — Settings → Calendar display exposes first_day_of_week.
  it('toggling First day of week submits the corresponding PATCH payload (landr-m4zq)', async () => {
    const user = userEvent.setup()
    renderSettingsTree('/settings/calendar-display')

    const select = (await screen.findByLabelText(
      /first day of week/i,
    )) as HTMLSelectElement
    // Default fixture omits the column → form defaults to 1 (Monday).
    expect(select.value).toBe('1')

    // Switch to Sunday-first.
    await user.selectOptions(select, '0')
    expect(select.value).toBe('0')

    // Save the form. The CalendarDisplaySettings form posts via patchOperator
    // with only the dirty fields (react-hook-form isDirty gate + the
    // mutation's exclude-unset behaviour on the server side).
    await user.click(screen.getByRole('button', { name: /save changes/i }))

    // The PATCH call must include first_day_of_week=0. Other fields are
    // included too (RHF submits the whole form) — we just assert presence
    // and the correct value.
    expect(mocks.patchOperator).toHaveBeenCalled()
    const lastCall = mocks.patchOperator.mock.calls.at(-1)
    expect(lastCall?.[0]).toBe('op-1')
    expect(lastCall?.[1]).toMatchObject({ first_day_of_week: 0 })
  })

  it('renders the Plan subsection placeholder when no package is embedded', async () => {
    renderSettingsTree('/account/plan')
    expect(
      await screen.findByText(/no plan information available/i),
    ).toBeInTheDocument()
  })

  it('redirects /staff to /settings/team', async () => {
    renderSettingsTree('/staff')
    // Staff page renders the Team sub-sidebar link as active (via NavLink).
    const nav = await screen.findByRole('navigation', {
      name: /settings sections/i,
    })
    const teamLink = within(nav).getByRole('link', { name: /team/i })
    // landr-ar44 — the active settings-nav link is now a filled primary
    // pill (bg-primary + text-primary-foreground). `font-medium` is the
    // active-only marker (inactive rows are normal weight), so it's the
    // stable proxy for "this section is active".
    expect(teamLink).toHaveClass(/font-medium/)
  })

  it('redirects /pickup-locations to /settings/pickup-locations', async () => {
    renderSettingsTree('/pickup-locations')
    const nav = await screen.findByRole('navigation', {
      name: /settings sections/i,
    })
    const link = within(nav).getByRole('link', { name: /pickup locations/i })
    // landr-ar44 — active link = filled primary pill; assert the
    // active-only `font-medium` marker (see /staff test).
    expect(link).toHaveClass(/font-medium/)
  })

  it('redirects /email-templates to /settings/email-templates', async () => {
    renderSettingsTree('/email-templates')
    const nav = await screen.findByRole('navigation', {
      name: /settings sections/i,
    })
    const link = within(nav).getByRole('link', { name: /email templates/i })
    // landr-ar44 — active link = filled primary pill; assert the
    // active-only `font-medium` marker (see /staff test).
    expect(link).toHaveClass(/font-medium/)
  })

  // landr-e8jf — Schedule now lives at /settings/schedule. Pin both the
  // route mount + the sub-sidebar link being active.
  it('mounts the Schedule subsection at /settings/schedule and marks its link active', async () => {
    renderSettingsTree('/settings/schedule')
    expect(
      await screen.findByTestId('schedule-placeholder'),
    ).toBeInTheDocument()
    const nav = screen.getByRole('navigation', {
      name: /settings sections/i,
    })
    const link = within(nav).getByRole('link', { name: /schedule/i })
    // landr-ar44 — active link = filled primary pill; assert the
    // active-only `font-medium` marker (see /staff test).
    expect(link).toHaveClass(/font-medium/)
  })

  // landr-3qkr.4 — Mobile nav smoke: the sub-sidebar renders a scrollable
  // chip strip on mobile. The nav element must always be in the document
  // and all section links must be reachable (even if visually off-screen
  // in a scroll container). This test pins that the nav is present and
  // queryable regardless of viewport width — the overflow-x-auto class
  // is a CSS concern, so we just assert presence + link count stability.
  it('renders mobile-nav: sub-sidebar links remain accessible in scrollable strip (landr-3qkr.4)', () => {
    renderSettingsTree('/settings/team')
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    // All 23 links must be in the DOM (the chip strip doesn't clip DOM nodes,
    // only overflows visually). If the count grows in future, extend the
    // existing "renders the Settings sub-sidebar" test comment chain first.
    expect(nav.querySelectorAll('a')).toHaveLength(23)
    // The <ul> must have the overflow-x-auto class (applied on mobile, stripped
    // on md+). We assert the class is present in the rendered markup so a
    // future refactor of the chip-strip doesn't silently remove mobile scroll.
    const ul = nav.querySelector('ul')
    expect(ul).toHaveClass('overflow-x-auto')
  })
})
