import {
  BuildingIcon,
  CalendarClockIcon,
  CreditCardIcon,
  LinkIcon,
  MailIcon,
  MapPinIcon,
  MonitorIcon,
  PackageIcon,
  PlugIcon,
  TagIcon,
  UsersIcon,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { t } from '@/lib/strings'

export type SettingsSubSection = {
  to: string
  label: string
  icon: LucideIcon
}

// Flat list (no nesting) per landr-wjd Step 4. Order matches the briefing
// + the parent ticket's subsection enumeration so the sub-sidebar reads
// the same as the Beads design notes.
export const SETTINGS_SECTIONS: SettingsSubSection[] = [
  {
    to: '/settings/company',
    label: t.settingsHub.sections.company,
    icon: BuildingIcon,
  },
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
    to: '/settings/email-templates',
    label: t.settingsHub.sections.emailTemplates,
    icon: MailIcon,
  },
  {
    to: '/settings/integrations/gmail',
    label: t.settingsHub.sections.integrationsGmail,
    icon: PlugIcon,
  },
  {
    to: '/settings/connected-accounts',
    label: t.settingsHub.sections.connectedAccounts,
    icon: LinkIcon,
  },
  {
    to: '/settings/pricing',
    label: t.settingsHub.sections.pricing,
    icon: TagIcon,
  },
  {
    to: '/settings/plan',
    label: t.settingsHub.sections.plan,
    icon: CreditCardIcon,
  },
]
