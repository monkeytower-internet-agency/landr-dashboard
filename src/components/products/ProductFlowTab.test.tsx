/**
 * ProductFlowTab tests (landr-7hac).
 *
 * landr-71kz.7 shipped this tab + its product-flow.ts helpers with NO tests
 * despite a critical DB-contract bug class (operator_id/product_id missing
 * from a write). These tests exercise the REAL product-flow.ts helpers
 * against a mocked supabase client (matching the ProductGroupManager /
 * product-addons.test.ts convention), so the add/reorder/delete mutation
 * payloads are asserted end-to-end through the component, not just at the
 * lib layer.
 *
 * Covers:
 *  - empty state when no modules are configured
 *  - "Add step" inserts a module with operator_id + product_id in the payload
 *  - deleting a module calls the delete helper with the right id
 *  - reordering (via the DndContext onDragEnd handler, captured through a
 *    partial @dnd-kit/core mock — jsdom cannot drive the real pointer
 *    pipeline) upserts every row with operator_id + product_id + new position
 */
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { DragEndEvent } from '@dnd-kit/core'

// ── Module mocks ──────────────────────────────────────────────────────────

type FlowModuleRow = {
  id: string
  operator_id: string
  product_id: string
  module_kind: string
  form_id: string | null
  position: number
}

const { mockSupabase } = vi.hoisted(() => {
  const state = {
    modules: [] as FlowModuleRow[],
    forms: [] as { id: string; name: string; key: string }[],
    insertCalls: [] as Record<string, unknown>[],
    upsertCalls: [] as Record<string, unknown>[][],
    deleteCalls: [] as string[],
  }
  return { mockSupabase: { state } }
})

vi.mock('@/lib/supabase', () => ({
  supabase: {
    from: vi.fn((table: string) => {
      if (table === 'product_flow_modules') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              order: vi.fn(async () => ({
                data: mockSupabase.state.modules,
                error: null,
              })),
            })),
          })),
          insert: vi.fn((payload: Record<string, unknown>) => {
            mockSupabase.state.insertCalls.push(payload)
            return {
              select: vi.fn(() => ({
                single: vi.fn(async () => {
                  const row = {
                    id: `mod-${mockSupabase.state.modules.length + 1}`,
                    ...payload,
                  } as FlowModuleRow
                  mockSupabase.state.modules = [...mockSupabase.state.modules, row]
                  return { data: row, error: null }
                }),
              })),
            }
          }),
          upsert: vi.fn(async (rows: Record<string, unknown>[]) => {
            mockSupabase.state.upsertCalls.push(rows)
            return { error: null }
          }),
          delete: vi.fn(() => ({
            eq: vi.fn(async (_col: string, id: string) => {
              mockSupabase.state.deleteCalls.push(id)
              mockSupabase.state.modules = mockSupabase.state.modules.filter(
                (m) => m.id !== id,
              )
              return { error: null }
            }),
          })),
        }
      }
      if (table === 'forms') {
        return {
          select: vi.fn(() => ({
            eq: vi.fn(() => ({
              eq: vi.fn(() => ({
                order: vi.fn(async () => ({
                  data: mockSupabase.state.forms,
                  error: null,
                })),
              })),
            })),
          })),
        }
      }
      throw new Error(`ProductFlowTab.test: unexpected table "${table}"`)
    }),
  },
  getSupabase: () => ({}),
}))

// jsdom can't drive @dnd-kit's real pointer/keyboard sensor pipeline (no
// layout, zero-size getBoundingClientRect). We keep the real DndContext
// machinery for props like sensors/collisionDetection but capture the
// onDragEnd handler so the reorder test can invoke it directly with a
// synthetic event — exercising the REAL handleDragEnd wired into the
// component, not a re-implementation of it.
const dragEndHandlers: Array<(event: DragEndEvent) => void> = []
vi.mock('@dnd-kit/core', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@dnd-kit/core')>()
  return {
    ...actual,
    DndContext: ({
      children,
      onDragEnd,
    }: {
      children: ReactNode
      onDragEnd: (event: DragEndEvent) => void
    }) => {
      dragEndHandlers.push(onDragEnd)
      return children
    },
  }
})

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}))

import { ProductFlowTab } from './ProductFlowTab'

function renderTab() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <ProductFlowTab productId="prod-1" operatorId="op-1" />
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  mockSupabase.state.modules = []
  mockSupabase.state.forms = []
  mockSupabase.state.insertCalls = []
  mockSupabase.state.upsertCalls = []
  mockSupabase.state.deleteCalls = []
  dragEndHandlers.length = 0
})

afterEach(() => {
  vi.clearAllMocks()
})

