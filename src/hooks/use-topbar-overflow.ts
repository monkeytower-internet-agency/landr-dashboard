// landr-fd5m.2 — measured priority-overflow for the dashboard topbar.
//
// WHY (see epic landr-fd5m): the staff topbar's right cluster is ~300px wider
// than an ordinary operator's (AppModeSwitcher + TierBadge + WidgetButton), so
// on phones the rightmost icons silently clip under the SidebarInset's
// `overflow-x: clip` guard. Static breakpoints can't solve it — the budget
// varies ~300px by persona/locale/feature-flags — so we MEASURE the available
// width and fold the lowest-priority items into the ⋯ TopbarMoreMenu only when
// they genuinely don't fit.
//
// FOLD ORDER: theme → widget → tier → report (theme folds first; report folds
// LAST — it is on the user's must-stay list). NEVER folded: ErrorHistoryBell,
// NotificationsBell (each owns a Radix DropdownMenu — nesting two Radix menus
// via portal is unreliable), UserMenu, AppModeSwitcher, OperatorSwitcher.
//
// FAIL-SAFE: unmeasured / zero widths fold NOTHING (jsdom or a ResizeObserver
// quirk ⇒ exactly today's behaviour). The `<=` comparison in computeFolded is
// what makes an all-zero-width measurement collapse to an EMPTY folded set.
//
// STABILITY: folded items stay MOUNTED but `hidden`, so their last-visible
// width is cached and drives the unfold decision. Because computeFolded reads
// CACHED widths (not the live post-fold width, which is 0), folding an item
// never changes the inputs that decided to fold it — the recompute is
// oscillation-free by construction. A ~16px unfold hysteresis absorbs the
// remaining sub-pixel jitter in the measured available width.

import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefCallback,
} from 'react'

/** The four topbar utilities that may fold into the ⋯ menu, in priority. */
export type TopbarFoldable = 'theme' | 'widget' | 'tier' | 'report'

/**
 * Fold order — index 0 folds FIRST, last index folds LAST. `report` is last
 * because it is on the user's must-stay list (fold it only when nothing else
 * can be given up).
 */
export const TOPBAR_FOLD_ORDER: TopbarFoldable[] = [
  'theme',
  'widget',
  'tier',
  'report',
]

// Never-fold cluster items we still MEASURE so the cluster's occupied width is
// computed uniformly. AppModeSwitcher / OperatorSwitcher are NOT listed: they
// sit LEFT of the flex-1 title, so their width is already absorbed into the
// title's left offset (titleRect.left − headerRect.left) below.
const NEVER_FOLD_IDS = ['errorbell', 'notifbell', 'usermenu'] as const

// Width the ⋯ trigger occupies once anything folds. It is a fixed `size-9`
// ghost icon button (36px), so a constant is exact — measuring it is
// unnecessary (and a persistent measuring wrapper would add a stray flex gap on
// desktop, where nothing folds, breaking the pixel-identical requirement). The
// trigger renders null while nothing is folded, so this width only ever enters
// the budget once a fold has already been decided.
const MORE_TRIGGER_FALLBACK = 36

// Extra headroom (px) required to UNFOLD an already-folded item. Folding is
// eager (fold the instant it doesn't fit → never clip); unfolding is reluctant
// (needs this much slack → no flicker at the boundary from RO sub-pixel jitter).
const UNFOLD_HYSTERESIS = 16

export type ComputeFoldedArgs = {
  /** Width available to the right cluster (header width − title left offset −
   *  padding-right − the title↔cluster gap). */
  availableForCluster: number
  /** Measured width of each foldable's wrapper. null/0 ⇒ not rendered (e.g.
   *  WidgetButton gated off, no deploy tier set) ⇒ skipped, never folded. */
  itemWidths: Record<TopbarFoldable, number | null>
  /** Widths of the always-visible measured items (bells, user menu). */
  neverFoldWidths: number[]
  /** Intra-cluster gap (px) between adjacent visible items. */
  gap: number
  /** Width (px) the ⋯ trigger occupies once anything is folded. */
  moreTriggerWidth: number
  /** Fold order (index 0 folds first). */
  order: TopbarFoldable[]
}

