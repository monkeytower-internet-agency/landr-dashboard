import {
  BanknoteIcon,
  BedIcon,
  BellIcon,
  BuildingIcon,
  ClipboardListIcon,
  CalendarClockIcon,
  CalendarDaysIcon,
  CheckSquareIcon,
  CloudSunIcon,
  CodeIcon,
  LayoutGridIcon,
  CoinsIcon,
  CreditCardIcon,
  FolderTreeIcon,
  IdCardIcon,
  KeyRoundIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  MegaphoneIcon,
  MonitorIcon,
  PackageIcon,
  PaletteIcon,
  PlugIcon,
  SlidersHorizontalIcon,
  SmartphoneIcon,
  SparklesIcon,
  TagIcon,
  TagsIcon,
  TicketIcon,
  UsersIcon,
  UsersRoundIcon,
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
// Each group has its OWN URL namespace so the URL matches the nav:
// ACCOUNT_SECTIONS live under /account/*, SETTINGS_SECTIONS under
// /settings/*. Both render through the same SettingsLayout; groupForPath()
// maps a pathname back to its group for the sub-sidebar, and /account &
// /settings each redirect their index to the group's first entry. (Done
// pre-launch — landr — when there were no stored deep links to preserve.)
// See SettingsSubSidebar + AppSidebar for the path→group mapping.
export const ACCOUNT_SECTIONS: SettingsSubSection[] = [
  {
    to: '/account/company',
    label: t.settingsHub.sections.company,
    icon: BuildingIcon,
  },
  {
    to: '/account/connected-accounts',
    label: t.settingsHub.sections.connectedAccounts,
    icon: LinkIcon,
  },
  // landr — change-password surface. Sits next to Connected accounts because
  // both manage how the operator authenticates into the dashboard.
  {
    to: '/account/security',
    label: t.settingsHub.sections.security,
    icon: KeyRoundIcon,
  },
  {
    to: '/account/integrations/gmail',
    label: t.settingsHub.sections.integrationsGmail,
    icon: PlugIcon,
  },
  // landr-6ybs — per-operator subscribable ICS calendar feed. Sits in
  // the ACCOUNT group next to Gmail because both are personal third-
  // party integrations the operator wires up once.
  {
    to: '/account/integrations/calendar',
    label: t.settingsHub.sections.integrationsCalendar,
    icon: CalendarDaysIcon,
  },
  // landr-1nwu.2 — per-operator Stripe (test+live) + Holded (demo+live)
  // payment/ERP credentials. Sits with the other personal third-party
  // integrations (Gmail, Calendar feed) the operator wires up once.
  {
    to: '/account/integrations/payments',
    label: t.settingsHub.sections.integrationsPayments,
    icon: BanknoteIcon,
  },
  {
    to: '/account/plan',
    label: t.settingsHub.sections.plan,
    icon: CreditCardIcon,
  },
  // landr-wwhn.16 — personal notification preferences (bell/email/push).
  // Lives in Account (personal scope) not Settings (operator scope).
  {
    to: '/account/notifications',
    label: t.settingsHub.sections.notifications,
    icon: BellIcon,
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
  // landr-jb1k — Booking widget presentation (showcased variant + category
  // grid columns). Sits next to Branding because both configure how the
  // embedded booking widget looks; Branding owns colours/logo/copy, this
  // owns layout/density.
  {
    to: '/settings/widget',
    label: t.settingsHub.sections.widget,
    icon: LayoutGridIcon,
  },
  // landr-znzz.7 — optional weather forecast hint for conditions pre-fill.
  // Sits next to Branding because both are "how this operator's surfaces
  // behave" toggles rather than primary domain objects (products/team/etc).
  {
    to: '/settings/weather',
    label: t.settingsHub.sections.weather,
    icon: CloudSunIcon,
  },
  {
    to: '/settings/team',
    label: t.settingsHub.sections.team,
    icon: UsersIcon,
  },
  // landr-funh — delivery roster (instructors, pilots, drivers). Sits next
  // to Team because both manage "people", but Providers is the operational
  // delivery roster while Team is dashboard sign-in (operator_memberships).
  {
    to: '/settings/providers',
    label: t.settingsHub.sections.providers,
    icon: UsersRoundIcon,
  },
  {
    to: '/settings/pickup-locations',
    label: t.settingsHub.sections.pickupLocations,
    icon: MapPinIcon,
  },
  // landr-cyoi — Hotels as a first-class settings entity (separate from
  // generic pickup locations; required address/email/phone + maps link). Sits
  // directly after Pickup locations because a hotel is also a pickup point.
  {
    to: '/settings/hotels',
    label: t.settingsHub.sections.hotels,
    icon: BedIcon,
  },
  {
    to: '/settings/products',
    label: t.settingsHub.sections.products,
    icon: PackageIcon,
  },
  // landr-up1b — nested category tree editor for product_groups. Sits
  // right after Products: operators bucket products into categories here.
  {
    to: '/settings/categories',
    label: t.settingsHub.sections.categories,
    icon: FolderTreeIcon,
  },
  // landr-up1b — booking-widget embed / shortcode generator. Grouped with
  // Products + Categories because the generator picks an operator/category/
  // product the operator just configured above.
  {
    to: '/settings/embed',
    label: t.settingsHub.sections.embed,
    icon: CodeIcon,
  },
  // landr-71kz.5 — operator form library (custom booking forms). Sits after
  // Embed code because both are "what the widget uses" config surfaces.
  {
    to: '/settings/forms',
    label: t.settingsHub.sections.forms,
    icon: ClipboardListIcon,
  },
  // landr-znzz.5 — generic per-operator offers/upsells shown in the AFTER
  // phase of the customer event page. Each offer links out to the operator's
  // own shop/merch/form via cta_url. No defaults, nothing vendor-specific.
  {
    to: '/settings/offers',
    label: t.settingsHub.sections.offers,
    icon: SparklesIcon,
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
  // (Email log moved out of Settings → standalone /email-log admin route.)
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
  // landr-v198 — operator-scoped vouchers / promo codes. Sits next to
  // Pricing because vouchers feed the pricing engine as discount rules.
  {
    to: '/settings/vouchers',
    label: t.settingsHub.sections.vouchers,
    icon: TicketIcon,
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
  // landr-atwy — post-booking account-link prompt opt-in. Sits after Webhooks
  // because both are per-operator "plumbing" toggles rather than primary
  // domain-object config surfaces.
  {
    to: '/settings/account-link',
    label: t.settingsHub.sections.accountLink,
    icon: SmartphoneIcon,
  },
]

// landr-sbhz.5 — STAFF-ONLY settings sections. Landr platform tooling, NOT
// operator-scoped config. The sub-sidebar appends these to the SETTINGS group
// ONLY for is_landr_staff users (the filter lives in SettingsSubSidebar). Kept
// in a separate list so SETTINGS_SECTIONS stays a stable operator-facing
// contract (its order is pinned by sections.test.ts) and so non-staff never
// even iterate over staff entries. These sections are deliberately NOT in the
// feature-entitlement registry (like /audit) — they gate on is_landr_staff,
// not on tenant tier.
export const STAFF_SECTIONS: SettingsSubSection[] = [
  {
    to: '/settings/tiers',
    label: t.settingsHub.sections.tiers,
    icon: SlidersHorizontalIcon,
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
  // (e.g. /account/integrations/gmail/oauth-callback).
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
