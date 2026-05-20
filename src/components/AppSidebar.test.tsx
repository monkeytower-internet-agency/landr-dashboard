import { render, screen, within, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { AppSidebar } from './AppSidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SidebarModeProvider } from '@/lib/sidebar-mode-context'
import {
  DEFAULT_SIDEBAR_MODE,
  SIDEBAR_MODE_STORAGE_KEY,
  type SidebarMode,
} from '@/lib/sidebar-mode'

// landr-sydf — Products is no longer a top-level sidebar item. The
// assertions below pin both the removal (no Products top-level link) and
// the daily-use cluster that should still be there.
//
// landr-fzcg — Account is now its own top-level sibling of Settings, and
// the collapse trigger is replaced by a 3-state radiogroup at the very
// bottom of the sidebar. AppSidebar now consumes SidebarModeProvider
// alongside SidebarProvider, so the renderer wraps both.
function renderSidebar(initialPath: string = '/') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SidebarModeProvider>
        <SidebarProvider>
          <AppSidebar />
        </SidebarProvider>
      </SidebarModeProvider>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
})

afterEach(() => {
  window.localStorage.clear()
})

describe('AppSidebar (landr-sydf)', () => {
  it('does NOT render a top-level Products entry', () => {
    renderSidebar()
    // shadcn Sidebar renders multiple visual variants (off-canvas + mobile
    // sheet); both list the same primaryItems. Querying the full document
    // for links + de-duping by href gives a stable assertion regardless of
    // which variant is mounted in jsdom.
    const links = screen.queryAllByRole('link')
    const hrefs = new Set(
      links.map((a) => a.getAttribute('href')).filter(Boolean),
    )
    expect(hrefs.has('/products')).toBe(false)
    // /settings/products must NOT appear in the top-level sidebar — it
    // lives in the sub-sidebar.
    expect(hrefs.has('/settings/products')).toBe(false)
    const productLink = links.find(
      (a) => (a.textContent ?? '').trim().toLowerCase() === 'products',
    )
    expect(productLink).toBeUndefined()
  })

  it('still renders the daily-use primary items + Settings + Account', () => {
    renderSidebar()
    const hrefs = new Set(
      screen
        .queryAllByRole('link')
        .map((a) => a.getAttribute('href'))
        .filter(Boolean),
    )
    for (const href of [
      '/',
      '/bookings',
      '/schedule',
      '/calendar',
      '/contacts',
      '/reporting',
      '/approvals/general',
      // landr-fzcg — Account + Settings are both top-level now.
      '/account',
      '/settings',
    ]) {
      expect(hrefs.has(href)).toBe(true)
    }
  })
})

describe('AppSidebar — Account/Settings split (landr-fzcg)', () => {
  it('Account link points to /account (lands on /settings/company)', () => {
    renderSidebar()
    const accountLinks = screen
      .queryAllByRole('link')
      .filter((a) => a.getAttribute('href') === '/account')
    expect(accountLinks.length).toBeGreaterThan(0)
    const txt = (accountLinks[0].textContent ?? '').toLowerCase()
    expect(txt).toContain('account')
  })

  it('highlights Account when on an account subsection URL', () => {
    renderSidebar('/settings/plan')
    // /settings/plan belongs to the Account group, so the Account nav
    // row should be marked active and Settings should NOT be.
    const accountLink = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/account')
    expect(accountLink).toBeDefined()
    const accountButton = accountLink!.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(accountButton?.getAttribute('data-active')).toBe('true')

    const settingsLink = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/settings')
    const settingsButton = settingsLink!.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(settingsButton?.getAttribute('data-active')).not.toBe('true')
  })

  it('highlights Settings when on a settings-group subsection URL', () => {
    renderSidebar('/settings/team')
    const settingsLink = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/settings')
    const settingsButton = settingsLink!.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(settingsButton?.getAttribute('data-active')).toBe('true')

    const accountLink = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/account')
    const accountButton = accountLink!.closest(
      '[data-sidebar="menu-button"]',
    ) as HTMLElement | null
    expect(accountButton?.getAttribute('data-active')).not.toBe('true')
  })

  it('does NOT highlight either when on an unrelated route', () => {
    renderSidebar('/bookings')
    for (const href of ['/account', '/settings']) {
      const link = screen
        .queryAllByRole('link')
        .find((a) => a.getAttribute('href') === href)
      const btn = link!.closest(
        '[data-sidebar="menu-button"]',
      ) as HTMLElement | null
      expect(btn?.getAttribute('data-active')).not.toBe('true')
    }
  })
})

describe('AppSidebar — 3-state collapse control (landr-fzcg)', () => {
  it('renders a radiogroup with the three modes', () => {
    renderSidebar()
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const radios = within(group).getAllByRole('radio')
    expect(radios).toHaveLength(3)
  })

  it('starts on the default mode (expanded)', () => {
    renderSidebar()
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const expanded = within(group).getByRole('radio', {
      name: /always expanded/i,
    })
    expect(expanded.getAttribute('aria-checked')).toBe('true')
    expect(DEFAULT_SIDEBAR_MODE).toBe<SidebarMode>('expanded')
  })

  it('clicking a radio switches mode + writes to localStorage', async () => {
    const user = userEvent.setup()
    renderSidebar()
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const hover = within(group).getByRole('radio', {
      name: /expand on hover/i,
    })

    await user.click(hover)

    expect(hover.getAttribute('aria-checked')).toBe('true')
    expect(window.localStorage.getItem(SIDEBAR_MODE_STORAGE_KEY)).toBe(
      'hover-expand',
    )
  })

  it('restores mode from localStorage on mount', () => {
    window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, 'collapsed')
    renderSidebar()
    // In collapsed mode the segmented control is hidden by CSS but
    // still in the DOM (we render both variants and toggle via CSS).
    // Assert via localStorage round-trip + the radiogroup state.
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const collapsed = within(group).getByRole('radio', {
      name: /always collapsed/i,
    })
    expect(collapsed.getAttribute('aria-checked')).toBe('true')
  })

  it('responds to cross-tab storage events', () => {
    renderSidebar()
    const group = screen.getByRole('radiogroup', {
      name: /sidebar display mode/i,
    })
    const hover = within(group).getByRole('radio', {
      name: /expand on hover/i,
    })
    expect(hover.getAttribute('aria-checked')).toBe('false')

    act(() => {
      window.localStorage.setItem(SIDEBAR_MODE_STORAGE_KEY, 'hover-expand')
      window.dispatchEvent(
        new StorageEvent('storage', {
          key: SIDEBAR_MODE_STORAGE_KEY,
          newValue: 'hover-expand',
        }),
      )
    })

    expect(hover.getAttribute('aria-checked')).toBe('true')
  })
})
