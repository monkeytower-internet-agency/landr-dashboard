/**
 * LANDR booking-widget shortcode grammar (landr-up1b / landr-il9f.3).
 *
 * Single source of truth for the `[landr_booking …]` shortcode string the
 * WP plugin (wp-plugin/landr-booking/landr-booking.php in the
 * landr-booking-widget repo) parses. Keep this in lockstep with the
 * plugin's `shortcode_atts` keys:
 *
 *   [landr_booking token="<widget_token>" group="courses" product="open-water"
 *                  height="800" src="https://bw.landr.de/"]
 *
 * - `token` (required) — the operator's opaque widget_token (NOT the slug).
 *   Resolves the operator on the widget side via `?w=<token>`. Rotatable
 *   without changing the slug. (landr-il9f: slug-based enumeration removed.)
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
import { supabase } from '@/lib/supabase'

/**
 * landr-il9f.3 — fetch the opaque widget_token for an operator.
 *
 * Owners and staff can read their own operators row via RLS. Returns the
 * token string, or null if the row / column is missing.
 *
 * Use with @tanstack/react-query:
 *   queryKey: ['operator-widget-token', operatorId]
 *   queryFn:  () => fetchWidgetToken(operatorId)
 */
export async function fetchWidgetToken(
  operatorId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('operators')
    .select('widget_token')
    .eq('id', operatorId)
    .maybeSingle()
  if (error || !data) return null
  return (data as { widget_token?: string | null }).widget_token ?? null
}

/**
 * landr-7zc5.2 — fetch the opaque widget_preview_token for an operator.
 *
 * Distinct from widget_token: this token is ONLY used for dashboard previews
 * (shows drafts); it is never embedded in live widgets. Owners and staff can
 * read their own operators row via RLS.
 *
 * Use with @tanstack/react-query:
 *   queryKey: ['operator-widget-preview-token', operatorId]
 *   queryFn:  () => fetchWidgetPreviewToken(operatorId)
 */
export async function fetchWidgetPreviewToken(
  operatorId: string,
): Promise<string | null> {
  const { data, error } = await supabase
    .from('operators')
    .select('widget_preview_token')
    .eq('id', operatorId)
    .maybeSingle()
  if (error || !data) return null
  return (data as { widget_preview_token?: string | null }).widget_preview_token ?? null
}

export type ShortcodeParams = {
  /** Operator widget token — required. Opaque, rotatable; NOT the slug. */
  token: string
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
 * attributes that are set; `token` is always present. Order matches the
 * plugin's documented form: token, group, product, height, src.
 */
export function buildShortcode(params: ShortcodeParams): string {
  const parts: string[] = [attr('token', params.token.trim())]

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
