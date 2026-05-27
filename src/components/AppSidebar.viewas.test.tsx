// landr-2soj — AppSidebar staff-only nav gating under view-as.
//
// The Revenue staff item (staffItems) is appended to the primary nav only for
// EFFECTIVE staff. So a staff user viewing-as a (non-staff) operator must NOT
// see Revenue; a normal staff session must. Non-staff never see it.
//
// Kept in a separate file from AppSidebar.test.tsx so it can toggle
// effectiveIsStaff without disturbing that file's permissive static mock.
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = {
  effectiveIsStaff: false,
}

vi.mock('@/lib/operator', () => ({
  useOperator: () => ({
    operators: [{ id: 'op-1', slug: 'para42', name: 'Para42' }],
    currentOperator: { id: 'op-1', slug: 'para42', name: 'Para42' },
    currentOperatorId: 'op-1',
    loading: false,
    switchOperator: () => {},
  }),
}))

vi.mock('@/lib/saved-views', async () => {
  const actual =
    await vi.importActual<typeof import('@/lib/saved-views')>(
      '@/lib/saved-views',
    )
  return { ...actual, listSavedViews: vi.fn(async () => []) }
})

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    session: null,
    user: { id: 'test-user', email: 'ok@landr.de' },
    loading: false,
    signOut: async () => {},
  }),
}))

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    isEnabled: () => true,
    isLandrStaff: mockState.effectiveIsStaff,
    effectiveIsStaff: mockState.effectiveIsStaff,
    isLoading: false,
  }),
}))

import { AppSidebar } from './AppSidebar'
import { SidebarProvider } from '@/components/ui/sidebar'
import { SidebarModeProvider } from '@/lib/sidebar-mode-context'

function renderSidebar() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  })
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter initialEntries={['/']}>
        <SidebarModeProvider>
          <SidebarProvider>
            <AppSidebar />
          </SidebarProvider>
        </SidebarModeProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  )
}

beforeEach(() => {
  window.localStorage.clear()
  mockState.effectiveIsStaff = false
})

afterEach(() => {
  window.localStorage.clear()
  vi.clearAllMocks()
})

describe('AppSidebar — staff Revenue item gating (landr-2soj)', () => {
  it('shows the /revenue staff item for effective staff', () => {
    mockState.effectiveIsStaff = true
    renderSidebar()
    const hrefs = new Set(
      screen
        .queryAllByRole('link')
        .map((a) => a.getAttribute('href'))
        .filter(Boolean),
    )
    expect(hrefs.has('/revenue')).toBe(true)
  })

  it('HIDES the /revenue staff item while in view-as (effectiveIsStaff false)', () => {
    mockState.effectiveIsStaff = false
    renderSidebar()
    const hrefs = new Set(
      screen
        .queryAllByRole('link')
        .map((a) => a.getAttribute('href'))
        .filter(Boolean),
    )
    expect(hrefs.has('/revenue')).toBe(false)
  })
})
