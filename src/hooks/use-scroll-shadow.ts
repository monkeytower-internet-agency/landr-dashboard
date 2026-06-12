import { useCallback, useEffect, useRef, useState } from 'react'

export type ScrollShadowState = {
  showTop: boolean
  showBottom: boolean
}

/**
 * Watches a scroll container and returns boolean flags indicating whether
 * there is more content above (showTop) or below (showBottom) the visible area.
 *
 * Usage:
 *   const { ref, showTop, showBottom } = useScrollShadow<HTMLDivElement>()
 *   <div ref={ref} className="overflow-y-auto">…</div>
 *   {showTop && <div className="shadow-top-fade" />}
 *   {showBottom && <div className="shadow-bottom-fade" />}
 *
 * - Both flags are false when the container is not scrollable in that direction.
 * - A ResizeObserver watches the element so resizing (or content changes that
 *   alter scrollHeight) re-evaluates the flags without needing a scroll event.
 */
export function useScrollShadow<T extends HTMLElement>() {
  const ref = useRef<T>(null)
  const [state, setState] = useState<ScrollShadowState>({
    showTop: false,
    showBottom: false,
  })

  const evaluate = useCallback(() => {
    const el = ref.current
    if (!el) return
    const { scrollTop, scrollHeight, clientHeight } = el
    // 2px tolerance avoids phantom shadows from sub-pixel rounding
    const showTop = scrollTop > 2
    const showBottom = scrollHeight - scrollTop - clientHeight > 2
    setState((prev) => {
      if (prev.showTop === showTop && prev.showBottom === showBottom) return prev
      return { showTop, showBottom }
    })
  }, [])

  useEffect(() => {
    const el = ref.current
    if (!el) return

    // Initial evaluation
    evaluate()

    // Re-evaluate on scroll
    el.addEventListener('scroll', evaluate, { passive: true })

    // Re-evaluate when the element or its content is resized
    const ro = new ResizeObserver(evaluate)
    ro.observe(el)

    return () => {
      el.removeEventListener('scroll', evaluate)
      ro.disconnect()
    }
  }, [evaluate])

  return { ref, ...state }
}
