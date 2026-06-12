import {
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

// --- Fixtures ---

type TemplateFixture = {
  id: string
  operator_id: string
  template_kind: string
  locale: string
  subject: string
  body_html: string
  body_text: string | null
  active: boolean
  created_at: string
  updated_at: string
}

// --- Hoisted mocks ---

const { mock } = vi.hoisted(() => {
  const state = {
    templates: [] as TemplateFixture[],
    fetchError: null as string | null,
    createCalls: [] as Array<Record<string, unknown>>,
    updateCalls: [] as Array<{ id: string; payload: Record<string, unknown> }>,
    deleteCalls: [] as string[],
    previewError: null as string | null,
    // landr-7tyo: Jinja render_error returned by the preview endpoint
    // (kept distinct from previewError, which simulates a network/HTTP
    // failure on the query itself).
    previewRenderError: null as string | null,
    // landr-x5o5.4: effective template override — controls what fetchEffective returns.
    // null → derive from templates list (is_default = no operator row exists)
    effectiveOverride: null as {
      subject: string
      body_html: string
      body_text: string | null
      is_default: boolean
      source: string
    } | null,
  }
  return { mock: { state } }
})

vi.mock('@/lib/emailTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/emailTemplates')>()
  return {
    ...actual,
    fetchTemplates: vi.fn(async (_operatorId: string) => {
      if (mock.state.fetchError) throw new Error(mock.state.fetchError)
      return mock.state.templates
    }),
    createTemplate: vi.fn(
      async (
        _operatorId: string,
        payload: Record<string, unknown>,
      ): Promise<TemplateFixture> => {
        const row: TemplateFixture = {
          id: `t-new-${mock.state.templates.length + 1}`,
          operator_id: _operatorId,
          template_kind: payload.template_kind as string,
          locale: payload.locale as string,
          subject: payload.subject as string,
          body_html: payload.body_html as string,
          body_text: (payload.body_text as string | null) ?? null,
          active: true,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        }
        mock.state.createCalls.push(payload)
        mock.state.templates = [...mock.state.templates, row]
        return row
      },
    ),
    updateTemplate: vi.fn(
      async (
        _operatorId: string,
        templateId: string,
        payload: Record<string, unknown>,
      ): Promise<TemplateFixture> => {
        mock.state.updateCalls.push({ id: templateId, payload })
        const idx = mock.state.templates.findIndex((t) => t.id === templateId)
        if (idx >= 0) {
          mock.state.templates[idx] = {
            ...mock.state.templates[idx],
            ...(payload as Partial<TemplateFixture>),
          }
          return mock.state.templates[idx]
        }
        throw new Error('template_not_found')
      },
    ),
    deleteTemplate: vi.fn(async (_operatorId: string, templateId: string) => {
      mock.state.deleteCalls.push(templateId)
      mock.state.templates = mock.state.templates.filter((t) => t.id !== templateId)
    }),
    previewTemplate: vi.fn(async (_operatorId: string, templateId: string) => {
      if (mock.state.previewError) throw new Error(mock.state.previewError)
      const tpl = mock.state.templates.find((t) => t.id === templateId)
      if (!tpl) throw new Error('template_not_found')
      return {
        template_kind: tpl.template_kind,
        locale: tpl.locale,
        subject: tpl.subject,
        body_html: tpl.body_html,
        body_text: tpl.body_text,
        // landr-7tyo: mirrors the live preview endpoint shape from
        // landr-tq6j. Tests can flip render_error via mock.state to
        // exercise the inline banner.
        render_error: mock.state.previewRenderError,
        fixture: {
          note: 'Rendered against a sample booking context.',
          context: {
            customer_name: 'Sample Customer',
            operator_name: 'Sample Operator',
          },
        },
      }
    }),
    // landr-x5o5.5: per-kind variable catalog endpoint. The editor fetches
    // this for the selected kind (independent of any saved template), so
    // the catalog is always present — including for a brand-new template.
    fetchVariables: vi.fn(async (_operatorId: string, kind: string) => ({
      kind,
      variables: [
        { name: 'customer_name', sample: 'Sample Customer', description: 'Customer full name' },
        { name: 'operator_name', sample: 'Sample Operator', description: 'Operator / business name' },
      ],
    })),
    // landr-x5o5.4: effective template endpoint — resolves to the operator row
    // if one exists, otherwise the Landr default.
    fetchEffective: vi.fn(async (_operatorId: string, kind: string, locale: string) => {
      if (mock.state.effectiveOverride) {
        return { kind, locale, ...mock.state.effectiveOverride }
      }
      // Derive from the templates list: if a row exists, it's the operator's custom.
      const operatorRow = mock.state.templates.find(
        (t) => t.template_kind === kind && t.locale === locale,
      )
      if (operatorRow) {
        return {
          kind,
          locale,
          subject: operatorRow.subject,
          body_html: operatorRow.body_html,
          body_text: operatorRow.body_text,
          is_default: false,
          source: 'operator_template',
        }
      }
      // No custom row → return a synthetic default.
      return {
        kind,
        locale,
        subject: `Default subject for ${kind}`,
        body_html: `<p>Default body for ${kind}</p>`,
        body_text: null,
        is_default: true,
        source: 'system_template',
      }
    }),
  }
})

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactNode }) => children,
}))

