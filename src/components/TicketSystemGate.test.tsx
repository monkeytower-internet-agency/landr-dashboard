// landr-7dya.10 — staff gate for the ticket-system app-view.
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mock } = vi.hoisted(() => {
  const state = {
    isLandrStaff: true,
    entLoading: false,
    canUseTicketSystem: true,
    capabilitiesLoading: false,
  }
  return { mock: { state } }
})

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isLandrStaff: mock.state.isLandrStaff,
    isLoading: mock.state.entLoading,
    effectiveIsStaff: mock.state.isLandrStaff,
    isEnabled: () => true,
  }),
}))

vi.mock('@/lib/app-mode-context', () => ({
  useAppMode: () => ({
    capabilities: {
      can_use_ticket_system: mock.state.canUseTicketSystem,
      can_view_as_operator: true,
    },
    capabilitiesLoading: mock.state.capabilitiesLoading,
  }),
}))

import { TicketSystemGate } from './TicketSystemGate'

function renderGate() {
  return render(
    <MemoryRouter initialEntries={['/staff/tickets']}>
      <Routes>
        <Route
          path="/staff/tickets"
          element={
            <TicketSystemGate>
              <div data-testid="protected">workspace</div>
            </TicketSystemGate>
          }
        />
        <Route path="/" element={<div data-testid="home">home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mock.state.isLandrStaff = true
  mock.state.entLoading = false
  mock.state.canUseTicketSystem = true
  mock.state.capabilitiesLoading = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('TicketSystemGate', () => {
  it('renders the workspace for capable staff', () => {
    renderGate()
    expect(screen.getByTestId('protected')).toBeInTheDocument()
  })

  it('redirects non-staff to home', () => {
    mock.state.isLandrStaff = false
    renderGate()
    expect(screen.getByTestId('home')).toBeInTheDocument()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
  })

  it('redirects staff without the ticket-system capability', () => {
    mock.state.canUseTicketSystem = false
    renderGate()
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('shows a loading placeholder while entitlements resolve', () => {
    mock.state.entLoading = true
    renderGate()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home')).not.toBeInTheDocument()
  })

  it('shows a loading placeholder while capabilities resolve', () => {
    mock.state.capabilitiesLoading = true
    renderGate()
    expect(screen.queryByTestId('protected')).not.toBeInTheDocument()
    expect(screen.queryByTestId('home')).not.toBeInTheDocument()
  })
})