/**
 * PURE greedy priority-fold. Folds the smallest possible PREFIX of `order`
 * (lowest-priority items first) such that the never-fold items, the kept
 * foldables, the ⋯ trigger (only when something folds) and the inter-item gaps
 * all fit within `availableForCluster`.
 *
 * Items with null/0 width are treated as not-rendered: they are skipped and can
 * never appear in the returned set. With every width 0 (jsdom / pre-measure)
 * the total is 0, `0 <= availableForCluster` holds, and the folded set is empty
 * — the documented fail-safe (today's behaviour).
 */
export function computeFolded({
  availableForCluster,
  itemWidths,
  neverFoldWidths,
  gap,
  moreTriggerWidth,
  order,
}: ComputeFoldedArgs): Set<TopbarFoldable> {
  // Only rendered foldables (positive measured width) can participate.
  const rendered = order.filter((id) => {
    const w = itemWidths[id]
    return w != null && w > 0
  })
  const neverFold = neverFoldWidths.filter((w) => w > 0)
  const neverSum = neverFold.reduce((a, b) => a + b, 0)

  // Try folding a growing prefix; return the first (smallest) prefix that fits.
  for (let foldCount = 0; foldCount <= rendered.length; foldCount++) {
    const kept = rendered.slice(foldCount)
    const keptSum = kept.reduce((a, id) => a + (itemWidths[id] as number), 0)
    const anyFolded = foldCount > 0
    const visibleCount = neverFold.length + kept.length + (anyFolded ? 1 : 0)
    const gaps = gap * Math.max(0, visibleCount - 1)
    const total = neverSum + keptSum + (anyFolded ? moreTriggerWidth : 0) + gaps
    if (total <= availableForCluster) {
      return new Set(rendered.slice(0, foldCount))
    }
  }
  // Even folding everything doesn't fit (never-fold items alone overflow, or a
  // sub-360 viewport below the documented floor): fold all rendered foldables.
  return new Set(rendered)
}

function sameSet(a: ReadonlySet<TopbarFoldable>, b: ReadonlySet<TopbarFoldable>): boolean {
  if (a.size !== b.size) return false
  for (const v of a) if (!b.has(v)) return false
  return true
}

function readGap(el: Element): number {
  const cs = getComputedStyle(el)
  return parseFloat(cs.columnGap || cs.gap || '0') || 0
}

export type UseTopbarOverflow = {
  /** Attach to the topbar <header>. */
  headerRef: RefCallback<HTMLElement>
  /** Attach to the `min-w-0 flex-1` title wrapper (the pivot that absorbs slack). */
  titleRef: RefCallback<HTMLDivElement>
  /** Ref callback factory for each measured cluster wrapper (foldables +
   *  never-fold items + the ⋯ trigger under id 'more'). */
  registerItem: (id: string) => RefCallback<HTMLElement>
  /** The currently-folded foldables. */
  folded: Set<TopbarFoldable>
}

/**
 * Measured priority-overflow hook for the topbar right cluster. See file header
 * for the design. Returns refs to wire onto the header/title/items plus the
 * live folded set to drive `hidden` classes and the ⋯ menu contents.
 */
