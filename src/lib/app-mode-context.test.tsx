// landr-7dya.10 — AppModeProvider: mode derivation, capability gating, and the
// enter-mode navigation actions.
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

const { mock } = vi.hoisted(() => {
  const state = {
    isLandrStaff: true,
    viewAsActive: false,
    exitViewAs: vi.fn(),
    capabilities: {
      can_use_ticket_system: true,
      can_view_as_operator: true,
    },
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
  const { mode, showSwitcher, capabilities, enterTicketSystem, enterOperatorMode } =
    useAppMode()
  const { pathname } = useLocation()
  return (
    <div>
      <span data-testid="mode">{mode}</span>
      <span data-testid="show-switcher">{String(showSwitcher)}</span>
      <span data-testid="can-tickets">
        {String(capabilities.can_use_ticket_system)}
      </span>
      <span data-testid="pathname">{pathname}</span>
      <button data-testid="go-tickets" onClick={enterTicketSystem}>
        tickets
      </button>
      <button data-testid="go-operator" onClick={enterOperatorMode}>
        operator
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
    can_use_ticket_system: true,
    can_view_as_operator: true,
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

  it('enterTicketSystem is a no-op without the ticket-system capability', async () => {
    mock.state.capabilities = {
      can_use_ticket_system: false,
      can_view_as_operator: true,
    }
    const user = userEvent.setup()
    renderAt('/bookings')
    // wait for the capability query to settle so the guard reads false
    await waitFor(() =>
      expect(screen.getByTestId('can-tickets')).toHaveTextContent('false'),
    )
    await user.click(screen.getByTestId('go-tickets'))
    expect(screen.getByTestId('pathname')).toHaveTextContent('/bookings')
  })
})
