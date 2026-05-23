/**
 * LANDR booking-widget shortcode grammar (landr-up1b).
 *
 * Single source of truth for the `[landr_booking …]` shortcode string the
 * WP plugin (wp-plugin/landr-booking/landr-booking.php in the
 * landr-booking-widget repo) parses. Keep this in lockstep with the
 * plugin's `shortcode_atts` keys:
 *
 *   [landr_booking operator="para42" group="courses" product="open-water"
 *                  height="800" src="https://bw.landr.de/"]
 *
 * - `operator` (required) — the operator slug.
 * - `group` (optional) — a product_groups slug. Scopes the embed to that
 *   category AND all of its nested sub-categories (the API resolves the
 *   subtree server-side). Mutually exclusive with `product` in normal use.
 * - `product` (optional) — a single product slug; deep-links to it.
 * - `height` (optional) — iframe pixel height. Omitted when blank/default.
 * - `src` (optional) — override widget origin (preview deploys). Omitted
 *   when blank.
 *
 * Attributes are emitted double-quoted so values containing nothing exotic
 * still copy/paste cleanly into the WordPress block/classic editor, which
 * is the documented form in the plugin's settings page.
 */

export type ShortcodeParams = {
  /** Operator slug — required. */
  operator: string
  /** Category (product_groups) slug — scopes to node + descendants. */
  group?: string | null
  /** Single product slug — deep-link. */
  product?: string | null
  /** Iframe height in px. Omitted when null/blank or non-positive. */
  height?: number | string | null
  /** Widget origin override. Omitted when null/blank. */
  src?: string | null
}

function attr(key: string, value: string): string {
  return `${key}="${value}"`
}

/**
 * Build the `[landr_booking …]` shortcode string. Only includes the
 * attributes that are set; `operator` is always present. Order matches the
 * plugin's documented form: operator, group, product, height, src.
 */
export function buildShortcode(params: ShortcodeParams): string {
  const parts: string[] = [attr('operator', params.operator.trim())]

  const group = (params.group ?? '').toString().trim()
  if (group) parts.push(attr('group', group))

  const product = (params.product ?? '').toString().trim()
  if (product) parts.push(attr('product', product))

  if (params.height !== null && params.height !== undefined) {
    const h =
      typeof params.height === 'number'
        ? params.height
        : parseInt(params.height.toString().trim(), 10)
    if (Number.isFinite(h) && h > 0) parts.push(attr('height', String(h)))
  }

  const src = (params.src ?? '').toString().trim()
  if (src) parts.push(attr('src', src.replace(/\/+$/, '')))

  return `[landr_booking ${parts.join(' ')}]`
}
