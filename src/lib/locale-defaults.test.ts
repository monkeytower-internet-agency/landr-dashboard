import { describe, expect, it } from 'vitest'
import { LOCALES, guessLocale, guessTimezone } from './locale-defaults'

describe('guessTimezone', () => {
  it('maps known countries to their primary timezone', () => {
    expect(guessTimezone('ES')).toBe('Europe/Madrid')
    expect(guessTimezone('DE')).toBe('Europe/Berlin')
    expect(guessTimezone('FR')).toBe('Europe/Paris')
    expect(guessTimezone('GB')).toBe('Europe/London')
    expect(guessTimezone('US')).toBe('America/New_York')
  })

  it('is case-insensitive on the country code', () => {
    expect(guessTimezone('es')).toBe('Europe/Madrid')
    expect(guessTimezone(' de ')).toBe('Europe/Berlin')
  })

  it('uses Atlantic/Canary when ES region matches canarias/canary', () => {
    expect(guessTimezone('ES', 'Canarias')).toBe('Atlantic/Canary')
    expect(guessTimezone('ES', 'Las Palmas, Canary Islands')).toBe('Atlantic/Canary')
  })

  it('falls back to a usable timezone for unknown countries', () => {
    const result = guessTimezone('XX')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })

  it('falls back to a usable timezone for empty/null input', () => {
    const result = guessTimezone(null)
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('guessLocale', () => {
  it('maps known countries to their primary BCP-47 language code', () => {
    expect(guessLocale('ES')).toBe('es')
    expect(guessLocale('DE')).toBe('de')
    expect(guessLocale('FR')).toBe('fr')
    expect(guessLocale('GB')).toBe('en')
    expect(guessLocale('CH')).toBe('de')
    expect(guessLocale('BE')).toBe('nl')
  })

  it('is case-insensitive on the country code', () => {
    expect(guessLocale('es')).toBe('es')
  })

  it('falls back to a usable locale for unknown countries', () => {
    const result = guessLocale('XX')
    expect(typeof result).toBe('string')
    expect(result.length).toBeGreaterThan(0)
  })
})

describe('LOCALES', () => {
  it('includes the core BCP-47 languages used by Para42-style operators', () => {
    const codes = LOCALES.map((l) => l.code)
    expect(codes).toContain('en')
    expect(codes).toContain('es')
    expect(codes).toContain('de')
    expect(codes).toContain('ca')
    expect(codes).toContain('eu')
  })

  it('has no duplicate codes', () => {
    const codes = LOCALES.map((l) => l.code)
    expect(new Set(codes).size).toBe(codes.length)
  })
})
