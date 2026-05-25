// landr-2soj — persistent "Viewing as <Operator>" banner + SR announcer.
//
// Rendered at the shell level so it sits across EVERY protected page while a
// staff user is in view-as mode. It states the active operator, reminds the
// staff user they are still themselves (actions are attributed to them — the
// session never changes; this is a VISIBILITY mode, not impersonation), and
// offers a clear [Exit to staff view] button that clears the view-as flag and
// restores the full staff view.
//
// Accessibility: the visible banner is a role="status" region. A SEPARATE,
// always-mounted aria-live region announces BOTH the enter and the exit
// transition (the visible banner unmounts on exit, so it cannot announce its
// own disappearance — the persistent announcer covers that).
import { useState } from 'react'
import { EyeIcon, XIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useOperator } from '@/lib/operator'
import { t } from '@/lib/strings'

function operatorDisplay(name: string | null, slug: string): string {
  return name && name.trim().length > 0 ? name : slug
}

export function ViewAsBanner() {
  const { viewAsActive, viewAsOperator, exitViewAs } = useOperator()
  const { user } = useAuth()

  // SR-only live region for the EXIT announcement only. Entering view-as is
  // announced by the banner itself (it mounts as a role="status" region, so
  // its text is read on appearance). Exiting unmounts the banner — a polite
  // live region does NOT announce content removal — so we set this message
  // imperatively in the exit click handler (an event handler, which the React
  // Compiler permits setState in, unlike a render/effect body).
  const [exitMessage, setExitMessage] = useState('')

  function handleExit() {
    setExitMessage(t.operator.viewAs.exitedAnnouncement)
    exitViewAs()
  }

  const opName = viewAsOperator
    ? operatorDisplay(viewAsOperator.name, viewAsOperator.slug)
    : ''
  const email = user?.email ?? ''

  return (
    <>
      <span className="sr-only" aria-live="polite">
        {viewAsActive ? '' : exitMessage}
      </span>
      {viewAsActive && viewAsOperator ? (
        <div
          role="status"
          aria-label={t.operator.viewAs.bannerRegionLabel}
          className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b border-amber-300/60 bg-amber-50 px-4 py-2 text-sm text-amber-900 sm:px-6 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-200"
        >
          <EyeIcon className="size-4 shrink-0" aria-hidden />
          <span className="min-w-0">
            {t.operator.viewAs.bannerPrefix}
            <strong className="font-semibold">{opName}</strong>
            {t.operator.viewAs.bannerMiddle}
            <strong className="font-semibold">{email}</strong>
            {t.operator.viewAs.bannerSuffix}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExit}
            className="ml-auto h-7 gap-1 border-amber-400/70 bg-amber-100/60 text-amber-900 hover:bg-amber-100 dark:border-amber-500/40 dark:bg-amber-900/40 dark:text-amber-100 dark:hover:bg-amber-900/60"
          >
            <XIcon className="size-3.5" aria-hidden />
            {t.operator.viewAs.exit}
          </Button>
        </div>
      ) : null}
    </>
  )
}
