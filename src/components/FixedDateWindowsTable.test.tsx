import { render as rtlRender, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { describe, expect, it, vi, beforeEach } from 'vitest'
import type { ReactElement } from 'react'
import type { FixedDateWindow } from '@/lib/fixedDateWindows'

const { mocks } = vi.hoisted(() => {
  return {
    mocks: {
      fetchFixedDateWindows: vi.fn<
        (opId: string, prodId: string) => Promise<FixedDateWindow[]>
      >(),
      createFixedDateWindow: vi.fn<
        (
          opId: string,
          prodId: string,
          payload: { start_date: string; end_date: string; capacity: number },
        ) => Promise<FixedDateWindow>
      >(),
      patchFixedDateWindow: vi.fn<
        (
          opId: string,
          prodId: string,
          windowId: string,
          payload: Partial<{
            start_date: string
            end_date: string
            capacity: number
            active: boolean
          }>,
        ) => Promise<FixedDateWindow>
      >(),
      deleteFixedDateWindow: vi.fn<
        (opId: string, prodId: string, windowId: string) => Promise<void>
      >(),
    },
  }
})

vi.mock('@/lib/fixedDateWindows', () => ({
  fetchFixedDateWindows: mocks.fetchFixedDateWindows,
  createFixedDateWindow: mocks.createFixedDateWindow,
  patchFixedDateWindow: mocks.patchFixedDateWindow,
  deleteFixedDateWindow: mocks.deleteFixedDateWindow,
}))

import { FixedDateWindowsTable } from './FixedDateWindowsTable'

function renderWithClient(ui: ReactElement) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return rtlRender(<QueryClientProvider client={client}>{ui}</QueryClientProvider>)
}

function makeWindow(overrides: Partial<FixedDateWindow> = {}): FixedDateWindow {
  return {
    id: 'w-1',
    operator_id: 'op-1',
    product_id: 'p-1',
    start_date: '2026-07-07',
    end_date: '2026-07-13',
    capacity: 8,
    capacity_reserved: 0,
    active: true,
    created_at: '2026-05-19T12:00:00Z',
    updated_at: '2026-05-19T12:00:00Z',
    ...overrides,
  }
}

describe('FixedDateWindowsTable', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('shows empty state when no windows exist', async () => {
    mocks.fetchFixedDateWindows.mockResolvedValue([])
    renderWithClient(<FixedDateWindowsTable operatorId="op-1" productId="p-1" />)

    await waitFor(() =>
      expect(
        screen.getByText(/No windows yet/i),
      ).toBeInTheDocument(),
    )
  })

  it('lists windows from the API', async () => {
    mocks.fetchFixedDateWindows.mockResolvedValue([
      makeWindow({ start_date: '2026-07-07', end_date: '2026-07-13', capacity: 8 }),
      makeWindow({
        id: 'w-2',
        start_date: '2026-08-04',
        end_date: '2026-08-10',
        capacity: 6,
        capacity_reserved: 2,
      }),
    ])
    renderWithClient(<FixedDateWindowsTable operatorId="op-1" productId="p-1" />)

    await waitFor(() => {
      expect(screen.getByText('2026-07-07')).toBeInTheDocument()
      expect(screen.getByText('2026-08-04')).toBeInTheDocument()
    })
  })

  it('creates a new window via the form', async () => {
    mocks.fetchFixedDateWindows.mockResolvedValue([])
    mocks.createFixedDateWindow.mockResolvedValue(
      makeWindow({ start_date: '2026-09-01', end_date: '2026-09-07', capacity: 10 }),
    )
    renderWithClient(<FixedDateWindowsTable operatorId="op-1" productId="p-1" />)

    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add window' })).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add window' }))

    const start = screen.getByLabelText('Start date') as HTMLInputElement
    const end = screen.getByLabelText('End date') as HTMLInputElement
    const cap = screen.getByLabelText('Capacity') as HTMLInputElement
    // userEvent.clear + type for date inputs requires explicit reset
    await userEvent.clear(start)
    await userEvent.type(start, '2026-09-01')
    await userEvent.clear(end)
    await userEvent.type(end, '2026-09-07')
    await userEvent.clear(cap)
    await userEvent.type(cap, '10')

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() =>
      expect(mocks.createFixedDateWindow).toHaveBeenCalledWith('op-1', 'p-1', {
        start_date: '2026-09-01',
        end_date: '2026-09-07',
        capacity: 10,
      }),
    )
  })

  it('blocks submission when end < start', async () => {
    mocks.fetchFixedDateWindows.mockResolvedValue([])
    renderWithClient(<FixedDateWindowsTable operatorId="op-1" productId="p-1" />)
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Add window' })).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Add window' }))

    const start = screen.getByLabelText('Start date') as HTMLInputElement
    const end = screen.getByLabelText('End date') as HTMLInputElement
    await userEvent.clear(start)
    await userEvent.type(start, '2026-09-10')
    await userEvent.clear(end)
    await userEvent.type(end, '2026-09-01')

    await userEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(mocks.createFixedDateWindow).not.toHaveBeenCalled()
    expect(
      await screen.findByText(/End date must be on or after start date/i),
    ).toBeInTheDocument()
  })

  it('shows the load error when the API fails', async () => {
    mocks.fetchFixedDateWindows.mockRejectedValue(new Error('boom'))
    renderWithClient(<FixedDateWindowsTable operatorId="op-1" productId="p-1" />)

    await waitFor(() =>
      expect(
        screen.getByText(/Failed to load course windows/i),
      ).toBeInTheDocument(),
    )
  })

  it('deletes a window after confirm', async () => {
    mocks.fetchFixedDateWindows.mockResolvedValue([makeWindow()])
    mocks.deleteFixedDateWindow.mockResolvedValue()
    const confirmSpy = vi.spyOn(globalThis, 'confirm').mockReturnValue(true)
    renderWithClient(<FixedDateWindowsTable operatorId="op-1" productId="p-1" />)

    await waitFor(() => expect(screen.getByText('2026-07-07')).toBeInTheDocument())

    const row = screen.getByText('2026-07-07').closest('tr')!
    const deleteButton = within(row).getByRole('button', { name: 'Delete' })
    await userEvent.click(deleteButton)

    await waitFor(() =>
      expect(mocks.deleteFixedDateWindow).toHaveBeenCalledWith('op-1', 'p-1', 'w-1'),
    )
    confirmSpy.mockRestore()
  })
})
