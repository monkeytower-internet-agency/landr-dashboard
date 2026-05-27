import {
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'
import type { UserIdentity } from '@supabase/supabase-js'

const { authMock } = vi.hoisted(() => ({
  authMock: {
    getUserIdentities: vi.fn(),
    linkIdentity: vi.fn(),
    unlinkIdentity: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUserIdentities: (...args: unknown[]) =>
        authMock.getUserIdentities(...args),
      linkIdentity: (...args: unknown[]) => authMock.linkIdentity(...args),
      unlinkIdentity: (...args: unknown[]) =>
        authMock.unlinkIdentity(...args),
      signInWithOAuth: vi.fn(),
    },
  },
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

import { ConnectedAccounts } from './ConnectedAccounts'

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
  })
}

const emailIdentity: UserIdentity = {
  identity_id: 'id-email',
  id: 'user-1',
  user_id: 'user-1',
  identity_data: { email: 'martin@para42.de' },
  provider: 'email',
  created_at: '2026-05-01T00:00:00Z',
  last_sign_in_at: '2026-05-01T00:00:00Z',
  updated_at: '2026-05-01T00:00:00Z',
}

const googleIdentity: UserIdentity = {
  ...emailIdentity,
  identity_id: 'id-google',
  identity_data: { email: 'martin@gmail.com' },
  provider: 'google',
}

beforeEach(() => {
  authMock.getUserIdentities.mockReset()
  authMock.linkIdentity.mockReset()
  authMock.unlinkIdentity.mockReset()
  authMock.linkIdentity.mockResolvedValue({ data: {}, error: null })
  authMock.unlinkIdentity.mockResolvedValue({ error: null })
  toastCalls.success.length = 0
  toastCalls.error.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ConnectedAccounts', () => {
  it('renders email primary row and Google "Not linked" with Connect button', async () => {
    authMock.getUserIdentities.mockResolvedValue({
      data: { identities: [emailIdentity] },
      error: null,
    })
    render(<ConnectedAccounts />)
    await screen.findByText('Email & password')
    expect(screen.getByText('martin@para42.de')).toBeInTheDocument()
    expect(screen.getByText('Google')).toBeInTheDocument()
    expect(screen.getByText('Not linked')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /^connect$/i }),
    ).toBeInTheDocument()
  })

  it('shows Disconnect button when Google is linked alongside email', async () => {
    authMock.getUserIdentities.mockResolvedValue({
      data: { identities: [emailIdentity, googleIdentity] },
      error: null,
    })
    render(<ConnectedAccounts />)
    await screen.findByText('martin@gmail.com')
    const disconnect = screen.getByRole('button', { name: /^disconnect$/i })
    expect(disconnect).toBeEnabled()
  })

  it('disables Disconnect when Google is the only identity', async () => {
    authMock.getUserIdentities.mockResolvedValue({
      data: { identities: [googleIdentity] },
      error: null,
    })
    render(<ConnectedAccounts />)
    await screen.findByText('martin@gmail.com')
    const disconnect = screen.getByRole('button', { name: /^disconnect$/i })
    expect(disconnect).toBeDisabled()
  })

  it('calls linkIdentity({ provider: "google" }) on Connect click', async () => {
    authMock.getUserIdentities.mockResolvedValue({
      data: { identities: [emailIdentity] },
      error: null,
    })
    const user = userEvent.setup()
    render(<ConnectedAccounts />)

    await user.click(
      await screen.findByRole('button', { name: /^connect$/i }),
    )
    await waitFor(() => {
      expect(authMock.linkIdentity).toHaveBeenCalledWith(
        expect.objectContaining({ provider: 'google' }),
      )
    })
  })

  it('calls unlinkIdentity after confirm and shows success toast', async () => {
    authMock.getUserIdentities.mockResolvedValue({
      data: { identities: [emailIdentity, googleIdentity] },
      error: null,
    })
    const user = userEvent.setup()
    render(<ConnectedAccounts />)

    await user.click(
      await screen.findByRole('button', { name: /^disconnect$/i }),
    )
    // Confirm dialog opens with an action button labelled Disconnect too.
    const confirmBtns = await screen.findAllByRole('button', {
      name: /disconnect/i,
    })
    // The dialog's action button is the second one.
    await user.click(confirmBtns[confirmBtns.length - 1])

    await waitFor(() => {
      expect(authMock.unlinkIdentity).toHaveBeenCalledWith(googleIdentity)
    })
    await waitFor(() => {
      expect(toastCalls.success.length).toBeGreaterThan(0)
    })
  })

  it('shows error toast when unlinkIdentity fails', async () => {
    authMock.getUserIdentities.mockResolvedValue({
      data: { identities: [emailIdentity, googleIdentity] },
      error: null,
    })
    authMock.unlinkIdentity.mockResolvedValue({
      error: { message: 'cannot remove' },
    })
    const user = userEvent.setup()
    render(<ConnectedAccounts />)

    await user.click(
      await screen.findByRole('button', { name: /^disconnect$/i }),
    )
    const confirmBtns = await screen.findAllByRole('button', {
      name: /disconnect/i,
    })
    await user.click(confirmBtns[confirmBtns.length - 1])

    await waitFor(() => {
      expect(toastCalls.error.length).toBeGreaterThan(0)
    })
  })
})
