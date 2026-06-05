// landr-3qkr.7 — FAB / BulkActionToolbar coexistence smoke tests.
//
// On a 360px phone both elements are fixed at the bottom of the viewport.
// The fix: BulkActionToolbar signals its active state to BulkToolbarContext;
// QuickCaptureFab reads the context and adds `hidden sm:flex` below sm/md.
//
// These tests assert:
//   1. When no bulk selection is active, the FAB is present.
//   2. When a bulk selection becomes active (toolbar rendered with count > 0),
//      the FAB gains the `hidden` class (sm:flex handles the breakpoint
//      media query — jsdom doesn't evaluate CSS, so we assert the class).
//   3. When the selection is cleared (toolbar count drops to 0), the FAB
//      no longer carries the hidden class.

import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    currentOperatorId: 'op-1',
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
  }),
}))

// Products query mock so the FAB doesn't attempt a network call.
vi.mock('@/lib/products', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/products')>()
  return { ...actual, fetchProducts: vi.fn().mockResolvedValue([]) }
})

// Tags mock for BulkActionToolbar tag action.
vi.mock('@/lib/tags', async (importActual) => {
  const actual = await importActual<typeof import('@/lib/tags')>()
  return { ...actual, fetchTags: vi.fn().mockResolvedValue([]) }
})

import { BulkToolbarProvider } from '@/lib/bulk-toolbar-context'
import { QuickCaptureFab } from './QuickCaptureFab'
import { BulkActionToolbar } from './BulkActionToolbar'

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } })
  return (
    <QueryClientProvider client={qc}>
      <BulkToolbarProvider>{children}</BulkToolbarProvider>
    </QueryClientProvider>
  )
}

describe('QuickCaptureFab + BulkActionToolbar coexistence (landr-3qkr.7)', () => {
  it('FAB is visible when no bulk selection is active', () => {
    render(
      <>
        <QuickCaptureFab />
        <BulkActionToolbar
          selectedIds={[]}
          onClear={() => {}}
          actions={['exportCsv']}
        />
      </>,
      { wrapper },
    )

    const fab = screen.getByTestId('quick-capture-fab')
    expect(fab).toBeInTheDocument()
    // No hidden class when toolbar is inactive.
    expect(fab.className).not.toContain('hidden')
  })

  it('FAB gains hidden class below sm when a bulk selection is active', () => {
    render(
      <>
        <QuickCaptureFab />
        <BulkActionToolbar
          selectedIds={['id-1', 'id-2']}
          onClear={() => {}}
          actions={['exportCsv']}
        />
      </>,
      { wrapper },
    )

    const fab = screen.getByTestId('quick-capture-fab')
    // The bulk toolbar is active → FAB should be hidden on small viewports.
    // jsdom doesn't resolve CSS media queries, so we assert the Tailwind
    // classes that produce the hide: "hidden sm:flex" (hidden by default,
    // flex ≥sm). Both classes must be present.
    expect(fab.className).toContain('hidden')
    expect(fab.className).toContain('sm:flex')
  })

  it('FAB loses hidden class when the bulk selection is cleared', () => {
    const { rerender } = render(
      <>
        <QuickCaptureFab />
        <BulkActionToolbar
          selectedIds={['id-1']}
          onClear={() => {}}
          actions={['exportCsv']}
        />
      </>,
      { wrapper },
    )

    // Toolbar active — FAB is hidden on small screens.
    expect(screen.getByTestId('quick-capture-fab').className).toContain(
      'hidden',
    )

    // Clear the selection: toolbar renders null (count = 0), context resets.
    rerender(
      <>
        <QuickCaptureFab />
        <BulkActionToolbar
          selectedIds={[]}
          onClear={() => {}}
          actions={['exportCsv']}
        />
      </>,
    )

    const fab = screen.getByTestId('quick-capture-fab')
    expect(fab.className).not.toContain('hidden')
  })
})
