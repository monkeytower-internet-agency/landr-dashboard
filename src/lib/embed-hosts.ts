/**
 * Widget host config map — landr-7zc5.4.
 *
 * Single source of truth for the three deployment environments.
 * Every place that builds a widget URL (EmbedSettings, shortcode,
 * tests) imports from here — no scattered string literals.
 */

export type EmbedEnv = 'development' | 'testing' | 'live'

/** Human-readable labels for the environment selector. */
export const EMBED_ENV_LABELS: Record<EmbedEnv, string> = {
  development: 'Development',
  testing: 'Testing',
  live: 'Live',
}

/**
 * Widget host for each environment (no trailing slash).
 * These are intentional constants, not runtime config — changing a
 * host means shipping a new dashboard build.
 */
export const EMBED_ENV_HOSTS: Record<EmbedEnv, string> = {
  development: 'bw-dev.landr.de',
  testing: 'bw-staging.landr.de',
  live: 'bw.landr.de',
}

/** Ordered list used to render the selector. */
export const EMBED_ENV_ORDER: EmbedEnv[] = ['development', 'testing', 'live']

/**
 * Build the full widget URL for the given env + widget token.
 * Optional group/product query params are included when set.
 */
export function buildWidgetUrl(
  env: EmbedEnv,
  token: string,
  opts: { group?: string | null; product?: string | null } = {},
): string {
  const host = EMBED_ENV_HOSTS[env]
  const qs = new URLSearchParams()
  if (token) qs.set('w', token)
  if (opts.group) qs.set('group', opts.group)
  if (opts.product) qs.set('product', opts.product)
  return `https://${host}/?${qs.toString()}`
}
