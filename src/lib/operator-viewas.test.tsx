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
    allOperators: [] as Array<{
      id: string
      slug: string
      name: string | null
      onboarded_at: string | null
    }>,
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
  // landr-y7lw — both seeded operators are onboarded so the existing view-as
  // assertions (staff-count === 2, enter view-as on op-martin) still hold; the
  // onboarded-filter behaviour gets its own describe block below.
  mock.state.allOperators = [
    { id: 'op-para', slug: 'para42', name: 'Para42', onboarded_at: '2026-01-01T00:00:00Z' },
    { id: 'op-martin', slug: 'martin-co', name: 'Martin Co', onboarded_at: '2026-02-02T00:00:00Z' },
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

describe('OperatorProvider — view-as onboarded filter (landr-y7lw)', () => {
  it('excludes operators with a null onboarded_at and includes onboarded ones', async () => {
    // op-ghost never finished onboarding (onboarded_at null) — it must NOT
    // appear in the staff picker list, while the two onboarded operators do.
    mock.state.allOperators = [
      { id: 'op-para', slug: 'para42', name: 'Para42', onboarded_at: '2026-01-01T00:00:00Z' },
      { id: 'op-martin', slug: 'martin-co', name: 'Martin Co', onboarded_at: '2026-02-02T00:00:00Z' },
      { id: 'op-ghost', slug: 'ghost', name: 'Ghost', onboarded_at: null },
    ]
    renderProvider()
    // Three rows fetched, but only the two onboarded ones survive the filter.
    await waitFor(() =>
      expect(screen.getByTestId('staff-count').textContent).toBe('2'),
    )
  })

  it('refuses enterViewAs for an un-onboarded operator (filtered out of the list)', async () => {
    const user = userEvent.setup()
    mock.state.allOperators = [
      { id: 'op-para', slug: 'para42', name: 'Para42', onboarded_at: '2026-01-01T00:00:00Z' },
      // op-ghost is the target of the Probe's "view-ghost" button.
      { id: 'op-ghost', slug: 'ghost', name: 'Ghost', onboarded_at: null },
    ]
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('staff-count').textContent).toBe('1'),
    )
    // Selecting the un-onboarded operator is a no-op: it isn't in the list.
    await user.click(screen.getByText('view-ghost'))
    expect(screen.getByTestId('active').textContent).toBe('false')
    expect(screen.getByTestId('current').textContent).toBe('op-para')
    expect(window.localStorage.getItem(VIEW_AS_KEY)).toBeNull()
  })

  it('does NOT honour a persisted view-as id pointing at an un-onboarded operator', async () => {
    // A stale view-as id that maps to an operator which exists but never
    // onboarded must resolve inactive (it's filtered out of staffOperators).
    window.localStorage.setItem(VIEW_AS_KEY, 'op-ghost')
    mock.state.allOperators = [
      { id: 'op-para', slug: 'para42', name: 'Para42', onboarded_at: '2026-01-01T00:00:00Z' },
      { id: 'op-ghost', slug: 'ghost', name: 'Ghost', onboarded_at: null },
    ]
    renderProvider()
    await waitFor(() =>
      expect(screen.getByTestId('staff-count').textContent).toBe('1'),
    )
    expect(screen.getByTestId('active').textContent).toBe('false')
    expect(screen.getByTestId('current').textContent).toBe('op-para')
  })
})
