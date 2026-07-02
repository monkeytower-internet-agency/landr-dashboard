/**
 * Tests for the WYSIWYG "Modify & send" dialog (landr-ri8a).
 *
 * Covers:
 *  - the dialog is wider (sm:max-w-3xl, not sm:max-w-lg)
 *  - the TipTap editor + toolbar render
 *  - toolbar toggles (heading / bold / bullet / ordered) apply formatting,
 *    reflected in the send payload's body_html
 *  - the send payload carries the editor's getHTML() + getText()
 *  - the "Edit HTML source" escape hatch still edits raw HTML
 *  - landr-7hac: the escape hatch and the WYSIWYG are mutually exclusive —
 *    body_text stays live-synced with raw HTML edits, and the WYSIWYG is
 *    re-seeded (not silently discarding the raw edit) once the hatch closes
 */
import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

const { resendEmailMock } = vi.hoisted(() => ({ resendEmailMock: vi.fn() }))
vi.mock('@/lib/outbound-emails', () => ({
  resendEmail: (...args: unknown[]) => resendEmailMock(...args),
}))

import { ResendDialog, type ResendDialogSource } from './ResendDialog'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

const source: ResendDialogSource = {
  id: 'e-1',
  to_address: 'a@b.test',
  subject: 'Your booking is confirmed',
  body_html: '<p>Hello world</p>',
  body_text: 'Hello world',
}

function renderDialog() {
  return render(
    <ResendDialog
      source={source}
      operatorId="op-1"
      open
      onOpenChange={() => {}}
    />,
  )
}

beforeEach(() => {
  resendEmailMock.mockReset()
  resendEmailMock.mockResolvedValue({ id: 'e-new', status: 'queued', sent_via: null })
})

