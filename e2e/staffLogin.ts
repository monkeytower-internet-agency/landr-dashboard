import type { Page } from '@playwright/test'

/**
 * landr-t0do: shared login helper for the two dashboard smoke specs
 * (login-protected-route + staff-topbar-mobile). Both need the same
 * seeded staff account, so this is a helper, not a fixture/suite.
 *
 * ok@landr.de is the `is_landr_staff=true` dev seed account created by
 * supabase/seed.sql in landr-api (idempotent on every `db reset`,
 * bridged into the para42 operator as owner). It's the only
 * password-login dev account with the staff bit set, which is why
 * Flow 3 (the topbar-overflow regression net) needs it specifically —
 * only staff render the AppModeSwitcher/TierBadge/WidgetButton that make
 * the topbar wide enough to fold at 360px in the first place.
 *
 * Override via env if the dev seed password ever rotates; these are dev
 * data, not a production secret (see landr-api/supabase/seed.sql).
 */
export const STAFF_EMAIL = process.env.E2E_STAFF_EMAIL ?? 'ok@landr.de'
export const STAFF_PASSWORD = process.env.E2E_STAFF_PASSWORD ?? 'Sun!Shine42'

export async function loginAsStaff(page: Page) {
  await page.goto('/login')
  await page.getByLabel('Email').fill(STAFF_EMAIL)
  // The password field's `getByLabel('Password')` is ambiguous — it also
  // matches the show/hide toggle button's accessible name — so target the
  // input by id instead (see src/routes/Login.tsx).
  await page.locator('#password').fill(STAFF_PASSWORD)
  await page.getByRole('button', { name: 'Sign in' }).click()
}