// landr-x5o5.7: mock fetchOperator to return hotel_email_locale (and
// default_locale as fallback) so the hotel locale pin resolves correctly.
const { operatorSettingsMock } = vi.hoisted(() => ({
  operatorSettingsMock: {
    hotel_email_locale: 'es' as string | null,
    default_locale: 'es',
  },
}))

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: vi.fn(async (_operatorId: string) => ({
      id: 'op-1',
      slug: 'para42',
      name: 'Para42',
      default_locale: operatorSettingsMock.default_locale,
      hotel_email_locale: operatorSettingsMock.hotel_email_locale,
    })),
  }
})

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'user-1', email: 'staff@operator.example' },
    loading: false,
    signOut: async () => {},
  }),
  AuthProvider: ({ children }: { children: ReactNode }) => children,
}))

const { toastCalls } = vi.hoisted(() => ({
  toastCalls: { success: [] as string[], error: [] as string[] },
}))

vi.mock('sonner', () => ({
  toast: {
    success: vi.fn((msg: string) => {
      toastCalls.success.push(msg)
    }),
    error: vi.fn((msg: string) => {
      toastCalls.error.push(msg)
    }),
  },
  Toaster: () => null,
}))

import { EmailTemplates } from './EmailTemplates'

function makeTemplate(overrides: Partial<TemplateFixture> = {}): TemplateFixture {
  return {
    id: 't-1',
    operator_id: 'op-1',
    template_kind: 'booking_received',
    locale: 'de',
    subject: 'Buchung erhalten',
    body_html: '<p>Hallo {{customer_name}}</p>',
    body_text: null,
    active: true,
    created_at: '2026-05-10T09:00:00.000Z',
    updated_at: '2026-05-10T09:00:00.000Z',
    ...overrides,
  }
}

