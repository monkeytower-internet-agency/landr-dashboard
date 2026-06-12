/**
 * Tests for useScrollShadow — the scroll-affordance primitive.
 *
 * Strategy: render a real component that wires up the hook so the useEffect
 * attaches its scroll listener to the actual DOM element. We then mutate
 * the scroll properties on the element and fire a synthetic scroll event
 * to drive the evaluate() function, then assert on the data-visible
 * attributes that the component writes to the overlay divs.
 */
import { render, screen, act } from '@testing-library/react'
import { describe, it, expect } from 'vitest'

import { useScrollShadow } from './use-scroll-shadow'

// Tiny test component: mounts the hook on a real div and exposes the
// shadow-overlay elements via data-scroll-shadow attributes.
function ScrollShadowHarness({
  scrollTop = 0,
  scrollHeight = 100,
  clientHeight = 100,
}: {
  scrollTop?: number
  scrollHeight?: number
  clientHeight?: number
}) {
  const { ref, showTop, showBottom } = useScrollShadow<HTMLDivElement>()
  return (
    <div>
      <div
        ref={ref}
        data-testid="scroll-container"
        data-scroll-top={scrollTop}
        data-scroll-height={scrollHeight}
        data-client-height={clientHeight}
        style={{ height: clientHeight, overflowY: 'auto' }}
      />
      <div
        data-testid="shadow-top"
        data-visible={String(showTop)}
      />
      <div
        data-testid="shadow-bottom"
        data-visible={String(showBottom)}
      />
    </div>
  )
}

/** Applies mock scroll dimensions to a container element and fires a scroll event. */
function simulateScroll(
  container: HTMLElement,
  opts: { scrollTop: number; scrollHeight: number; clientHeight: number },
) {
  Object.defineProperty(container, 'scrollTop', {
    configurable: true,
    writable: true,
    value: opts.scrollTop,
  })
  Object.defineProperty(container, 'scrollHeight', {
    configurable: true,
    writable: true,
    value: opts.scrollHeight,
  })
  Object.defineProperty(container, 'clientHeight', {
    configurable: true,
    writable: true,
    value: opts.clientHeight,
  })
  act(() => {
    container.dispatchEvent(new Event('scroll', { bubbles: false }))
  })
}

describe('useScrollShadow', () => {
  it('both shadows are hidden when content fits (no overflow)', () => {
    render(<ScrollShadowHarness scrollHeight={100} clientHeight={100} />)
    const container = screen.getByTestId('scroll-container')
    simulateScroll(container, { scrollTop: 0, scrollHeight: 100, clientHeight: 100 })

    expect(screen.getByTestId('shadow-top').dataset.visible).toBe('false')
    expect(screen.getByTestId('shadow-bottom').dataset.visible).toBe('false')
  })

  it('only bottom shadow shows at scrollTop=0 when content overflows', () => {
    render(<ScrollShadowHarness />)
    const container = screen.getByTestId('scroll-container')
    simulateScroll(container, { scrollTop: 0, scrollHeight: 300, clientHeight: 100 })

    expect(screen.getByTestId('shadow-top').dataset.visible).toBe('false')
    expect(screen.getByTestId('shadow-bottom').dataset.visible).toBe('true')
  })

  it('only top shadow shows when scrolled to the very bottom', () => {
    render(<ScrollShadowHarness />)
    const container = screen.getByTestId('scroll-container')
    simulateScroll(container, { scrollTop: 200, scrollHeight: 300, clientHeight: 100 })

    expect(screen.getByTestId('shadow-top').dataset.visible).toBe('true')
    expect(screen.getByTestId('shadow-bottom').dataset.visible).toBe('false')
  })

  it('both shadows show when scrolled to the middle', () => {
    render(<ScrollShadowHarness />)
    const container = screen.getByTestId('scroll-container')
    simulateScroll(container, { scrollTop: 100, scrollHeight: 300, clientHeight: 100 })

    expect(screen.getByTestId('shadow-top').dataset.visible).toBe('true')
    expect(screen.getByTestId('shadow-bottom').dataset.visible).toBe('true')
  })

  it('top shadow suppressed within the 2px sub-pixel tolerance (scrollTop=1)', () => {
    render(<ScrollShadowHarness />)
    const container = screen.getByTestId('scroll-container')
    simulateScroll(container, { scrollTop: 1, scrollHeight: 300, clientHeight: 100 })

    expect(screen.getByTestId('shadow-top').dataset.visible).toBe('false')
    // Content still extends below → bottom shadow is active
    expect(screen.getByTestId('shadow-bottom').dataset.visible).toBe('true')
  })

  it('bottom shadow suppressed within the 2px sub-pixel tolerance (1px remaining)', () => {
    render(<ScrollShadowHarness />)
    const container = screen.getByTestId('scroll-container')
    // scrollHeight - scrollTop - clientHeight = 1 → within tolerance
    simulateScroll(container, { scrollTop: 199, scrollHeight: 300, clientHeight: 100 })

    expect(screen.getByTestId('shadow-bottom').dataset.visible).toBe('false')
    // Well past the top → top shadow is active
    expect(screen.getByTestId('shadow-top').dataset.visible).toBe('true')
  })
})
