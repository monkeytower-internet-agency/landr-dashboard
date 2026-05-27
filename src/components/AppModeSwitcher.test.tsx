// landr-7dya.10 — top-level workspace mode switch.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffCapabilities } from '@/lib/staff-capabilities'
import type { AppMode } from '@/lib/app-mode'

const { mock } = vi.hoisted(() => {
  const state = {
    mode: 'operator' as AppMode,
    capabilities: {
      can_use_ticket_system: true,
      can_view_as_operator: true,
    } as StaffCapabilities,
    showSwitcher: true,
    staffOperators: [
      { id: 'op-1', slug: 'para42', name: 'Para42' },
    ] as Array<{ id: string; slug: string; name: string | null }>,
    enterOperatorMode: vi.fn(),
    enterTicketSystem: vi.fn(),
    enterViewAs: vi.fn(),
  }
  return { mock: { state } }
})

vi.mock('@/lib/app-mode-context', () => ({
  useAppMode: () => ({
    mode: mock.state.mode,
    capabilities: mock.state.capabilities,
    capabilitiesLoading: false,
    showSwitcher: mock.state.showSwitcher,
    enterOperatorMode: mock.state.enterOperatorMode,
    enterTicketSystem: mock.state.enterTicketSystem,
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    staffOperators: mock.state.staffOperators,
    enterViewAs: mock.state.enterViewAs,
  }),
}))

import { AppModeSwitcher } from './AppModeSwitcher'

beforeEach(() => {
  mock.state.mode = 'operator'
  mock.state.capabilities = {
    can_use_ticket_system: true,
    can_view_as_operator: true,
  }
  mock.state.showSwitcher = true
  mock.state.staffOperators = [{ id: 'op-1', slug: 'para42', name: 'Para42' }]
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AppModeSwitcher', () => {
  it('renders nothing when showSwitcher is false (non-staff)', () => {
    mock.state.showSwitcher = false
    const { container } = render(<AppModeSwitcher />)
    expect(container).toBeEmptyDOMElement()
  })

  it('shows all three modes for a fully-capable staff user', async () => {
    const user = userEvent.setup()
    render(<AppModeSwitcher />)
    await user.click(screen.getByTestId('app-mode-switcher-trigger'))
    expect(screen.getByTestId('app-mode-option-operator')).toBeInTheDocument()
    expect(screen.getByTestId('app-mode-option-view-as')).toBeInTheDocument()
    expect(screen.getByTestId('app-mode-option-tickets')).toBeInTheDocument()
  })

  it('hides the ticket-system mode when the capability is false', async () => {
    mock.state.capabilities = {
      can_use_ticket_system: false,
      can_view_as_operator: true,
    }
    const user = userEvent.setup()
    render(<AppModeSwitcher />)
    await user.click(screen.getByTestId('app-mode-switcher-trigger'))
    expect(
      screen.queryByTestId('app-mode-option-tickets'),
    ).not.toBeInTheDocument()
  })

  it('hides the view-as mode when the capability is false', async () => {
    mock.state.capabilities = {
      can_use_ticket_system: true,
      can_view_as_operator: false,
    }
    const user = userEvent.setup()
    render(<AppModeSwitcher />)
    await user.click(screen.getByTestId('app-mode-switcher-trigger'))
    expect(
      screen.queryByTestId('app-mode-option-view-as'),
    ).not.toBeInTheDocument()
  })

  it('enters the ticket system when that mode is selected', async () => {
    const user = userEvent.setup()
    render(<AppModeSwitcher />)
    await user.click(screen.getByTestId('app-mode-switcher-trigger'))
    await user.click(screen.getByTestId('app-mode-option-tickets'))
    expect(mock.state.enterTicketSystem).toHaveBeenCalledTimes(1)
  })

  it('enters operator mode when that mode is selected', async () => {
    mock.state.mode = 'tickets'
    const user = userEvent.setup()
    render(<AppModeSwitcher />)
    await user.click(screen.getByTestId('app-mode-switcher-trigger'))
    await user.click(screen.getByTestId('app-mode-option-operator'))
    expect(mock.state.enterOperatorMode).toHaveBeenCalledTimes(1)
  })

  it('enters view-as for the first staff operator when that mode is selected', async () => {
    const user = userEvent.setup()
    render(<AppModeSwitcher />)
    await user.click(screen.getByTestId('app-mode-switcher-trigger'))
    await user.click(screen.getByTestId('app-mode-option-view-as'))
    expect(mock.state.enterViewAs).toHaveBeenCalledWith('op-1')
  })

  it('reflects the current mode on the trigger', () => {
    mock.state.mode = 'tickets'
    render(<AppModeSwitcher />)
    expect(screen.getByTestId('app-mode-switcher-trigger')).toHaveAttribute(
      'data-current-mode',
      'tickets',
    )
  })
})
