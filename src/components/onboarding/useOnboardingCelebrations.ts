/**
 * useOnboardingCelebrations — fires step micro-celebrations and the full
 * confetti burst on wizard finish.
 *
 * canvas-confetti is lazy-imported (dynamic import) only when a celebration
 * fires, never at module load time.  prefers-reduced-motion: confetti call
 * passes `disableForReducedMotion: true` so the library respects the setting;
 * the micro-pop is CSS-only and the global kill-switch in index.css handles it.
 *
 * Returns:
 *   - `justCompletedStep`: the step index whose checkmark should play its pop,
 *     reset to null after one tick so the animation key cycles correctly.
 *   - `triggerStepCelebration(stepIdx)`: call when advancing a step.
 *   - `triggerFinishConfetti()`: call on wizard completion (Step 9 shown).
 */

import { useCallback, useEffect, useRef, useState } from 'react'

// Comic Testival palette for confetti
const CONFETTI_COLORS = [
  '#E8702E', // sunset orange
  '#F7B32B', // golden yellow
  '#4A7BD0', // sky blue
  '#5DA53C', // meadow green
  '#D9486E', // magenta
  '#FFE9B8', // sun cream
]

export function useOnboardingCelebrations() {
  const [justCompletedStep, setJustCompletedStep] = useState<number | null>(null)
  const popTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Cancel the pending pop-reset timer on unmount so it never fires
  // setState after the component (and this hook) is gone.
  useEffect(() => {
    return () => {
      if (popTimerRef.current) clearTimeout(popTimerRef.current)
    }
  }, [])

  const triggerStepCelebration = useCallback((stepIdx: number) => {
    // Reset any pending pop so quick navigation doesn't stack animations.
    if (popTimerRef.current) clearTimeout(popTimerRef.current)

    setJustCompletedStep(stepIdx)
    // Reset after 600ms — long enough for the 0.35s pop-in to fully play.
    popTimerRef.current = setTimeout(() => {
      setJustCompletedStep(null)
    }, 600)
  }, [])

  const triggerFinishConfetti = useCallback(async () => {
    // Lazy-load canvas-confetti only when the finish fires.
    try {
      const mod = await import('canvas-confetti')
      const confetti = mod.default

      // Two bursts from the left and right for a full celebration feel.
      confetti({
        particleCount: 100,
        spread: 70,
        origin: { x: 0.3, y: 0.6 },
        colors: CONFETTI_COLORS,
        disableForReducedMotion: true,
      })

      setTimeout(() => {
        confetti({
          particleCount: 100,
          spread: 70,
          origin: { x: 0.7, y: 0.6 },
          colors: CONFETTI_COLORS,
          disableForReducedMotion: true,
        })
      }, 150)
    } catch {
      // canvas-confetti unavailable (e.g. jsdom test env) — silent no-op.
    }
  }, [])

  return { justCompletedStep, triggerStepCelebration, triggerFinishConfetti }
}