// The "Add step" <select> always renders an option literally named
// "Participants" / "Date & time selection" / etc, regardless of whether the
// modules query has resolved — so asserting on that text alone is a false
// friend (it resolves instantly, before the real module row / DndContext
// ever mounts). Each module row's "Remove … step" button only exists once
// fetchFlowModules has resolved and the row actually rendered, so use that
// as the synchronization point everywhere below.
function findRemoveButton(kindLabel: string) {
  return screen.findByRole('button', {
    name: new RegExp(`remove ${kindLabel} step`, 'i'),
  })
}

describe('<ProductFlowTab>', () => {
  it('shows the default-flow empty state when no modules are configured', async () => {
    renderTab()
    await screen.findByText('Default booking flow')
  })

  it('renders existing modules from fetchFlowModules', async () => {
    mockSupabase.state.modules = [
      {
        id: 'mod-1',
        operator_id: 'op-1',
        product_id: 'prod-1',
        module_kind: 'participants',
        form_id: null,
        position: 1,
      },
    ]
    renderTab()
    await findRemoveButton('Participants')
  })

  // ── Add ──────────────────────────────────────────────────────────────────

  it('adding a step inserts a module with operator_id + product_id in the payload', async () => {
    const user = userEvent.setup()
    renderTab()
    await screen.findByText('Default booking flow')

    await user.click(screen.getByRole('button', { name: /^add$/i }))

    await waitFor(() => expect(mockSupabase.state.insertCalls).toHaveLength(1))
    // The DB-contract assertion this ticket exists for: omitting either field
    // fails the NOT NULL / RLS WITH CHECK on product_flow_modules.
    expect(mockSupabase.state.insertCalls[0]).toMatchObject({
      operator_id: 'op-1',
      product_id: 'prod-1',
    })
    await findRemoveButton('Participants') // default addKind, now a real row
  })

  // ── Delete ───────────────────────────────────────────────────────────────

  it('deleting a module calls deleteFlowModule with its id and removes it from the list', async () => {
    mockSupabase.state.modules = [
      {
        id: 'mod-1',
        operator_id: 'op-1',
        product_id: 'prod-1',
        module_kind: 'participants',
        form_id: null,
        position: 1,
      },
    ]
    const user = userEvent.setup()
    renderTab()

    await user.click(await findRemoveButton('Participants'))

    await waitFor(() => expect(mockSupabase.state.deleteCalls).toEqual(['mod-1']))
    await waitFor(() =>
      expect(screen.queryByRole('button', { name: /remove participants step/i })).toBeNull(),
    )
  })

  // ── Reorder ──────────────────────────────────────────────────────────────

  it('reordering upserts every row with operator_id + product_id + the new positions', async () => {
    mockSupabase.state.modules = [
      {
        id: 'mod-1',
        operator_id: 'op-1',
        product_id: 'prod-1',
        module_kind: 'selection',
        form_id: null,
        position: 1,
      },
      {
        id: 'mod-2',
        operator_id: 'op-1',
        product_id: 'prod-1',
        module_kind: 'participants',
        form_id: null,
        position: 2,
      },
    ]
    renderTab()
    await findRemoveButton('Participants')

    expect(dragEndHandlers).toHaveLength(1)
    // Drag mod-1 to where mod-2 was — swaps the pair.
    dragEndHandlers[0]({
      active: { id: 'mod-1' },
      over: { id: 'mod-2' },
    } as unknown as DragEndEvent)

    await waitFor(() => expect(mockSupabase.state.upsertCalls).toHaveLength(1))
    const rows = mockSupabase.state.upsertCalls[0]
    expect(rows).toHaveLength(2)
    for (const row of rows) {
      // Same DB-contract bug class as insert: PostgREST upsert is
      // INSERT ... ON CONFLICT, so every row's VALUES need operator_id.
      expect(row).toMatchObject({ operator_id: 'op-1', product_id: 'prod-1' })
    }
    // mod-2 (was position 2) now comes first, mod-1 (was position 1) second.
    expect(rows.map((r) => r.id)).toEqual(['mod-2', 'mod-1'])
    expect(rows.map((r) => r.position)).toEqual([1, 2])
  })

  it('a no-op drag (dropped on itself) does not call upsert', async () => {
    mockSupabase.state.modules = [
      {
        id: 'mod-1',
        operator_id: 'op-1',
        product_id: 'prod-1',
        module_kind: 'selection',
        form_id: null,
        position: 1,
      },
    ]
    renderTab()
    await findRemoveButton('Date & time selection')

    expect(dragEndHandlers).toHaveLength(1)
    dragEndHandlers[0]({
      active: { id: 'mod-1' },
      over: { id: 'mod-1' },
    } as unknown as DragEndEvent)

    // Give the (non-existent) mutation a tick to fire were it going to.
    await Promise.resolve()
    expect(mockSupabase.state.upsertCalls).toHaveLength(0)
  })
})
