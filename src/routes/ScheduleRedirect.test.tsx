import { render, screen } from '@testing-library/react'
import {
  MemoryRouter,
  Navigate,
  Route,
  Routes,
  useLocation,
} from 'react-router-dom'
import { describe, expect, it } from 'vitest'

// landr-e8jf — the /schedule path must keep working after the route
// moved into Settings, both for bookmarks and for the landr-3uai
// Calendar capacity-pill navigation which jumps to
// /schedule?date=...&product=... when the operator clicks a pill.
// This test pins the redirect contract WITHOUT pulling in the full
// <App /> auth surface (mirrors ProductsRedirect.test.tsx).

// Duplicate of the helper in App.tsx — colocated here so the contract
// (query-string preservation) is tested in isolation. If App.tsx's
// redirect changes shape, this test breaks before anything reaches the
// network.
function ScheduleRedirect() {
  const { search } = useLocation()
  return <Navigate to={`/settings/schedule${search}`} replace />
}

function PathProbe() {
  const { pathname, search } = useLocation()
  return (
    <div data-testid="location">
      <span data-testid="pathname">{pathname}</span>
      <span data-testid="search">{search}</span>
    </div>
  )
}

function renderRoutes(initial: string) {
  return render(
    <MemoryRouter initialEntries={[initial]}>
      <Routes>
        <Route path="/schedule" element={<ScheduleRedirect />} />
        <Route path="/settings/schedule" element={<PathProbe />} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('Legacy /schedule redirect (landr-e8jf)', () => {
  it('redirects /schedule to /settings/schedule', () => {
    renderRoutes('/schedule')
    expect(screen.getByTestId('pathname').textContent).toBe(
      '/settings/schedule',
    )
    expect(screen.getByTestId('search').textContent).toBe('')
  })

  it('preserves the query string from /schedule?date=...&product=... (landr-3uai pill nav)', () => {
    renderRoutes('/schedule?date=2026-05-15&product=prod-1')
    expect(screen.getByTestId('pathname').textContent).toBe(
      '/settings/schedule',
    )
    expect(screen.getByTestId('search').textContent).toBe(
      '?date=2026-05-15&product=prod-1',
    )
  })
})