function render(ui: React.ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

beforeEach(() => {
  mock.state.templates = []
  mock.state.fetchError = null
  mock.state.createCalls = []
  mock.state.updateCalls = []
  mock.state.deleteCalls = []
  mock.state.previewError = null
  mock.state.previewRenderError = null
  mock.state.effectiveOverride = null
  toastCalls.success.length = 0
  toastCalls.error.length = 0
  // landr-x5o5.7: reset hotel locale mock to the default (es) before each test.
  operatorSettingsMock.hotel_email_locale = 'es'
  operatorSettingsMock.default_locale = 'es'
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EmailTemplates route', () => {
  it('renders kind selector tabs and locale selector tabs', async () => {
    render(<EmailTemplates />)
    await screen.findByText('Booking received')
    expect(screen.getByText('Hotel request')).toBeInTheDocument()
    expect(screen.getByText('Hotel confirmation')).toBeInTheDocument()
    expect(screen.getByText('Booking confirmation')).toBeInTheDocument()
    // One DE, EN, and ES tab in the locale segmented control
    expect(screen.getAllByRole('tab', { name: /de/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('tab', { name: /en/i }).length).toBeGreaterThanOrEqual(1)
    expect(screen.getAllByRole('tab', { name: /es/i }).length).toBeGreaterThanOrEqual(1)
    // The editor is immediately visible (first kind + first locale pre-selected)
    await screen.findByLabelText(/email template editor/i)
  })

  it('shows "Customized" badge when a template row exists for that locale (landr-x5o5.4)', async () => {
    mock.state.templates = [makeTemplate()]
    render(<EmailTemplates />)
    await screen.findByText('Booking received')
    expect(screen.getByText('Customized')).toBeInTheDocument()
  })

  it('opens edit form with the correct template when locale tab is clicked', async () => {
    mock.state.templates = [makeTemplate()]
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Form is visible immediately (first kind+locale pre-selected)
    await screen.findByLabelText(/email template editor/i)

    // Click the DE locale tab explicitly and confirm the template loads
    const deTabs = screen.getAllByRole('tab', { name: /de/i })
    await user.click(deTabs[0])

    await screen.findByDisplayValue('Buchung erhalten')
  })

  it('switches locale tab and shows the correct form', async () => {
    mock.state.templates = [
      makeTemplate({ locale: 'de', subject: 'Buchung erhalten' }),
      makeTemplate({
        id: 't-2',
        locale: 'en',
        subject: 'Booking received',
        body_html: '<p>Hello {{customer_name}}</p>',
      }),
    ]
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Click de tab first
    const deTabs = screen.getAllByRole('tab', { name: /de/i })
    await user.click(deTabs[0])
    await screen.findByDisplayValue('Buchung erhalten')

    // Switch to en
    const enTabs = screen.getAllByRole('tab', { name: /en/i })
    await user.click(enTabs[0])
    await screen.findByDisplayValue('Booking received')
  })

  it('edits subject and saves via PATCH when template already exists', async () => {
    mock.state.templates = [makeTemplate()]
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    const deTabs = screen.getAllByRole('tab', { name: /de/i })
    await user.click(deTabs[0])

    const subjectInput = await screen.findByDisplayValue('Buchung erhalten')
    await user.clear(subjectInput)
    await user.type(subjectInput, 'Buchungseingang')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mock.state.updateCalls.length).toBe(1)
    })
    expect(mock.state.updateCalls[0]).toMatchObject({
      id: 't-1',
      payload: expect.objectContaining({ subject: 'Buchungseingang' }),
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('creates a new template via POST when content differs from the default', async () => {
    // No operator row — form prefills with the mocked default content.
    mock.state.templates = []
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    const deTabs = screen.getAllByRole('tab', { name: /de/i })
    await user.click(deTabs[0])

    // Wait for the effective template to prefill the subject.
    const form = await screen.findByLabelText(/email template editor/i)
    const subjectInput = within(form).getByLabelText(/subject/i)
    // Clear the default and type a custom subject (diverges from default → create).
    await user.clear(subjectInput)
    await user.type(subjectInput, 'Buchung erhalten')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mock.state.createCalls.length).toBe(1)
    })
    expect(mock.state.createCalls[0]).toMatchObject({
      template_kind: 'booking_received',
      locale: 'de',
      subject: 'Buchung erhalten',
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('resets to default via DELETE when reset button is clicked', async () => {
    mock.state.templates = [makeTemplate()]
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    const deTabs = screen.getAllByRole('tab', { name: /de/i })
    await user.click(deTabs[0])

    await screen.findByRole('button', { name: /reset to default/i })
    await user.click(screen.getByRole('button', { name: /reset to default/i }))

    await waitFor(() => {
      expect(mock.state.deleteCalls).toContain('t-1')
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('shows error card when fetch fails', async () => {
    mock.state.fetchError = 'permission denied'
    render(<EmailTemplates />)
    await screen.findByText(/failed to load email templates/i)
    expect(screen.getByText(/permission denied/i)).toBeInTheDocument()
  })

  it('surfaces render_error from the preview endpoint as an inline banner (landr-7tyo)', async () => {
    mock.state.templates = [makeTemplate()]
    mock.state.previewRenderError = "'undefined_xyz' is undefined"
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    const deTabs = screen.getAllByRole('tab', { name: /de/i })
    await user.click(deTabs[0])

    await screen.findByLabelText(/email template editor/i)
    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/template did not render/i)
    expect(banner).toHaveTextContent("'undefined_xyz' is undefined")
  })

  it('shows the per-kind variable catalog in the editor for a saved template (landr-x5o5.5)', async () => {
    mock.state.templates = [makeTemplate()]
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    const deTabs = screen.getAllByRole('tab', { name: /de/i })
    await user.click(deTabs[0])

    await screen.findByLabelText(/email template editor/i)
    const sidebar = await screen.findByRole('complementary', {
      name: /available variables/i,
    })
    expect(sidebar).toHaveTextContent('{{ customer_name }}')
    expect(sidebar).toHaveTextContent('{{ operator_name }}')
  })

  it('shows the per-kind variable catalog even when NO saved template exists (landr-x5o5.5)', async () => {
    // No templates at all — the editor still renders the catalog fed by
    // the variables endpoint, keyed on the selected (default) kind.
    mock.state.templates = []
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    await screen.findByLabelText(/email template editor/i)
    const sidebar = await screen.findByRole('complementary', {
      name: /available variables/i,
    })
    expect(sidebar).toHaveTextContent('{{ customer_name }}')
    expect(sidebar).toHaveTextContent('{{ operator_name }}')
    // Single source: exactly one catalog on the page (none in the preview).
    expect(
      screen.getAllByRole('complementary', { name: /available variables/i }),
    ).toHaveLength(1)
  })

  // landr-x5o5.6 — hotel locale pin
  it('hides locale switcher and shows pin note when hotel_request kind is selected (landr-x5o5.6)', async () => {
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Click Hotel request kind tab
    await user.click(screen.getByRole('tab', { name: /hotel request/i }))

    // Locale switcher (tablist) must be gone
    await waitFor(() => {
      expect(screen.queryByRole('tablist', { name: /language/i })).not.toBeInTheDocument()
    })

    // Pin note must appear with the hotel locale
    expect(screen.getByTestId('hotel-locale-pin-note')).toBeInTheDocument()
    expect(screen.getByTestId('hotel-locale-pin-note')).toHaveTextContent(/hotel emails are always sent in/i)
    expect(screen.getByTestId('hotel-locale-pin-note')).toHaveTextContent(/operator settings/i)
  })

  it('hides locale switcher and shows pin note when hotel_confirmation kind is selected (landr-x5o5.6)', async () => {
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Click Hotel confirmation kind tab
    await user.click(screen.getByRole('tab', { name: /hotel confirmation/i }))

    // Locale switcher (tablist) must be gone
    await waitFor(() => {
      expect(screen.queryByRole('tablist', { name: /language/i })).not.toBeInTheDocument()
    })

    // Pin note must appear
    expect(screen.getByTestId('hotel-locale-pin-note')).toBeInTheDocument()
  })

  it('shows locale switcher (not pin note) for non-hotel kinds (landr-x5o5.6)', async () => {
    render(<EmailTemplates />)
    // Default kind is booking_received — non-hotel
    await screen.findByText('Booking received')

    // Locale tablist must be present
    expect(screen.getByRole('tablist', { name: /language/i })).toBeInTheDocument()
    expect(screen.queryByTestId('hotel-locale-pin-note')).not.toBeInTheDocument()
  })

  it('locale switcher returns after switching from hotel kind back to non-hotel kind (landr-x5o5.6)', async () => {
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Switch to hotel kind — switcher disappears
    await user.click(screen.getByRole('tab', { name: /hotel request/i }))
    await waitFor(() => {
      expect(screen.queryByRole('tablist', { name: /language/i })).not.toBeInTheDocument()
    })

    // Switch back to booking_confirmation (non-hotel) — switcher reappears
    await user.click(screen.getByRole('tab', { name: /booking confirmation/i }))
    await waitFor(() => {
      expect(screen.getByRole('tablist', { name: /language/i })).toBeInTheDocument()
    })
    expect(screen.queryByTestId('hotel-locale-pin-note')).not.toBeInTheDocument()
  })

  // landr-x5o5.7 — hotel_email_locale as the real pin source
  it('hotel locale pin uses hotel_email_locale when set (landr-x5o5.7)', async () => {
    operatorSettingsMock.hotel_email_locale = 'de'
    operatorSettingsMock.default_locale = 'es'

    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Switch to hotel kind
    await user.click(screen.getByRole('tab', { name: /hotel request/i }))

    // Pin note should show DE (from hotel_email_locale), not ES (from default_locale)
    const pinNote = await screen.findByTestId('hotel-locale-pin-note')
    expect(pinNote.textContent).toMatch(/DE/i)
  })

  it('hotel locale pin falls back to default_locale when hotel_email_locale is null (landr-x5o5.7)', async () => {
    operatorSettingsMock.hotel_email_locale = null
    operatorSettingsMock.default_locale = 'en'

    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Switch to hotel kind
    await user.click(screen.getByRole('tab', { name: /hotel request/i }))

    // Pin note should show EN (from default_locale fallback)
    const pinNote = await screen.findByTestId('hotel-locale-pin-note')
    expect(pinNote.textContent).toMatch(/EN/i)
  })

  // landr-x5o5.4 — prefill + badge + divergence guard
  it('prefills the form with the default content when no operator row exists (landr-x5o5.4)', async () => {
    mock.state.templates = []
    mock.state.effectiveOverride = {
      subject: 'Default subject',
      body_html: '<p>Default HTML body</p>',
      body_text: null,
      is_default: true,
      source: 'system_template',
    }
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Wait for the prefill to populate the subject field.
    await screen.findByDisplayValue('Default subject')
    // HTML body should also be prefilled.
    expect(screen.getByDisplayValue('<p>Default HTML body</p>')).toBeInTheDocument()
  })

  it('shows "Using Landr default" badge when is_default is true (landr-x5o5.4)', async () => {
    mock.state.templates = []
    mock.state.effectiveOverride = {
      subject: 'Default subject',
      body_html: '<p>Default body</p>',
      body_text: null,
      is_default: true,
      source: 'system_template',
    }
    render(<EmailTemplates />)
    await screen.findByText('Booking received')
    // Badge should show "Using Landr default"
    await screen.findByText('Using Landr default')
    expect(screen.queryByText('Customized')).not.toBeInTheDocument()
  })

  it('shows "Customized" badge when is_default is false (landr-x5o5.4)', async () => {
    mock.state.templates = [makeTemplate()]
    mock.state.effectiveOverride = {
      subject: 'Operator subject',
      body_html: '<p>Operator body</p>',
      body_text: null,
      is_default: false,
      source: 'operator_template',
    }
    render(<EmailTemplates />)
    await screen.findByText('Booking received')
    await screen.findByText('Customized')
    expect(screen.queryByText('Using Landr default')).not.toBeInTheDocument()
  })

  it('does NOT call createTemplate when saving content identical to the default (landr-x5o5.4)', async () => {
    mock.state.templates = []
    const defaultSubject = 'Default subject for booking_received'
    const defaultBodyHtml = '<p>Default body for booking_received</p>'
    mock.state.effectiveOverride = {
      subject: defaultSubject,
      body_html: defaultBodyHtml,
      body_text: null,
      is_default: true,
      source: 'system_template',
    }
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Wait for prefill.
    await screen.findByDisplayValue(defaultSubject)

    // Click save without changing anything — content equals the default.
    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
    // No create call should have been made.
    expect(mock.state.createCalls).toHaveLength(0)
    // Should show the "no changes" toast.
    expect(toastCalls.success[0]).toMatch(/no changes from the default/i)
  })

  it('calls createTemplate when saving content that differs from the default (landr-x5o5.4)', async () => {
    mock.state.templates = []
    mock.state.effectiveOverride = {
      subject: 'Default subject',
      body_html: '<p>Default body</p>',
      body_text: null,
      is_default: true,
      source: 'system_template',
    }
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Wait for prefill then modify the subject.
    const subjectInput = await screen.findByDisplayValue('Default subject')
    await user.clear(subjectInput)
    await user.type(subjectInput, 'My custom subject')

    await user.click(screen.getByRole('button', { name: /^save$/i }))

    await waitFor(() => {
      expect(mock.state.createCalls.length).toBe(1)
    })
    expect(mock.state.createCalls[0]).toMatchObject({
      template_kind: 'booking_received',
      subject: 'My custom subject',
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
    expect(toastCalls.success[0]).toMatch(/template saved/i)
  })
})
