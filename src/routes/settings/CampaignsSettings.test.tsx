// landr-sp4r — Settings → Campaigns smoke + interaction coverage.
//
// Verifies the campaigns list renders, the create dialog opens + submits
// a campaign, the edit dialog pre-fills, and deactivate fires deleteCampaign.

import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { Campaign } from '@/lib/campaigns'

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

const { fetchMock, createMock, patchMock, deleteMock } = vi.hoisted(() => ({
  fetchMock: vi.fn(),
  createMock: vi.fn(),
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
}))

vi.mock('@/lib/campaigns', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/campaigns')>()
  return {
    ...actual,
    fetchCampaigns: (...args: unknown[]) => fetchMock(...args),
    createCampaign: (...args: unknown[]) => createMock(...args),
    patchCampaign: (...args: unknown[]) => patchMock(...args),
    deleteCampaign: (...args: unknown[]) => deleteMock(...args),
  }
})

import { CampaignsSettings } from './CampaignsSettings'

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

function makeCampaign(overrides: Partial<Campaign> = {}): Campaign {
  return {
    id: 'c1',
    operator_id: 'op-1',
    code: 'SUMMER25',
    label: 'Summer 2025',
    label_localized: null,
    description: null,
    description_localized: null,
    kind: 'marketing',
    scope: 'booking',
    start_date: '2025-06-01',
    end_date: '2025-08-31',
    active: true,
    sort_order: 0,
    created_at: '2026-05-22T12:00:00Z',
    updated_at: '2026-05-22T12:00:00Z',
    ...overrides,
  }
}

beforeEach(() => {
  fetchMock.mockReset()
  createMock.mockReset()
  patchMock.mockReset()
  deleteMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('CampaignsSettings (landr-sp4r)', () => {
  it('renders the operator campaigns', async () => {
    fetchMock.mockResolvedValue([makeCampaign()])
    render(<CampaignsSettings />)
    await waitFor(() => {
      expect(screen.getByText('SUMMER25')).toBeInTheDocument()
    })
    expect(screen.getByText('Summer 2025')).toBeInTheDocument()
  })

  it('shows the empty state when there are no campaigns', async () => {
    fetchMock.mockResolvedValue([])
    render(<CampaignsSettings />)
    await waitFor(() => {
      expect(screen.getByText(/No campaigns yet/i)).toBeInTheDocument()
    })
  })

  it('opens the create dialog and submits a new campaign', async () => {
    fetchMock.mockResolvedValue([])
    createMock.mockResolvedValue(makeCampaign())
    const user = userEvent.setup()
    render(<CampaignsSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('campaigns-settings-new')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('campaigns-settings-new'))

    await user.type(screen.getByTestId('campaign-dialog-code'), 'AUTUMN25')
    await user.type(screen.getByTestId('campaign-dialog-label'), 'Autumn push')
    await user.click(screen.getByTestId('campaign-dialog-save'))

    await waitFor(() => {
      expect(createMock).toHaveBeenCalledTimes(1)
    })
    const [opId, input] = createMock.mock.calls[0]
    expect(opId).toBe('op-1')
    expect(input).toMatchObject({
      code: 'AUTUMN25',
      label: 'Autumn push',
      kind: 'marketing',
      scope: 'booking',
      active: true,
    })
  })

  it('blocks save when end date precedes start date', async () => {
    fetchMock.mockResolvedValue([])
    const user = userEvent.setup()
    render(<CampaignsSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('campaigns-settings-new')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('campaigns-settings-new'))

    await user.type(screen.getByTestId('campaign-dialog-code'), 'X')
    await user.type(screen.getByTestId('campaign-dialog-label'), 'X')
    // start defaults to today; force start after end via fireEvent-style typing
    const start = screen.getByTestId('campaign-dialog-start')
    const end = screen.getByTestId('campaign-dialog-end')
    await user.clear(start)
    await user.type(start, '2025-08-31')
    await user.clear(end)
    await user.type(end, '2025-06-01')

    expect(screen.getByTestId('campaign-dialog-save')).toBeDisabled()
    expect(screen.getByText(/End date must not be before/i)).toBeInTheDocument()
  })

  it('opens the edit dialog pre-filled and patches', async () => {
    fetchMock.mockResolvedValue([makeCampaign()])
    patchMock.mockResolvedValue(makeCampaign({ label: 'Summer Sale' }))
    const user = userEvent.setup()
    render(<CampaignsSettings />)

    await waitFor(() => {
      expect(screen.getByTestId('campaign-row-c1-edit')).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('campaign-row-c1-edit'))

    const labelInput = screen.getByTestId('campaign-dialog-label')
    expect(labelInput).toHaveValue('Summer 2025')
    await user.clear(labelInput)
    await user.type(labelInput, 'Summer Sale')
    await user.click(screen.getByTestId('campaign-dialog-save'))

    await waitFor(() => {
      expect(patchMock).toHaveBeenCalledTimes(1)
    })
    const [opId, id, patch] = patchMock.mock.calls[0]
    expect(opId).toBe('op-1')
    expect(id).toBe('c1')
    expect(patch).toMatchObject({ label: 'Summer Sale' })
  })

  it('deactivates a campaign after confirm', async () => {
    fetchMock.mockResolvedValue([makeCampaign()])
    deleteMock.mockResolvedValue(undefined)
    const user = userEvent.setup()
    render(<CampaignsSettings />)

    await waitFor(() => {
      expect(
        screen.getByTestId('campaign-row-c1-deactivate'),
      ).toBeInTheDocument()
    })
    await user.click(screen.getByTestId('campaign-row-c1-deactivate'))
    await user.click(screen.getByTestId('campaign-row-c1-confirm-deactivate'))

    await waitFor(() => {
      expect(deleteMock).toHaveBeenCalledWith('op-1', 'c1')
    })
  })
})
