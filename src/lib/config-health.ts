// landr-y5si — config-health API client types and fetch function.
//
// Mirrors the API endpoint: GET /api/staff/operators/{operator_id}/config-health
// Returns a list of misconfiguration issues for the operator so the dashboard
// can surface them as actionable banners.
//
// Adding a new issue kind: define it in app/services/config_health.py on the API
// side; the dashboard receives it automatically via the shared ConfigHealthIssue
// shape — no changes needed here unless a new target_route needs mapping.

import { api } from '@/lib/api-client'

export type ConfigHealthSeverity = 'error' | 'warning'

export type ConfigHealthIssue = {
  /** Stable identifier for the issue kind (e.g. 'hotel_missing_email'). */
  id: string
  severity: ConfigHealthSeverity
  title: string
  message: string
  /** Dashboard route to navigate to when the operator clicks the banner. */
  target_route: string
}

export type ConfigHealthResponse = {
  issues: ConfigHealthIssue[]
}

export async function fetchConfigHealth(
  operatorId: string,
): Promise<ConfigHealthResponse> {
  return api<ConfigHealthResponse>(
    'GET',
    `/api/staff/operators/${operatorId}/config-health`,
  )
}
