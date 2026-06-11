// Shared password input with show/hide eye toggle.
//
// Extracts the repeated `div.relative > Input + toggle-button` pattern from
// Login, ResetPassword, and SecuritySettings (4 call sites). The show/hide
// state is managed by the _caller_ so sibling fields (e.g. confirm password)
// can reflect the same visibility toggle without prop-drilling a setter.

import * as React from 'react'
import { Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'

export type PasswordInputProps = Omit<
  React.ComponentProps<'input'>,
  'type'
> & {
  /** Controlled: is the password currently visible? */
  show: boolean
  /** Called when the user clicks the eye toggle button. */
  onToggleShow: () => void
}

/**
 * A password `<input>` with an eye-icon show/hide toggle overlaid on the right.
 *
 * The `show` + `onToggleShow` props keep the visibility state in the parent so
 * multiple inputs in the same form (e.g. new + confirm) share one toggle.
 *
 * All other props are forwarded to the underlying `<Input>`. The wrapper `div`
 * is the positioning context for the toggle button.
 */
export function PasswordInput({
  show,
  onToggleShow,
  disabled,
  className,
  ...props
}: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        disabled={disabled}
        className={cn('pr-10', className)}
        {...props}
      />
      <button
        type="button"
        aria-label={show ? 'Hide password' : 'Show password'}
        onClick={onToggleShow}
        disabled={disabled}
        className="absolute inset-y-0 right-0 flex cursor-pointer items-center px-3 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed"
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}
