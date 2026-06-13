// landr-fx2i — OperatorSwitcher behaviour by operator count:
//   0 operators → "no operators" hint label
//   1 operator  → static read-only label (no dropdown chevron, no menu)
//   2+ operators → existing dropdown menu with chevron
//
// Hide-when-1 is the load-bearing change; single-operator accounts saw
// a dropdown with one option and a useless chevron, so the topbar now
// degrades to a plain label and the page title gets the freed space.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { OperatorSwitcher } from './OperatorSwitcher'

type OpMock = { id: string; slug: string; name: string | null }

const enterViewAs = vi.fn()

const mockState = {
  operators: [] as OpMock[],
  currentOperator: null as OpMock | null,
  currentOperatorId: null as string | null,
  loading: false,
  // landr-2soj — staff view-as picker source + flags.
  staffOperators: [] as OpMock[],
  viewAsOperator: null as OpMock | null,
  isLandrStaff: false,
}

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: mockState.operators,
    currentOperator: mockState.currentOperator,
    currentOperatorId: mockState.currentOperatorId,
    loading: mockState.loading,
    switchOperator: vi.fn(),
    refreshOperators: vi.fn(),
    staffOperators: mockState.staffOperators,
    staffOperatorsLoading: false,
    viewAsActive: mockState.viewAsOperator !== null,
    viewAsOperator: mockState.viewAsOperator,
    enterViewAs,
    exitViewAs: vi.fn(),
  }),
}))

// landr-2soj — the picker is gated on isLandrStaff from useEntitlements.
vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: () => true,
    isLandrStaff: mockState.isLandrStaff,
    effectiveIsStaff: mockState.isLandrStaff && mockState.viewAsOperator === null,
    isLoading: false,
  }),
}))

function setState(next: Partial<typeof mockState>) {
  Object.assign(mockState, next)
}

beforeEach(() => {
  setState({
    operators: [],
    currentOperator: null,
    currentOperatorId: null,
    loading: false,
    staffOperators: [],
    viewAsOperator: null,
    isLandrStaff: false,
  })
  enterViewAs.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('OperatorSwitcher (landr-fx2i)', () => {
  it('renders a no-operators hint when the user has zero memberships', () => {
    setState({
      operators: [],
      currentOperator: null,
      currentOperatorId: null,
      loading: false,
    })
    render(<OperatorSwitcher />)
    // No button / dropdown.
    expect(screen.queryByRole('button')).toBeNull()
    // The hint text from t.operator.noOperators ("No operators available
    // for this account.") should be visible.
    expect(
      screen.getByText(/no operators linked/i),
    ).toBeInTheDocument()
  })

  it('renders a read-only label (no dropdown chevron) when the user has exactly 1 operator', () => {
    setState({
      operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      loading: false,
    })
    render(<OperatorSwitcher />)

    // Operator name shows as plain text.
    expect(screen.getByText('Para42')).toBeInTheDocument()
    // CRITICAL: no <button> means no dropdown trigger; the chevron icon
    // lives inside that button so this also confirms the chevron is gone.
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('falls back to slug when the single operator has no name', () => {
    setState({
      operators: [{ id: 'op-1', slug: 'solo-co', name: null }],
      currentOperator: { id: 'op-1', slug: 'solo-co', name: null },
      currentOperatorId: 'op-1',
      loading: false,
    })
    render(<OperatorSwitcher />)
    expect(screen.getByText('solo-co')).toBeInTheDocument()
    expect(screen.queryByRole('button')).toBeNull()
  })

  it('renders the dropdown (with chevron button) when the user has 2+ operators', () => {
    setState({
      operators: [
        { id: 'op-1', slug: 'para42', name: 'Para42' },
        { id: 'op-2', slug: 'kayak-co', name: 'Kayak Co' },
      ],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      loading: false,
    })
    render(<OperatorSwitcher />)
    // The dropdown trigger is rendered as a button.
    const trigger = screen.getByRole('button', { name: /operator/i })
    expect(trigger).toBeInTheDocument()
    // Currently-selected operator's label shows on the trigger.
    expect(screen.getByText('Para42')).toBeInTheDocument()
  })
})

// landr-2soj — STAFF "View as operator" picker. Non-staff must NEVER see the
// all-operators selector (the staffOperators list is also empty for them via
// RLS, but the UI gate on isLandrStaff is the belt-and-braces assertion).
describe('OperatorSwitcher — staff view-as picker (landr-2soj)', () => {
  it('does NOT render the all-operators selector for a non-staff user', async () => {
    const user = userEvent.setup()
    // A non-staff user with 2 memberships gets the membership dropdown, but
    // the staffOperators list must not surface (and would be empty anyway).
    setState({
      isLandrStaff: false,
      operators: [
        { id: 'op-1', slug: 'para42', name: 'Para42' },
        { id: 'op-2', slug: 'kayak-co', name: 'Kayak Co' },
      ],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      // Even if a leak ever populated this, the isLandrStaff gate hides it.
      staffOperators: [{ id: 'op-9', slug: 'martin-co', name: 'Martin Co' }],
    })
    render(<OperatorSwitcher />)
    await user.click(screen.getByRole('button', { name: /operator/i }))
    // The "View as operator (staff)" section header must be absent.
    expect(screen.queryByText(/view as operator/i)).toBeNull()
    // The staff-only operator (not a membership) must not appear.
    expect(screen.queryByText('Martin Co')).toBeNull()
    expect(enterViewAs).not.toHaveBeenCalled()
  })

  it('renders the all-operators selector for staff and enters view-as on select', async () => {
    const user = userEvent.setup()
    setState({
      isLandrStaff: true,
      // Staff who owns Para42 but can view as any operator.
      operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      staffOperators: [
        { id: 'op-1', slug: 'para42', name: 'Para42' },
        { id: 'op-9', slug: 'martin-co', name: 'Martin Co' },
      ],
    })
    render(<OperatorSwitcher />)
    // Staff always get a dropdown trigger even with one membership.
    await user.click(screen.getByRole('button', { name: /operator/i }))
    expect(screen.getByText(/view as operator/i)).toBeInTheDocument()
    // Pick the non-membership operator from the staff section.
    await user.click(screen.getByText('Martin Co'))
    expect(enterViewAs).toHaveBeenCalledWith('op-9')
  })

  it('marks the active view-as target with aria-current', async () => {
    const user = userEvent.setup()
    setState({
      isLandrStaff: true,
      operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
      currentOperator: { id: 'op-9', slug: 'martin-co', name: 'Martin Co' },
      currentOperatorId: 'op-9',
      staffOperators: [
        { id: 'op-1', slug: 'para42', name: 'Para42' },
        { id: 'op-9', slug: 'martin-co', name: 'Martin Co' },
      ],
      viewAsOperator: { id: 'op-9', slug: 'martin-co', name: 'Martin Co' },
    })
    render(<OperatorSwitcher />)
    await user.click(screen.getByRole('button', { name: /operator/i }))
    // "Martin Co" also shows on the trigger (it's the current operator), so
    // scope to the menu item carrying the staff-section entry.
    const active = screen
      .getAllByText('Martin Co')
      .map((el) => el.closest('[role="menuitem"]'))
      .find((el): el is HTMLElement => el !== null)
    expect(active).toBeDefined()
    expect(active!.getAttribute('aria-current')).toBe('true')
  })
})
