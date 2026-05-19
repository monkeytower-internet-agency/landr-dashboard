// Country (ISO-3166 alpha-2) -> default IANA timezone for European/SaaS markets.
const COUNTRY_TIMEZONE: Record<string, string> = {
  ES: 'Europe/Madrid',
  DE: 'Europe/Berlin',
  FR: 'Europe/Paris',
  IT: 'Europe/Rome',
  PT: 'Europe/Lisbon',
  NL: 'Europe/Amsterdam',
  GB: 'Europe/London',
  CH: 'Europe/Zurich',
  AT: 'Europe/Vienna',
  BE: 'Europe/Brussels',
  IE: 'Europe/Dublin',
  PL: 'Europe/Warsaw',
  CZ: 'Europe/Prague',
  US: 'America/New_York',
}

// Country -> primary BCP-47 language code.
const COUNTRY_LOCALE: Record<string, string> = {
  ES: 'es',
  DE: 'de',
  FR: 'fr',
  IT: 'it',
  PT: 'pt',
  NL: 'nl',
  GB: 'en',
  CH: 'de',
  AT: 'de',
  BE: 'nl',
  IE: 'en',
  PL: 'pl',
  CZ: 'cs',
  US: 'en',
}

function browserTimezone(): string {
  if (typeof Intl === 'undefined') return 'Europe/Madrid'
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Europe/Madrid'
  } catch {
    return 'Europe/Madrid'
  }
}

function browserLocale(): string {
  if (typeof navigator === 'undefined' || !navigator.language) return 'en'
  return navigator.language.split('-')[0] || 'en'
}

export function guessTimezone(
  country: string | null | undefined,
  region?: string | null,
): string {
  const cc = (country ?? '').toUpperCase().trim()
  if (cc === 'ES' && region) {
    const r = region.toLowerCase()
    if (r.includes('canarias') || r.includes('canary')) {
      return 'Atlantic/Canary'
    }
  }
  if (cc && COUNTRY_TIMEZONE[cc]) {
    return COUNTRY_TIMEZONE[cc]
  }
  return browserTimezone()
}

export function guessLocale(country: string | null | undefined): string {
  const cc = (country ?? '').toUpperCase().trim()
  if (cc && COUNTRY_LOCALE[cc]) {
    return COUNTRY_LOCALE[cc]
  }
  return browserLocale()
}

export const LOCALES: ReadonlyArray<{ code: string; label: string }> = [
  { code: 'en', label: 'English' },
  { code: 'es', label: 'Español' },
  { code: 'de', label: 'Deutsch' },
  { code: 'fr', label: 'Français' },
  { code: 'it', label: 'Italiano' },
  { code: 'pt', label: 'Português' },
  { code: 'ca', label: 'Català' },
  { code: 'eu', label: 'Euskara' },
  { code: 'nl', label: 'Nederlands' },
  { code: 'pl', label: 'Polski' },
  { code: 'cs', label: 'Čeština' },
]
