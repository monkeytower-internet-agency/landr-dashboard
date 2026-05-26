import { describe, expect, it } from 'vitest'

import {
  ACCOUNT_SECTIONS,
  SETTINGS_SECTIONS,
  groupForPath,
  landingPathFor,
} from './sections'

// landr-sydf — Products moved out of the main sidebar into Settings. The
// data-level assertions below pin the contract: the sub-sidebar exposes a
// Products entry at /settings/products and the section list is the only
// place that controls it (no per-component conditional rendering).
describe('SETTINGS_SECTIONS', () => {
  it('includes a Products entry at /settings/products', () => {
    const entry = SETTINGS_SECTIONS.find((s) => s.to === '/settings/products')
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Products')
  })

  // landr-e8jf — Schedule moved from main sidebar into Settings (Calendar
  // now carries the capacity pills via landr-3uai; Schedule is a setup
  // tool for availability windows, not a daily-ops surface).
  it('includes a Schedule entry at /settings/schedule', () => {
    const entry = SETTINGS_SECTIONS.find((s) => s.to === '/settings/schedule')
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Schedule')
  })

  // landr-yp8x — Branding section drives the embedded booking widget's
  // logo + primary colour.
  it('includes a Branding entry at /settings/branding', () => {
    const entry = SETTINGS_SECTIONS.find((s) => s.to === '/settings/branding')
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Branding')
  })

  it('has no duplicate routes', () => {
    const tos = SETTINGS_SECTIONS.map((s) => s.to)
    expect(new Set(tos).size).toBe(tos.length)
  })
})

// landr-fzcg — split Account out of Settings. Both groups share
// /settings/* URLs but are surfaced as two distinct top-level sidebar
// items; groupForPath() drives which sub-sidebar list renders.
describe('ACCOUNT_SECTIONS (landr-fzcg)', () => {
  // landr-6ybs — Calendar feed joined ACCOUNT between Gmail and Plan
  // (per-operator subscribable ICS feed; sits next to Gmail because
  // both are personal third-party integrations).
  // landr-wwhn.16 — Notifications added after Plan (personal notification
  // preferences: bell/email/push + per-ticket overrides).
  // landr-1nwu.2 — Payments & invoicing joined ACCOUNT between Calendar feed
  // and Plan (per-operator Stripe + Holded credentials; another personal
  // third-party integration the operator wires up once).
  it('contains exactly company/connected/gmail/calendar/payments/plan/notifications in that order', () => {
    expect(ACCOUNT_SECTIONS.map((s) => s.to)).toEqual([
      '/settings/company',
      '/settings/connected-accounts',
      '/settings/integrations/gmail',
      '/settings/integrations/calendar',
      '/settings/integrations/payments',
      '/settings/plan',
      '/settings/notifications',
    ])
  })

  // landr-1nwu.2 — pin the Payments & invoicing entry shape.
  it('includes a Payments & invoicing entry at /settings/integrations/payments', () => {
    const entry = ACCOUNT_SECTIONS.find(
      (s) => s.to === '/settings/integrations/payments',
    )
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Payments & invoicing')
  })

  it('includes a Calendar feed entry at /settings/integrations/calendar', () => {
    const entry = ACCOUNT_SECTIONS.find(
      (s) => s.to === '/settings/integrations/calendar',
    )
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Calendar feed')
  })

  it('has no duplicate routes', () => {
    const tos = ACCOUNT_SECTIONS.map((s) => s.to)
    expect(new Set(tos).size).toBe(tos.length)
  })
})

