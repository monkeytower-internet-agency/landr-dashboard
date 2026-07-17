/**
 * landr-t0do / landr-3nyx: single source of truth for the smoke suite's
 * target host. Shared between playwright.config.ts (drives `baseURL` for
 * relative `page.goto()` calls) and devServerReachable.ts (probes the same
 * host before running any assertions) so the two can never drift.
 */
export const DASHBOARD_BASE_URL =
  process.env.DASHBOARD_BASE_URL ?? 'https://dashboard.dev.landr.de'
