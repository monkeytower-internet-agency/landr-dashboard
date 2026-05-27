// landr-a8fg — shareable deep-link button used by BookingDetailSheet,
// CustomerDetailSheet and ViewPage headers. Copies window.location.origin +
// a caller-supplied path to navigator.clipboard. A success toast confirms
// the copy; an error toast surfaces clipboard failures (Safari private mode,
// insecure context, etc.) so the operator gets explicit feedback either way.
//
// Tooltip strategy: native `title` attribute. The radix Tooltip primitive
// requires a TooltipProvider in the React tree; the detail sheets render
// outside the AppSidebar's provider in tests (and in any future surface
// that doesn't include the sidebar), so a native title keeps the button
// dependency-free and matches the existing pattern used by other inline
// buttons in the sheet headers.
import { LinkIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { t } from '@/lib/strings'

type Props = {
  /**
   * Path (with leading slash) to append to window.location.origin. Examples:
   *   /bookings?open=<bookingId>
   *   /contacts?open=<contactId>
   *   /views/<viewId>
   */
  path: string
  /**
   * Optional aria-label override. Defaults to the shared "Copy link to this"
   * copy so screen readers announce the same wording as the visible tooltip.
   */
  ariaLabel?: string
  /**
   * Optional test id so callers can target the per-surface instance in tests.
   */
  testId?: string
  className?: string
}

export function CopyLinkButton({ path, ariaLabel, testId, className }: Props) {
  const label = ariaLabel ?? t.copyLink.tooltip
  async function handleClick() {
    const url = window.location.origin + path
    try {
      await navigator.clipboard.writeText(url)
      toast.success(t.copyLink.toastSuccess)
    } catch {
      toast.error(t.copyLink.toastError)
    }
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="ghost"
      onClick={handleClick}
      aria-label={label}
      title={label}
      data-testid={testId}
      className={className ?? 'h-7 px-2'}
    >
      <LinkIcon className="size-3.5" aria-hidden="true" />
    </Button>
  )
}
