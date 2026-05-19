import { render, screen, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { EmailTemplatePreview } from './EmailTemplatePreview'
import { buildPreviewSrcDoc } from '@/lib/emailPreview'
import type { EmailTemplate } from '@/lib/emailTemplates'

vi.mock('@/lib/emailTemplates', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/emailTemplates')>()
  return {
    ...actual,
    previewTemplate: vi.fn(async () => ({
      template_kind: 'booking_received',
      locale: 'de',
      subject: 'Hallo',
      body_html: '<p style="color:#111">Hallo {{customer_name}}</p>',
      body_text: 'Hallo',
      fixture: { note: 'not a stub' },
    })),
  }
})

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

function Providers({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>
}

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
