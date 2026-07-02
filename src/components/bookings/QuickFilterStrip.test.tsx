// landr-68a9 — verifies the quick-filter pill strip renders each preset,
// applies its target filter state on click, and visually marks the pill
// that matches the live filter state as active.

import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const authState = { userId: 'user-1' as string | null }

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: authState.userId ? { id: authState.userId } : null,
    session: null,
    loading: false,
    signOut: async () => {},
  }),
}))

import { renderHook, act } from '@testing-library/react'
import { useBookingsFilters } from '@/lib/bookings-filters'
import { QuickFilterStrip } from './QuickFilterStrip'

beforeEach(() => {
  window.localStorage.clear()
  authState.userId = 'user-1'
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('QuickFilterStrip (landr-68a9)', () => {
  it('renders the five preset pills', () => {
    const { result } = renderHook(() => useBookingsFilters())
    render(<QuickFilterStrip filtersApi={result.current} />)
    expect(
      screen.getByTestId('bookings-quick-filters-all'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('bookings-quick-filters-today'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('bookings-quick-filters-this_week'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('bookings-quick-filters-pending_payment'),
    ).toBeInTheDocument()
    expect(
      screen.getByTestId('bookings-quick-filters-upcoming'),
    ).toBeInTheDocument()
  })

  it('marks "All" active when no filters are set', () => {
    const { result } = renderHook(() => useBookingsFilters())
    render(<QuickFilterStrip filtersApi={result.current} />)
    expect(screen.getByTestId('bookings-quick-filters-all')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    expect(screen.getByTestId('bookings-quick-filters-today')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('clicking "Today" sets serviceDateRange and marks it active', async () => {
    const user = userEvent.setup()
    const { result, rerender } = renderHook(() => useBookingsFilters())
    const { rerender: rerenderUi } = render(
      <QuickFilterStrip filtersApi={result.current} />,
    )

    await user.click(screen.getByTestId('bookings-quick-filters-today'))
    rerender()
    rerenderUi(<QuickFilterStrip filtersApi={result.current} />)

    expect(result.current.filters.serviceDateRange).toBe('today')
    expect(screen.getByTestId('bookings-quick-filters-today')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
    // "All" deactivates once a real preset is in effect.
    expect(screen.getByTestId('bookings-quick-filters-all')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })

  it('clicking "Pending payment" sets the lifecycle filter', async () => {
    const user = userEvent.setup()
    const { result, rerender } = renderHook(() => useBookingsFilters())
    const { rerender: rerenderUi } = render(
      <QuickFilterStrip filtersApi={result.current} />,
    )

    await user.click(
      screen.getByTestId('bookings-quick-filters-pending_payment'),
    )
    rerender()
    rerenderUi(<QuickFilterStrip filtersApi={result.current} />)

    expect(result.current.filters.lifecycleStates).toEqual([
      'awaiting_payment',
    ])
    expect(
      screen.getByTestId('bookings-quick-filters-pending_payment'),
    ).toHaveAttribute('aria-pressed', 'true')
  })

  it('clicking "All" clears every dimension', async () => {
    const user = userEvent.setup()
    const { result, rerender } = renderHook(() => useBookingsFilters())
    // Seed some state first.
    act(() => result.current.toggle('productKinds', 'service'))
    act(() => result.current.setShowPast(true))
    rerender()

    const { rerender: rerenderUi } = render(
      <QuickFilterStrip filtersApi={result.current} />,
    )
    await user.click(screen.getByTestId('bookings-quick-filters-all'))
    rerender()
    rerenderUi(<QuickFilterStrip filtersApi={result.current} />)

    expect(result.current.filters.productKinds).toEqual([])
    expect(result.current.filters.showPast).toBe(false)
    expect(result.current.filters.serviceDateRange).toBeNull()
    expect(screen.getByTestId('bookings-quick-filters-all')).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('hides "Pending payment" when the operator has no awaiting_payment stage', () => {
    const { result } = renderHook(() => useBookingsFilters())
    render(
      <QuickFilterStrip
        filtersApi={result.current}
        stages={[{ code: 'submitted' }, { code: 'finalised' }]}
      />,
    )
    expect(
      screen.queryByTestId('bookings-quick-filters-pending_payment'),
    ).not.toBeInTheDocument()
    // Unrelated presets are unaffected.
    expect(
      screen.getByTestId('bookings-quick-filters-today'),
    ).toBeInTheDocument()
  })

  it('shows "Pending payment" when the operator has the awaiting_payment stage', () => {
    const { result } = renderHook(() => useBookingsFilters())
    render(
      <QuickFilterStrip
        filtersApi={result.current}
        stages={[{ code: 'submitted' }, { code: 'awaiting_payment' }]}
      />,
    )
    expect(
      screen.getByTestId('bookings-quick-filters-pending_payment'),
    ).toBeInTheDocument()
  })

  it('no pill is active when filters do not match any preset', async () => {
    const { result, rerender } = renderHook(() => useBookingsFilters())
    // A combination no preset targets (productKinds + serviceDateRange).
    act(() => result.current.toggle('productKinds', 'service'))
    rerender()

    render(<QuickFilterStrip filtersApi={result.current} />)
    expect(screen.getByTestId('bookings-quick-filters-all')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
    expect(screen.getByTestId('bookings-quick-filters-today')).toHaveAttribute(
      'aria-pressed',
      'false',
    )
  })
})
