import * as React from 'react'

import { cn } from '@/lib/utils'
import { useScrollShadow } from '@/hooks/use-scroll-shadow'

type ScrollShadowProps = React.ComponentProps<'div'> & {
  /**
   * Height of the fade gradients in pixels. Defaults to 20.
   * Keep small (12–24) for a subtle, on-brand look.
   */
  fadeHeight?: number
  /**
   * CSS color value for the fade overlay. Defaults to `var(--background)`.
   * For sidebar use, pass `"var(--sidebar)"` so the fade matches the sidebar
   * background in both light and dark themes.
   */
  fadeColor?: string
  /**
   * Extra className applied to the inner scrollable container div.
   * The outer wrapper is position:relative; the inner element gets
   * overflow-y:auto + scrollbar-gutter:stable.
   */
  innerClassName?: string
}

/**
 * ScrollShadow — reusable scroll-affordance wrapper.
 *
 * Renders its children inside a scrollable container and overlays
 * conditional top/bottom gradient fades that appear only when there
 * is content above/below the visible area.
 *
 * - Fade color uses `var(--background)` so it blends with both light
 *   and dark themes. For sidebar use pass `fadeColor="var(--sidebar)"`.
 * - ResizeObserver and scroll events keep the fades in sync with
 *   dynamic content changes.
 * - `scrollbar-gutter: stable` reserves space for the scrollbar so
 *   content doesn't jump when the scrollbar appears or disappears.
 *
 * @example
 * <ScrollShadow className="flex-1" innerClassName="px-2">
 *   <LongList />
 * </ScrollShadow>
 */
export function ScrollShadow({
  className,
  innerClassName,
  children,
  fadeHeight = 20,
  fadeColor,
  style,
  ...props
}: ScrollShadowProps) {
  const { ref, showTop, showBottom } = useScrollShadow<HTMLDivElement>()

  const resolvedFadeColor = fadeColor ?? 'var(--background)'

  return (
    <div
      data-slot="scroll-shadow"
      className={cn('relative min-h-0', className)}
      style={style}
      {...props}
    >
      {/* Top fade — appears when scrolled down */}
      <div
        aria-hidden
        data-scroll-shadow="top"
        data-visible={showTop}
        className={cn(
          'pointer-events-none absolute inset-x-0 top-0 z-10 transition-opacity duration-150',
          showTop ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          height: fadeHeight,
          background: `linear-gradient(to bottom, ${resolvedFadeColor}, transparent)`,
        }}
      />

      {/* Scrollable content */}
      <div
        ref={ref}
        className={cn(
          'h-full overflow-y-auto [scrollbar-gutter:stable]',
          innerClassName,
        )}
      >
        {children}
      </div>

      {/* Bottom fade — appears when there is content below */}
      <div
        aria-hidden
        data-scroll-shadow="bottom"
        data-visible={showBottom}
        className={cn(
          'pointer-events-none absolute inset-x-0 bottom-0 z-10 transition-opacity duration-150',
          showBottom ? 'opacity-100' : 'opacity-0',
        )}
        style={{
          height: fadeHeight,
          background: `linear-gradient(to top, ${resolvedFadeColor}, transparent)`,
        }}
      />
    </div>
  )
}
