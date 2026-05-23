import {
  BuildingIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CheckSquareIcon,
  CoinsIcon,
  CreditCardIcon,
  IdCardIcon,
  LinkIcon,
  MailIcon,
  MailOpenIcon,
  MapPinIcon,
  MegaphoneIcon,
  MonitorIcon,
  PackageIcon,
  PaletteIcon,
  PlugIcon,
  TagIcon,
  TagsIcon,
  UsersIcon,
  WebhookIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { t } from '@/lib/strings'

export type SettingsSubSection = {
  to: string
  label: string
  icon: LucideIcon
}

// landr-fzcg — Account vs Settings split. Account holds user/billing-
// scoped subsections (company, connected accounts + Gmail, plan).
// Settings holds program/operator-scoped subsections (calendar, display,
// team, locations, products, email templates, pricing).
//
// URL routes intentionally stay under /settings/* for both groups —
// keeps deep-link history valid and avoids a destructive route rename.
// The sidebar exposes /account as a virtual top-level item that lands
// the user on /settings/company (first ACCOUNT_SECTIONS entry) and the
// sub-sidebar then renders the ACCOUNT_SECTIONS list. See
// SettingsSubSidebar + AppSidebar for the path→group mapping.
export const ACCOUNT_SECTIONS: SettingsSubSection[] = [
  {
    to: '/settings/company',
    label: t.settingsHub.sections.company,
    icon: BuildingIcon,
  },
  {
    to: '/settings/connected-accounts',
    label: t.settingsHub.sections.connectedAccounts,
    icon: LinkIcon,
  },
  {
    to: '/settings/integrations/gmail',
    label: t.settingsHub.sections.integrationsGmail,
    icon: PlugIcon,
  },
  // landr-6ybs — per-operator subscribable ICS calendar feed. Sits in
  // the ACCOUNT group next to Gmail because both are personal third-
  // party integrations the operator wires up once.
  {
    to: '/settings/integrations/calendar',
    label: t.settingsHub.sections.integrationsCalendar,
    icon: CalendarDaysIcon,
  },
  {
    to: '/settings/plan',
    label: t.settingsHub.sections.plan,
    icon: CreditCardIcon,
  },
]

// landr-e8jf — Schedule joins the SETTINGS group below Products. It
// sits alongside other operator-config surfaces (calendar display,
// pickup locations, products) because, with the main Calendar showing
// capacity pills (landr-3uai), Schedule is now a setup/management tool
// for defining availability windows, not a daily-ops surface.
export const SETTINGS_SECTIONS: SettingsSubSection[] = [
  {
    to: '/settings/calendar-display',
    label: t.settingsHub.sections.calendarDisplay,
    icon: CalendarClockIcon,
  },
  {
    to: '/settings/display-preferences',
    label: t.settingsHub.sections.displayPreferences,
    icon: MonitorIcon,
  },
  // landr-yp8x — Branding sits next to Display preferences so the
  // operator can configure all 'how my surfaces look' settings in one
  // cluster.
  {
    to: '/settings/branding',
    label: t.settingsHub.sections.branding,
    icon: PaletteIcon,
  },
  {
    to: '/settings/team',
    label: t.settingsHub.sections.team,
    icon: UsersIcon,
  },
  {
    to: '/settings/pickup-locations',
    label: t.settingsHub.sections.pickupLocations,
    icon: MapPinIcon,
  },
  {
    to: '/settings/products',
    label: t.settingsHub.sections.products,
    icon: PackageIcon,
  },
  {
    to: '/settings/schedule',
    label: t.settingsHub.sections.schedule,
    icon: CalendarDaysIcon,
  },
  {
    to: '/settings/email-templates',
    label: t.settingsHub.sections.emailTemplates,
    icon: MailIcon,
  },
  // landr-qg4q — Email log sits right after Email templates so operators
  // who just edited a template can verify it shipped (or debug a failure)
  // without leaving the settings IA.
  {
    to: '/settings/email-log',
    label: t.settingsHub.sections.emailLog,
    icon: MailOpenIcon,
  },
  {
    to: '/settings/pricing',
    label: t.settingsHub.sections.pricing,
    icon: TagIcon,
  },
  // landr-9n0l — commission schemes + agent-earnings report. Sits next
  // to Pricing because both configure how booking value is split.
  {
    to: '/settings/commissions',
    label: t.settingsHub.sections.commissions,
    icon: CoinsIcon,
  },
  // landr-iz58 — operator-scoped tags (bookings + contacts).
  {
    to: '/settings/tags',
    label: t.settingsHub.sections.tags,
    icon: TagsIcon,
  },
  // landr-1tqx — operator-scoped participant service roles
  // (Pilot/Passenger/Diver…) the booking widget reads.
  {
    to: '/settings/service-roles',
    label: t.settingsHub.sections.serviceRoles,
    icon: IdCardIcon,
  },
  // landr-sp4r — operator-scoped marketing campaigns for booking
  // attribution (bookings.campaign_id). Sits next to Tags as the other
  // "slice + measure your bookings" config surface.
  {
    to: '/settings/campaigns',
    label: t.settingsHub.sections.campaigns,
    icon: MegaphoneIcon,
  },
  // landr-r87i — operator-customisable default per-booking checklist
  // (v2 of landr-84n1). Sits at the bottom of SETTINGS because it
  // configures a workflow detail rather than a primary domain object.
  {
    to: '/settings/operations',
    label: t.settingsHub.sections.operations,
    icon: CheckSquareIcon,
  },
  // landr-ah9u — operator webhook configuration. Sits below Operations
  // (the other 'workflow plumbing' entry) and at the very bottom of the
  // SETTINGS list because v1 is a stub — the surface exists but the
  // server-side delivery worker arrives in v2.
  {
    to: '/settings/webhooks',
    label: t.settingsHub.sections.webhooks,
    icon: WebhookIcon,
  },
]

// Set of all URL prefixes that belong to ACCOUNT — used by the sub-
// sidebar to decide which group's section list to render. Cheap O(1)
// lookup avoids dragging the full ACCOUNT_SECTIONS list into the layout.
const ACCOUNT_PATHS = new Set(ACCOUNT_SECTIONS.map((s) => s.to))

/**
 * Decide whether `pathname` belongs to the Account group or the Settings
 * group. Defaults to Settings for unknown paths — the Settings list is
 * the larger/safer default surface to render in that edge case.
 */
export function groupForPath(
  pathname: string,
): 'account' | 'settings' {
  // Exact match on a known account path, OR a deeper segment under it
  // (e.g. /settings/integrations/gmail/oauth-callback).
  for (const p of ACCOUNT_PATHS) {
    if (pathname === p || pathname.startsWith(`${p}/`)) return 'account'
  }
  return 'settings'
}

/**
 * Resolve the landing path for a top-level sidebar item. Used by
 * AppSidebar to know where to send the user when they click 'Account'
 * or 'Settings' (the first sub-section in each group).
 */
export function landingPathFor(group: 'account' | 'settings'): string {
  return group === 'account'
    ? ACCOUNT_SECTIONS[0].to
    : SETTINGS_SECTIONS[0].to
}
