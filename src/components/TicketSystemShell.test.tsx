// landr-7dya.10 — full-screen ticket-system shell chrome.
import type { ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mock } = vi.hoisted(() => ({
  mock: { enterOperatorMode: vi.fn() },
}))

vi.mock('@/lib/app-mode-context', () => ({
  useAppMode: () => ({
    mode: 'tickets',
    capabilities: {
      can_use_ticket_system: true,
      can_view_as_operator: true,
    },
    capabilitiesLoading: false,
    showSwitcher: true,
    enterOperatorMode: mock.enterOperatorMode,
    enterTicketSystem: vi.fn(),
  }),
}))

// The switcher + bell + theme toggle pull a lot of providers; stub them to keep
// this test focused on the SHELL chrome (tabs, exit, surface host).
vi.mock('@/components/AppModeSwitcher', () => ({
  AppModeSwitcher: () => <div data-testid="mode-switcher-stub" />,
}))
vi.mock('@/components/NotificationsBell', () => ({
  NotificationsBell: () => <div data-testid="bell-stub" />,
}))
vi.mock('@/components/ThemeToggle', () => ({
  ThemeToggle: () => <div data-testid="theme-stub" />,
}))
// landr-7dya.11 — the shared filter bar + its provider pull auth + query
// providers; stub them so this test stays a pure SHELL-chrome test (the filter
// bar / provider have their own dedicated tests). The provider stub is a plain
// passthrough so the <Outlet /> still renders.
vi.mock('@/lib/ticket-filter-context', () => ({
  TicketFilterProvider: ({ children }: { children: ReactNode }) => (
    <>{children}</>
  ),
}))
vi.mock('@/components/tickets/TicketFilterBar', () => ({
  TicketFilterBar: () => <div data-testid="ticket-filter-bar-stub" />,
}))

import { TicketSystemShell } from './TicketSystemShell'
import { TICKET_SYSTEM_PATH } from '@/lib/app-mode'

function renderAt(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path={TICKET_SYSTEM_PATH} element={<TicketSystemShell />}>
          <Route index element={<div data-testid="inbox-surface">inbox</div>} />
          <Route
            path="board"
            element={<div data-testid="board-surface">board</div>}
          />
          <Route
            path="planning"
            element={<div data-testid="planning-surface">planning</div>}
          />
        </Route>
        <Route path="/" element={<div data-testid="home">home</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mock.enterOperatorMode.mockReset()
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('TicketSystemShell', () => {
  it('renders its own chrome (title + exit + tabs)', () => {
    renderAt(TICKET_SYSTEM_PATH)
    expect(screen.getByTestId('ticket-system-shell')).toBeInTheDocument()
    expect(screen.getByTestId('ticket-system-exit')).toBeInTheDocument()
    // surface tabs render twice (desktop header + mobile row)
    expect(
      screen.getAllByTestId('ticket-system-surface-tabs').length,
    ).toBeGreaterThanOrEqual(1)
  })

  it('hosts the inbox surface at the index route', () => {
    renderAt(TICKET_SYSTEM_PATH)
    expect(screen.getByTestId('inbox-surface')).toBeInTheDocument()
  })

  it('hosts the board surface', () => {
    renderAt(`${TICKET_SYSTEM_PATH}/board`)
    expect(screen.getByTestId('board-surface')).toBeInTheDocument()
  })

  it('hosts the planning surface', () => {
    renderAt(`${TICKET_SYSTEM_PATH}/planning`)
    expect(screen.getByTestId('planning-surface')).toBeInTheDocument()
  })

  it('marks the active tab via aria-current', () => {
    renderAt(`${TICKET_SYSTEM_PATH}/board`)
    const boardTabs = screen.getAllByTestId('ticket-system-tab-board')
    expect(boardTabs[0]).toHaveAttribute('aria-current', 'page')
  })

  it('exits to the operator dashboard when the exit button is clicked', async () => {
    const user = userEvent.setup()
    renderAt(TICKET_SYSTEM_PATH)
    await user.click(screen.getByTestId('ticket-system-exit'))
    expect(mock.enterOperatorMode).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('home')).toBeInTheDocument()
  })
})
