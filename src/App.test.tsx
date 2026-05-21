import {
  render as rtlRender,
  screen,
  waitFor,
  type RenderOptions,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'
import type { Session } from '@supabase/supabase-js'

function render(ui: ReactElement, options?: RenderOptions) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    ),
    ...options,
  })
}

type FakeRow = {
  operator_id: string
  operators: {
    id: string
    slug: string
    name: string | null
    onboarded_at: string | null
  }
}

const { mock } = vi.hoisted(() => {
  const state = {
    session: null as Session | null,
    operatorRows: [] as FakeRow[],
    signInError: null as { message: string } | null,
  }
  const listeners = new Set<(event: string, session: Session | null) => void>()

  const makeSession = (email = 'staff@operator.example'): Session =>
    ({
      access_token: 'token',
      refresh_token: 'refresh',
      expires_in: 3600,
      expires_at: Math.floor(Date.now() / 1000) + 3600,
      token_type: 'bearer',
      user: {
        id: 'user-1',
        app_metadata: {},
        user_metadata: {},
        aud: 'authenticated',
        created_at: new Date().toISOString(),
        email,
      },
    }) as Session

  const supabase = {
    auth: {
      getSession: vi.fn(async () => ({ data: { session: state.session } })),
      onAuthStateChange: vi.fn(
        (cb: (event: string, session: Session | null) => void) => {
          listeners.add(cb)
          return {
            data: {
              subscription: {
                unsubscribe: () => {
                  listeners.delete(cb)
                },
              },
            },
          }
        },
      ),
      signInWithPassword: vi.fn(
        async ({ email }: { email: string; password: string }) => {
          if (state.signInError)
            return { data: null, error: state.signInError }
          state.session = makeSession(email)
          listeners.forEach((cb) => cb('SIGNED_IN', state.session))
          return { data: { session: state.session }, error: null }
        },
      ),
      signOut: vi.fn(async () => {
        state.session = null
        listeners.forEach((cb) => cb('SIGNED_OUT', null))
        return { error: null }
      }),
    },
    // landr-39nw — useOperator now resolves the auth.uid → public.users.id
    // via a `.from('users').select('id').eq(...).maybeSingle()` round-trip
    // before fetching memberships. The chain must therefore expose `eq()`
    // and `maybeSingle()` (users table) plus the existing thenable for the
    // memberships SELECT. We dispatch on table name so the membership query
    // still resolves via `then`, while the users-bridge resolves via the
    // terminal `maybeSingle()` to a stub row.
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {}
      Object.assign(builder, {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === 'users') {
            // Resolve the supabase_auth_id → public.users.id bridge so the
            // membership fetch downstream has a non-null userRow to filter
            // on. The exact id is irrelevant for the tests; what matters is
            // that the chain resolves and useOperator proceeds.
            return { data: { id: 'public-user-1' }, error: null }
          }
          return { data: null, error: null }
        }),
        then: (
          resolve: (v: { data: FakeRow[]; error: null }) => void,
        ) => {
          resolve({ data: state.operatorRows, error: null })
          return Promise.resolve({ data: state.operatorRows, error: null })
        },
      })
      return builder
    }),
  }

  return {
    mock: {
      state,
      supabase,
      makeSession,
    },
  }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

import App from './App'

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  mock.state.session = null
  mock.state.operatorRows = []
  mock.state.signInError = null
  vi.clearAllMocks()
})

describe('App routing', () => {
  it('redirects unauthenticated users to /login', async () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: /sign in/i }),
    ).toBeInTheDocument()
  })

  it('renders the protected dashboard for authenticated users', async () => {
    mock.state.session = mock.makeSession()
    mock.state.operatorRows = [
      { operator_id: 'op-1', operators: { id: 'op-1', slug: 'para42', name: 'Para42', onboarded_at: '2026-05-01T00:00:00Z' } },
    ]

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: /Para42/i }),
    ).toBeInTheDocument()
    expect(screen.getByText(/scaffold ready/i)).toBeInTheDocument()
  })

  it('renders the not-found screen for unknown routes', async () => {
    mock.state.session = mock.makeSession()

    render(
      <MemoryRouter initialEntries={['/does-not-exist']}>
        <App />
      </MemoryRouter>,
    )

    expect(
      await screen.findByRole('heading', { name: /Not found/i }),
    ).toBeInTheDocument()
  })
})

