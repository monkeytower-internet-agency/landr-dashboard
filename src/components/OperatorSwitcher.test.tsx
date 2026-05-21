// landr-fx2i — OperatorSwitcher behaviour by operator count:
//   0 operators → "no operators" hint label
//   1 operator  → static read-only label (no dropdown chevron, no menu)
//   2+ operators → existing dropdown menu with chevron
//
// Hide-when-1 is the load-bearing change; single-operator accounts saw
// a dropdown with one option and a useless chevron, so the topbar now
// degrades to a plain label and the page title gets the freed space.
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { OperatorSwitcher } from './OperatorSwitcher'

type OpMock = { id: string; slug: string; name: string | null }

const mockState = {
  operators: [] as OpMock[],
  currentOperator: null as OpMock | null,
  currentOperatorId: null as string | null,
  loading: false,
}

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: mockState.operators,
    currentOperator: mockState.currentOperator,
    currentOperatorId: mockState.currentOperatorId,
    loading: mockState.loading,
    switchOperator: vi.fn(),
    refreshOperators: vi.fn(),
  }),
}))

function setState(next: Partial<typeof mockState>) {
  Object.assign(mockState, next)
}

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
      screen.getByText(/no operators available/i),
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
