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

function renderSettingsTree(initialPath: string) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route element={<Outlet />}>
          <Route path="/settings" element={<SettingsLayout />}>
            <Route index element={<Navigate to="/settings/company" replace />} />
            <Route path="company" element={<CompanySettings />} />
            <Route path="calendar-display" element={<CalendarDisplaySettings />} />
            <Route
              path="display-preferences"
              element={<DisplayPreferencesSettings />}
            />
            <Route path="team" element={<Staff />} />
            <Route path="pickup-locations" element={<PickupLocations />} />
            <Route path="email-templates" element={<EmailTemplates />} />
            <Route
              path="integrations/gmail"
              element={<IntegrationsGmailSettings />}
            />
            <Route
              path="connected-accounts"
              element={<ConnectedAccountsSettings />}
            />
            <Route path="plan" element={<PlanSettings />} />
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
  it('redirects /settings to /settings/company', async () => {
    renderSettingsTree('/settings')
    // CompanySettings renders the operator name via the Input default value.
    expect(await screen.findByDisplayValue('Para42')).toBeInTheDocument()
  })

  it('renders all ten sub-sidebar links', () => {
    renderSettingsTree('/settings/company')
    const nav = screen.getByRole('navigation', { name: /settings sections/i })
    const links = nav.querySelectorAll('a')
    expect(links).toHaveLength(10)
    expect(nav).toHaveTextContent(/company/i)
    expect(nav).toHaveTextContent(/calendar & display/i)
    expect(nav).toHaveTextContent(/display preferences/i)
    expect(nav).toHaveTextContent(/team/i)
    expect(nav).toHaveTextContent(/pickup locations/i)
    expect(nav).toHaveTextContent(/email templates/i)
    expect(nav).toHaveTextContent(/gmail/i)
    expect(nav).toHaveTextContent(/connected accounts/i)
    expect(nav).toHaveTextContent(/plan/i)
  })

  it('navigates to the calendar-display subsection when its sidebar link is clicked', async () => {
    const user = userEvent.setup()
    renderSettingsTree('/settings/company')
    await screen.findByDisplayValue('Para42')

    await user.click(screen.getByRole('link', { name: /calendar & display/i }))

    // Calendar subsection mounts work-hours form fields.
    expect(
      await screen.findByLabelText(/work hours — start/i),
    ).toBeInTheDocument()
  })

  it('renders the Plan subsection placeholder when no package is embedded', async () => {
    renderSettingsTree('/settings/plan')
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
    expect(teamLink).toHaveClass(/text-foreground/)
  })

  it('redirects /pickup-locations to /settings/pickup-locations', async () => {
    renderSettingsTree('/pickup-locations')
    const nav = await screen.findByRole('navigation', {
      name: /settings sections/i,
    })
    const link = within(nav).getByRole('link', { name: /pickup locations/i })
    expect(link).toHaveClass(/text-foreground/)
  })

  it('redirects /email-templates to /settings/email-templates', async () => {
    renderSettingsTree('/email-templates')
    const nav = await screen.findByRole('navigation', {
      name: /settings sections/i,
    })
    const link = within(nav).getByRole('link', { name: /email templates/i })
    expect(link).toHaveClass(/text-foreground/)
  })
})