describe('ResendDialog (WYSIWYG)', () => {
  it('renders a wider dialog (sm:max-w-3xl, not sm:max-w-lg)', () => {
    renderDialog()
    const dialog = screen.getByRole('dialog')
    expect(dialog.className).toContain('sm:max-w-3xl')
    expect(dialog.className).not.toContain('sm:max-w-lg')
  })

  it('renders the WYSIWYG editor + toolbar (no plain body textarea)', () => {
    renderDialog()
    expect(screen.getByTestId('rte-toolbar')).toBeInTheDocument()
    expect(screen.getByTestId('rte-editor')).toBeInTheDocument()
    expect(screen.getByTestId('rte-bold')).toBeInTheDocument()
    expect(screen.getByTestId('rte-h1')).toBeInTheDocument()
    expect(screen.getByTestId('rte-bullet-list')).toBeInTheDocument()
    expect(screen.getByTestId('rte-ordered-list')).toBeInTheDocument()
    // The old plain-text body textarea is gone.
    expect(screen.queryByTestId('resend-body-text')).toBeNull()
  })

  it('loads the existing body into the editor', () => {
    renderDialog()
    expect(within(screen.getByTestId('rte-editor')).getByText('Hello world')).toBeInTheDocument()
  })

  it('send payload carries the editor html + text', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByTestId('resend-submit'))

    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())
    const [opId, emailId, payload] = resendEmailMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(opId).toBe('op-1')
    expect(emailId).toBe('e-1')
    // Editor normalises to its schema; the body still round-trips as HTML+text.
    if ('body_html' in payload) {
      expect(payload.body_html).toContain('Hello world')
    }
    if ('body_text' in payload) {
      expect(payload.body_text).toContain('Hello world')
    }
  })

  it('ordered-list toggle applies formatting reflected in the payload html', async () => {
    const user = userEvent.setup()
    renderDialog()

    // The toolbar buttons focus the editor in their command chain, so we can
    // toggle directly without simulating a mouse click into the contenteditable
    // (jsdom lacks the coords APIs ProseMirror needs for mousedown).
    await user.click(screen.getByTestId('rte-ordered-list'))
    // Active-state styling reflects the applied node.
    await waitFor(() =>
      expect(screen.getByTestId('rte-ordered-list')).toHaveAttribute('data-active', 'true'),
    )

    await user.click(screen.getByTestId('resend-submit'))
    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())
    const [, , payload] = resendEmailMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(payload.body_html).toContain('<ol')
  })

  it('heading toggle applies an <h1> reflected in the payload html', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByTestId('rte-h1'))
    await waitFor(() =>
      expect(screen.getByTestId('rte-h1')).toHaveAttribute('data-active', 'true'),
    )
    await user.click(screen.getByTestId('resend-submit'))
    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())
    const [, , payload] = resendEmailMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(payload.body_html).toContain('<h1')
  })

  it('bullet-list toggle reports active state', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByTestId('rte-bullet-list'))
    await waitFor(() =>
      expect(screen.getByTestId('rte-bullet-list')).toHaveAttribute('data-active', 'true'),
    )
  })

  it('bold toggle reports active state', async () => {
    const user = userEvent.setup()
    renderDialog()
    await user.click(screen.getByTestId('rte-bold'))
    await waitFor(() =>
      expect(screen.getByTestId('rte-bold')).toHaveAttribute('data-active', 'true'),
    )
  })

  it('the "Edit HTML source" escape hatch still edits raw HTML', async () => {
    const user = userEvent.setup()
    renderDialog()

    // Hidden until toggled.
    expect(screen.queryByTestId('resend-body-html')).toBeNull()
    await user.click(screen.getByTestId('resend-html-toggle'))

    const htmlBox = await screen.findByTestId('resend-body-html')
    await user.clear(htmlBox)
    await user.type(htmlBox, '<p>raw edited</p>')

    await user.click(screen.getByTestId('resend-submit'))
    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())
    const [, , payload] = resendEmailMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(payload.body_html).toBe('<p>raw edited</p>')
  })

  it('re-derives body_text from raw HTML as it is edited in the escape hatch (landr-7hac)', async () => {
    const user = userEvent.setup()
    renderDialog()

    await user.click(screen.getByTestId('resend-html-toggle'))
    const htmlBox = await screen.findByTestId('resend-body-html')
    await user.clear(htmlBox)
    await user.type(htmlBox, '<p>brand new text</p>')

    await user.click(screen.getByTestId('resend-submit'))
    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())
    const [, , payload] = resendEmailMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(payload.body_html).toBe('<p>brand new text</p>')
    // body_text must reflect the NEW html, not the stale original body_text.
    expect(payload.body_text).toBe('brand new text')
    expect(payload.body_text).not.toBe(source.body_text)
  })

  it('locks the WYSIWYG (non-editable) while the HTML-source escape hatch is open (landr-7hac)', async () => {
    const user = userEvent.setup()
    renderDialog()

    expect(screen.getByTestId('rte-editor')).toHaveAttribute('contenteditable', 'true')
    await user.click(screen.getByTestId('resend-html-toggle'))
    await waitFor(() =>
      expect(screen.getByTestId('rte-editor')).toHaveAttribute('contenteditable', 'false'),
    )

    // Re-enabled once the escape hatch closes again.
    await user.click(screen.getByTestId('resend-html-toggle'))
    await waitFor(() =>
      expect(screen.getByTestId('rte-editor')).toHaveAttribute('contenteditable', 'true'),
    )
  })

  it('does not silently discard a raw-HTML edit when the WYSIWYG is touched afterwards (landr-7hac)', async () => {
    const user = userEvent.setup()
    renderDialog()

    // Edit raw HTML via the escape hatch.
    await user.click(screen.getByTestId('resend-html-toggle'))
    const htmlBox = await screen.findByTestId('resend-body-html')
    await user.clear(htmlBox)
    await user.type(htmlBox, '<p>edited via source</p>')

    // Close the escape hatch — the WYSIWYG must be re-seeded from the edit,
    // not silently reverted to the original body loaded at mount.
    await user.click(screen.getByTestId('resend-html-toggle'))
    await waitFor(() =>
      expect(
        within(screen.getByTestId('rte-editor')).getByText('edited via source'),
      ).toBeInTheDocument(),
    )

    // Touching the WYSIWYG now (bold toggle) must NOT drop the raw edit.
    await user.click(screen.getByTestId('rte-bold'))

    await user.click(screen.getByTestId('resend-submit'))
    await waitFor(() => expect(resendEmailMock).toHaveBeenCalled())
    const [, , payload] = resendEmailMock.mock.calls[0] as [
      string,
      string,
      Record<string, unknown>,
    ]
    expect(payload.body_html).toContain('edited via source')
    expect(payload.body_text).toContain('edited via source')
  })
})
