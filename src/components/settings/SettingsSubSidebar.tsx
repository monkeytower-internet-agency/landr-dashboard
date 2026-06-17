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
    // landr-hxnb.7 — comic pass: the nav label uses font-display (Space
    // Grotesk) and the active pill adopts the settings section hue
    // (slate/cool, hue 230) instead of the generic brand orange, so the
    // nav reads as belonging to the settings zone. Inactive items keep the
    // soft warm-cream hover for legibility.
    <nav aria-label={navLabel} className="w-full shrink-0 md:w-56">
      {/*
       * landr-3qkr.4 — Mobile (<md): horizontally scrollable chip strip so
       * the long section list never causes page overflow. Each chip keeps the
       * same active-pill language (bg-primary, font-medium) that desktop uses.
       *
       * Desktop (md+): vertical pill list, same as before.
       *
       * landr-hxnb.7 — on desktop, a left border in the settings hue gives
       * the vertical rail a subtle comic identity cue.
       */}
      <ul className="flex gap-1 overflow-x-auto pb-1 md:flex-col md:gap-0.5 md:overflow-x-visible md:pb-0">
        {sections.map((section) => {
          const Icon = section.icon
          return (
            <li key={section.to} className="shrink-0 md:shrink">
              <NavLink
                to={section.to}
                className={({ isActive }) =>
                  cn(
                    // landr-ar44 — settings section nav: soft hover tint for
                    // inactive rows, a filled section-hue pill for the active
                    // section so it reads as the current location.
                    // landr-hxnb.7 — active pill uses settings vivid hue
                    // (--hue-settings-vivid) instead of generic --primary so
                    // the nav matches the settings comic identity.
                    'flex items-center gap-2 rounded-md px-2.5 py-1.5 text-sm transition-colors font-display',
                    'text-muted-foreground hover:bg-accent hover:text-foreground',
                    isActive &&
                      'font-medium shadow-s hover:text-hue-settings-on-color',
                  )
                }
                style={({ isActive }) =>
                  isActive
                    ? {
                        background: 'var(--hue-settings-vivid)',
                        color: 'var(--hue-settings-on-color)',
                      }
                    : {}
                }
              >
                <Icon className="size-4 shrink-0" aria-hidden="true" />
                <span className="whitespace-nowrap">{section.label}</span>
              </NavLink>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