describe('account/settings grouping (landr-fzcg)', () => {
  // landr-e8jf — Schedule joined the SETTINGS group between Products and
  // Email templates (was a top-level sidebar item; capacity pills on the
  // main Calendar via landr-3uai turned Schedule into a setup tool).
  // landr-yp8x — Branding joined the SETTINGS group next to Display
  // preferences (logo + primary colour shown in the embedded widget).
  // landr-iz58 — Tags joined the SETTINGS group below Pricing (operator-
  // scoped labels for bookings + contacts).
  // landr-qg4q — Email log joined the SETTINGS group between Email
  // templates and Pricing (outbound_emails viewer for operator debug).
  // landr-9n0l — Commissions joined the SETTINGS group between Pricing
  // and Tags (commission scheme editor + agent-earnings report).
  // landr-1tqx — Service roles joined the SETTINGS group below Tags
  // (operator-scoped participant role catalogue read by the booking widget).
  // landr-sp4r — Campaigns joined the SETTINGS group below Service roles
  // (operator-scoped marketing campaigns for booking attribution).
  // landr-v198 — Vouchers joined the SETTINGS group below Commissions
  // (operator promo-code editor; feeds the pricing engine).
  // landr-funh — Providers joined the SETTINGS group below Team
  // (operational delivery roster + per-booking-day assignment picker).
  // landr-up1b — Categories + Embed joined the SETTINGS group right after
  // Products (nested category tree editor + booking-widget embed generator).
  // landr-znzz.7 — Weather (opt-in forecast hint) added after Branding.
  it('settings group contains the twenty-two program subsections', () => {
    expect(SETTINGS_SECTIONS.map((s) => s.to)).toEqual([
      '/settings/calendar-display',
      '/settings/display-preferences',
      '/settings/branding',
      // landr-znzz.7 — weather forecast hint opt-in (sits next to Branding).
      '/settings/weather',
      '/settings/team',
      // landr-funh — Settings → Providers: operational delivery roster.
      '/settings/providers',
      '/settings/pickup-locations',
      '/settings/products',
      // landr-up1b — nested category tree editor + booking-widget embed
      // generator, grouped right after Products.
      '/settings/categories',
      '/settings/embed',
      // landr-znzz.5 — generic per-operator offers/upsells for the event page.
      '/settings/offers',
      '/settings/schedule',
      '/settings/email-templates',
      '/settings/email-log',
      '/settings/pricing',
      '/settings/commissions',
      '/settings/vouchers',
      '/settings/tags',
      // landr-1tqx — Settings → Service roles: operator-scoped participant
      // role catalogue (Pilot/Passenger/Diver…) read by the booking widget.
      '/settings/service-roles',
      // landr-sp4r — Settings → Campaigns: operator-scoped marketing
      // campaigns for booking attribution (bookings.campaign_id).
      '/settings/campaigns',
      // landr-r87i — Settings → Operations: operator-customisable
      // default per-booking checklist items (v2 of landr-84n1).
      '/settings/operations',
      // landr-ah9u — Settings → Webhooks: operator-managed event
      // subscriptions (v1 localStorage; v2 server-delivered).
      '/settings/webhooks',
    ])
  })

  // landr-r87i — pin the Operations entry shape.
  it('includes an Operations entry at /settings/operations', () => {
    const entry = SETTINGS_SECTIONS.find(
      (s) => s.to === '/settings/operations',
    )
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Operations')
  })

  // landr-qg4q — pin the Email log entry shape.
  it('includes an Email log entry at /settings/email-log', () => {
    const entry = SETTINGS_SECTIONS.find((s) => s.to === '/settings/email-log')
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Email log')
  })

  // landr-ah9u — pin the Webhooks entry shape.
  it('includes a Webhooks entry at /settings/webhooks', () => {
    const entry = SETTINGS_SECTIONS.find((s) => s.to === '/settings/webhooks')
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Webhooks')
  })

  it('account + settings are disjoint', () => {
    const a = new Set(ACCOUNT_SECTIONS.map((s) => s.to))
    for (const section of SETTINGS_SECTIONS) {
      expect(a.has(section.to)).toBe(false)
    }
  })
})

describe('groupForPath() (landr-fzcg)', () => {
  it('routes account-group leaf URLs to "account"', () => {
    for (const section of ACCOUNT_SECTIONS) {
      expect(groupForPath(section.to)).toBe('account')
    }
  })

  it('routes account-group deeper URLs to "account"', () => {
    expect(groupForPath('/settings/integrations/gmail/oauth-callback')).toBe(
      'account',
    )
    expect(groupForPath('/settings/connected-accounts/google')).toBe('account')
  })

  it('routes settings-group leaf URLs to "settings"', () => {
    for (const section of SETTINGS_SECTIONS) {
      expect(groupForPath(section.to)).toBe('settings')
    }
  })

  it('defaults to "settings" for unknown paths', () => {
    expect(groupForPath('/somewhere/else')).toBe('settings')
    expect(groupForPath('/settings')).toBe('settings')
    expect(groupForPath('/')).toBe('settings')
  })
})

describe('landingPathFor() (landr-fzcg)', () => {
  it('returns the first ACCOUNT section for the account group', () => {
    expect(landingPathFor('account')).toBe(ACCOUNT_SECTIONS[0].to)
  })

  it('returns the first SETTINGS section for the settings group', () => {
    expect(landingPathFor('settings')).toBe(SETTINGS_SECTIONS[0].to)
  })
})
