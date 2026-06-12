// landr-v9e4.11 — Login page tests.
//
// Covers:
//   1. Empty-fields validation gate: submitting with a blank email and/or
//      blank password shows inline field errors, does NOT call signInWithPassword.
//   2. signInWithPassword error → submitError is rendered, navigate() is NOT
//      called.
//   3. signInWithPassword success → navigate(from, { replace: true }) is called
//      with the "from" location or "/" when no location state is set.

import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

// ---------------------------------------------------------------------------
// Mocks — hoisted before module imports.
// ---------------------------------------------------------------------------

const { mock } = vi.hoisted(() => {
  const supabase = {
    auth: {
      signInWithPassword: vi.fn(),
      getSession: vi.fn(async () => ({ data: { session: null } })),
    },
  }
  return { mock: { supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

// Stub useAuth so Login renders without an AuthProvider wrapper.
// Default: no session (not logged in).
const useAuthMock = vi.fn(() => ({
  session: null,
  user: null,
  loading: false,
  signOut: async () => {},
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => useAuthMock(),
}))

// ContinueWithProvider imports signInWithProvider; stub the whole module
// so the Google OAuth button doesn't fire real network calls.
vi.mock('@/lib/auth-providers', () => ({
  PROVIDERS: [{ id: 'google', name: 'Google', icon: 'google' }],
  signInWithProvider: vi.fn(async () => ({ error: null })),
}))

// ---------------------------------------------------------------------------
// Lazy import — must happen AFTER vi.mock() calls.
// ---------------------------------------------------------------------------

import { Login } from './Login'
import { t } from '@/lib/strings'

// ---------------------------------------------------------------------------
// Render helpers
// ---------------------------------------------------------------------------

/**
 * Renders Login inside a MemoryRouter.
 *
 * Provides a `/home` stub so navigate() can land somewhere visible.
 * `initialPath` and `locationState` control what the router delivers as
 * `location.state` (used by the "from" redirect).
 */
function render(
  ui: ReactElement,
  {
    initialPath = '/login',
  }: { initialPath?: string } = {},
) {
  return rtlRender(
    <MemoryRouter initialEntries={[initialPath]}>
      <Routes>
        <Route path="/login" element={ui} />
        <Route path="/" element={<div data-testid="home-route">Home</div>} />
        <Route
          path="/dashboard"
          element={<div data-testid="dashboard-route">Dashboard</div>}
        />
      </Routes>
    </MemoryRouter>,
  )
}

// ---------------------------------------------------------------------------

beforeEach(() => {
  mock.supabase.auth.signInWithPassword.mockReset()
  mock.supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
  useAuthMock.mockReturnValue({
    session: null,
    user: null,
    loading: false,
    signOut: async () => {},
  })
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Login page (landr-v9e4.11)', () => {
  // -------------------------------------------------------------------------
  // 1. Empty-fields validation gate
  // -------------------------------------------------------------------------

  it('shows email error when form is submitted with empty email', async () => {
    const user = userEvent.setup()
    render(<Login />)

    // Leave email blank; fill password so only the email error fires.
    const password = screen.getByLabelText(t.auth.passwordLabel)
    await user.type(password, 'secret')

    await user.click(screen.getByRole('button', { name: t.auth.submit }))

    expect(screen.getByText(t.auth.invalidEmail)).toBeInTheDocument()
    expect(mock.supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('shows password error when form is submitted with empty password', async () => {
    const user = userEvent.setup()
    render(<Login />)

    const email = screen.getByLabelText(t.auth.emailLabel)
    await user.type(email, 'test@example.com')

    // Leave password blank.
    await user.click(screen.getByRole('button', { name: t.auth.submit }))

    expect(screen.getByText(t.auth.passwordRequired)).toBeInTheDocument()
    expect(mock.supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('shows both field errors when both email and password are empty', async () => {
    const user = userEvent.setup()
    render(<Login />)

    await user.click(screen.getByRole('button', { name: t.auth.submit }))

    expect(screen.getByText(t.auth.invalidEmail)).toBeInTheDocument()
    expect(screen.getByText(t.auth.passwordRequired)).toBeInTheDocument()
    expect(mock.supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('shows email error when email is not a valid address', async () => {
    const user = userEvent.setup()
    render(<Login />)

    await user.type(screen.getByLabelText(t.auth.emailLabel), 'notanemail')
    await user.type(screen.getByLabelText(t.auth.passwordLabel), 'secret')
    await user.click(screen.getByRole('button', { name: t.auth.submit }))

    expect(screen.getByText(t.auth.invalidEmail)).toBeInTheDocument()
    expect(mock.supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  // -------------------------------------------------------------------------
  // 2. signInWithPassword error → submitError rendered, no navigation
  // -------------------------------------------------------------------------

  it('displays the server error message when signInWithPassword returns an error', async () => {
    const user = userEvent.setup()
    mock.supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Invalid login credentials' },
    })
    render(<Login />)

    await user.type(screen.getByLabelText(t.auth.emailLabel), 'user@example.com')
    await user.type(screen.getByLabelText(t.auth.passwordLabel), 'wrongpass')
    await user.click(screen.getByRole('button', { name: t.auth.submit }))

    await waitFor(() => {
      expect(screen.getByText('Invalid login credentials')).toBeInTheDocument()
    })

    // Home/dashboard route should NOT be shown — user stays on login page.
    expect(screen.queryByTestId('home-route')).not.toBeInTheDocument()
    expect(screen.queryByTestId('dashboard-route')).not.toBeInTheDocument()
  })

  it('displays the generic error when signInWithPassword error has no message', async () => {
    const user = userEvent.setup()
    mock.supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: '' },
    })
    render(<Login />)

    await user.type(screen.getByLabelText(t.auth.emailLabel), 'user@example.com')
    await user.type(screen.getByLabelText(t.auth.passwordLabel), 'pass')
    await user.click(screen.getByRole('button', { name: t.auth.submit }))

    await waitFor(() => {
      expect(screen.getByText(t.auth.genericError)).toBeInTheDocument()
    })
  })

  it('does not call navigate when signInWithPassword returns an error', async () => {
    const user = userEvent.setup()
    mock.supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: null },
      error: { message: 'Bad credentials' },
    })
    render(<Login />)

    await user.type(screen.getByLabelText(t.auth.emailLabel), 'user@example.com')
    await user.type(screen.getByLabelText(t.auth.passwordLabel), 'pass')
    await user.click(screen.getByRole('button', { name: t.auth.submit }))

    await waitFor(() => {
      expect(screen.getByText('Bad credentials')).toBeInTheDocument()
    })

    // The MemoryRouter would have navigated away if navigate() was called.
    // Login form is still visible → navigate() was NOT called.
    expect(
      screen.getByRole('button', { name: t.auth.submit }),
    ).toBeInTheDocument()
  })

  // -------------------------------------------------------------------------
  // 3. Success → navigate(from, { replace: true })
  // -------------------------------------------------------------------------

  it('navigates to "/" on success when no "from" location state is present', async () => {
    const user = userEvent.setup()
    mock.supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: {
        session: { access_token: 'tok', user: {} },
        user: {},
      },
      error: null,
    })
    render(<Login />)

    await user.type(screen.getByLabelText(t.auth.emailLabel), 'user@example.com')
    await user.type(screen.getByLabelText(t.auth.passwordLabel), 'correct')
    await user.click(screen.getByRole('button', { name: t.auth.submit }))

    // The router should land on the "/" route.
    await waitFor(() => {
      expect(screen.getByTestId('home-route')).toBeInTheDocument()
    })
  })

  it('calls signInWithPassword with the trimmed email and exact password', async () => {
    const user = userEvent.setup()
    mock.supabase.auth.signInWithPassword.mockResolvedValueOnce({
      data: { session: { access_token: 'tok', user: {} }, user: {} },
      error: null,
    })
    render(<Login />)

    await user.type(
      screen.getByLabelText(t.auth.emailLabel),
      '  user@example.com  ',
    )
    await user.type(screen.getByLabelText(t.auth.passwordLabel), 'mypassword')
    await user.click(screen.getByRole('button', { name: t.auth.submit }))

    await waitFor(() => {
      expect(mock.supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'user@example.com',
        password: 'mypassword',
      })
    })
  })
})
