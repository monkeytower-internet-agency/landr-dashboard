import { Outlet } from 'react-router-dom'
import { SettingsSubSidebar } from '@/components/settings/SettingsSubSidebar'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

// SettingsLayout wraps all /settings/* subsections. Left rail is the
// sub-sidebar (~200px), right pane is the active subsection via <Outlet />.
// Pattern from video-1: Notion / Vercel settings — a flat list of sections
// in the left rail, the active section's form in the right pane.
//
// landr-fx2i — fallback "Settings" title for the topbar. Each sub-
// section (CompanySettings, PlanSettings, Products with selection, etc.)
// renders its own <PageTitle crumbs={['Settings', section]} /> which
// mounts after this one in the React tree, overriding the topbar. This
// fallback covers /settings (pre-redirect) and any sub-route that
// hasn't been wired with its own title yet.
//
// landr-hxnb.7 — comic pass: the outer wrapper picks up the settings
// section hue (slate/cool, hue 230) as a subtle soft-bg tint strip at
// the top of the layout, and the nav + content area sit on the warm
// cream page bg. The sub-sidebar gets a gentle settings-hue left border
// on desktop so the two-pane layout reads as one themed region.
export function SettingsLayout() {
  return (
    // landr-3qkr.4 — layout is column-first on mobile, row on md+.
    // overflow-x-guard prevents the horizontal chip strip and any wide
    // section content from escaping the viewport (clip, not hidden, so
    // sticky descendants still work).
    // landr-hxnb.7 — settings-hue soft-bg strip at the very top of the
    // layout gives the section its comic identity without heavy decoration.
    <div className="mx-auto flex w-full max-w-7xl flex-col overflow-x-guard">
      {/* Comic accent stripe — settings hue (slate/cool) */}
      <div
        className="h-1 w-full rounded-t-lg"
        style={{ background: 'var(--hue-settings-vivid)' }}
        aria-hidden="true"
      />
      <div className="flex flex-col gap-4 px-2 py-4 md:flex-row md:gap-8 md:px-4">
        <PageTitle title={t.app.settings} />
        <SettingsSubSidebar />
        <div className="min-w-0 flex-1">
          <Outlet />
        </div>
      </div>
    </div>
  )
}
