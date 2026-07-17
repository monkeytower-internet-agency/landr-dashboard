import { expect, test } from '@playwright/test'
import { DASHBOARD_BASE_URL } from './baseUrl'
import { isDevServerReachable } from './devServerReachable'
import { loginAsStaff } from './staffLogin'

/**
 * landr-t0do — Flow 2: login + one protected route renders.
 *
 * Deliberately ONE assertion beyond "we're not still on /login": the
 * Dashboard route (behind ProtectedRoute + OnboardingGuard + AppShell)
 * actually mounts its content grid. Resist growing this into a full auth
 * suite — session-expiry / logout / OAuth are separate concerns.
 */
test('login redirects to the dashboard and renders the protected route', async ({
  page,
}) => {
  // landr-3nyx: skip (not fail) when the dev host is down/unreachable —
  // see e2e/devServerReachable.ts.
  test.skip(
    !(await isDevServerReachable()),
    `dev server unreachable at ${DASHBOARD_BASE_URL}`,
  )

  await loginAsStaff(page)

  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('dashboard-grid')).toBeVisible({ timeout: 15_000 })
})