export function useTopbarOverflow(): UseTopbarOverflow {
  const headerElRef = useRef<HTMLElement | null>(null)
  const titleElRef = useRef<HTMLElement | null>(null)
  const elements = useRef<Map<string, HTMLElement>>(new Map())
  const widthCache = useRef<Map<string, number>>(new Map())
  const foldedRef = useRef<Set<TopbarFoldable>>(new Set())
  const [folded, setFolded] = useState<Set<TopbarFoldable>>(() => new Set())

  const measure = useCallback(() => {
    const header = headerElRef.current
    const title = titleElRef.current
    if (!header || !title) return

    // 1. Refresh cached widths from the currently-VISIBLE wrappers. A hidden
    //    (folded) wrapper reports offsetWidth 0 — we skip it so its last
    //    visible width survives to drive the unfold decision. A wrapper whose
    //    child rendered null (gated-off widget, unset tier) is also 0 ⇒ stays
    //    out of the cache ⇒ null in itemWidths ⇒ never folds.
    let clusterEl: HTMLElement | null = null
    for (const [id, el] of elements.current) {
      const w = el.offsetWidth
      if (w > 0) {
        widthCache.current.set(id, w)
        if (!clusterEl && id !== 'more') clusterEl = el.parentElement
      }
    }

    // 2. Geometry. titleRect.left is stable regardless of the title's own width
    //    (it is left-aligned after the left cluster), so folding — which only
    //    changes the cluster/title split — never moves it. That is what makes
    //    `available` invariant under folding.
    const headerRect = header.getBoundingClientRect()
    const titleRect = title.getBoundingClientRect()
    const headerStyle = getComputedStyle(header)
    const paddingRight = parseFloat(headerStyle.paddingRight) || 0
    const headerGap = readGap(header)
    const clusterGap = clusterEl ? readGap(clusterEl) : headerGap
    const available =
      headerRect.width -
      (titleRect.left - headerRect.left) -
      paddingRight -
      headerGap

    // 3. Assemble pure-function inputs from the cache.
    const itemWidths = {} as Record<TopbarFoldable, number | null>
    for (const id of TOPBAR_FOLD_ORDER) {
      itemWidths[id] = widthCache.current.get(id) ?? null
    }
    const neverFoldWidths = NEVER_FOLD_IDS.map(
      (id) => widthCache.current.get(id) ?? 0,
    )
    const moreTriggerWidth =
      widthCache.current.get('more') ?? MORE_TRIGGER_FALLBACK

    // 4. Fold eagerly, unfold reluctantly. `reluctant` (16px less room) folds a
    //    superset of `eager`; an already-folded item unfolds only once it fits
    //    with that margin, while a kept item folds the instant it overflows.
    const shared = {
      itemWidths,
      neverFoldWidths,
      gap: clusterGap,
      moreTriggerWidth,
      order: TOPBAR_FOLD_ORDER,
    }
    const eager = computeFolded({ ...shared, availableForCluster: available })
    const reluctant = computeFolded({
      ...shared,
      availableForCluster: available - UNFOLD_HYSTERESIS,
    })
    const prev = foldedRef.current
    const next = new Set<TopbarFoldable>()
    for (const id of TOPBAR_FOLD_ORDER) {
      const shouldFold = prev.has(id) ? reluctant.has(id) : eager.has(id)
      if (shouldFold) next.add(id)
    }

    // 5. Commit only on real change (guards the render→layout-effect loop).
    if (!sameSet(prev, next)) {
      foldedRef.current = next
      setFolded(next)
    }
  }, [])

  const headerRef = useCallback<RefCallback<HTMLElement>>((el) => {
    headerElRef.current = el
  }, [])
  const titleRef = useCallback<RefCallback<HTMLDivElement>>((el) => {
    titleElRef.current = el
  }, [])

  const registerItem = useCallback(
    (id: string): RefCallback<HTMLElement> =>
      (el) => {
        if (el) elements.current.set(id, el)
        else elements.current.delete(id)
      },
    [],
  )

  // Recompute before paint on every render: covers mount, the fold→re-render
  // settle, and left-cluster changes (long operator name, view-as) that resize
  // no observed box but do re-render the shell. Idempotent (step 5 guards), so
  // it settles in at most two passes with no first-paint flash.
  useLayoutEffect(() => {
    measure()
  })

  // Catch viewport resize / rotation that fires no React re-render. rAF batches
  // RO bursts and dodges the "ResizeObserver loop limit exceeded" warning.
  useEffect(() => {
    const header = headerElRef.current
    if (!header || typeof ResizeObserver === 'undefined') return
    let raf = 0
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(() => measure())
    })
    ro.observe(header)
    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
    }
  }, [measure])

  return { headerRef, titleRef, registerItem, folded }
}
