import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock } = vi.hoisted(() => ({
  authMock: {
    getUser: vi.fn(),
    signInWithPassword: vi.fn(),
    updateUser: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      getUser: (...a: unknown[]) => authMock.getUser(...a),
      signInWithPassword: (...a: unknown[]) => authMock.signInWithPassword(...a),
      updateUser: (...a: unknown[]) => authMock.updateUser(...a),
    },
  },
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ user: { email: 'seed@para42.example' } }),
}))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { SecuritySettings } from './SecuritySettings'

function renderPage() {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter>
        <SecuritySettings />
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  authMock.getUser.mockReset()
  authMock.signInWithPassword.mockReset()
  authMock.updateUser.mockReset()
  toastMock.success.mockReset()
  // Default: an account WITH a password (app_metadata.providers includes
  // 'email') — even with no auth.identities rows, as seeded operators have.
  authMock.getUser.mockResolvedValue({
    data: { user: { app_metadata: { providers: ['email'] } } },
    error: null,
  })
  authMock.signInWithPassword.mockResolvedValue({ data: {}, error: null })
  authMock.updateUser.mockResolvedValue({ data: {}, error: null })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SecuritySettings', () => {
  it('shows the set-password form (no current-password field) when the user has no email identity', async () => {
    authMock.getUser.mockResolvedValue({
      data: { user: { app_metadata: { providers: ['google'] } } },
      error: null,
    })
    renderPage()
    expect(
      await screen.findByRole('button', { name: /set password/i }),
    ).toBeInTheDocument()
    expect(
      screen.queryByLabelText(/current password/i),
    ).not.toBeInTheDocument()
  })

  it('sets a password for a provider-only user without a current-password check', async () => {
    authMock.getUser.mockResolvedValue({
      data: { user: { app_metadata: { providers: ['google'] } } },
      error: null,
    })
    const user = userEvent.setup()
    renderPage()
    await user.type(
      await screen.findByLabelText(/^new password$/i),
      'longenough1',
    )
    await user.type(
      screen.getByLabelText(/confirm new password/i),
      'longenough1',
    )
    await user.click(screen.getByRole('button', { name: /set password/i }))

    await waitFor(() =>
      expect(authMock.updateUser).toHaveBeenCalledWith({
        password: 'longenough1',
      }),
    )
    expect(authMock.signInWithPassword).not.toHaveBeenCalled()
    expect(toastMock.success).toHaveBeenCalled()
  })

  it('verifies the current password before updating', async () => {
    authMock.signInWithPassword.mockResolvedValue({
      data: {},
      error: { message: 'Invalid login credentials' },
    })
    const user = userEvent.setup()
    renderPage()
    await user.type(
      await screen.findByLabelText(/current password/i),
      'wrongpass',
    )
    await user.type(screen.getByLabelText(/^new password$/i), 'longenough1')
    await user.type(screen.getByLabelText(/confirm new password/i), 'longenough1')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(/incorrect/i),
    )
    expect(authMock.updateUser).not.toHaveBeenCalled()
  })

  it('updates the password on a successful current-password check', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(
      await screen.findByLabelText(/current password/i),
      'oldpassword1',
    )
    await user.type(screen.getByLabelText(/^new password$/i), 'longenough1')
    await user.type(screen.getByLabelText(/confirm new password/i), 'longenough1')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() =>
      expect(authMock.signInWithPassword).toHaveBeenCalledWith({
        email: 'seed@para42.example',
        password: 'oldpassword1',
      }),
    )
    await waitFor(() =>
      expect(authMock.updateUser).toHaveBeenCalledWith({
        password: 'longenough1',
      }),
    )
    expect(toastMock.success).toHaveBeenCalled()
  })

  it('rejects a new password equal to the current one', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(
      await screen.findByLabelText(/current password/i),
      'samepass123',
    )
    await user.type(screen.getByLabelText(/^new password$/i), 'samepass123')
    await user.type(screen.getByLabelText(/confirm new password/i), 'samepass123')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    expect(screen.getByRole('alert')).toHaveTextContent(/different/i)
    expect(authMock.signInWithPassword).not.toHaveBeenCalled()
  })
})
