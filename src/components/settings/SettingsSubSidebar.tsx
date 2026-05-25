import { NavLink, useLocation } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { useEntitlements } from '@/lib/entitlements'
import { featureForSection } from '@/lib/entitlements-map'
import {
  ACCOUNT_SECTIONS,
  SETTINGS_SECTIONS,
  STAFF_SECTIONS,
  groupForPath,
  type SettingsSubSection,
} from './sections'

// landr-fzcg — sub-sidebar now renders one of two section lists based on
// whether the current URL belongs to the Account group (company, gmail,
// connected accounts, plan) or the Settings group (everything else).
// Both groups share the same /settings/* URL prefix; the split is purely
// a sidebar IA grouping decision.
export function SettingsSubSidebar() {
  const { pathname } = useLocation()
  const { isEnabled, effectiveIsStaff } = useEntitlements()
  const group = groupForPath(pathname)
  // landr-sbhz.5 — append the STAFF_SECTIONS (Tiers & features) to the bottom
  // of the SETTINGS group, but only for Landr staff. Non-staff never see the
  // entry; the route + RLS enforce it server-side regardless.
  // landr-2soj — gate on EFFECTIVE staff so Settings → Tiers is hidden while a
  // staff user is viewing as a (non-staff) operator.
  const baseSettings: ReadonlyArray<SettingsSubSection> = effectiveIsStaff
    ? [...SETTINGS_SECTIONS, ...STAFF_SECTIONS]
    : SETTINGS_SECTIONS
  const allSections: ReadonlyArray<SettingsSubSection> =
    group === 'account' ? ACCOUNT_SECTIONS : baseSettings
  // landr-sbhz.6 — hide settings sub-sections whose gating feature is DISABLED
  // for the current operator. Sections without a gating feature
  // (calendar-display, display-preferences, connected-accounts, notifications,
  // offers, service-roles, operations) have featureForSection() === null and
  // are always shown. Staff bypass lives inside isEnabled.
  const sections = allSections.filter((section) => {
    const feature = featureForSection(section.to)
    return feature === null || isEnabled(feature)
  })
  const navLabel =
    group === 'account' ? t.accountHub.navLabel : t.settingsHub.navLabel
  return (
    <nav aria-label={navLabel} className="w-full shrink-0 md:w-56">
      <ul className="flex flex-col gap-0.5">
        {sections.map((section) => {
          const Icon = section.icon
          return (
            <li key={section.to}>
              <NavLink
                to={section.to}
                className={({ isActive }) =>
                  cn(
                    // Structural only — visual polish (active pill, hover
                    // bg) is tuned by sibling worker landr-z7t via theme
                    // tokens + the shadcn primitives we re-use elsewhere.
                    'flex items-center gap-2 rounded-md px-2 py-1.5 text-sm',
                    'text-muted-foreground hover:bg-accent hover:text-foreground',
                    isActive && 'bg-accent font-medium text-foreground',
                  )
                }
              >
                <Icon className="size-4" aria-hidden="true" />
                <span>{section.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
