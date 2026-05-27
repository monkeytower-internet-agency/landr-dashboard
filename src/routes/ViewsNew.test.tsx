// landr-v0xg — tests for the /views/new materialiser route.
//
// Covers:
//   - blank create when ?from is missing → POST with Untitled name
//   - template create when ?from=template:<key> → POST with template config
//   - unknown template key falls back to blank Untitled (no throw)
//   - successful create replace-navigates to /views/:newId
import {
  render as rtlRender,
  screen,
  waitFor,
  type RenderOptions,
} from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement } from 'react'

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
  OperatorProvider: ({ children }: { children: ReactElement }) => children,
}))

const { mocks } = vi.hoisted(() => ({
  mocks: {
    createSavedView: vi.fn(),
    getSavedView: vi.fn(),
  },
}))

vi.mock('@/lib/saved-views', async () => {
  const actual = await vi.importActual<typeof import('@/lib/saved-views')>(
    '@/lib/saved-views',
  )
  return {
    ...actual,
    createSavedView: mocks.createSavedView,
    getSavedView: mocks.getSavedView,
  }
})

import { ViewsNew } from './ViewsNew'

// Zod 4 enforces UUID version+variant nibbles; use canonical v4 fixtures.
const NEW_ID = '77777777-7777-4777-8777-777777777777'

function LocationProbe() {
  const loc = useLocation()
  return <span data-testid="loc">{loc.pathname}</span>
}

function render(initial: string): ReturnType<typeof rtlRender> {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  const options: RenderOptions = {
    wrapper: ({ children }) => (
      <QueryClientProvider client={client}>
        <MemoryRouter initialEntries={[initial]}>
          <Routes>
            <Route path="/views/new" element={<>{children}</>} />
            <Route path="/views/:viewId" element={<LocationProbe />} />
          </Routes>
        </MemoryRouter>
      </QueryClientProvider>
    ),
  }
  return rtlRender(<ViewsNew />, options)
}

function makeCreated(name: string) {
  return {
    id: NEW_ID,
    operator_id: '11111111-1111-4111-8111-111111111111',
    creator_user_id: '33333333-3333-4333-8333-333333333333',
    entity_type: 'booking',
    visibility: 'personal',
    name,
    config: {},
    sort_order: 0,
    created_at: '2026-05-21T10:00:00Z',
    updated_at: '2026-05-21T10:00:00Z',
  }
}

beforeEach(() => {
  mocks.createSavedView.mockReset()
  mocks.getSavedView.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('ViewsNew (landr-v0xg)', () => {
  it('creates a blank Untitled Personal view when ?from is missing', async () => {
    mocks.createSavedView.mockResolvedValueOnce(makeCreated('Untitled view'))

    render('/views/new')

    await waitFor(() => {
      expect(mocks.createSavedView).toHaveBeenCalledTimes(1)
    })
    const [opId, payload] = mocks.createSavedView.mock.calls[0]
    expect(opId).toBe('op-1')
    expect(payload).toMatchObject({
      name: 'Untitled view',
      entity_type: 'booking',
      visibility: 'personal',
    })

    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe(`/views/${NEW_ID}`)
    })
  })

  it('creates from a template when ?from=template:<key> is set', async () => {
    mocks.createSavedView.mockResolvedValueOnce(makeCreated('Pending approvals'))

    render('/views/new?from=template:pending-approvals')

    await waitFor(() => {
      expect(mocks.createSavedView).toHaveBeenCalledTimes(1)
    })
    const [, payload] = mocks.createSavedView.mock.calls[0]
    expect(payload).toMatchObject({
      name: 'Pending approvals',
      entity_type: 'booking',
      visibility: 'personal',
    })
    // Template config should be passed through verbatim (board layout, the
    // current_stage filter, board column spec).
    const sentConfig = (payload as { config: Record<string, unknown> }).config
    expect(sentConfig.layout).toBe('board')
    expect(Array.isArray(sentConfig.filters)).toBe(true)

    await waitFor(() => {
      expect(screen.getByTestId('loc').textContent).toBe(`/views/${NEW_ID}`)
    })
  })

  it('falls back to Untitled when ?from=template:<unknown-key>', async () => {
    mocks.createSavedView.mockResolvedValueOnce(makeCreated('Untitled view'))

    render('/views/new?from=template:does-not-exist')

    await waitFor(() => {
      expect(mocks.createSavedView).toHaveBeenCalledTimes(1)
    })
    const [, payload] = mocks.createSavedView.mock.calls[0]
    expect(payload).toMatchObject({ name: 'Untitled view' })
  })

  it('surfaces an inline error when the create call fails', async () => {
    mocks.createSavedView.mockRejectedValueOnce(new Error('boom'))

    render('/views/new')

    expect(await screen.findByText(/failed to create view/i)).toBeInTheDocument()
    expect(screen.getByText(/boom/i)).toBeInTheDocument()
  })
})
