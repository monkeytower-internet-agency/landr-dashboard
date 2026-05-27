// landr-7dya.13 — ViewAsOperatorPicker: operator picker dialog for view-as mode.
//
// Tests:
//  - Renders nothing when picker is closed.
//  - Renders the operator list when open.
//  - Filters operators by search input.
//  - Calls enterViewAs + closeViewAsPicker when an operator is selected.
//  - Calls closeViewAsPicker when the dialog is dismissed.
//  - Shows the loading state while staffOperatorsLoading is true.
//  - Highlights the currently viewed-as operator.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffOperatorRef } from '@/lib/operator'

const { mock } = vi.hoisted(() => {
  const state = {
    viewAsPickerOpen: false,
    closeViewAsPicker: vi.fn(),
    staffOperators: [
      { id: 'op-para', slug: 'para42', name: 'Para42' },
      { id: 'op-martin', slug: 'martin-co', name: 'Martin Co' },
      { id: 'op-slug-only', slug: 'slug-only', name: null },
    ] as StaffOperatorRef[],
    staffOperatorsLoading: false,
    viewAsOperator: null as StaffOperatorRef | null,
    enterViewAs: vi.fn(),
  }
  return { mock: { state } }
})

vi.mock('@/lib/app-mode-context', () => ({
  useAppMode: () => ({
    viewAsPickerOpen: mock.state.viewAsPickerOpen,
    closeViewAsPicker: mock.state.closeViewAsPicker,
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    staffOperators: mock.state.staffOperators,
    staffOperatorsLoading: mock.state.staffOperatorsLoading,
    viewAsOperator: mock.state.viewAsOperator,
    enterViewAs: mock.state.enterViewAs,
  }),
}))

import { ViewAsOperatorPicker } from './ViewAsOperatorPicker'

beforeEach(() => {
  mock.state.viewAsPickerOpen = false
  mock.state.staffOperators = [
    { id: 'op-para', slug: 'para42', name: 'Para42' },
    { id: 'op-martin', slug: 'martin-co', name: 'Martin Co' },
    { id: 'op-slug-only', slug: 'slug-only', name: null },
  ]
  mock.state.staffOperatorsLoading = false
  mock.state.viewAsOperator = null
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ViewAsOperatorPicker', () => {
  it('renders nothing (dialog closed) when viewAsPickerOpen is false', () => {
    mock.state.viewAsPickerOpen = false
    render(<ViewAsOperatorPicker />)
    // CommandDialog uses a Portal — the dialog content is not in the container
    // when closed. We check the absence of operator items.
    expect(
      screen.queryByTestId('view-as-picker-option-para42'),
    ).not.toBeInTheDocument()
  })

  it('renders the operator list when open', async () => {
    mock.state.viewAsPickerOpen = true
    render(<ViewAsOperatorPicker />)
    expect(
      await screen.findByTestId('view-as-picker-option-para42'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('view-as-picker-option-martin-co'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('view-as-picker-option-slug-only'),
    ).toBeInTheDocument()
  })

  it('calls enterViewAs and closeViewAsPicker when an operator is selected', async () => {
    mock.state.viewAsPickerOpen = true
    const user = userEvent.setup()
    render(<ViewAsOperatorPicker />)
    await screen.findByTestId('view-as-picker-option-para42')
    await user.click(screen.getByTestId('view-as-picker-option-para42'))
    expect(mock.state.enterViewAs).toHaveBeenCalledWith('op-para')
    expect(mock.state.closeViewAsPicker).toHaveBeenCalledTimes(1)
  })

  it('shows the loading state while staffOperatorsLoading is true', async () => {
    mock.state.viewAsPickerOpen = true
    mock.state.staffOperatorsLoading = true
    mock.state.staffOperators = []
    render(<ViewAsOperatorPicker />)
    // The loading message is rendered inside CommandEmpty.
    expect(
      await screen.findByText('Loading operators…'),
    ).toBeInTheDocument()
  })

  it('shows empty state when no operators match the search', async () => {
    mock.state.viewAsPickerOpen = true
    const user = userEvent.setup()
    render(<ViewAsOperatorPicker />)
    const input = await screen.findByTestId('view-as-picker-input')
    await user.type(input, 'zzznomatch')
    await waitFor(() =>
      expect(screen.getByText('No operators found.')).toBeInTheDocument(),
    )
  })

  it('filters operators by name/slug when the user types', async () => {
    mock.state.viewAsPickerOpen = true
    const user = userEvent.setup()
    render(<ViewAsOperatorPicker />)
    const input = await screen.findByTestId('view-as-picker-input')
    await user.type(input, 'para')
    await waitFor(() =>
      expect(
        screen.getByTestId('view-as-picker-option-para42'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByTestId('view-as-picker-option-martin-co'),
    ).not.toBeInTheDocument()
  })

  it('marks the currently viewed-as operator as active', async () => {
    mock.state.viewAsPickerOpen = true
    mock.state.viewAsOperator = {
      id: 'op-martin',
      slug: 'martin-co',
      name: 'Martin Co',
    }
    render(<ViewAsOperatorPicker />)
    const item = await screen.findByTestId('view-as-picker-option-martin-co')
    expect(item).toHaveAttribute('aria-current', 'true')
    // The para42 item is NOT active.
    expect(
      screen.getByTestId('view-as-picker-option-para42'),
    ).not.toHaveAttribute('aria-current')
  })

  it('uses the slug as display name when the operator has no name', async () => {
    mock.state.viewAsPickerOpen = true
    render(<ViewAsOperatorPicker />)
    // 'slug-only' operator has name: null — should show the slug as label.
    expect(
      await screen.findByTestId('view-as-picker-option-slug-only'),
    ).toHaveTextContent('slug-only')
  })
})
