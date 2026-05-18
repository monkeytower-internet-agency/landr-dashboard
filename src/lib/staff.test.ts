import { describe, expect, it } from 'vitest'
import {
  parsePermissions,
  permissionsSummary,
  permissionsToText,
  staffDate,
} from './staff'

describe('parsePermissions', () => {
  it('treats empty input as null (no override)', () => {
    expect(parsePermissions('')).toEqual({ ok: true, value: null })
    expect(parsePermissions('   ')).toEqual({ ok: true, value: null })
  })

  it('parses a valid JSON object', () => {
    expect(parsePermissions('{"a":1}')).toEqual({
      ok: true,
      value: { a: 1 },
    })
  })

  it('rejects invalid JSON', () => {
    const result = parsePermissions('not json')
    expect(result.ok).toBe(false)
  })

  it('rejects arrays, primitives, and JSON null', () => {
    expect(parsePermissions('[1,2,3]').ok).toBe(false)
    expect(parsePermissions('"hi"').ok).toBe(false)
    expect(parsePermissions('42').ok).toBe(false)
    expect(parsePermissions('null').ok).toBe(false)
  })
})

describe('permissionsToText', () => {
  it('round-trips through parsePermissions', () => {
    const obj = { manage_bookings: true, scope: 'self' }
    const text = permissionsToText(obj)
    const back = parsePermissions(text)
    expect(back.ok).toBe(true)
    if (back.ok) expect(back.value).toEqual(obj)
  })

  it('renders null as empty string', () => {
    expect(permissionsToText(null)).toBe('')
  })
})

describe('permissionsSummary', () => {
  it('summarises by key count', () => {
    expect(permissionsSummary(null)).toBe('—')
    expect(permissionsSummary({})).toBe('—')
    expect(permissionsSummary({ a: 1 })).toBe('1 key')
    expect(permissionsSummary({ a: 1, b: 2 })).toBe('2 keys')
  })
})

describe('staffDate', () => {
  it('handles null and invalid ISO strings gracefully', () => {
    expect(staffDate(null)).toBe('—')
    expect(staffDate('not-a-date')).toBe('not-a-date')
  })
  it('formats a valid ISO date', () => {
    const out = staffDate('2026-05-10T09:00:00.000Z')
    // Locale-dependent formatting; just assert it's not the bullet sentinel.
    expect(out).not.toBe('—')
    expect(out.length).toBeGreaterThan(0)
  })
})
