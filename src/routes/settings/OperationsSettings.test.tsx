// landr-r87i — Settings → Operations smoke + interaction coverage.
//
// Verifies the checklist template editor renders the operator's items,
// supports add/remove/reorder/rename, and submits a wholesale PUT on Save.

import {
  render as rtlRender,
  screen,
  waitFor,
} from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ReactElement, ReactNode } from 'react'

import type { ChecklistTemplate } from '@/lib/checklistTemplate'

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

const { fetchTemplateMock, putTemplateMock } = vi.hoisted(() => ({
  fetchTemplateMock: vi.fn(),
  putTemplateMock: vi.fn(),
}))

vi.mock('@/lib/checklistTemplate', async (importOriginal) => {
  const actual =
    await importOriginal<typeof import('@/lib/checklistTemplate')>()
  return {
    ...actual,
    fetchChecklistTemplate: (...args: unknown[]) =>
      fetchTemplateMock(...args),
    putChecklistTemplate: (...args: unknown[]) => putTemplateMock(...args),
  }
})

import { OperationsSettings } from './OperationsSettings'

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

function makeTemplate(): ChecklistTemplate {
  return {
    items: [
      { key: 'default-called-customer', label: 'Called customer', order: 0 },
      { key: 'default-payment-received', label: 'Payment received', order: 1 },
      { key: 'default-equipment-ready', label: 'Equipment ready', order: 2 },
    ],
  }
}

beforeEach(() => {
  fetchTemplateMock.mockReset()
  putTemplateMock.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('OperationsSettings (landr-r87i)', () => {
  it('renders the operator template rows', async () => {
    fetchTemplateMock.mockResolvedValue(makeTemplate())
    render(<OperationsSettings />)
    await waitFor(() => {
      expect(screen.getByDisplayValue('Called customer')).toBeInTheDocument()
    })
    expect(screen.getByDisplayValue('Payment received')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Equipment ready')).toBeInTheDocument()
  })

  it('disables Save until the draft differs from the server', async () => {
    fetchTemplateMock.mockResolvedValue(makeTemplate())
    render(<OperationsSettings />)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue('Called customer'),
      ).toBeInTheDocument()
    })
    const save = screen.getByTestId('operations-checklist-save')
    expect(save).toBeDisabled()
  })

  it('submits the wholesale list (with re-stamped order) on Save', async () => {
    fetchTemplateMock.mockResolvedValue(makeTemplate())
    putTemplateMock.mockResolvedValue(makeTemplate())
    const user = userEvent.setup()
    render(<OperationsSettings />)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue('Called customer'),
      ).toBeInTheDocument()
    })

    // Rename the first row and add a new one.
    const firstInput = screen.getByTestId('operations-checklist-input-0')
    await user.clear(firstInput)
    await user.type(firstInput, 'Greeted on arrival')

    await user.click(screen.getByTestId('operations-checklist-add'))
    const lastIdx = 3 // 3 original + 1 added → row idx 3
    const newInput = screen.getByTestId(
      `operations-checklist-input-${lastIdx}`,
    )
    await user.type(newInput, 'Sign waiver')

    await user.click(screen.getByTestId('operations-checklist-save'))

    await waitFor(() => {
      expect(putTemplateMock).toHaveBeenCalledTimes(1)
    })
    const [opId, items] = putTemplateMock.mock.calls[0]
    expect(opId).toBe('op-1')
    expect(items).toEqual([
      expect.objectContaining({ label: 'Greeted on arrival', order: 0 }),
      expect.objectContaining({ label: 'Payment received', order: 1 }),
      expect.objectContaining({ label: 'Equipment ready', order: 2 }),
      expect.objectContaining({ label: 'Sign waiver', order: 3 }),
    ])
  })

  it('moves an item up and reorders on save', async () => {
    fetchTemplateMock.mockResolvedValue(makeTemplate())
    putTemplateMock.mockResolvedValue(makeTemplate())
    const user = userEvent.setup()
    render(<OperationsSettings />)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue('Called customer'),
      ).toBeInTheDocument()
    })

    // Move the second row (Payment received) up to position 0.
    await user.click(screen.getByTestId('operations-checklist-up-1'))
    await user.click(screen.getByTestId('operations-checklist-save'))

    await waitFor(() => {
      expect(putTemplateMock).toHaveBeenCalledTimes(1)
    })
    const items = putTemplateMock.mock.calls[0][1]
    expect(items[0].label).toBe('Payment received')
    expect(items[1].label).toBe('Called customer')
    expect(items[2].label).toBe('Equipment ready')
  })

  it('removes an item and posts the shortened list', async () => {
    fetchTemplateMock.mockResolvedValue(makeTemplate())
    putTemplateMock.mockResolvedValue(makeTemplate())
    const user = userEvent.setup()
    render(<OperationsSettings />)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue('Called customer'),
      ).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('operations-checklist-remove-2'))
    await user.click(screen.getByTestId('operations-checklist-save'))

    await waitFor(() => {
      expect(putTemplateMock).toHaveBeenCalledTimes(1)
    })
    const items = putTemplateMock.mock.calls[0][1]
    expect(items).toHaveLength(2)
    expect(items.map((i: { label: string }) => i.label)).toEqual([
      'Called customer',
      'Payment received',
    ])
  })

  it('blocks save when an item label is blank', async () => {
    fetchTemplateMock.mockResolvedValue(makeTemplate())
    const user = userEvent.setup()
    render(<OperationsSettings />)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue('Called customer'),
      ).toBeInTheDocument()
    })

    const firstInput = screen.getByTestId('operations-checklist-input-0')
    await user.clear(firstInput)

    expect(screen.getByTestId('operations-checklist-save')).toBeDisabled()
    expect(
      screen.getByText(/labels cannot be blank/i),
    ).toBeInTheDocument()
  })

  it('blocks save when two labels collide', async () => {
    fetchTemplateMock.mockResolvedValue(makeTemplate())
    const user = userEvent.setup()
    render(<OperationsSettings />)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue('Called customer'),
      ).toBeInTheDocument()
    })

    const secondInput = screen.getByTestId('operations-checklist-input-1')
    await user.clear(secondInput)
    await user.type(secondInput, 'Called customer')

    expect(screen.getByTestId('operations-checklist-save')).toBeDisabled()
    expect(screen.getByText(/unique label/i)).toBeInTheDocument()
  })

  it('reverts the draft back to server state on Discard', async () => {
    fetchTemplateMock.mockResolvedValue(makeTemplate())
    const user = userEvent.setup()
    render(<OperationsSettings />)
    await waitFor(() => {
      expect(
        screen.getByDisplayValue('Called customer'),
      ).toBeInTheDocument()
    })

    const firstInput = screen.getByTestId('operations-checklist-input-0')
    await user.clear(firstInput)
    await user.type(firstInput, 'XXX')

    await user.click(screen.getByTestId('operations-checklist-revert'))
    expect(screen.getByDisplayValue('Called customer')).toBeInTheDocument()
  })
})
