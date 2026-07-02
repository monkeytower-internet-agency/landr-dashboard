// landr-fd5m.2 — measured topbar priority-overflow.
//
// Two layers under test:
//   1. computeFolded — the PURE greedy fold. Fixtures encode the real width
//      budget: staff@360 folds all four, staff@390 folds theme+widget+tier and
//      keeps report, an ordinary operator@390 folds nothing, desktop folds
//      nothing, an all-zero (jsdom / pre-measure) measurement folds nothing
//      (the documented fail-safe), and a gated-off item (null width) can never
//      appear in the folded set.
//   2. useTopbarOverflow — the hook, driven by a CONTROLLABLE ResizeObserver
//      mock (src/test/setup.ts installs a global NOOP RO polyfill; we override
//      it here) plus getBoundingClientRect/offsetWidth stubs. We assert it
//      settles to the same folded set across two consecutive measure passes
//      (oscillation-free).

import { act, cleanup, render } from '@testing-library/react'
import { createElement, type ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  computeFolded,
  useTopbarOverflow,
  TOPBAR_FOLD_ORDER,
  type TopbarFoldable,
} from './use-topbar-overflow'

// ── width model shared by the computeFolded fixtures ─────────────────────────
// Never-fold cluster items (errorbell, notifbell, usermenu) and the ⋯ trigger.
const NEVER = [32, 32, 36] // = 100
const MORE = 36
// A staff right-cluster: theme + widget + tier(pill) + report.
const STAFF: Record<TopbarFoldable, number | null> = {
  theme: 36,
  widget: 40,
  tier: 64,
  report: 36,
}

function fold(
  available: number,
  itemWidths: Record<TopbarFoldable, number | null>,
  gap = 0,
): Set<TopbarFoldable> {
  return computeFolded({
    availableForCluster: available,
    itemWidths,
    neverFoldWidths: NEVER,
    gap,
    moreTriggerWidth: MORE,
    order: TOPBAR_FOLD_ORDER,
  })
}

describe('computeFolded (landr-fd5m.2)', () => {
  it('staff @360: the cluster cannot fit — folds all four foldables', () => {
    // no-fold cluster = 100(never) + 176(foldables) = 276; folding everything
    // costs 100 + 36(⋯) = 136. available 150 fits only the fold-all case.
    const folded = fold(150, STAFF)
    expect([...folded].sort()).toEqual(['report', 'theme', 'tier', 'widget'])
  })

  it('staff @390: folds theme+widget+tier but KEEPS report (must-stay)', () => {
    // fold theme,widget,tier → keep report: 100 + 36(report) + 36(⋯) = 172.
    // fold theme,widget → keep tier,report: 100 + 100 + 36 = 236. available 210
    // fits the first but not the second, so report survives.
    const folded = fold(210, STAFF)
    expect([...folded].sort()).toEqual(['theme', 'tier', 'widget'])
    expect(folded.has('report')).toBe(false)
  })

  it('ordinary operator @390 (widget gated off): everything fits — folds nothing', () => {
    // Operator has no staff booking widget → null width, and a narrower left
    // cluster (no mode switcher) leaves more room. rendered = theme+tier+report
    // = 136; +100 never = 236 <= 320 → empty.
    const operator: Record<TopbarFoldable, number | null> = {
      ...STAFF,
      widget: null,
    }
    expect(fold(320, operator).size).toBe(0)
  })

  it('desktop: acres of room — folds nothing', () => {
    expect(fold(900, STAFF).size).toBe(0)
  })

  it('all-zero widths (jsdom / pre-measure): folds NOTHING (fail-safe)', () => {
    const zero: Record<TopbarFoldable, number | null> = {
      theme: 0,
      widget: 0,
      tier: 0,
      report: 0,
    }
    const folded = computeFolded({
      availableForCluster: 0,
      itemWidths: zero,
      neverFoldWidths: [0, 0, 0],
      gap: 0,
      moreTriggerWidth: MORE,
      order: TOPBAR_FOLD_ORDER,
    })
    expect(folded.size).toBe(0)
  })

  it('gated-off items (null width) never enter the folded set, even when tight', () => {
    // widget gated off; squeeze hard so theme/tier/report all fold — widget
    // must still never appear.
    const gated: Record<TopbarFoldable, number | null> = {
      ...STAFF,
      widget: null,
    }
    const folded = fold(120, gated)
    expect(folded.has('widget')).toBe(false)
    for (const id of folded) expect(['theme', 'tier', 'report']).toContain(id)
  })

  it('gap widths are charged between visible items', () => {
    // With a generous gap the same available that fit at gap=0 no longer does.
    const tight = fold(280, STAFF, 0)
    expect(tight.size).toBe(0)
    const withGap = fold(280, STAFF, 8)
    expect(withGap.size).toBeGreaterThan(0)
  })
})

