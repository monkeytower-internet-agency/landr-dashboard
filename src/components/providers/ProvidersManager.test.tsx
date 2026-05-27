import { render as rtlRender, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ReactNode } from 'react'

import { ProvidersManager } from '@/components/providers/ProvidersManager'

type ProviderFixture = {
  id: string
  operator_id: string
  contact_id: string | null
  display_name: string
  default_role_id: string | null
  active: boolean
  sort_order: number
  created_at: string
  updated_at: string
}

const { mock } = vi.hoisted(() => ({
  mock: {
    state: {
      roster: [] as ProviderFixture[],
      roleTypes: [] as Array<{ id: string; label: string }>,
      lastCreate: null as Record<string, unknown> | null,
      lastPatch: null as { id: string; body: Record<string, unknown> } | null,
      lastDelete: null as string | null,
    },
  },
}))

vi.mock('@/lib/providers', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/providers')>()
  return {
    ...actual,
    fetchProviderRoster: vi.fn(async () => mock.state.roster),
    fetchProviderRoleTypes: vi.fn(async () => mock.state.roleTypes),
    createProvider: vi.fn(async (_op: string, body: Record<string, unknown>) => {
      mock.state.lastCreate = body
      const row: ProviderFixture = {
        id: `prov-${mock.state.roster.length + 1}`,
        operator_id: 'op-1',
        contact_id: null,
        display_name: body.display_name as string,
        default_role_id: (body.default_role_id as string | null) ?? null,
        active: true,
        sort_order: 0,
        created_at: '2026-05-22T00:00:00Z',
        updated_at: '2026-05-22T00:00:00Z',
      }
      mock.state.roster = [...mock.state.roster, row]
      return row
    }),
    updateProvider: vi.fn(
      async (_op: string, id: string, body: Record<string, unknown>) => {
        mock.state.lastPatch = { id, body }
        mock.state.roster = mock.state.roster.map((p) =>
          p.id === id ? { ...p, ...body } : p,
        )
        return mock.state.roster.find((p) => p.id === id)!
      },
    ),
    deleteProvider: vi.fn(async (_op: string, id: string) => {
      mock.state.lastDelete = id
      mock.state.roster = mock.state.roster.filter((p) => p.id !== id)
    }),
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

function render(ui: ReactNode) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

afterEach(() => {
  mock.state.roster = []
  mock.state.roleTypes = []
  mock.state.lastCreate = null
  mock.state.lastPatch = null
  mock.state.lastDelete = null
  vi.clearAllMocks()
})

describe('ProvidersManager', () => {
  it('lists the roster', async () => {
    mock.state.roleTypes = [{ id: 'role-1', label: 'Tandem pilot' }]
    mock.state.roster = [
      {
        id: 'prov-1',
        operator_id: 'op-1',
        contact_id: null,
        display_name: 'Martin Reichelt',
        default_role_id: 'role-1',
        active: true,
        sort_order: 10,
        created_at: '2026-05-22T00:00:00Z',
        updated_at: '2026-05-22T00:00:00Z',
      },
    ]
    render(<ProvidersManager operatorId="op-1" />)

    expect(await screen.findByText('Martin Reichelt')).toBeInTheDocument()
    expect(screen.getByText('Tandem pilot')).toBeInTheDocument()
  })

  it('shows the empty state', async () => {
    render(<ProvidersManager operatorId="op-1" />)
    expect(
      await screen.findByText(/No providers yet/i),
    ).toBeInTheDocument()
  })

  it('creates a provider', async () => {
    const user = userEvent.setup()
    mock.state.roleTypes = [{ id: 'role-1', label: 'Driver' }]
    render(<ProvidersManager operatorId="op-1" />)

    await screen.findByText(/No providers yet/i)
    await user.click(screen.getByRole('button', { name: /Add provider/i }))

    const input = await screen.findByTestId('provider-name-input')
    await user.type(input, 'Marie Dubois')
    await user.click(screen.getByTestId('provider-save-btn'))

    await waitFor(() => {
      expect(mock.state.lastCreate).toMatchObject({
        display_name: 'Marie Dubois',
      })
    })
  })

  it('deactivates a provider', async () => {
    const user = userEvent.setup()
    mock.state.roster = [
      {
        id: 'prov-1',
        operator_id: 'op-1',
        contact_id: null,
        display_name: 'Active Andy',
        default_role_id: null,
        active: true,
        sort_order: 0,
        created_at: '2026-05-22T00:00:00Z',
        updated_at: '2026-05-22T00:00:00Z',
      },
    ]
    render(<ProvidersManager operatorId="op-1" />)

    await screen.findByText('Active Andy')
    await user.click(screen.getByRole('button', { name: /Deactivate/i }))

    await waitFor(() => {
      expect(mock.state.lastPatch).toEqual({
        id: 'prov-1',
        body: { active: false },
      })
    })
  })
})
