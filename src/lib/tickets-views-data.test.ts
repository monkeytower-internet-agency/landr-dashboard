// landr-wwhn.17 — tests for the ticket-view data layer.
//
// Covers:
//   - readTicketConfigLabelAreas: valid/invalid/absent config
//   - readTicketConfigStatuses: valid/invalid/absent config
//   - applyTicketViewFilters: no filter, single area, multi-area, tickets without labels
// landr-wwhn.31:
//   - readTicketConfigOperatorId: valid/invalid/absent config
//   - applyTicketViewFilters: operator filter (id match, no match, absent)
//   - applyTicketViewFilters: combined operator + area filter
//
// Note: fetchTicketsWithLabels and useViewTickets involve Supabase I/O;
// integration-level tests for those live in a separate E2E suite. This file
// covers only the pure helpers.

import { describe, expect, it } from 'vitest'
import {
  readTicketConfigLabelAreas,
  readTicketConfigOperatorId,
  readTicketConfigStatuses,
  applyTicketViewFilters,
  TICKET_LABEL_AREAS,
} from './tickets-views-data'
import type { TicketRow } from './tickets'

// ---- fixtures ---------------------------------------------------------------

function makeTicket(
  overrides: Partial<TicketRow> & { labels?: { area: string }[] } = {},
): TicketRow {
  const base: TicketRow = {
    id: 'ticket-1',
    context: 'operations',
    type: 'bug',
    title: 'A bug',
    body: null,
    status: 'backlog',
    priority: 'p2',
    perceived_impact: 'annoying',
    reporter_id: null,
    operator_id: 'op-1',
    assignee_id: null,
    blocked: false,
    moscow: null,
    created_at: '2026-05-24T00:00:00Z',
    updated_at: '2026-05-24T00:00:00Z',
  }
  return { ...base, ...overrides } as TicketRow
}

// ---- readTicketConfigLabelAreas -------------------------------------------

describe('readTicketConfigLabelAreas', () => {
  it('returns [] when config has no ticketConfig key', () => {
    expect(readTicketConfigLabelAreas({})).toEqual([])
  })

  it('returns [] when ticketConfig.labelAreas is absent', () => {
    expect(readTicketConfigLabelAreas({ ticketConfig: {} })).toEqual([])
  })

  it('returns [] when ticketConfig.labelAreas is empty array', () => {
    expect(
      readTicketConfigLabelAreas({ ticketConfig: { labelAreas: [] } }),
    ).toEqual([])
  })

  it('returns valid area values', () => {
    const result = readTicketConfigLabelAreas({
      ticketConfig: { labelAreas: ['dashboard', 'api'] },
    })
    expect(result).toEqual(['dashboard', 'api'])
  })

  it('strips unknown area values', () => {
    const result = readTicketConfigLabelAreas({
      ticketConfig: { labelAreas: ['dashboard', 'unknown-area', 'app'] },
    })
    expect(result).toEqual(['dashboard', 'app'])
  })

  it('tolerates non-array labelAreas gracefully', () => {
    expect(
      readTicketConfigLabelAreas({ ticketConfig: { labelAreas: 'dashboard' } }),
    ).toEqual([])
  })

  it('tolerates all canonical area values', () => {
    const result = readTicketConfigLabelAreas({
      ticketConfig: { labelAreas: [...TICKET_LABEL_AREAS] },
    })
    expect(result).toEqual([...TICKET_LABEL_AREAS])
  })
})

// ---- readTicketConfigStatuses ---------------------------------------------

describe('readTicketConfigStatuses', () => {
  it('returns [] when config has no ticketConfig', () => {
    expect(readTicketConfigStatuses({})).toEqual([])
  })

  it('returns [] when ticketConfig.statuses is absent', () => {
    expect(readTicketConfigStatuses({ ticketConfig: {} })).toEqual([])
  })

  it('returns valid status values', () => {
    const result = readTicketConfigStatuses({
      ticketConfig: { statuses: ['backlog', 'ready'] },
    })
    expect(result).toEqual(['backlog', 'ready'])
  })

  it('strips unknown status values', () => {
    const result = readTicketConfigStatuses({
      ticketConfig: { statuses: ['backlog', 'unknown', 'done'] },
    })
    expect(result).toEqual(['backlog', 'done'])
  })
})

// ---- applyTicketViewFilters -----------------------------------------------

