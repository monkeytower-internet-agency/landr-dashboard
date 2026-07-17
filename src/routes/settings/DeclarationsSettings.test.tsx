// landr-c53m.14 — DeclarationsSettings page tests.
//
// Covers:
//   1. Toggle renders and reflects the current operator value (false by default).
//   2. Save button is disabled when no change has been made.
//   3. Toggling the checkbox enables the Save button.
//   4. Clicking Save calls patchOperator with the correct payload.

import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'

const mockPatchOperator = vi.fn().mockResolvedValue({
  id: 'op-1',
  name: 'Test Op',
  slug: 'test-op',
  require_declarations: false,
})

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: vi.fn().mockResolvedValue({
      id: 'op-1',
      name: 'Test Op',
      slug: 'test-op',
      require_declarations: false,
    }),
    patchOperator: (...args: unknown[]) => mockPatchOperator(...args),
  }
})

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({ currentOperatorId: 'op-1' }),
}))

vi.mock('@/lib/page-title', () => ({
  PageTitle: () => null,
}))

import { DeclarationsSettings } from './DeclarationsSettings'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('DeclarationsSettings', () => {
  it('renders the enable toggle', async () => {
    renderWithQuery(<DeclarationsSettings />)
    await waitFor(() => {
      expect(screen.getByTestId('declarations-enabled')).toBeDefined()
    })
  })

  it('toggle reflects the current operator value (false = unchecked)', async () => {
    renderWithQuery(<DeclarationsSettings />)
    await waitFor(() => screen.getByTestId('declarations-enabled'))
    const toggle = screen.getByTestId('declarations-enabled')
    expect(toggle).toHaveProperty('checked', false)
  })

  it('save button is disabled when no changes made', async () => {
    renderWithQuery(<DeclarationsSettings />)
    await waitFor(() => screen.getByTestId('declarations-save'))
    const saveBtn = screen.getByTestId('declarations-save')
    expect(saveBtn).toHaveProperty('disabled', true)
  })

  it('save button becomes enabled after toggling', async () => {
    renderWithQuery(<DeclarationsSettings />)
    await waitFor(() => screen.getByTestId('declarations-enabled'))
    fireEvent.click(screen.getByTestId('declarations-enabled'))
    await waitFor(() => {
      expect(screen.getByTestId('declarations-save')).toHaveProperty(
        'disabled',
        false,
      )
    })
  })

  it('clicking Save calls patchOperator with require_declarations: true', async () => {
    mockPatchOperator.mockClear()
    renderWithQuery(<DeclarationsSettings />)
    await waitFor(() => screen.getByTestId('declarations-enabled'))
    fireEvent.click(screen.getByTestId('declarations-enabled'))
    await waitFor(() =>
      expect(screen.getByTestId('declarations-save')).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(screen.getByTestId('declarations-save'))
    await waitFor(() => {
      expect(mockPatchOperator).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({ require_declarations: true }),
      )
    })
  })
})
