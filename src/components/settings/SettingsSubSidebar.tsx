import { NavLink } from 'react-router-dom'
import { cn } from '@/lib/utils'
import { t } from '@/lib/strings'
import { SETTINGS_SECTIONS } from './sections'

export function SettingsSubSidebar() {
  return (
    <nav
      aria-label={t.settingsHub.navLabel}
      className="w-full shrink-0 md:w-56"
    >
      <ul className="flex flex-col gap-0.5">
        {SETTINGS_SECTIONS.map((section) => {
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
