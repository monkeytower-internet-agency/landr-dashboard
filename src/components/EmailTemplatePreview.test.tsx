import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { EmailTemplatePreview, EmailVariableCatalog } from './EmailTemplatePreview'
import { buildPreviewSrcDoc } from '@/lib/emailPreview'
import type {
  EmailTemplate,
  PreviewResult,
  VariableCatalogEntry,
} from '@/lib/emailTemplates'

// --- Hoisted mocks ---

const { mock } = vi.hoisted(() => {
  const state = {
    nextResult: null as PreviewResult | null,
  }
  return { mock: { state } }
})

vi.mock('@/lib/emailTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/emailTemplates')>()
  return {
    ...actual,
    previewTemplate: vi.fn(async () => {
      if (!mock.state.nextResult) throw new Error('test: nextResult not set')
      return mock.state.nextResult
    }),
  }
})

const toastSuccess = vi.fn()
const toastError = vi.fn()
vi.mock('sonner', () => ({
  toast: {
    success: (msg: string) => toastSuccess(msg),
    error: (msg: string) => toastError(msg),
  },
}))

// --- Fixtures ---

const TEMPLATE: EmailTemplate = {
  id: 't-1',
  operator_id: 'op-1',
  template_kind: 'booking_received',
  locale: 'de',
  subject: 'Hallo',
  body_html: '<p style="color:#111">Hallo {{customer_name}}</p>',
  body_text: 'Hallo',
  active: true,
  created_at: '2026-05-19T00:00:00.000Z',
  updated_at: '2026-05-19T00:00:00.000Z',
}

const SAMPLE_CONTEXT = {
  customer_name: 'Sample Customer',
  customer_first_name: 'Sample',
  customer_last_name: 'Customer',
  operator_name: 'Sample Operator',
  start_date: '2026-06-01',
}

function buildResult(over: Partial<PreviewResult> = {}): PreviewResult {
  return {
    template_kind: 'booking_received',
    locale: 'de',
    subject: 'Hallo Sample Customer',
    body_html: '<p style="color:#111">Hallo Sample Customer</p>',
    body_text: 'Hallo Sample Customer',
    render_error: null,
    fixture: { note: 'sample', context: SAMPLE_CONTEXT },
    ...over,
  }
}

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

// --- Tests ---

beforeEach(() => {
  mock.state.nextResult = buildResult()
  toastSuccess.mockReset()
  toastError.mockReset()
})

afterEach(() => {
  vi.useRealTimers()
})

describe('buildPreviewSrcDoc', () => {
  it('wraps the body html in a full document with forced light styles', () => {
    const doc = buildPreviewSrcDoc('<p>hi</p>')
    expect(doc).toContain('<!doctype html>')
    expect(doc).toContain('color-scheme: light')
    expect(doc).toContain('background: #ffffff')
    expect(doc).toContain('<p>hi</p>')
  })

  it('embeds the original body markup verbatim inside <body>', () => {
    const body = '<a href="https://example.com">click</a>'
    const doc = buildPreviewSrcDoc(body)
    expect(doc).toContain(body)
  })
})

describe('EmailTemplatePreview iframe', () => {
  it('renders the HTML body inside an iframe whose srcDoc forces a light surface', async () => {
    mock.state.nextResult = buildResult({
      body_html: '<p style="color:#111">Hallo {{customer_name}}</p>',
    })
    render(
      <Providers>
        <EmailTemplatePreview operatorId="op-1" template={TEMPLATE} />
      </Providers>,
    )

    const iframe = await waitFor(() => {
      const el = screen.getByTitle(/email html preview/i) as HTMLIFrameElement
      if (!el.getAttribute('srcdoc')) throw new Error('srcdoc not set yet')
      return el
    })

    const srcDoc = iframe.getAttribute('srcdoc') ?? ''
    expect(srcDoc).toContain('color-scheme: light')
    expect(srcDoc).toContain('background: #ffffff')
    expect(srcDoc).toContain('Hallo {{customer_name}}')
    expect(iframe.getAttribute('sandbox')).toBe('')
  })
})

describe('EmailTemplatePreview render_error', () => {
  it('shows the render_error banner below the iframe when set', async () => {
    mock.state.nextResult = buildResult({
      render_error: "'undefined_xyz' is undefined",
    })
    render(
      <Providers>
        <EmailTemplatePreview operatorId="op-1" template={TEMPLATE} />
      </Providers>,
    )

    const banner = await screen.findByRole('alert')
    expect(banner).toHaveTextContent(/template did not render/i)
    expect(banner).toHaveTextContent("'undefined_xyz' is undefined")
    // The iframe is still rendered alongside the banner so the operator
    // can see whatever partial output the engine produced.
    expect(screen.getByTitle(/email html preview/i)).toBeInTheDocument()
  })

  it('omits the render_error banner when render_error is null', async () => {
    render(
      <Providers>
        <EmailTemplatePreview operatorId="op-1" template={TEMPLATE} />
      </Providers>,
    )

    await screen.findByTitle(/email html preview/i)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('EmailTemplatePreview variable catalog', () => {
  // landr-x5o5.5: the catalog moved out of the preview into the editor
  // (single source, fed by the per-kind variables endpoint). The preview
  // no longer renders a catalog — assert it is gone here.
  it('does NOT render a variable catalog inside the preview', async () => {
    render(
      <Providers>
        <EmailTemplatePreview operatorId="op-1" template={TEMPLATE} />
      </Providers>,
    )

    await screen.findByTitle(/email html preview/i)
    expect(
      screen.queryByRole('complementary', { name: /available variables/i }),
    ).not.toBeInTheDocument()
  })
})

// landr-x5o5.5: EmailVariableCatalog is now an exported, standalone
// component fed by the per-kind variables endpoint. These tests cover the
// chip rendering, copy-to-clipboard behaviour, and empty state directly.
describe('EmailVariableCatalog', () => {
  const ENTRIES: VariableCatalogEntry[] = [
    { name: 'customer_name', sample: 'Sample Customer', description: 'Customer full name' },
    { name: 'operator_name', sample: 'Sample Operator', description: 'Operator / business name' },
    { name: 'start_date', sample: '2026-06-01', description: 'Booking start date' },
  ]

  it('renders one chip per entry with the Jinja placeholder', () => {
    render(<EmailVariableCatalog entries={ENTRIES} />)

    const sidebar = screen.getByRole('complementary', {
      name: /available variables/i,
    })
    for (const entry of ENTRIES) {
      const chip = screen.getByLabelText(
        new RegExp(`copy {{ ${entry.name} }} to clipboard`, 'i'),
      )
      expect(chip).toBeInTheDocument()
      expect(chip).toHaveTextContent(`{{ ${entry.name} }}`)
    }
    expect(sidebar).toHaveTextContent('{{ customer_name }}')
  })

  it('copies the Jinja placeholder to the clipboard when a chip is clicked', async () => {
    const writeText = vi.fn(async () => undefined)
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText },
    })
    render(<EmailVariableCatalog entries={ENTRIES} />)

    const chip = screen.getByLabelText(/copy {{ customer_name }} to clipboard/i)
    chip.click()

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith('{{ customer_name }}')
    })
    await waitFor(() => {
      expect(toastSuccess).toHaveBeenCalledWith('Copied to clipboard.')
    })
  })

  it('shows the empty-state copy when there are no entries', () => {
    render(<EmailVariableCatalog entries={[]} />)
    expect(
      screen.getByText(/no variables available for this template type\./i),
    ).toBeInTheDocument()
  })
})
