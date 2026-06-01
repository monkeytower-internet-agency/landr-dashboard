// landr — shared on/off Switch.
//
// Why this exists: the dashboard hand-rolled `<button role="switch">` toggles in
// several places (Settings → Notifications channel toggles, TicketDetailSheet
// per-channel overrides + internal-note toggle). The Notifications toggle styled
// its track with `hsl(var(--input))` — INVALID in this theme: our CSS variables
// are oklch *values*, not HSL triplets, so `hsl(oklch(...))` produced an invalid
// colour and the track rendered transparent (invisible in both light and dark).
// The others used `bg-input` correctly but the off-state was very low contrast.
//
// This consolidates the markup onto one high-contrast switch: a bordered track
// (so the pill is always visible) + a ringed thumb (so the knob reads against
// any track), with `bg-primary` for ON. The thumb uses `bg-background` so it
// contrasts in BOTH themes — primary is near-black in light and near-white in
// dark, and a fixed-colour thumb would blend on one of them.
//
// Presentational + controlled: pass `checked`; wire behaviour through normal
// button props (`onClick`, `disabled`, `data-testid`, `id`, `aria-label`). The
// component owns only role/aria-checked and the visual state, so it drops into
// the existing call sites without changing their handlers.

import * as React from 'react'

import { cn } from '@/lib/utils'

type SwitchSize = 'sm' | 'default'

const TRACK_SIZE: Record<SwitchSize, string> = {
  sm: 'h-4 w-7',
  default: 'h-5 w-9',
}
const THUMB_SIZE: Record<SwitchSize, string> = {
  sm: 'size-3',
  default: 'size-4',
}
const THUMB_ON: Record<SwitchSize, string> = {
  sm: 'translate-x-3.5',
  default: 'translate-x-4.5',
}

export type SwitchProps = Omit<
  React.ComponentProps<'button'>,
  'role' | 'aria-checked' | 'children'
> & {
  checked: boolean
  size?: SwitchSize
  /** Extra classes for the TRACK — e.g. to override the checked colour. */
  className?: string
}

export function Switch({
  checked,
  size = 'default',
  className,
  type = 'button',
  ...props
}: SwitchProps) {
  return (
    <button
      type={type}
      role="switch"
      aria-checked={checked}
      data-state={checked ? 'checked' : 'unchecked'}
      className={cn(
        'inline-flex shrink-0 cursor-pointer items-center rounded-full border transition-colors',
        'focus-visible:ring-ring focus-visible:ring-offset-background focus-visible:ring-2 focus-visible:ring-offset-1 focus-visible:outline-none',
        'disabled:cursor-not-allowed disabled:opacity-50',
        TRACK_SIZE[size],
        checked
          ? 'bg-primary border-primary'
          : 'bg-muted border-border dark:bg-input dark:border-white/25',
        className,
      )}
      {...props}
    >
      <span
        className={cn(
          'bg-background pointer-events-none block rounded-full shadow-sm ring-1 ring-black/10 transition-transform dark:ring-white/25',
          THUMB_SIZE[size],
          checked ? THUMB_ON[size] : 'translate-x-0.5',
        )}
      />
    </button>
  )
}
