// landr-2soj — OperatorProvider "view as operator" state.
//
// Pins the provider-level contract:
//   - staffOperators comes from a SEPARATE `operators` table query (NOT the
//     membership join) and is the picker source.
//   - enterViewAs only honours an id present in staffOperators; while active,
//     currentOperatorId resolves to the viewed-as operator so data scopes to
//     it via the existing filters.
//   - exitViewAs restores the staff's OWN membership scope.
//   - the view-as target persists to localStorage under its own key.
//
// supabase is mocked with a table-dispatching builder (mirrors App.test.tsx):
//   users               → bridge row {id}
//   operator_memberships → the staff user's OWN memberships
//   operators            → the all-operators staff list
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Session } from '@supabase/supabase-js'

const { mock } = vi.hoisted(() => {
  const state = {
    membershipRows: [] as Array<{
      operator_id: string
      operators: { id: string; slug: string; name: string | null }
    }>,
    allOperators: [] as Array<{ id: string; slug: string; name: string | null }>,
  }
  const supabase = {
    from: vi.fn((table: string) => {
      const builder: Record<string, unknown> = {}
      Object.assign(builder, {
        select: vi.fn(() => builder),
        eq: vi.fn(() => builder),
        order: vi.fn(() => builder),
        maybeSingle: vi.fn(async () => {
          if (table === 'users') return { data: { id: 'pub-1' }, error: null }
          return { data: null, error: null }
        }),
        then: (resolve: (v: { data: unknown[]; error: null }) => void) => {
          let data: unknown[] = []
          if (table === 'operator_memberships') data = state.membershipRows
          else if (table === 'operators') data = state.allOperators
          resolve({ data, error: null })
          return Promise.resolve({ data, error: null })
        },
      })
      return builder
    }),
  }
  return { mock: { state, supabase } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: mock.supabase,
  getSupabase: () => mock.supabase,
}))

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: { user: { id: 'auth-uid', email: 'ok@landr.de' } } as Session,
    user: { id: 'auth-uid', email: 'ok@landr.de' },
    loading: false,
  }),
}))

import { OperatorProvider, useOperator } from './operator'

function Probe() {
  const {
    currentOperatorId,
    staffOperators,
    viewAsActive,
    viewAsOperator,
    enterViewAs,
    exitViewAs,
  } = useOperator()
  return (
    <div>
      <span data-testid="current">{currentOperatorId ?? 'none'}</span>
      <span data-testid="active">{String(viewAsActive)}</span>
      <span data-testid="view-as">{viewAsOperator?.id ?? 'none'}</span>
      <span data-testid="staff-count">{staffOperators.length}</span>
      <button type="button" onClick={() => enterViewAs('op-martin')}>
        view-martin
      </button>
      <button type="button" onClick={() => enterViewAs('op-ghost')}>
        view-ghost
      </button>
      <button type="button" onClick={exitViewAs}>
        exit
      </button>
    </div>
  )
}

function renderProvider() {
  return render(
    <OperatorProvider>
      <Probe />
    </OperatorProvider>,
  )
}

const VIEW_AS_KEY = 'landr.dashboard.viewAsOperatorId'

beforeEach(() => {
  window.localStorage.clear()
  mock.state.membershipRows = [
    { operator_id: 'op-para', operators: { id: 'op-para', slug: 'para42', name: 'Para42' } },
  ]
  mock.state.allOperators = [
    { id: 'op-para', slug: 'para42', name: 'Para42' },
    { id: 'op-martin', slug: 'martin-co', name: 'Martin Co' },
  ]
})

afterEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('OperatorProvider — view-as (landr-2soj)', () => {
  it('loads the SEPARATE all-operators staff list', async () => {
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('staff-count').textContent).toBe('2'),
    )
    // Own scope defaults to the single membership.
    expect(screen.getByTestId('current').textContent).toBe('op-para')
    expect(screen.getByTestId('active').textContent).toBe('false')
  })

  it('enters view-as for a staff-list operator and scopes currentOperatorId to it', async () => {
    const user = userEvent.setup()
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('staff-count').textContent).toBe('2'),
    )
    await user.click(screen.getByText('view-martin'))
    await waitFor(() =>
      expect(screen.getByTestId('active').textContent).toBe('true'),
    )
    // currentOperatorId now resolves to the viewed-as operator (data scopes
    // to it via the existing filters).
    expect(screen.getByTestId('current').textContent).toBe('op-martin')
    expect(screen.getByTestId('view-as').textContent).toBe('op-martin')
    // Persisted under its own key.
    expect(window.localStorage.getItem(VIEW_AS_KEY)).toBe('op-martin')
  })

  it('ignores enterViewAs for an id NOT in the staff list (no-op)', async () => {
    const user = userEvent.setup()
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('staff-count').textContent).toBe('2'),
    )
    await user.click(screen.getByText('view-ghost'))
    // No transition: still scoped to own membership, not active.
    expect(screen.getByTestId('active').textContent).toBe('false')
    expect(screen.getByTestId('current').textContent).toBe('op-para')
    expect(window.localStorage.getItem(VIEW_AS_KEY)).toBeNull()
  })

  it('exitViewAs restores the own membership scope', async () => {
    const user = userEvent.setup()
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('staff-count').textContent).toBe('2'),
    )
    await user.click(screen.getByText('view-martin'))
    await waitFor(() =>
      expect(screen.getByTestId('current').textContent).toBe('op-martin'),
    )
    await user.click(screen.getByText('exit'))
    await waitFor(() =>
      expect(screen.getByTestId('active').textContent).toBe('false'),
    )
    expect(screen.getByTestId('current').textContent).toBe('op-para')
    expect(window.localStorage.getItem(VIEW_AS_KEY)).toBeNull()
  })

  it('does NOT honour a persisted view-as id that is absent from the staff list', async () => {
    // Seed a stale id that no longer maps to any operator.
    window.localStorage.setItem(VIEW_AS_KEY, 'op-deleted')
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('staff-count').textContent).toBe('2'),
    )
    // Stale id resolves to inactive; own scope shows.
    expect(screen.getByTestId('active').textContent).toBe('false')
    expect(screen.getByTestId('current').textContent).toBe('op-para')
  })
})
