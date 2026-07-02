// landr-m63x — Settings → Service roles: receives_main_service +
// requires_pickup_location toggles (mobile parity).
//
// Verifies the edit affordance shows the current value of both fields and
// that toggling + saving sends a minimal PATCH containing only the changed
// field(s), matching this screen's existing minimal-PATCH convention.

import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { ServiceRole } from '@/lib/serviceRoles'

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

vi.mock('@/lib/operator', async () => {
  const mod = await vi.importActual<typeof import('@/lib/operator')>(
    '@/lib/operator',
  )
  return {
    ...mod,
    useOperator: () => ({
      operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
      currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
      currentOperatorId: 'op-1',
      loading: false,
      switchOperator: () => {},
    }),
    OperatorProvider: ({ children }: { children: ReactNode }) => children,
  }
})

const { fetchMock, patchMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  patchMock: vi.fn(),
}))

vi.mock('@/lib/serviceRoles', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/serviceRoles')>()
  return {
    ...actual,
    fetchServiceRoles: (...args: unknown[]) => fetchMock(...args),
    updateServiceRole: (...args: unknown[]) => patchMock(...args),
  }
})

import { ServiceRolesManager } from './ServiceRolesSettings'

// ---------------------------------------------------------------------------
// Helpers + fixtures
// ---------------------------------------------------------------------------

function render(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(ui, {
    wrapper: ({ children }: { children: ReactNode }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter>{children}</MemoryRouter>
      </QueryClientProvider>
    ),
  })
}

function makeRole(overrides: Partial<ServiceRole> = {}): ServiceRole {
  return {
    id: 'r1',
    operator_id: 'op-1',
    code: 'pilot',
    label: 'Pilot',
    label_localized: null,
    description: null,
    description_localized: null,
    requires_pickup_location: false,
    requires_provider_role_id: null,
    receives_main_service: true,
    sort_order: 0,
    active: true,
    created_at: '2026-05-22T12:00:00Z',
    updated_at: '2026-05-22T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  patchMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('ServiceRolesSettings — mobile-parity toggles (landr-m63x)', () => {
  it('reflects the current field values when entering edit mode', async () => {
    fetchMock.mockResolvedValue([
      makeRole({ receives_main_service: false, requires_pickup_location: true }),
    ])
    const user = userEvent.setup()
    render(<ServiceRolesManager operatorId="op-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('service-role-row-r1-edit')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('service-role-row-r1-edit'))

    const receivesSwitch = screen.getByTestId(
      'service-role-row-r1-receives-main-service',
    )
    const pickupSwitch = screen.getByTestId(
      'service-role-row-r1-requires-pickup-location',
    )
    expect(receivesSwitch).toHaveAttribute('aria-checked', 'false')
    expect(pickupSwitch).toHaveAttribute('aria-checked', 'true')
  })

  it('sends only the toggled field when saving receives_main_service', async () => {
    fetchMock.mockResolvedValue([makeRole()])
    patchMock.mockResolvedValue(makeRole({ receives_main_service: false }))
    const user = userEvent.setup()
    render(<ServiceRolesManager operatorId="op-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('service-role-row-r1-edit')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('service-role-row-r1-edit'))

    const receivesSwitch = screen.getByTestId(
      'service-role-row-r1-receives-main-service',
    )
    expect(receivesSwitch).toHaveAttribute('aria-checked', 'true')
    await user.click(receivesSwitch)
    expect(receivesSwitch).toHaveAttribute('aria-checked', 'false')

    await user.click(screen.getByTestId('service-role-row-r1-save'))

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledTimes(1)
    })
    expect(patchMock).toHaveBeenCalledWith('op-1', 'r1', {
      receives_main_service: false,
    })
  })

  it('sends only the toggled field when saving requires_pickup_location', async () => {
    fetchMock.mockResolvedValue([makeRole({ requires_pickup_location: false })])
    patchMock.mockResolvedValue(makeRole({ requires_pickup_location: true }))
    const user = userEvent.setup()
    render(<ServiceRolesManager operatorId="op-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('service-role-row-r1-edit')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('service-role-row-r1-edit'))

    const pickupSwitch = screen.getByTestId(
      'service-role-row-r1-requires-pickup-location',
    )
    expect(pickupSwitch).toHaveAttribute('aria-checked', 'false')
    await user.click(pickupSwitch)

    await user.click(screen.getByTestId('service-role-row-r1-save'))

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledTimes(1)
    })
    expect(patchMock).toHaveBeenCalledWith('op-1', 'r1', {
      requires_pickup_location: true,
    })
  })

  it('combines a label change and a toggle change into a single patch', async () => {
    fetchMock.mockResolvedValue([makeRole()])
    patchMock.mockResolvedValue(makeRole({ label: 'Tandem Pilot' }))
    const user = userEvent.setup()
    render(<ServiceRolesManager operatorId="op-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('service-role-row-r1-edit')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('service-role-row-r1-edit'))

    const labelInput = screen.getByTestId('service-role-row-r1-label')
    await user.clear(labelInput)
    await user.type(labelInput, 'Tandem Pilot')
    await user.click(
      screen.getByTestId('service-role-row-r1-requires-pickup-location'),
    )
    await user.click(screen.getByTestId('service-role-row-r1-save'))

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledTimes(1)
    })
    expect(patchMock).toHaveBeenCalledWith('op-1', 'r1', {
      label: 'Tandem Pilot',
      requires_pickup_location: true,
    })
  })

  it('disables save when nothing changed and re-enables on toggle', async () => {
    fetchMock.mockResolvedValue([makeRole()])
    const user = userEvent.setup()
    render(<ServiceRolesManager operatorId="op-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('service-role-row-r1-edit')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('service-role-row-r1-edit'))

    expect(screen.getByTestId('service-role-row-r1-save')).toBeDisabled()
    await user.click(
      screen.getByTestId('service-role-row-r1-receives-main-service'),
    )
    expect(screen.getByTestId('service-role-row-r1-save')).not.toBeDisabled()
  })

  it('resets toggles to the original value on cancel', async () => {
    fetchMock.mockResolvedValue([makeRole()])
    const user = userEvent.setup()
    render(<ServiceRolesManager operatorId="op-1" />)

    await waitFor(() => {
      expect(screen.getByTestId('service-role-row-r1-edit')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('service-role-row-r1-edit'))
    await user.click(
      screen.getByTestId('service-role-row-r1-receives-main-service'),
    )
    await user.click(screen.getByText('Cancel'))

    // Re-enter edit mode; the toggle should reflect the unchanged role value.
    await user.click(screen.getByTestId('service-role-row-r1-edit'))
    expect(
      screen.getByTestId('service-role-row-r1-receives-main-service'),
    ).toHaveAttribute('aria-checked', 'true')
    expect(patchMock).not.toHaveBeenCalled()
  })
})
