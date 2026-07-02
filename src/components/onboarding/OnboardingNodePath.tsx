/**
 * OnboardingNodePath — Duolingo-style node progress path for the 9-step
 * onboarding wizard.
 *
 * Each step is rendered as a connected circle node:
 *   - Completed: filled in the bookings section hue with a checkmark, plays
 *     a pop-in animation on first completion (keyed by step index).
 *   - Current: highlighted ring with a pulse, shows the step number.
 *   - Future: muted / faded, shows the step number.
 *
 * The connecting lines between nodes fill progressively.
 *
 * All animations use the C0 motion utilities (animate-pop-in, animate-wiggle).
 * The prefers-reduced-motion global kill-switch in index.css handles disabling.
 */

import type { CSSProperties } from 'react'

const STEP_ICONS: string[] = [
  '👋', // 1 Welcome
  '🏢', // 2 Company
  '📍', // 3 Address
  '🚐', // 4 Pickup
  '🎯', // 5 Products
  '📧', // 6 Gmail
  '✉️', // 7 Emails
  '🔌', // 8 Embed
  '🎉', // 9 Done
]

interface NodePathProps {
  step: number
  total: number
  /** Step indices (1-based) that just completed — used to key the pop-in. */
  justCompletedStep?: number | null
}

export function OnboardingNodePath({ step, total, justCompletedStep }: NodePathProps) {
  if (import.meta.env.DEV && STEP_ICONS.length !== total) {
    // STEP_ICONS is a fixed 9-entry list keyed by step index; if `total`
    // diverges (e.g. a step is added/removed from the wizard) the lookup
    // below would silently render nothing for the missing steps instead of
    // failing loudly — surface the mismatch in dev.
    console.warn(
      `OnboardingNodePath: STEP_ICONS has ${STEP_ICONS.length} entries but total=${total} — icons and step count have diverged.`,
    )
  }

  return (
    <nav
      aria-label="Onboarding progress"
      className="w-full overflow-x-auto pb-1"
    >
      <ol
        className="flex items-center gap-0 min-w-0"
        style={{ '--total': total } as CSSProperties}
      >
        {Array.from({ length: total }, (_, i) => {
          const idx = i + 1
          const isCompleted = idx < step
          const isCurrent = idx === step
          const justCompleted = justCompletedStep === idx

          return (
            <li key={idx} className="flex items-center flex-1 min-w-0">
              {/* Node */}
              <div className="flex flex-col items-center gap-0.5 flex-shrink-0">
                <div
                  key={justCompleted ? `done-${idx}` : `node-${idx}`}
                  className={[
                    'relative flex items-center justify-center rounded-full transition-all duration-300',
                    'w-8 h-8 text-xs font-bold select-none',
                    // Completed: vivid bookings hue fill
                    isCompleted
                      ? [
                          'bg-[--hue-bookings-vivid] text-[--hue-bookings-on-color]',
                          'shadow-[0_0_0_3px_var(--hue-bookings-soft-bg)]',
                          justCompleted ? 'animate-pop-in' : '',
                        ].join(' ')
                      : isCurrent
                        ? [
                            'bg-primary text-primary-foreground',
                            'shadow-[0_0_0_3px_color-mix(in_oklch,var(--primary)_20%,transparent)]',
                            'scale-110',
                          ].join(' ')
                        : 'bg-muted text-muted-foreground opacity-50',
                  ].join(' ')}
                  aria-current={isCurrent ? 'step' : undefined}
                  title={`Step ${idx}`}
                >
                  {isCompleted ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 16 16"
                      fill="none"
                      aria-hidden="true"
                      className={justCompleted ? 'animate-pop-in' : ''}
                    >
                      <path
                        d="M3 8L6.5 11.5L13 4.5"
                        stroke="currentColor"
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  ) : (
                    <span>{idx}</span>
                  )}
                </div>
                {/* Step icon — shown only for current node */}
                {isCurrent && (
                  <span
                    className="text-[10px] leading-none animate-slide-up-fade"
                    aria-hidden="true"
                  >
                    {STEP_ICONS[i] ?? ''}
                  </span>
                )}
              </div>

              {/* Connector line (not after last node) */}
              {idx < total && (
                <div
                  className="flex-1 h-1 mx-0.5 rounded-full overflow-hidden bg-muted min-w-[4px]"
                  aria-hidden="true"
                >
                  <div
                    className={[
                      'h-full rounded-full transition-all duration-500',
                      isCompleted
                        ? 'w-full bg-[--hue-bookings-vivid]'
                        : 'w-0',
                    ].join(' ')}
                  />
                </div>
              )}
            </li>
          )
        })}
      </ol>
    </nav>
  )
}
