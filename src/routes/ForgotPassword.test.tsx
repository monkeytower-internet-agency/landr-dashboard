import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock } = vi.hoisted(() => ({
  authMock: {
    resetPasswordForEmail: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      resetPasswordForEmail: (...args: unknown[]) =>
        authMock.resetPasswordForEmail(...args),
    },
  },
}))

import { ForgotPassword } from './ForgotPassword'

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/forgot-password']}>
      <Routes>
        <Route path="/forgot-password" element={<ForgotPassword />} />
        <Route path="/login" element={<div>LOGIN ROUTE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  authMock.resetPasswordForEmail.mockReset()
  authMock.resetPasswordForEmail.mockResolvedValue({ data: {}, error: null })
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL('https://dashboard-staging.landr.de/forgot-password'),
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ForgotPassword', () => {
  it('validates the email before submitting', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    expect(authMock.resetPasswordForEmail).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })

  it('calls resetPasswordForEmail with a redirectTo built from window.location.origin', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/email/i), 'seed@para42.example')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(authMock.resetPasswordForEmail).toHaveBeenCalledWith(
        'seed@para42.example',
        { redirectTo: 'https://dashboard-staging.landr.de/reset-password' },
      ),
    )
  })

  it('shows the neutral confirmation regardless of account existence', async () => {
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/email/i), 'seed@para42.example')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument(),
    )
    // No leak of whether the account exists.
    expect(screen.getByText(/if an account exists/i)).toBeInTheDocument()
  })

  it('still shows the confirmation when Supabase errors (no enumeration)', async () => {
    authMock.resetPasswordForEmail.mockRejectedValue(new Error('boom'))
    const user = userEvent.setup()
    renderPage()
    await user.type(screen.getByLabelText(/email/i), 'seed@para42.example')
    await user.click(screen.getByRole('button', { name: /send reset link/i }))
    await waitFor(() =>
      expect(screen.getByText(/check your inbox/i)).toBeInTheDocument(),
    )
  })
})
