import { expect, test } from '@playwright/test'
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
  await loginAsStaff(page)

  await expect(page).toHaveURL('/')
  await expect(page.getByTestId('dashboard-grid')).toBeVisible({ timeout: 15_000 })
})