describe('Login form', () => {
  it('shows a validation error for an invalid email', async () => {
    const user = userEvent.setup()
    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: /sign in/i })
    await user.type(screen.getByLabelText(/email/i), 'not-an-email')
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'secret123')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(await screen.findByText(/enter a valid email/i)).toBeInTheDocument()
    expect(mock.supabase.auth.signInWithPassword).not.toHaveBeenCalled()
  })

  it('signs in and lands on the dashboard on success', async () => {
    mock.state.operatorRows = [
      { operator_id: 'op-1', operators: { id: 'op-1', slug: 'para42', name: 'Para42', onboarded_at: '2026-05-01T00:00:00Z' } },
    ]
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/email/i), 'staff@operator.example')
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'correcthorse')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    await waitFor(() => {
      expect(mock.supabase.auth.signInWithPassword).toHaveBeenCalledWith({
        email: 'staff@operator.example',
        password: 'correcthorse',
      })
    })
    expect(
      await screen.findByRole('heading', { name: /Para42/i }),
    ).toBeInTheDocument()
  })

  it('surfaces a server error from Supabase', async () => {
    mock.state.signInError = { message: 'Invalid login credentials' }
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/login']}>
        <App />
      </MemoryRouter>,
    )

    await user.type(screen.getByLabelText(/email/i), 'staff@operator.example')
    await user.type(screen.getByLabelText(/password/i, { selector: 'input' }), 'wrong')
    await user.click(screen.getByRole('button', { name: /sign in/i }))

    expect(
      await screen.findByText(/invalid login credentials/i),
    ).toBeInTheDocument()
  })
})

describe('Operator switcher', () => {
  it('lists the operators returned by the membership query', async () => {
    mock.state.session = mock.makeSession()
    mock.state.operatorRows = [
      { operator_id: 'op-1', operators: { id: 'op-1', slug: 'para42', name: 'Para42', onboarded_at: '2026-05-01T00:00:00Z' } },
      { operator_id: 'op-2', operators: { id: 'op-2', slug: 'kayak-co', name: 'Kayak Co', onboarded_at: '2026-05-01T00:00:00Z' } },
    ]
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    const trigger = await screen.findByRole('button', { name: /operator/i })
    await user.click(trigger)

    expect(
      await screen.findByRole('menuitem', { name: /Kayak Co/i }),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('menuitem', { name: /Para42/i }),
    ).toBeInTheDocument()
  })

  it('persists the chosen operator id to localStorage', async () => {
    mock.state.session = mock.makeSession()
    mock.state.operatorRows = [
      { operator_id: 'op-1', operators: { id: 'op-1', slug: 'para42', name: 'Para42', onboarded_at: '2026-05-01T00:00:00Z' } },
      { operator_id: 'op-2', operators: { id: 'op-2', slug: 'kayak-co', name: 'Kayak Co', onboarded_at: '2026-05-01T00:00:00Z' } },
    ]
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    const trigger = await screen.findByRole('button', { name: /operator/i })
    await user.click(trigger)
    await user.click(await screen.findByRole('menuitem', { name: /Kayak Co/i }))

    await waitFor(() => {
      expect(
        window.localStorage.getItem('landr.dashboard.currentOperatorId'),
      ).toBe('op-2')
    })
  })
})

describe('Sign out', () => {
  it('calls supabase signOut and returns the user to /login', async () => {
    mock.state.session = mock.makeSession()
    mock.state.operatorRows = [
      { operator_id: 'op-1', operators: { id: 'op-1', slug: 'para42', name: 'Para42', onboarded_at: '2026-05-01T00:00:00Z' } },
    ]
    const user = userEvent.setup()

    render(
      <MemoryRouter initialEntries={['/']}>
        <App />
      </MemoryRouter>,
    )

    await screen.findByRole('heading', { name: /Para42/i })
    // landr-fx2i — Sign out lives inside the UserMenu dropdown (commit
    // f7b790b dropped the redundant standalone button). Open the menu
    // first, then click the menuitem.
    await user.click(screen.getByRole('button', { name: /user menu/i }))
    await user.click(await screen.findByRole('menuitem', { name: /sign out/i }))

    expect(mock.supabase.auth.signOut).toHaveBeenCalled()
    expect(
      await screen.findByRole('heading', { name: /sign in/i }),
    ).toBeInTheDocument()
  })
})
