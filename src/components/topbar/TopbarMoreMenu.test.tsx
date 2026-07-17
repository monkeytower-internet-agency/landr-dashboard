// landr-fd5m.2 — TopbarMoreMenu: the MEASURED overflow menu. Driven by the
// `folded` set from useTopbarOverflow (not a static breakpoint), it:
//   1. renders NOTHING when nothing is folded (folded.size === 0),
//   2. renders the ⋯ trigger when at least one item is folded,
//   3. surfaces exactly the folded items — theme, widget (→ onOpenWidget),
//      tier (plain cross-tier <a href> links from urlForTier), report,
//   4. still wires the theme + report items to their handlers.

import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi, beforeEach } from 'vitest'

const { mocks } = vi.hoisted(() => ({
  mocks: {
    toggleTheme: vi.fn(),
    openReportFab: vi.fn(),
    onOpenWidget: vi.fn(),
    effectiveIsStaff: true,
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

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    effectiveIsStaff: mocks.effectiveIsStaff,
  }),
}))

// Real tier logic (otherTiers / urlForTier / TIER_DISPLAY) with a pinned
// current tier so cross-tier targets are deterministic. From 'staging' the
// other tiers are dev + prod.
vi.mock('@/lib/tier', async () => {
  const actual = await vi.importActual<typeof import('@/lib/tier')>('@/lib/tier')
  return { ...actual, getTier: () => 'staging' as const }
})

import { TopbarMoreMenu } from './TopbarMoreMenu'
import type { TopbarFoldable } from '@/hooks/use-topbar-overflow'

function foldedSet(...ids: TopbarFoldable[]): ReadonlySet<TopbarFoldable> {
  return new Set(ids)
}

beforeEach(() => {
  mocks.toggleTheme.mockClear()
  mocks.openReportFab.mockClear()
  mocks.onOpenWidget.mockClear()
  mocks.effectiveIsStaff = true
})

