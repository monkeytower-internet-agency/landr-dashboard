import { render, screen, waitFor } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { authMock } = vi.hoisted(() => ({
  authMock: {
    exchangeCodeForSession: vi.fn(),
    getSession: vi.fn(),
  },
}))

vi.mock('@/lib/supabase', () => ({
  supabase: {
    auth: {
      exchangeCodeForSession: (...args: unknown[]) =>
        authMock.exchangeCodeForSession(...args),
      getSession: (...args: unknown[]) => authMock.getSession(...args),
    },
  },
}))

import { AuthCallback } from './AuthCallback'

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/login" element={<div>LOGIN ROUTE</div>} />
        <Route path="/" element={<div>HOME ROUTE</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  authMock.exchangeCodeForSession.mockReset()
  authMock.getSession.mockReset()
  authMock.getSession.mockResolvedValue({ data: { session: null } })
  // jsdom doesn't always set href the way we need; stub window.location.search
  // via a getter on the URL the component reads.
  Object.defineProperty(window, 'location', {
    configurable: true,
    value: new URL('http://localhost/auth/callback'),
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AuthCallback', () => {
  it('redirects duplicate-identity error_code to /login?error=email_in_use', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(
        'http://localhost/auth/callback?error=server_error&error_code=identity_already_exists&error_description=already',
      ),
    })
    renderAt(
      '/auth/callback?error=server_error&error_code=identity_already_exists&error_description=already',
    )
    await screen.findByText('LOGIN ROUTE')
  })

  it('redirects email_exists error_code to /login?error=email_in_use', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(
        'http://localhost/auth/callback?error=server_error&error_code=email_exists',
      ),
    })
    renderAt('/auth/callback?error=server_error&error_code=email_exists')
    await screen.findByText('LOGIN ROUTE')
  })

  it('redirects unknown OAuth error to /login?error=unknown', async () => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL(
        'http://localhost/auth/callback?error=access_denied&error_code=user_denied',
      ),
    })
    renderAt('/auth/callback?error=access_denied&error_code=user_denied')
    await screen.findByText('LOGIN ROUTE')
  })

  it('exchanges PKCE code and routes home on success', async () => {
    authMock.exchangeCodeForSession.mockResolvedValue({ error: null })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost/auth/callback?code=abc123'),
    })
    renderAt('/auth/callback?code=abc123')
    await screen.findByText('HOME ROUTE')
    await waitFor(() =>
      expect(authMock.exchangeCodeForSession).toHaveBeenCalled(),
    )
  })

  it('routes duplicate-identity error from code-exchange to /login', async () => {
    authMock.exchangeCodeForSession.mockResolvedValue({
      error: { code: 'identity_already_exists', message: 'collision' },
    })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost/auth/callback?code=abc123'),
    })
    renderAt('/auth/callback?code=abc123')
    await screen.findByText('LOGIN ROUTE')
  })

  it('routes unknown error from code-exchange to /login?error=unknown', async () => {
    authMock.exchangeCodeForSession.mockResolvedValue({
      error: { code: 'server_error', message: 'boom' },
    })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost/auth/callback?code=abc123'),
    })
    renderAt('/auth/callback?code=abc123')
    await screen.findByText('LOGIN ROUTE')
  })

  it('falls back to home when implicit-flow session is detected', async () => {
    authMock.getSession.mockResolvedValue({
      data: { session: { access_token: 'tok' } },
    })
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: new URL('http://localhost/auth/callback'),
    })
    renderAt('/auth/callback')
    await screen.findByText('HOME ROUTE')
  })
})
