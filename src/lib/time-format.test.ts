import { describe, it, expect } from 'vitest'
import { formatTime, formatTimeRange } from './time-format'

describe('formatTime', () => {
  it('renders 24h with hourCycle h23 when hour12=false', () => {
    expect(formatTime('13:05', { hour12: false })).toBe('13:05')
    expect(formatTime('08:30', { hour12: false })).toBe('08:30')
    expect(formatTime('00:00', { hour12: false })).toBe('00:00')
  })

  it('renders 12h with AM/PM when hour12=true', () => {
    // Intl in en-IE 12h mode emits 'h:MM a.m./p.m.' — assert the parts that
    // matter (hour digit + meridiem) without binding to a specific locale's
    // separator/punctuation quirks.
    const morning = formatTime('08:30', { hour12: true })
    expect(morning).toMatch(/8:30/)
    expect(morning.toLowerCase()).toMatch(/a\.?m/)

    const afternoon = formatTime('13:05', { hour12: true })
    expect(afternoon).toMatch(/1:05/)
    expect(afternoon.toLowerCase()).toMatch(/p\.?m/)

    const midnight = formatTime('00:00', { hour12: true })
    expect(midnight).toMatch(/12:00/)
    expect(midnight.toLowerCase()).toMatch(/a\.?m/)
  })

  it('accepts ISO timestamp strings', () => {
    // 2026-05-19T13:05:00Z — produces local-time HH:mm. We assert format
    // shape (digits + colon, 5 chars) rather than the literal hour, which
    // depends on the host TZ.
    const out24 = formatTime('2026-05-19T13:05:00Z', { hour12: false })
    expect(out24).toMatch(/^\d{2}:\d{2}$/)

    const out12 = formatTime('2026-05-19T13:05:00Z', { hour12: true })
    expect(out12).toMatch(/\d{1,2}:\d{2}/)
    expect(out12.toLowerCase()).toMatch(/[ap]\.?m/)
  })

  it('accepts Date objects', () => {
    const d = new Date()
    d.setHours(9, 15, 0, 0)
    expect(formatTime(d, { hour12: false })).toBe('09:15')
  })

  it('accepts HH:mm:ss strings and ignores seconds in the output', () => {
    expect(formatTime('07:45:30', { hour12: false })).toBe('07:45')
  })

  it('returns the input verbatim when unparseable', () => {
    expect(formatTime('not-a-time', { hour12: false })).toBe('not-a-time')
    expect(formatTime('25:99', { hour12: false })).toBe('25:99')
  })
})

describe('formatTimeRange', () => {
  it('joins two formatted times with an en-dash', () => {
    expect(formatTimeRange('08:00', '20:00', { hour12: false })).toBe('08:00–20:00')
  })

  it('respects hour12 for both endpoints', () => {
    const out = formatTimeRange('08:00', '20:00', { hour12: true })
    expect(out).toMatch(/–/)
    // First part am, second part pm.
    const [left, right] = out.split('–')
    expect(left.toLowerCase()).toMatch(/a\.?m/)
    expect(right.toLowerCase()).toMatch(/p\.?m/)
  })
})
