// landr-c58d — StarButton tests.
//
// Covers:
//   - renders a button with the correct aria-label + aria-pressed for both states
//   - click toggles starred + calls setViewUserState
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

import { StarButton } from './StarButton'
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
    user_state: { starred: false, hidden: false },
    ...overrides,
  }
}

function renderWithClient(
  initial: SavedViewWithState[],
  starred: boolean,
): { client: QueryClient } {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  })
  client.setQueryData(['saved-views', OP_ID], initial)
  render(
    <QueryClientProvider client={client}>
      <StarButton viewId={VIEW_ID} starred={starred} operatorId={OP_ID} />
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

describe('StarButton (landr-c58d)', () => {
  it('renders the unstarred aria-label by default', () => {
    renderWithClient([makeView()], false)
    expect(
      screen.getByRole('button', { name: /star this view/i }),
    ).toHaveAttribute('aria-pressed', 'false')
  })

  it('renders the starred aria-label when starred', () => {
    renderWithClient([makeView({ user_state: { starred: true, hidden: false } })], true)
    expect(
      screen.getByRole('button', { name: /unstar this view/i }),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking calls setViewUserState with the toggled value', async () => {
    mocks.setViewUserState.mockResolvedValueOnce(undefined)
    renderWithClient([makeView()], false)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /star this view/i }))

    await waitFor(() => {
      expect(mocks.setViewUserState).toHaveBeenCalledWith(OP_ID, VIEW_ID, {
        starred: true,
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

    await user.click(screen.getByRole('button', { name: /star this view/i }))

    await waitFor(() => {
      const cached = client.getQueryData<SavedViewWithState[]>([
        'saved-views',
        OP_ID,
      ])
      expect(cached?.[0].user_state.starred).toBe(true)
    })

    resolve()
  })

  it('reverts the optimistic patch + toasts on error', async () => {
    mocks.setViewUserState.mockRejectedValueOnce(new Error('boom'))
    const { client } = renderWithClient([makeView()], false)
    const user = userEvent.setup()

    await user.click(screen.getByRole('button', { name: /star this view/i }))

    await waitFor(() => {
      expect(mocks.toastError).toHaveBeenCalled()
    })
    const cached = client.getQueryData<SavedViewWithState[]>([
      'saved-views',
      OP_ID,
    ])
    expect(cached?.[0].user_state.starred).toBe(false)
  })
})
