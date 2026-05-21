// landr-c58d / landr-45pb — PinButton tests (renamed from StarButton).
//
// Covers:
//   - renders a button with the correct aria-label + aria-pressed for both states
//   - click toggles pinned + calls setViewUserState({pinned})
//   - on API error: reverts the optimistic cache patch + toasts
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mocks } = vi.hoisted(() => {
  return {
    mocks: {
      setViewUserState: vi.fn(),
      toastError: vi.fn(),
    },
  }
})

vi.mock('@/lib/saved-views', async () => {
  const actual = await vi.importActual<typeof import('@/lib/saved-views')>(
    '@/lib/saved-views',
  )
  return {
    ...actual,
    setViewUserState: mocks.setViewUserState,
  }
})

vi.mock('sonner', () => ({
  toast: {
    error: mocks.toastError,
    success: vi.fn(),
  },
}))

import { PinButton } from './PinButton'
import type { SavedViewWithState } from '@/lib/saved-views'

const OP_ID = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'
const VIEW_ID = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'

function makeView(overrides: Partial<SavedViewWithState> = {}): SavedViewWithState {
  return {
    id: VIEW_ID,
    operator_id: OP_ID,
    creator_user_id: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
    entity_type: 'booking',
    visibility: 'personal',
    name: 'A view',
    config: {},
    sort_order: 0,
    created_at: '2026-05-21T10:00:00Z',
    updated_at: '2026-05-21T10:00:00Z',
    user_state: { pinned: false, hidden: false, sort_order: 0 },
    ...overrides,
  }
}

function renderWithClient(
  initial: SavedViewWithState[],
  pinned: boolean,
): { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['saved-views', OP_ID], initial)
  render(
    <QueryClientProvider client={client}>
      <PinButton viewId={VIEW_ID} pinned={pinned} operatorId={OP_ID} />
    </QueryClientProvider>,
  )
  return { client }
}

beforeEach(() => {
  mocks.setViewUserState.mockReset()
  mocks.toastError.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('PinButton (landr-45pb)', () => {
  it('renders the unpinned aria-label by default', () => {
    renderWithClient([makeView()], false)
    expect(
      screen.getByRole('button', { name: /pin this view/i }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders the pinned aria-label when pinned', () => {
    renderWithClient(
      [makeView({ user_state: { pinned: true, hidden: false, sort_order: 0 } })],
      true,
    )
    expect(
      screen.getByRole('button', { name: /unpin this view/i }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking calls setViewUserState with the toggled value', async () => {
    mocks.setViewUserState.mockResolvedValueOnce(undefined)
    renderWithClient([makeView()], false)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /pin this view/i }))

    await waitFor(() => {
      expect(mocks.setViewUserState).toHaveBeenCalledWith(OP_ID, VIEW_ID, {
        pinned: true,
      })
    })
  })

  it('optimistically updates the cached list while the request is in flight', async () => {
    // Slow request so the optimistic patch is observable.
    let resolve: () => void = () => {}
    mocks.setViewUserState.mockImplementationOnce(
      () => new Promise<void>((r) => { resolve = r }),
    )
    const { client } = renderWithClient([makeView()], false)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /pin this view/i }))

    await waitFor(() => {
      const cached = client.getQueryData<SavedViewWithState[]>([
        'saved-views',
        OP_ID,
      ])
      expect(cached?.[0].user_state.pinned).toBe(true)
    })

    resolve()
  })

  it('reverts the optimistic patch + toasts on error', async () => {
    mocks.setViewUserState.mockRejectedValueOnce(new Error('boom'))
    const { client } = renderWithClient([makeView()], false)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /pin this view/i }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalled()
    })
    const cached = client.getQueryData<SavedViewWithState[]>([
      'saved-views',
      OP_ID,
    ])
    expect(cached?.[0].user_state.pinned).toBe(false)
  })
})
