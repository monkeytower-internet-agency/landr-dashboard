import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock } = vi.hoisted(() => ({
  authMock: {
    onAuthStateChange: vi.fn(),
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn(),
    updateUser: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      onAuthStateChange: (...args: unknown[]) =>
        authMock.onAuthStateChange(...args),
      exchangeCodeForSession: (...args: unknown[]) =>
        authMock.exchangeCodeForSession(...args),
      getSession: (...args: unknown[]) => authMock.getSession(...args),
      updateUser: (...args: unknown[]) => authMock.updateUser(...args),
    },
  },
}))

const toastMock = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }))
vi.mock('sonner', () => ({ toast: toastMock }))

import { ResetPassword } from './ResetPassword'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/reset-password" element={<ResetPassword />} />
        <Route path="/forgot-password" element={<div>FORGOT ROUTE</div>} />
        <Route path="/" element={<div>HOME ROUTE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  authMock.onAuthStateChange.mockReset()
  authMock.exchangeCodeForSession.mockReset()
  authMock.getSession.mockReset()
  authMock.updateUser.mockReset()
  toastMock.success.mockReset()

  // Default: a no-op subscription.
  authMock.onAuthStateChange.mockReturnValue({
    data: { subscription: { unsubscribe: vi.fn() } },
  })
  authMock.getSession.mockResolvedValue({ data: { session: null } })
  authMock.updateUser.mockResolvedValue({ data: {}, error: null })

  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL('https://dashboard-staging.landr.de/reset-password'),
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ResetPassword', () => {
  it('shows the invalid-link state when there is no code and no session', async () => {
    renderAt('/reset-password')
    await waitFor(() =>
      expect(
        screen.getByText(/invalid or has expired/i),
      ).toBeInTheDocument(),
    )
  })

  it('exchanges the recovery code and reveals the form', async () => {
    authMock.exchangeCodeForSession.mockResolvedValue({ error: null })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(
        'https://dashboard-staging.landr.de/reset-password?code=abc123',
      ),
    })
    renderAt('/reset-password?code=abc123')
    await waitFor(() =>
      expect(authMock.exchangeCodeForSession).toHaveBeenCalled(),
    )
    expect(
      await screen.findByLabelText(/^new password$/i),
    ).toBeInTheDocument()
  })

  it('rejects too-short and mismatched passwords before calling updateUser', async () => {
    authMock.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    })
    const user = userEvent.setup()
    renderAt('/reset-password')
    const newPw = await screen.findByLabelText(/^new password$/i)
    const confirm = screen.getByLabelText(/confirm new password/i)

    await user.type(newPw, 'short')
    await user.type(confirm, 'short')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    expect(authMock.updateUser).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/at least 8/i)

    await user.clear(newPw)
    await user.clear(confirm)
    await user.type(newPw, 'longenough1')
    await user.type(confirm, 'different123')
    await user.click(screen.getByRole('button', { name: /update password/i }))
    expect(authMock.updateUser).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent(/do not match/i)
  })

  it('updates the password and routes home on success', async () => {
    authMock.getSession.mockResolvedValue({
      data: { session: { user: { id: 'u1' } } },
    })
    const user = userEvent.setup()
    renderAt('/reset-password')
    const newPw = await screen.findByLabelText(/^new password$/i)
    const confirm = screen.getByLabelText(/confirm new password/i)
    await user.type(newPw, 'longenough1')
    await user.type(confirm, 'longenough1')
    await user.click(screen.getByRole('button', { name: /update password/i }))

    await waitFor(() =>
      expect(authMock.updateUser).toHaveBeenCalledWith({
        password: 'longenough1',
      }),
    )
    await waitFor(() =>
      expect(screen.getByText('HOME ROUTE')).toBeInTheDocument(),
    )
    expect(toastMock.success).toHaveBeenCalled()
  })
})
