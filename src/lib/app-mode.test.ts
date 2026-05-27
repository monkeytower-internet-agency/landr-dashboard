// landr-7dya.10 — pure app-mode helpers.
import { describe, expect, it } from 'vitest'
import {
  deriveAppMode,
  isTicketSystemPath,
  surfaceForPath,
  TICKET_SURFACES,
  TICKET_SYSTEM_PATH,
} from './app-mode'

describe('isTicketSystemPath', () => {
  it('matches the bare app-view path', () => {
    expect(isTicketSystemPath(TICKET_SYSTEM_PATH)).toBe(true)
  })
  it('matches sub-surface paths', () => {
    expect(isTicketSystemPath(`${TICKET_SYSTEM_PATH}/board`)).toBe(true)
    expect(isTicketSystemPath(`${TICKET_SYSTEM_PATH}/planning`)).toBe(true)
  })
  it('does NOT match the operator-chrome /tickets board route', () => {
    expect(isTicketSystemPath('/tickets')).toBe(false)
    expect(isTicketSystemPath('/tickets/planning')).toBe(false)
  })
  it('does not match unrelated routes', () => {
    expect(isTicketSystemPath('/')).toBe(false)
    expect(isTicketSystemPath('/feedback-inbox')).toBe(false)
    // a path that merely shares a prefix segment but not the boundary
    expect(isTicketSystemPath('/staff/tickets-other')).toBe(false)
  })
})

describe('deriveAppMode', () => {
  it('returns tickets inside the app-view regardless of view-as', () => {
    expect(deriveAppMode(TICKET_SYSTEM_PATH, false)).toBe('tickets')
    expect(deriveAppMode(`${TICKET_SYSTEM_PATH}/board`, true)).toBe('tickets')
  })
  it('returns view-as when view-as is active outside the app-view', () => {
    expect(deriveAppMode('/', true)).toBe('view-as')
    expect(deriveAppMode('/bookings', true)).toBe('view-as')
  })
  it('returns operator by default', () => {
    expect(deriveAppMode('/', false)).toBe('operator')
    expect(deriveAppMode('/bookings', false)).toBe('operator')
    expect(deriveAppMode('/tickets', false)).toBe('operator')
  })
})

describe('surfaceForPath', () => {
  it('maps the bare path to inbox', () => {
    expect(surfaceForPath(TICKET_SYSTEM_PATH)).toBe('inbox')
  })
  it('maps board/planning correctly (longest prefix wins)', () => {
    expect(surfaceForPath(`${TICKET_SYSTEM_PATH}/board`)).toBe('board')
    expect(surfaceForPath(`${TICKET_SYSTEM_PATH}/planning`)).toBe('planning')
  })
  it('returns null outside the app-view', () => {
    expect(surfaceForPath('/')).toBeNull()
    expect(surfaceForPath('/tickets')).toBeNull()
  })
})

describe('TICKET_SURFACES', () => {
  it('lists inbox first (default surface), then board, then planning', () => {
    expect(TICKET_SURFACES.map((s) => s.key)).toEqual([
      'inbox',
      'board',
      'planning',
    ])
  })
})
