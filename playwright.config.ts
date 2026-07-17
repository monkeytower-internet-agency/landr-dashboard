import { defineConfig, devices } from '@playwright/test'

import { DASHBOARD_BASE_URL } from './e2e/baseUrl'

/**
 * landr-t0do: deliberately tiny Playwright smoke net for the dashboard.
 *
 * Base URL defaults to the live Trillian dev stack (dashboard.dev.landr.de —
 * Tailscale-only, served by Caddy in front of the shared `npm run dev`
 * instance on :5173). Unlike the widget's dev deployment, there is no public
 * (Cloudflare-reachable) dashboard dev host: the dashboard talks to Supabase
 * at kong.dev.landr.de, which resolves to a Tailscale address — browsers
 * refuse that fetch from a public origin (Private Network Access), and the
 * hostname itself doesn't resolve off the tailnet at all. So this job can
 * only succeed on a runner that's on the tailnet (Trillian itself today).
 * See .beads/scratch/handoffs/landr-t0do.md for the full writeup.
 *
 * landr-3nyx: when the dev host is unreachable (server not running, Caddy
 * edge down, runner not on the tailnet), each spec probes it via
 * e2e/devServerReachable.ts and calls `test.skip()` instead of letting
 * `page.goto()` time out — so infra-unavailability shows up as "skipped",
 * not "failed", in the (non-required) dashboard-smoke check.
 *
 * Override DASHBOARD_BASE_URL to point at a local `vite` dev/preview server
 * (e.g. http://localhost:5174) while iterating — see e2e/README below.
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: process.env.CI ? [['line'], ['html', { open: 'never' }]] : 'list',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: DASHBOARD_BASE_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
})
