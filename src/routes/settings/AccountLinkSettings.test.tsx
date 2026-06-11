// landr-atwy — AccountLinkSettings page tests.
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
  offer_account_link: false,
})

vi.mock('@/lib/operatorSettings', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/operatorSettings')>()
  return {
    ...actual,
    fetchOperator: vi.fn().mockResolvedValue({
      id: 'op-1',
      name: 'Test Op',
      slug: 'test-op',
      offer_account_link: false,
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

import { AccountLinkSettings } from './AccountLinkSettings'

function renderWithQuery(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>)
}

describe('AccountLinkSettings', () => {
  it('renders the enable toggle', async () => {
    renderWithQuery(<AccountLinkSettings />)
    await waitFor(() => {
      expect(screen.getByTestId('account-link-enabled')).toBeDefined()
    })
  })

  it('toggle reflects the current operator value (false = unchecked)', async () => {
    renderWithQuery(<AccountLinkSettings />)
    await waitFor(() => screen.getByTestId('account-link-enabled'))
    const toggle = screen.getByTestId('account-link-enabled')
    expect(toggle).toHaveProperty('checked', false)
  })

  it('save button is disabled when no changes made', async () => {
    renderWithQuery(<AccountLinkSettings />)
    await waitFor(() => screen.getByTestId('account-link-save'))
    const saveBtn = screen.getByTestId('account-link-save')
    expect(saveBtn).toHaveProperty('disabled', true)
  })

  it('save button becomes enabled after toggling', async () => {
    renderWithQuery(<AccountLinkSettings />)
    await waitFor(() => screen.getByTestId('account-link-enabled'))
    fireEvent.click(screen.getByTestId('account-link-enabled'))
    await waitFor(() => {
      expect(screen.getByTestId('account-link-save')).toHaveProperty(
        'disabled',
        false,
      )
    })
  })

  it('clicking Save calls patchOperator with offer_account_link: true', async () => {
    mockPatchOperator.mockClear()
    renderWithQuery(<AccountLinkSettings />)
    await waitFor(() => screen.getByTestId('account-link-enabled'))
    fireEvent.click(screen.getByTestId('account-link-enabled'))
    await waitFor(() =>
      expect(screen.getByTestId('account-link-save')).toHaveProperty(
        'disabled',
        false,
      ),
    )
    fireEvent.click(screen.getByTestId('account-link-save'))
    await waitFor(() => {
      expect(mockPatchOperator).toHaveBeenCalledWith(
        'op-1',
        expect.objectContaining({ offer_account_link: true }),
      )
    })
  })
})
