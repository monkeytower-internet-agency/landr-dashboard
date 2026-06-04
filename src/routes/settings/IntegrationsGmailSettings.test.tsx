import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const settingsMock = vi.hoisted(() => ({
  fetchGmailStatus: vi.fn(),
  fetchGmailInstallUrl: vi.fn(),
  disconnectGmail: vi.fn(),
}))

vi.mock('@/lib/operatorSettings', () => settingsMock)

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({ currentOperatorId: 'op-1' }),
}))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { IntegrationsGmailSettings } from './IntegrationsGmailSettings'

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <IntegrationsGmailSettings />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  settingsMock.fetchGmailStatus.mockResolvedValue({ connected: false })
  settingsMock.fetchGmailInstallUrl.mockResolvedValue({
    install_url: 'https://accounts.google.com/o/oauth2/auth?x=1',
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

// landr-tq28 regression: the connect popup was opened with 'noopener',
// which makes window.open() return NULL by spec — popupRef stayed empty,
// the dashboard tab navigated to Google, and the popup sat on about:blank.
describe('IntegrationsGmailSettings — OAuth popup (landr-tq28)', () => {
  it('routes the install URL into the popup handle, never the dashboard tab', async () => {
    const fakePopup = {
      location: { href: 'about:blank' },
      close: vi.fn(),
    } as unknown as Window
    const openSpy = vi
      .spyOn(window, 'open')
      .mockReturnValue(fakePopup)

    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: /connect/i }),
    )

    // The popup must be opened synchronously (popup-blocker rule)…
    expect(openSpy).toHaveBeenCalledTimes(1)
    // …WITHOUT 'noopener' (it nulls the return value by spec).
    const features = String(openSpy.mock.calls[0]?.[2] ?? '')
    expect(features).not.toMatch(/noopener/i)
    // The OAuth URL lands in the POPUP, not the current tab.
    await waitFor(() =>
      expect((fakePopup as Window).location.href).toBe(
        'https://accounts.google.com/o/oauth2/auth?x=1',
      ),
    )
  })

  it('falls back to same-tab navigation only when the popup was blocked', async () => {
    vi.spyOn(window, 'open').mockReturnValue(null)
    // jsdom forbids real navigation; stub location with a writable double.
    const original = window.location
    Object.defineProperty(window, 'location', {
      writable: true,
      value: { ...original, href: original.href },
    })

    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: /connect/i }),
    )

    await waitFor(() =>
      expect(window.location.href).toBe(
        'https://accounts.google.com/o/oauth2/auth?x=1',
      ),
    )
    Object.defineProperty(window, 'location', {
      writable: true,
      value: original,
    })
  })

  it('closes the popup and toasts on install-url fetch failure', async () => {
    const closeMock = vi.fn()
    const fakePopup = {
      location: { href: 'about:blank' },
      close: closeMock,
    } as unknown as Window
    vi.spyOn(window, 'open').mockReturnValue(fakePopup)
    settingsMock.fetchGmailInstallUrl.mockRejectedValue(
      new Error('install url failed'),
    )

    const user = userEvent.setup()
    renderPage()
    await user.click(
      await screen.findByRole('button', { name: /connect/i }),
    )

    await waitFor(() => expect(toastMock.error).toHaveBeenCalled())
    expect(closeMock).toHaveBeenCalled()
  })
})
