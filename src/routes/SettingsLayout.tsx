import { Outlet } from 'react-router-dom'
import { SettingsSubSidebar } from '@/components/settings/SettingsSubSidebar'

// SettingsLayout wraps all /settings/* subsections. Left rail is the
// sub-sidebar (~200px), right pane is the active subsection via <Outlet />.
// Pattern from video-1: Notion / Vercel settings — a flat list of sections
// in the left rail, the active section's form in the right pane.
export function SettingsLayout() {
  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-2 py-4 md:flex-row md:gap-8 md:px-4">
      <SettingsSubSidebar />
      <div className="min-w-0 flex-1">
        <Outlet />
      </div>
    </div>
  )
}
