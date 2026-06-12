// landr-7dya.10 / landr-7dya.13 — top-level workspace mode switch.
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffCapabilities } from '@/lib/staff-capabilities'
import type { AppMode } from '@/lib/app-mode'

const { mock } = vi.hoisted(() => {
  const state = {
    mode: 'operator' as AppMode,
    capabilities: {
      is_staff: true,
      is_owner: false,
      can_triage_tickets: true,
      can_admin_roles: false,
      can_view_as_operator: true,
      roles: [],
    } as StaffCapabilities,
    showSwitcher: true,
    enterOperatorMode: vi.fn(),
    enterTicketSystem: vi.fn(),
    enterViewAsMode: vi.fn(),
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
    enterViewAsMode: mock.state.enterViewAsMode,
    viewAsPickerOpen: false,
    closeViewAsPicker: vi.fn(),
  }),
}))

// AppModeSwitcher no longer imports useOperator — no mock needed.

import { AppModeSwitcher } from './AppModeSwitcher'

beforeEach(() => {
  mock.state.mode = 'operator'
  mock.state.capabilities = {
    is_staff: true,
    is_owner: false,
    can_triage_tickets: true,
    can_admin_roles: false,
    can_view_as_operator: true,
    roles: [],
  }
  mock.state.showSwitcher = true
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
      is_staff: false,
      is_owner: false,
      can_triage_tickets: false,
      can_admin_roles: false,
      can_view_as_operator: true,
      roles: [],
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
      is_staff: true,
      is_owner: false,
      can_triage_tickets: true,
      can_admin_roles: false,
      can_view_as_operator: false,
      roles: [],
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

  it('calls enterViewAsMode (opens picker) when view-as mode is selected', async () => {
    const user = userEvent.setup()
    render(<AppModeSwitcher />)
    await user.click(screen.getByTestId('app-mode-switcher-trigger'))
    await user.click(screen.getByTestId('app-mode-option-view-as'))
    expect(mock.state.enterViewAsMode).toHaveBeenCalledTimes(1)
  })

  it('reflects the current mode on the trigger', () => {
    mock.state.mode = 'tickets'
    render(<AppModeSwitcher />)
    expect(screen.getByTestId('app-mode-switcher-trigger')).toHaveAttribute(
      'data-current-mode',
      'tickets',
    )
  })

  it('shows the ticket-system mode when only can_triage_tickets is true', async () => {
    mock.state.capabilities = {
      is_staff: false,
      is_owner: false,
      can_triage_tickets: true,
      can_admin_roles: false,
      can_view_as_operator: true,
      roles: [],
    }
    const user = userEvent.setup()
    render(<AppModeSwitcher />)
    await user.click(screen.getByTestId('app-mode-switcher-trigger'))
    expect(screen.getByTestId('app-mode-option-tickets')).toBeInTheDocument()
  })
})
