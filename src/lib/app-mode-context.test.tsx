// landr-7dya.10 / landr-7dya.13 — AppModeProvider: mode derivation, capability
// gating, enter-mode navigation actions, and view-as picker open state.
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import {
  MemoryRouter,
  Routes,
  Route,
  useLocation,
} from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StaffCapabilities } from '@/lib/staff-capabilities'

const { mock } = vi.hoisted(() => {
  const state = {
    isLandrStaff: true,
    viewAsActive: false,
    exitViewAs: vi.fn(),
    capabilities: {
      is_staff: true,
      is_owner: false,
      can_triage_tickets: true,
      can_admin_roles: false,
      can_view_as_operator: true,
      roles: [],
    } as StaffCapabilities,
  }
  return { mock: { state } }
})

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isLandrStaff: mock.state.isLandrStaff,
    effectiveIsStaff: mock.state.isLandrStaff && !mock.state.viewAsActive,
    isEnabled: () => true,
    isLoading: false,
  }),
}))

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    viewAsActive: mock.state.viewAsActive,
    exitViewAs: mock.state.exitViewAs,
  }),
}))

vi.mock('@/lib/staff-capabilities', async () => {
  const actual = await vi.importActual<
    typeof import('@/lib/staff-capabilities')
  >('@/lib/staff-capabilities')
  return {
    ...actual,
    fetchStaffCapabilities: vi.fn(async () => mock.state.capabilities),
  }
})

import { AppModeProvider, useAppMode } from './app-mode-context'
import { TICKET_SYSTEM_PATH } from './app-mode'

function Probe() {
  const {
    mode,
    showSwitcher,
    capabilities,
    enterTicketSystem,
    enterOperatorMode,
    enterViewAsMode,
    viewAsPickerOpen,
    closeViewAsPicker,
  } = useAppMode()
  const { pathname } = useLocation()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="show-switcher">{String(showSwitcher)}</span>
      <span data-testid="can-tickets">
        {String(capabilities.is_staff || capabilities.can_triage_tickets)}
      </span>
      <span data-testid="can-view-as">{String(capabilities.can_view_as_operator)}</span>
      <span data-testid="picker-open">{String(viewAsPickerOpen)}</span>
      <span data-testid="pathname">{pathname}</span>
      <button data-testid="go-tickets" onClick={enterTicketSystem}>
        tickets
      </button>
      <button data-testid="go-operator" onClick={enterOperatorMode}>
        operator
      </button>
      <button data-testid="go-view-as" onClick={enterViewAsMode}>
        view-as
      </button>
      <button data-testid="close-picker" onClick={closeViewAsPicker}>
        close
      </button>
    </div>
  )
}

function renderAt(initial: string) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={[initial]}>
        <AppModeProvider>
          <Routes>
            <Route path="*" element={<Probe />} />
          </Routes>
        </AppModeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mock.state.isLandrStaff = true
  mock.state.viewAsActive = false
  mock.state.capabilities = {
    is_staff: true,
    is_owner: false,
    can_triage_tickets: true,
    can_admin_roles: false,
    can_view_as_operator: true,
    roles: [],
  }
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('AppModeProvider mode derivation', () => {
  it('derives operator mode on a normal route', async () => {
    renderAt('/bookings')
    expect(await screen.findByTestId('mode')).toHaveTextContent('operator')
  })

  it('derives tickets mode inside the app-view', async () => {
    renderAt(TICKET_SYSTEM_PATH)
    expect(await screen.findByTestId('mode')).toHaveTextContent('tickets')
  })

  it('derives view-as mode when view-as is active outside the app-view', async () => {
    mock.state.viewAsActive = true
    renderAt('/bookings')
    expect(await screen.findByTestId('mode')).toHaveTextContent('view-as')
  })
})

describe('AppModeProvider switcher gating', () => {
  it('shows the switcher for capable staff', async () => {
    renderAt('/')
    expect(await screen.findByTestId('show-switcher')).toHaveTextContent('true')
  })

  it('hides the switcher for non-staff', async () => {
    mock.state.isLandrStaff = false
    renderAt('/')
    expect(await screen.findByTestId('show-switcher')).toHaveTextContent(
      'false',
    )
  })

  it('hides the switcher when staff has no capabilities', async () => {
    mock.state.capabilities = {
      is_staff: false,
      is_owner: false,
      can_triage_tickets: false,
      can_admin_roles: false,
      can_view_as_operator: false,
      roles: [],
    }
    renderAt('/')
    await waitFor(() =>
      expect(screen.getByTestId('can-tickets')).toHaveTextContent('false'),
    )
    expect(screen.getByTestId('show-switcher')).toHaveTextContent('false')
  })
})

describe('AppModeProvider navigation actions', () => {
  it('enterTicketSystem navigates into the app-view', async () => {
    const user = userEvent.setup()
    renderAt('/bookings')
    await screen.findByTestId('mode')
    await user.click(screen.getByTestId('go-tickets'))
    expect(screen.getByTestId('pathname')).toHaveTextContent(TICKET_SYSTEM_PATH)
    expect(screen.getByTestId('mode')).toHaveTextContent('tickets')
  })

  it('enterOperatorMode leaves the app-view back to home', async () => {
    const user = userEvent.setup()
    renderAt(TICKET_SYSTEM_PATH)
    await screen.findByTestId('mode')
    await user.click(screen.getByTestId('go-operator'))
    expect(screen.getByTestId('pathname')).toHaveTextContent('/')
    expect(screen.getByTestId('mode')).toHaveTextContent('operator')
  })

  it('enterTicketSystem is a no-op without ticket capability', async () => {
    mock.state.capabilities = {
      is_staff: false,
      is_owner: false,
      can_triage_tickets: false,
      can_admin_roles: false,
      can_view_as_operator: true,
      roles: [],
    }
    const user = userEvent.setup()
    renderAt('/bookings')
    await waitFor(() =>
      expect(screen.getByTestId('can-tickets')).toHaveTextContent('false'),
    )
    await user.click(screen.getByTestId('go-tickets'))
    expect(screen.getByTestId('pathname')).toHaveTextContent('/bookings')
  })
})

describe('AppModeProvider view-as picker state (landr-7dya.13)', () => {
  it('picker starts closed', async () => {
    renderAt('/')
    expect(await screen.findByTestId('picker-open')).toHaveTextContent('false')
  })

  it('enterViewAsMode opens the picker', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await screen.findByTestId('picker-open')
    await user.click(screen.getByTestId('go-view-as'))
    expect(screen.getByTestId('picker-open')).toHaveTextContent('true')
  })

  it('closeViewAsPicker closes the picker', async () => {
    const user = userEvent.setup()
    renderAt('/')
    await screen.findByTestId('picker-open')
    await user.click(screen.getByTestId('go-view-as'))
    expect(screen.getByTestId('picker-open')).toHaveTextContent('true')
    await user.click(screen.getByTestId('close-picker'))
    expect(screen.getByTestId('picker-open')).toHaveTextContent('false')
  })

  it('enterViewAsMode is a no-op without can_view_as_operator', async () => {
    mock.state.capabilities = {
      is_staff: true,
      is_owner: false,
      can_triage_tickets: true,
      can_admin_roles: false,
      can_view_as_operator: false,
      roles: [],
    }
    const user = userEvent.setup()
    renderAt('/')
    await waitFor(() =>
      expect(screen.getByTestId('can-view-as')).toHaveTextContent('false'),
    )
    await user.click(screen.getByTestId('go-view-as'))
    expect(screen.getByTestId('picker-open')).toHaveTextContent('false')
  })
})
