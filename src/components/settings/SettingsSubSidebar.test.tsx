// landr-2soj — SettingsSubSidebar staff-section gating under view-as.
//
// Settings → Tiers (STAFF_SECTIONS) appends to the SETTINGS group only for
// EFFECTIVE staff. So:
//   - normal staff (effectiveIsStaff true)  → Tiers visible
//   - staff in view-as (effectiveIsStaff false) → Tiers HIDDEN
//   - non-staff (effectiveIsStaff false)     → Tiers HIDDEN
//
// useEntitlements is mocked so this is a pure IA test (no provider / RPC).
import { render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mockState = {
  effectiveIsStaff: false,
}

vi.mock('@/lib/entitlements', () => ({
  useEntitlements: () => ({
    // Keep all tenant features enabled so this test isolates the staff gate.
    isEnabled: () => true,
    isLandrStaff: false,
    effectiveIsStaff: mockState.effectiveIsStaff,
    isLoading: false,
  }),
}))

import { SettingsSubSidebar } from './SettingsSubSidebar'

// Use a SETTINGS-group path (not an ACCOUNT one like /settings/company) so the
// sub-sidebar renders the SETTINGS list — that's where STAFF_SECTIONS append.
function renderSub(initialPath = '/settings/team') {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <SettingsSubSidebar />
    </MemoryRouter>,
  )
}

beforeEach(() => {
  mockState.effectiveIsStaff = false
})

afterEach(() => {
  vi.clearAllMocks()
})

describe('SettingsSubSidebar — Tiers gating (landr-2soj)', () => {
  it('shows Settings → Tiers for effective staff', () => {
    mockState.effectiveIsStaff = true
    renderSub()
    const tiers = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/settings/tiers')
    expect(tiers).toBeDefined()
  })

  it('HIDES Settings → Tiers when staff is in view-as (effectiveIsStaff false)', () => {
    mockState.effectiveIsStaff = false
    renderSub()
    const tiers = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/settings/tiers')
    expect(tiers).toBeUndefined()
  })

  it('HIDES Settings → Tiers for non-staff', () => {
    mockState.effectiveIsStaff = false
    renderSub()
    const tiers = screen
      .queryAllByRole('link')
      .find((a) => a.getAttribute('href') === '/settings/tiers')
    expect(tiers).toBeUndefined()
  })
})
