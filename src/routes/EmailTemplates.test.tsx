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
        fixture: {
          note: 'v1 stub: raw template returned without variable substitution',
          booking_id: '00000000-0000-0000-0000-000000000000',
        },
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
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('EmailTemplates route', () => {
  it('renders three kind cards with locale tabs', async () => {
    render(<EmailTemplates />)
    await screen.findByText('Booking received')
    expect(screen.getByText('Hotel request')).toBeInTheDocument()
    expect(screen.getByText('Booking confirmation')).toBeInTheDocument()
    // Each card has two locale tab buttons
    const deTabs = screen.getAllByRole('button', { name: /de/i })
    expect(deTabs.length).toBeGreaterThanOrEqual(3)
  })

  it('shows "Custom" badge when a template row exists for that locale', async () => {
    mock.state.templates = [makeTemplate()]
    render(<EmailTemplates />)
    await screen.findByText('Booking received')
    expect(screen.getByText('Custom')).toBeInTheDocument()
  })

  it('opens edit form when a locale tab is clicked', async () => {
    mock.state.templates = [makeTemplate()]
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    // Click the 'de' tab in the first card
    const deTabs = screen.getAllByRole('button', { name: /de/i })
    await user.click(deTabs[0])

    // Form should be visible
    await screen.findByLabelText(/email template editor/i)
    expect(screen.getByDisplayValue('Buchung erhalten')).toBeInTheDocument()
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
    const deTabs = screen.getAllByRole('button', { name: /de/i })
    await user.click(deTabs[0])
    await screen.findByDisplayValue('Buchung erhalten')

    // Switch to en
    const enTabs = screen.getAllByRole('button', { name: /en/i })
    await user.click(enTabs[0])
    await screen.findByDisplayValue('Booking received')
  })

  it('edits subject and saves via PATCH when template already exists', async () => {
    mock.state.templates = [makeTemplate()]
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    const deTabs = screen.getAllByRole('button', { name: /de/i })
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

  it('creates a new template via POST when no row exists for that locale', async () => {
    mock.state.templates = []
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    const deTabs = screen.getAllByRole('button', { name: /de/i })
    await user.click(deTabs[0])

    const form = await screen.findByLabelText(/email template editor/i)
    const subjectInput = within(form).getByLabelText(/subject/i)
    await user.type(subjectInput, 'Buchung erhalten')

    const htmlInput = within(form).getByLabelText(/html body/i)
    await user.type(htmlInput, '<p>Hallo</p>')

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

    const deTabs = screen.getAllByRole('button', { name: /de/i })
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

  it('shows stub banner in preview when backend returns v1 stub fixture', async () => {
    mock.state.templates = [makeTemplate()]
    const user = userEvent.setup()
    render(<EmailTemplates />)
    await screen.findByText('Booking received')

    const deTabs = screen.getAllByRole('button', { name: /de/i })
    await user.click(deTabs[0])

    await screen.findByLabelText(/email template editor/i)
    await screen.findByText(/live preview lands when the email sender ships/i)
  })
})
