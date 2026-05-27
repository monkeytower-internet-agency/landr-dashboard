// landr-7dya.10 / landr-7dya.13 — staff gate for the ticket-system app-view.
// Capabilities shape reconciled with real API (landr-api PR #171):
//   { is_staff, is_owner, can_triage_tickets, can_admin_roles, can_view_as_operator, roles }
// canUseTicketSystem(caps) = caps.is_staff || caps.can_triage_tickets
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mock } = vi.hoisted(() => {
  const state = {
    isLandrStaff: true,
    entLoading: false,
    // is_staff=true → canUseTicketSystem returns true (staff gets access).
    isStaffCap: true,
    canTriageTickets: false,
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
      is_staff: mock.state.isStaffCap,
      is_owner: false,
      can_triage_tickets: mock.state.canTriageTickets,
      can_admin_roles: false,
      can_view_as_operator: true,
      roles: [],
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
  mock.state.isStaffCap = true
  mock.state.canTriageTickets = false
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
    // Neither is_staff nor can_triage_tickets → canUseTicketSystem = false.
    mock.state.isStaffCap = false
    mock.state.canTriageTickets = false
    renderGate()
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })

  it('allows access when can_triage_tickets is true even without is_staff', () => {
    mock.state.isStaffCap = false
    mock.state.canTriageTickets = true
    renderGate()
    expect(screen.getByTestId('protected')).toBeInTheDocument()
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
