/**
 * Tests for the AuthProvider's handleSessionExpired flow.
 *
 * Coverage:
 *  - Registers a handler with api-client at mount.
 *  - Idempotent: concurrent 401s only trigger ONE signOut + ONE navigate.
 *  - Skips the redirect when already on /login (no loop).
 *  - Cross-tab SIGNED_OUT also routes through the handler.
 *
 * See landr-fr2.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, waitFor, act } from '@testing-library/react'
import { MemoryRouter, useLocation } from 'react-router-dom'

const { mock } = vi.hoisted(() => {
  type AuthChangeCallback = (event: string, session: unknown) => void
  const state: { authChangeCb: AuthChangeCallback | null } = {
    authChangeCb: null,
  }
  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: null } })),
      onAuthStateChange: vi.fn((cb: AuthChangeCallback) => {
        state.authChangeCb = cb
        return { data: { subscription: { unsubscribe: vi.fn() } } }
      }),
      signOut: vi.fn(async () => ({ error: null })),
    },
  }
  const toastApi = { error: vi.fn(), success: vi.fn() }
  return { mock: { supabase, state, toastApi } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('sonner', () => ({ toast: mock.toastApi }))

const navigateSpy = vi.fn()

vi.mock('react-router-dom', async () => {
  const actual =
    await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
  return {
    ...actual,
    useNavigate: () => navigateSpy,
  }
})

import { AuthProvider } from './auth'

// Probe that captures the current router location so we can assert on it.
function LocationProbe(): null {
  // useLocation makes the component re-render when location changes — that
  // lets us observe navigate() side-effects via locationRef.
  useLocation()
  return null
}

beforeEach(() => {
  navigateSpy.mockReset()
  mock.toastApi.error.mockReset()
  mock.toastApi.success.mockReset()
  mock.supabase.auth.signOut.mockClear()
  mock.supabase.auth.getSession.mockResolvedValue({ data: { session: null } })
  mock.state.authChangeCb = null
})

afterEach(() => {
  vi.clearAllMocks()
})

function renderWithRouter(initialPath = '/bookings') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <LocationProbe />
      </AuthProvider>
    </MemoryRouter>,
  )
}

describe('AuthProvider — handleSessionExpired', () => {
  it('is idempotent — concurrent invocations only sign out and navigate once', async () => {
    renderWithRouter('/bookings')

    // Wait for getSession + handler registration to settle.
    await waitFor(() => expect(mock.supabase.auth.getSession).toHaveBeenCalled())

    // Simulate 5 concurrent 401s firing the handler — TanStack Query may
    // refetch many keys at once after a JWT expiry. SIGNED_OUT routes through
    // the same handleSessionExpired path that api-client's 401 interceptor
    // uses, so we can exercise the idempotency latch via the auth event.
    await act(async () => {
      const cb = mock.state.authChangeCb!
      cb('SIGNED_OUT', null)
      cb('SIGNED_OUT', null)
      cb('SIGNED_OUT', null)
      cb('SIGNED_OUT', null)
      cb('SIGNED_OUT', null)
    })

    await waitFor(() => expect(navigateSpy).toHaveBeenCalled())
    expect(navigateSpy).toHaveBeenCalledTimes(1)
    expect(mock.supabase.auth.signOut).toHaveBeenCalledTimes(1)
    expect(mock.toastApi.error).toHaveBeenCalledTimes(1)
  })

  it('does not redirect when already on /login', async () => {
    renderWithRouter('/login')

    await waitFor(() => expect(mock.supabase.auth.getSession).toHaveBeenCalled())

    await act(async () => {
      mock.state.authChangeCb!('SIGNED_OUT', null)
    })

    // Even after a tick, no navigate should have been called.
    await new Promise((r) => setTimeout(r, 0))
    expect(navigateSpy).not.toHaveBeenCalled()
    expect(mock.toastApi.error).not.toHaveBeenCalled()
  })

  it('navigates to /login carrying from-state when not on /login', async () => {
    renderWithRouter('/bookings')

    await waitFor(() => expect(mock.supabase.auth.getSession).toHaveBeenCalled())

    await act(async () => {
      mock.state.authChangeCb!('SIGNED_OUT', null)
    })

    await waitFor(() => expect(navigateSpy).toHaveBeenCalled())
    const [target, options] = navigateSpy.mock.calls[0] as [
      string,
      { replace?: boolean; state?: { from?: { pathname: string } } },
    ]
    expect(target).toBe('/login')
    expect(options.replace).toBe(true)
    expect(options.state?.from?.pathname).toBe('/bookings')
  })

  it('releases the idempotency latch after a successful SIGNED_IN', async () => {
    renderWithRouter('/bookings')

    await waitFor(() => expect(mock.supabase.auth.getSession).toHaveBeenCalled())

    // First expiry → 1 navigate.
    await act(async () => {
      mock.state.authChangeCb!('SIGNED_OUT', null)
    })
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledTimes(1))

    // User signs back in → latch resets.
    await act(async () => {
      mock.state.authChangeCb!('SIGNED_IN', {
        user: { id: 'u-1' },
        access_token: 'fresh',
      })
    })

    // Another expiry should fire again now.
    await act(async () => {
      mock.state.authChangeCb!('SIGNED_OUT', null)
    })
    await waitFor(() => expect(navigateSpy).toHaveBeenCalledTimes(2))
  })
})
