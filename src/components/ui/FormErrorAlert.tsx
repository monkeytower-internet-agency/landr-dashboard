// Shared inline form-error alert banner.
//
// Extracts the repeated destructive-banner pattern from Login (3 sites),
// ResetPassword (1 site), and SecuritySettings (2 sites). Renders nothing
// when `message` is falsy so callers can write:
//
//   <FormErrorAlert message={error} />
//
// instead of the repeated conditional wrapper.

import { cn } from '@/lib/utils'

export interface FormErrorAlertProps {
  /** The error message to display. Renders nothing when falsy. */
  message: string | null | undefined
  /** Extra classes — use to add margins, e.g. `className="mb-4"`. */
  className?: string
}

/**
 * Inline form-error banner with `role="alert"`.
 *
 * Renders nothing when `message` is falsy, so you can drop it unconditionally
 * in the form and let `message` control visibility.
 */
export function FormErrorAlert({ message, className }: FormErrorAlertProps) {
  if (!message) return null
  return (
    <div
      role="alert"
      className={cn(
        'rounded-md border border-destructive/50 bg-destructive/10 px-3 py-2 text-destructive text-sm',
        className,
      )}
    >
      {message}
    </div>
  )
}
