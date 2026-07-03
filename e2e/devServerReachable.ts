import { DASHBOARD_BASE_URL } from './baseUrl'

/**
 * landr-3nyx: the smoke specs target a live dev host (dashboard.dev.landr.de
 * by default — see playwright.config.ts) that only exists when someone has
 * `npm run dev` running on Trillian and the Tailscale-gated Caddy edge in
 * front of it is up. The dashboard-smoke GitHub Actions job already runs
 * with `continue-on-error: true` (non-blocking) for exactly this reason —
 * but a hard connection timeout (net::ERR_ABORTED) still reports the job's
 * *check* as failed/red in the PR's checks list, which reads as "this PR
 * broke something" to an automated worker even though nothing about the
 * code regressed — the dev box was just unreachable.
 *
 * Probe reachability once per worker before running any real assertions,
 * and let call sites `test.skip()` when it's down. Any HTTP response (even
 * a 4xx/redirect) proves the host is up; only network-level failures (DNS
 * resolution failure, connection refused/reset, or our own timeout) mean
 * the dev server itself is unreachable.
 */
let cachedProbe: Promise<boolean> | undefined

async function probe(url: string, timeoutMs: number): Promise<boolean> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    await fetch(url, { signal: controller.signal, redirect: 'manual' })
    return true
  } catch {
    return false
  } finally {
    clearTimeout(timer)
  }
}

export function isDevServerReachable(
  url: string = DASHBOARD_BASE_URL,
  timeoutMs = 5_000,
): Promise<boolean> {
  cachedProbe ??= probe(url, timeoutMs)
  return cachedProbe
}
