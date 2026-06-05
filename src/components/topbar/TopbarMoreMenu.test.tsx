// landr-3qkr.7 — TopbarMoreMenu: overflow menu for lowest-priority topbar
// items below md. Asserts:
//   1. The ellipsis trigger renders.
//   2. The menu is hidden by default (no content in DOM before open).
//   3. Clicking the trigger opens a menu that contains the collapsed items
//      (theme toggle + feedback).
//   4. The feedback menu item calls the ReportFab open handler.
//   5. The theme menu item calls toggleTheme.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    toggleTheme: vi.fn(),
    openReportFab: vi.fn(),
  },
}))

vi.mock('@/lib/theme', () => ({
  useTheme: () => ({
    resolvedTheme: 'light',
    toggleTheme: mocks.toggleTheme,
  }),
}))

vi.mock('@/lib/report-fab-context', () => ({
  useReportFab: () => ({
    open: false,
    setOpen: mocks.openReportFab,
  }),
}))

import { TopbarMoreMenu } from './TopbarMoreMenu'

describe('TopbarMoreMenu (landr-3qkr.7)', () => {
  it('renders the ellipsis trigger', () => {
    render(<TopbarMoreMenu />)
    expect(
      screen.getByTestId('topbar-more-menu-trigger'),
    ).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /more options/i }),
    ).toBeInTheDocument()
  })

  it('content is not in the DOM before the trigger is clicked', () => {
    render(<TopbarMoreMenu />)
    expect(
      screen.queryByTestId('topbar-more-menu-content'),
    ).not.toBeInTheDocument()
  })

  it('clicking the trigger opens the menu with the collapsed items', async () => {
    const user = userEvent.setup()
    render(<TopbarMoreMenu />)

    await user.click(screen.getByTestId('topbar-more-menu-trigger'))

    await waitFor(() => {
      expect(
        screen.getByTestId('topbar-more-menu-content'),
      ).toBeInTheDocument()
    })

    // Both collapsed items are present.
    expect(screen.getByTestId('topbar-more-menu-theme')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-more-menu-report')).toBeInTheDocument()
  })

  it('clicking the theme item calls toggleTheme', async () => {
    const user = userEvent.setup()
    render(<TopbarMoreMenu />)

    await user.click(screen.getByTestId('topbar-more-menu-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-more-menu-theme')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('topbar-more-menu-theme'))
    expect(mocks.toggleTheme).toHaveBeenCalledOnce()
  })

  it('clicking the feedback item opens the ReportFab dialog', async () => {
    const user = userEvent.setup()
    render(<TopbarMoreMenu />)

    await user.click(screen.getByTestId('topbar-more-menu-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-more-menu-report')).toBeInTheDocument()
    })

    await user.click(screen.getByTestId('topbar-more-menu-report'))
    expect(mocks.openReportFab).toHaveBeenCalledOnce()
    expect(mocks.openReportFab).toHaveBeenCalledWith(true)
  })
})