describe('applyTicketViewFilters', () => {
  it('returns all tickets when no area filter is set', () => {
    const tickets = [
      makeTicket({ id: 'a' }),
      makeTicket({ id: 'b' }),
    ]
    expect(applyTicketViewFilters(tickets, {})).toHaveLength(2)
  })

  it('returns all tickets when labelAreas is empty', () => {
    const tickets = [
      makeTicket({ id: 'a' }),
      makeTicket({ id: 'b' }),
    ]
    expect(
      applyTicketViewFilters(tickets, {
        ticketConfig: { labelAreas: [] },
      }),
    ).toHaveLength(2)
  })

  it('filters to tickets that have at least one matching area label', () => {
    const withDashboard = makeTicket({
      id: 'dash',
      // labels are a side-channel field attached by fetchTicketsWithLabels
    }) as TicketRow & { labels: { area: string }[] }
    withDashboard.labels = [{ area: 'dashboard' }]

    const withApi = makeTicket({ id: 'api' }) as TicketRow & {
      labels: { area: string }[]
    }
    withApi.labels = [{ area: 'api' }]

    const noLabels = makeTicket({ id: 'none' })

    const filtered = applyTicketViewFilters(
      [withDashboard, withApi, noLabels],
      { ticketConfig: { labelAreas: ['dashboard'] } },
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('dash')
  })

  it('includes tickets matching any of multiple selected areas', () => {
    const withDash = makeTicket({ id: 'a' }) as TicketRow & {
      labels: { area: string }[]
    }
    withDash.labels = [{ area: 'dashboard' }]

    const withApp = makeTicket({ id: 'b' }) as TicketRow & {
      labels: { area: string }[]
    }
    withApp.labels = [{ area: 'app' }]

    const withNone = makeTicket({ id: 'c' })

    const filtered = applyTicketViewFilters(
      [withDash, withApp, withNone],
      { ticketConfig: { labelAreas: ['dashboard', 'app'] } },
    )
    expect(filtered).toHaveLength(2)
    expect(filtered.map((t) => t.id)).toEqual(['a', 'b'])
  })

  it('excludes tickets with labels that do not match the active areas', () => {
    const withApi = makeTicket({ id: 'api' }) as TicketRow & {
      labels: { area: string }[]
    }
    withApi.labels = [{ area: 'api' }]

    const filtered = applyTicketViewFilters(
      [withApi],
      { ticketConfig: { labelAreas: ['dashboard'] } },
    )
    expect(filtered).toHaveLength(0)
  })

  it('excludes tickets with no labels when a filter is active', () => {
    const noLabels = makeTicket({ id: 'x' })
    const filtered = applyTicketViewFilters(
      [noLabels],
      { ticketConfig: { labelAreas: ['dashboard'] } },
    )
    expect(filtered).toHaveLength(0)
  })
})

// ---- readTicketConfigOperatorId (landr-wwhn.31) ------------------------------

describe('readTicketConfigOperatorId', () => {
  it('returns null when config has no ticketConfig', () => {
    expect(readTicketConfigOperatorId({})).toBeNull()
  })

  it('returns null when ticketConfig.operatorId is absent', () => {
    expect(readTicketConfigOperatorId({ ticketConfig: {} })).toBeNull()
  })

  it('returns null when ticketConfig.operatorId is empty string', () => {
    expect(
      readTicketConfigOperatorId({ ticketConfig: { operatorId: '' } }),
    ).toBeNull()
  })

  it('returns null when ticketConfig.operatorId is a non-string value', () => {
    expect(
      readTicketConfigOperatorId({ ticketConfig: { operatorId: 42 } }),
    ).toBeNull()
  })

  it('returns the operatorId string when valid', () => {
    const id = 'op-uuid-123'
    expect(
      readTicketConfigOperatorId({ ticketConfig: { operatorId: id } }),
    ).toBe(id)
  })
})

// ---- applyTicketViewFilters — operator filter (landr-wwhn.31) ---------------

describe('applyTicketViewFilters — operator filter', () => {
  it('returns all tickets when no operatorId is set', () => {
    const tickets = [
      makeTicket({ id: 'a', operator_id: 'op-1' }),
      makeTicket({ id: 'b', operator_id: 'op-2' }),
    ]
    expect(applyTicketViewFilters(tickets, {})).toHaveLength(2)
  })

  it('filters to tickets from the specified operator', () => {
    const tickets = [
      makeTicket({ id: 'a', operator_id: 'op-1' }),
      makeTicket({ id: 'b', operator_id: 'op-2' }),
      makeTicket({ id: 'c', operator_id: 'op-1' }),
    ]
    const filtered = applyTicketViewFilters(tickets, {
      ticketConfig: { operatorId: 'op-1' },
    })
    expect(filtered).toHaveLength(2)
    expect(filtered.map((t) => t.id)).toEqual(['a', 'c'])
  })

  it('returns empty when no tickets match the specified operator', () => {
    const tickets = [
      makeTicket({ id: 'a', operator_id: 'op-1' }),
    ]
    const filtered = applyTicketViewFilters(tickets, {
      ticketConfig: { operatorId: 'op-xyz' },
    })
    expect(filtered).toHaveLength(0)
  })

  it('applies operator filter then area filter in sequence', () => {
    const t1 = makeTicket({ id: 'op1-dash', operator_id: 'op-1' }) as TicketRow & { labels: { area: string }[] }
    t1.labels = [{ area: 'dashboard' }]

    const t2 = makeTicket({ id: 'op1-api', operator_id: 'op-1' }) as TicketRow & { labels: { area: string }[] }
    t2.labels = [{ area: 'api' }]

    const t3 = makeTicket({ id: 'op2-dash', operator_id: 'op-2' }) as TicketRow & { labels: { area: string }[] }
    t3.labels = [{ area: 'dashboard' }]

    // Operator op-1 AND area dashboard → only t1.
    const filtered = applyTicketViewFilters(
      [t1, t2, t3],
      { ticketConfig: { operatorId: 'op-1', labelAreas: ['dashboard'] } },
    )
    expect(filtered).toHaveLength(1)
    expect(filtered[0].id).toBe('op1-dash')
  })
})