// ── hook: controllable ResizeObserver + geometry stubs ───────────────────────

// A CONTROLLABLE ResizeObserver mock that records WHICH elements each observer
// watches, so `resize(el)` can fire only the observers actually observing `el`.
// This is what lets the "RO fires on the SPAN" test discriminate the fix: if the
// hook only observed the header, resizing a wrapper span would fire nothing.
type ROCb = (entries: ResizeObserverEntry[], obs: ResizeObserver) => void
let observers: MockResizeObserver[] = []

class MockResizeObserver {
  cb: ROCb
  targets = new Set<Element>()
  constructor(cb: ROCb) {
    this.cb = cb
    observers.push(this)
  }
  observe(el: Element) {
    this.targets.add(el)
  }
  unobserve(el: Element) {
    this.targets.delete(el)
  }
  disconnect() {
    this.targets.clear()
  }
}

/** Fire a resize for one element — only observers watching it re-measure. */
function resize(el: Element) {
  act(() => {
    for (const o of observers) {
      if (o.targets.has(el)) {
        o.cb([{ target: el } as unknown as ResizeObserverEntry], o as unknown as ResizeObserver)
      }
    }
  })
}

function stubRect(el: Element, rect: Partial<DOMRect>) {
  Object.defineProperty(el, 'getBoundingClientRect', {
    configurable: true,
    value: () => ({
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...rect,
    }),
  })
}

function stubWidth(el: Element, width: number) {
  Object.defineProperty(el, 'offsetWidth', {
    configurable: true,
    value: width,
  })
}

// Minimal harness that wires the hook the way AppShell does: a <header>, a
// title pivot, and one measured span per cluster item, exposing the live folded
// set as a data attribute so the test can read it out of the DOM.
function Harness(): ReactElement {
  const { headerRef, titleRef, registerItem, folded } = useTopbarOverflow()
  return createElement(
    'header',
    { ref: headerRef, 'data-testid': 'hdr' },
    createElement('div', { ref: titleRef, 'data-testid': 'title' }, 'title'),
    createElement(
      'div',
      { 'data-testid': 'cluster' },
      createElement('span', {
        ref: registerItem('tier'),
        'data-testid': 'w-tier',
      }),
      createElement('span', {
        ref: registerItem('widget'),
        'data-testid': 'w-widget',
      }),
      createElement('span', {
        ref: registerItem('report'),
        'data-testid': 'w-report',
      }),
      createElement('span', {
        ref: registerItem('errorbell'),
        'data-testid': 'w-errorbell',
      }),
      createElement('span', {
        ref: registerItem('notifbell'),
        'data-testid': 'w-notifbell',
      }),
      createElement('span', {
        ref: registerItem('theme'),
        'data-testid': 'w-theme',
      }),
      createElement('span', {
        ref: registerItem('usermenu'),
        'data-testid': 'w-usermenu',
      }),
    ),
    createElement(
      'div',
      {
        'data-testid': 'folded',
        'data-folded': [...folded].sort().join(','),
      },
      [...folded].sort().join(','),
    ),
  )
}

