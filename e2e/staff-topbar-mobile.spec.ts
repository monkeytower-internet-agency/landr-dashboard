import { expect, test } from '@playwright/test'
import { loginAsStaff } from './staffLogin'

/**
 * landr-t0do — Flow 3: staff-persona topbar @ 360x800, the durable
 * regression net for landr-fd5m.2 (measured priority-overflow).
 *
 * The staff persona (AppModeSwitcher + TierBadge + WidgetButton on top of
 * the ordinary operator cluster) is the widest topbar the app renders —
 * it's the case that used to clip on a 360px phone before fd5m.2. This
 * spec asserts the two invariants the fix promises, and nothing else:
 *
 *   1. Every VISIBLE topbar-item-* fits inside the 360px viewport
 *      (box.x + box.width <= 360) and the page never gains horizontal
 *      scroll.
 *   2. Every topbar-item-* the fold hook decided to HIDE is still reachable
 *      — it shows up in the topbar-more-menu, whose own trigger also fits.
 *
 * Resist adding more viewports/personas/breakpoints here — this is a
 * regression net for one fix, not a responsive-design test suite.
 */

const TOPBAR_ITEM_IDS = [
  'tier',
  'widget',
  'report',
  'errorbell',
  'notifbell',
  'theme',
  'usermenu',
] as const

const VIEWPORT_WIDTH = 360

test('staff topbar @ 360x800: visible items fit, folded items reach the more-menu', async ({
  page,
}) => {
  await page.setViewportSize({ width: VIEWPORT_WIDTH, height: 800 })
  await loginAsStaff(page)
  await expect(page.getByTestId('dashboard-grid')).toBeVisible({ timeout: 15_000 })
  // Let the ResizeObserver-driven fold measurement settle (mount + fold-settle
  // passes are sync per the hook's docs, but async entitlement/token-driven
  // item widths — e.g. WidgetButton — can still shift the fold set once more).
  await page.waitForTimeout(500)

  const foldedIds: string[] = []

  for (const id of TOPBAR_ITEM_IDS) {
    const item = page.getByTestId(`topbar-item-${id}`)
    if ((await item.count()) === 0) {
      // Not rendered at all (feature/entitlement off for this persona) —
      // nothing to assert.
      continue
    }
    if (await item.isVisible()) {
      const box = await item.boundingBox()
      expect(box, `topbar-item-${id} is visible but has no bounding box`).not.toBeNull()
      expect(
        box!.x + box!.width,
        `topbar-item-${id} overflows the ${VIEWPORT_WIDTH}px viewport (x=${box!.x}, width=${box!.width})`,
      ).toBeLessThanOrEqual(VIEWPORT_WIDTH)
    } else {
      foldedIds.push(id)
    }
  }

  // No horizontal scroll anywhere on the page — the overflow-x-guard's job.
  const hasHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth > document.documentElement.clientWidth,
  )
  expect(hasHorizontalScroll, 'page gained horizontal scroll at 360px').toBe(false)

  if (foldedIds.length === 0) {
    // Staff persona fit inline at 360px without folding anything — the ⋯
    // trigger renders null in that case (see use-topbar-overflow.ts), so
    // there's nothing further to assert.
    return
  }

  const moreTrigger = page.getByTestId('topbar-more-menu-trigger')
  await expect(moreTrigger).toBeVisible()
  const triggerBox = await moreTrigger.boundingBox()
  expect(triggerBox, 'more-menu trigger has no bounding box').not.toBeNull()
  expect(
    triggerBox!.x + triggerBox!.width,
    'more-menu trigger itself overflows the viewport',
  ).toBeLessThanOrEqual(VIEWPORT_WIDTH)

  await moreTrigger.click()
  const menuContent = page.getByTestId('topbar-more-menu-content')
  await expect(menuContent).toBeVisible()

  for (const id of foldedIds) {
    if (id === 'tier') {
      // Tier menu entries are keyed by target tier (topbar-more-menu-tier-<x>),
      // not a fixed id — assert at least one is present.
      await expect(
        menuContent.locator('[data-testid^="topbar-more-menu-tier-"]').first(),
      ).toBeVisible()
    } else if (id === 'widget' || id === 'report' || id === 'theme') {
      await expect(menuContent.getByTestId(`topbar-more-menu-${id}`)).toBeVisible()
    }
    // errorbell / notifbell / usermenu are NEVER folded (use-topbar-overflow's
    // NEVER_FOLD_IDS) — they can't land in `foldedIds`, nothing to check here.
  }
})
