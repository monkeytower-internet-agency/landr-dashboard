/**
 * CategoriesSettings tests (landr-up1b) — nested category tree editor.
 * Covers indented render from parent_id, reparent via the move-under
 * select, the cycle-guard (own subtree disabled as a target), and the
 * per-category copy-shortcode affordance.
 */
import {
  fireEvent,
  render as rtlRender,
  screen,
  waitFor,
  within,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import type { ReactElement, ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

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
      refreshOperators: () => {},
    }),
    OperatorProvider: ({ children }: { children: ReactNode }) => children,
  }
})

type GroupFixture = import('@/lib/productGroups').ProductGroup

const { state, reparentMock } = vi.hoisted(() => ({
  state: { groups: [] as GroupFixture[] },
  reparentMock: vi.fn(),
}))

vi.mock('@/lib/productGroups', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/productGroups')>()
  return {
    ...actual,
    fetchProductGroupTree: vi.fn(async () => state.groups),
    createProductGroup: vi.fn(async () => state.groups[0]),
    updateProductGroup: vi.fn(async () => state.groups[0]),
    deleteProductGroup: vi.fn(async () => {}),
    reparentProductGroup: vi.fn(
      async (_op: string, id: string, parentId: string | null) => {
        reparentMock(id, parentId)
        return { ...state.groups.find((g) => g.id === id)!, parent_id: parentId }
      },
    ),
  }
})

const { toastSuccess, toastError } = vi.hoisted(() => ({
  toastSuccess: vi.fn(),
  toastError: vi.fn(),
}))
vi.mock('sonner', () => ({
  toast: { success: toastSuccess, error: toastError },
}))

import { CategoriesSettings } from './CategoriesSettings'

function g(
  id: string,
  parent_id: string | null,
  name: string,
  sort_order = 0,
): GroupFixture {
  return {
    id,
    operator_id: 'op-1',
    slug: id,
    name,
    name_localized: null,
    description: null,
    description_localized: null,
    parent_id,
    sort_order,
    active: true,
    created_at: '2026-05-22T00:00:00Z',
    updated_at: '2026-05-22T00:00:00Z',
  }
}

const clipboardWriteText = vi.fn(() => Promise.resolve())
Object.defineProperty(navigator, 'clipboard', {
  configurable: true,
  value: { writeText: clipboardWriteText },
})

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

beforeEach(() => {
  state.groups = [
    g('courses', null, 'Courses', 10),
    g('beginner', 'courses', 'Beginner', 10),
    g('kids', 'beginner', 'Kids', 10),
    g('guided', null, 'Guided', 20),
  ]
  reparentMock.mockReset()
  toastSuccess.mockReset()
  toastError.mockReset()
  clipboardWriteText.mockReset()
  clipboardWriteText.mockResolvedValue(undefined)
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('CategoriesSettings (landr-up1b)', () => {
  it('renders the nested tree in depth-first order', async () => {
    render(<CategoriesSettings />)
    await screen.findByTestId('category-row-courses')
    const rows = screen.getAllByTestId(/^category-row-[a-z]+$/)
    expect(rows.map((r) => r.getAttribute('data-testid'))).toEqual([
      'category-row-courses',
      'category-row-beginner',
      'category-row-kids',
      'category-row-guided',
    ])
  })

  it('reparents a category via the move-under select', async () => {
    const user = userEvent.setup()
    render(<CategoriesSettings />)
    const beginnerRow = await screen.findByTestId('category-row-beginner')
    const move = within(beginnerRow).getByTestId('category-row-beginner-move')
    // Move "Beginner" from under Courses to the root.
    await user.selectOptions(move, '')
    await waitFor(() =>
      expect(reparentMock).toHaveBeenCalledWith('beginner', null),
    )
  })

  it('excludes a node and its subtree from its own move-under targets', async () => {
    render(<CategoriesSettings />)
    const coursesRow = await screen.findByTestId('category-row-courses')
    const move = within(coursesRow).getByTestId(
      'category-row-courses-move',
    ) as HTMLSelectElement
    const optionValues = Array.from(move.options).map((o) => o.value)
    // Courses, Beginner, Kids are its own subtree → must not be options.
    expect(optionValues).not.toContain('courses')
    expect(optionValues).not.toContain('beginner')
    expect(optionValues).not.toContain('kids')
    // Guided (a separate root) is a legal target.
    expect(optionValues).toContain('guided')
  })

  it('copies a category shortcode to the clipboard', async () => {
    render(<CategoriesSettings />)
    const beginnerRow = await screen.findByTestId('category-row-beginner')
    // Re-install the spy right before the click: an earlier test in this
    // file may have called userEvent.setup(), which (v14) swaps
    // navigator.clipboard for its own stub. fireEvent dispatches a plain
    // click so our freshly-installed spy is the one that runs.
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWriteText },
    })
    fireEvent.click(
      within(beginnerRow).getByTestId('category-row-beginner-copy'),
    )
    await waitFor(() =>
      expect(clipboardWriteText).toHaveBeenCalledWith(
        '[landr_booking operator="para42" group="beginner"]',
      ),
    )
  })
})