describe('TopbarMoreMenu (landr-fd5m.2)', () => {
  it('renders nothing when the folded set is empty', () => {
    const { container } = render(
      <TopbarMoreMenu folded={foldedSet()} onOpenWidget={mocks.onOpenWidget} />,
    )
    expect(container).toBeEmptyDOMElement()
    expect(screen.queryByTestId('topbar-more-menu-trigger')).toBeNull()
  })

  it('renders the ⋯ trigger when at least one item is folded', () => {
    render(
      <TopbarMoreMenu
        folded={foldedSet('theme')}
        onOpenWidget={mocks.onOpenWidget}
      />,
    )
    expect(screen.getByTestId('topbar-more-menu-trigger')).toBeInTheDocument()
    expect(
      screen.getByRole('button', { name: /more options/i }),
    ).toBeInTheDocument()
  })

  it('content is not in the DOM before the trigger is clicked', () => {
    render(
      <TopbarMoreMenu
        folded={foldedSet('theme', 'report')}
        onOpenWidget={mocks.onOpenWidget}
      />,
    )
    expect(
      screen.queryByTestId('topbar-more-menu-content'),
    ).not.toBeInTheDocument()
  })

  it('surfaces exactly the folded items (theme + report), and no others', async () => {
    const user = userEvent.setup()
    render(
      <TopbarMoreMenu
        folded={foldedSet('theme', 'report')}
        onOpenWidget={mocks.onOpenWidget}
      />,
    )

    await user.click(screen.getByTestId('topbar-more-menu-trigger'))
    await waitFor(() => {
      expect(screen.getByTestId('topbar-more-menu-content')).toBeInTheDocument()
    })

    expect(screen.getByTestId('topbar-more-menu-theme')).toBeInTheDocument()
    expect(screen.getByTestId('topbar-more-menu-report')).toBeInTheDocument()
    // Not folded ⇒ absent.
    expect(
      screen.queryByTestId('topbar-more-menu-widget'),
    ).not.toBeInTheDocument()
    expect(
      screen.queryByTestId('topbar-more-menu-tier-dev'),
    ).not.toBeInTheDocument()
  })

  it('the theme item calls toggleTheme', async () => {
    const user = userEvent.setup()
    render(
      <TopbarMoreMenu
        folded={foldedSet('theme')}
        onOpenWidget={mocks.onOpenWidget}
      />,
    )
    await user.click(screen.getByTestId('topbar-more-menu-trigger'))
    await waitFor(() =>
      expect(screen.getByTestId('topbar-more-menu-theme')).toBeInTheDocument(),
    )
    await user.click(screen.getByTestId('topbar-more-menu-theme'))
    expect(mocks.toggleTheme).toHaveBeenCalledOnce()
  })

  it('the report item opens the ReportFab dialog', async () => {
    const user = userEvent.setup()
    render(
      <TopbarMoreMenu
        folded={foldedSet('report')}
        onOpenWidget={mocks.onOpenWidget}
      />,
    )
    await user.click(screen.getByTestId('topbar-more-menu-trigger'))
    await waitFor(() =>
      expect(screen.getByTestId('topbar-more-menu-report')).toBeInTheDocument(),
    )
    await user.click(screen.getByTestId('topbar-more-menu-report'))
    expect(mocks.openReportFab).toHaveBeenCalledOnce()
    expect(mocks.openReportFab).toHaveBeenCalledWith(true)
  })

  it('the widget item calls onOpenWidget (opens the lifted staff modal)', async () => {
    const user = userEvent.setup()
    render(
      <TopbarMoreMenu
        folded={foldedSet('widget')}
        onOpenWidget={mocks.onOpenWidget}
      />,
    )
    await user.click(screen.getByTestId('topbar-more-menu-trigger'))
    await waitFor(() =>
      expect(screen.getByTestId('topbar-more-menu-widget')).toBeInTheDocument(),
    )
    await user.click(screen.getByTestId('topbar-more-menu-widget'))
    expect(mocks.onOpenWidget).toHaveBeenCalledOnce()
  })

  it('folded tier renders cross-tier <a href> links (staff sees Dev + Prod)', async () => {
    const user = userEvent.setup()
    render(
      <TopbarMoreMenu
        folded={foldedSet('tier')}
        onOpenWidget={mocks.onOpenWidget}
      />,
    )
    await user.click(screen.getByTestId('topbar-more-menu-trigger'))
    await waitFor(() =>
      expect(
        screen.getByTestId('topbar-more-menu-content'),
      ).toBeInTheDocument(),
    )

    // `asChild` merges the DropdownMenuItem props onto the <a>, so the
    // testid-bearing element IS the plain anchor (no nested Radix dropdown).
    const dev = screen.getByTestId('topbar-more-menu-tier-dev')
    const prod = screen.getByTestId('topbar-more-menu-tier-prod')
    expect(dev.tagName).toBe('A')
    expect(prod.tagName).toBe('A')
    expect(dev.getAttribute('href')).toContain('dashboard.dev.landr.de')
    expect(prod.getAttribute('href')).toContain('dashboard.landr.de')
    // Current tier (staging) is never a jump target.
    expect(
      screen.queryByTestId('topbar-more-menu-tier-staging'),
    ).not.toBeInTheDocument()
  })

  it('non-staff never gets the Dev jump target (Tailscale-only)', async () => {
    mocks.effectiveIsStaff = false
    const user = userEvent.setup()
    render(
      <TopbarMoreMenu
        folded={foldedSet('tier')}
        onOpenWidget={mocks.onOpenWidget}
      />,
    )
    await user.click(screen.getByTestId('topbar-more-menu-trigger'))
    await waitFor(() =>
      expect(
        screen.getByTestId('topbar-more-menu-content'),
      ).toBeInTheDocument(),
    )
    expect(
      screen.queryByTestId('topbar-more-menu-tier-dev'),
    ).not.toBeInTheDocument()
    expect(screen.getByTestId('topbar-more-menu-tier-prod')).toBeInTheDocument()
  })
})