describe('useTopbarOverflow (landr-fd5m.2)', () => {
  let container: HTMLElement

  beforeEach(() => {
    observers = []
    vi.stubGlobal('ResizeObserver', MockResizeObserver)
    // Flush the hook's rAF batching synchronously.
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0)
      return 1
    })
    vi.stubGlobal('cancelAnimationFrame', () => {})
  })

  afterEach(() => {
    cleanup()
    vi.unstubAllGlobals()
  })

  function foldedFromDom(): string {
    return (
      container
        .querySelector('[data-testid="folded"]')
        ?.getAttribute('data-folded') ?? ''
    )
  }

  function applyStaffGeometry(available: number) {
    const hdr = container.querySelector('[data-testid="hdr"]')!
    const title = container.querySelector('[data-testid="title"]')!
    // available = headerWidth − (titleLeft − headerLeft) − paddingRight − gap.
    // No inline padding/gap ⇒ available = headerWidth − titleLeft.
    stubRect(hdr, { width: 360, left: 0 })
    stubRect(title, { left: 360 - available, width: 10 })
    const widths: Record<string, number> = {
      'w-theme': 36,
      'w-widget': 40,
      'w-tier': 64,
      'w-report': 36,
      'w-errorbell': 32,
      'w-notifbell': 32,
      'w-usermenu': 36,
    }
    for (const [tid, w] of Object.entries(widths)) {
      stubWidth(container.querySelector(`[data-testid="${tid}"]`)!, w)
    }
  }

  function el(tid: string): HTMLElement {
    return container.querySelector(`[data-testid="${tid}"]`) as HTMLElement
  }

  // A viewport/rotation tick: the header box changed. Fires the observer that
  // watches the header (always observed), standing in for the RO burst.
  function tickRO() {
    resize(el('hdr'))
  }

  it('folds nothing before anything is measured (jsdom all-zero fail-safe)', () => {
    container = render(createElement(Harness)).container
    // No geometry stubs applied ⇒ every width 0 ⇒ empty.
    expect(foldedFromDom()).toBe('')
  })

  it('at a 360-tight budget it folds all four and is STABLE across two passes', () => {
    container = render(createElement(Harness)).container
    applyStaffGeometry(150)

    tickRO()
    const afterFirst = foldedFromDom()
    expect(afterFirst).toBe('report,theme,tier,widget')

    // A second identical measure pass must not oscillate.
    tickRO()
    expect(foldedFromDom()).toBe(afterFirst)
  })

  it('at a roomier budget it folds only theme+widget+tier and keeps report', () => {
    container = render(createElement(Harness)).container
    applyStaffGeometry(210)

    tickRO()
    expect(foldedFromDom()).toBe('theme,tier,widget')

    tickRO()
    expect(foldedFromDom()).toBe('theme,tier,widget')
  })

  it('at a desktop budget it folds nothing', () => {
    container = render(createElement(Harness)).container
    applyStaffGeometry(900)

    tickRO()
    expect(foldedFromDom()).toBe('')
  })

  // ── the fix: async child width changes must re-measure ──────────────────────

  it('re-measures when a wrapper span grows 0→40 with NO parent re-render', () => {
    container = render(createElement(Harness)).container
    // Budget 250: with the widget still PENDING (span 0) the cluster fits inline
    // and nothing folds; once its token query settles (span → 40) it no longer
    // fits and the widget+theme must fold.
    applyStaffGeometry(250)
    stubWidth(el('w-widget'), 0)
    tickRO()
    expect(foldedFromDom()).toBe('')

    // The token settles: the WidgetButton renders, so its wrapper grows 0→40px
    // — but AppShell does NOT re-render, and the header box is unchanged. Only
    // the ResizeObserver watching that SPAN can notice. Fire it (NO re-render,
    // NO header tick) and assert measure re-ran and the fold set updated. Before
    // the fix the RO watched only the header, so this stayed ''.
    stubWidth(el('w-widget'), 40)
    resize(el('w-widget'))
    expect(foldedFromDom()).toBe('theme,widget')
  })

  it('evicts a stale cache entry when a visible wrapper drops to 0 (no phantom)', () => {
    container = render(createElement(Harness)).container
    // Budget 210: staff folds theme+tier+widget (report stays); the widget
    // wrapper is measured at 40 and CACHED.
    applyStaffGeometry(210)
    tickRO()
    expect(foldedFromDom()).toBe('theme,tier,widget')

    // Widget gated off on an operator/view-as switch: its wrapper stays VISIBLE
    // (no `hidden` class, no child) yet now measures 0. Its stale 40px MUST be
    // evicted so the fold decision matches a cluster that never had the widget —
    // its space is not reserved and it never appears in the fold set (⋯ would
    // otherwise show a dead entry). Before the fix the 40px resurrected.
    stubWidth(el('w-widget'), 0)
    resize(el('w-widget'))

    const withoutWidget = [...fold(210, { ...STAFF, widget: null })].sort().join(',')
    expect(foldedFromDom()).toBe(withoutWidget)
    expect(foldedFromDom().split(',')).not.toContain('widget')
  })
})
