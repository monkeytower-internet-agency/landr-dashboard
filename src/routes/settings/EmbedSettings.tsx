/**
 * Settings → Embed (landr-up1b / landr-il9f.3 / landr-7zc5.4).
 *
 * Booking-widget shortcode generator. The operator picks a mode (all
 * products / a category subtree / a single product), tunes optional
 * height + src overrides, and gets a live `[landr_booking …]` shortcode
 * (for the WordPress plugin) plus a raw <iframe> snippet (for any other
 * CMS), each with a Copy button.
 *
 * landr-il9f.3: The opaque widget_token (NOT the operator slug) is fetched
 * from the operators row and emitted as `token=` in the shortcode and
 * `?w=` in the iframe URL. This prevents operator enumeration by slug.
 *
 * landr-7zc5.4: Environment selector (Development / Testing / Live) swaps
 * the widget host via EMBED_ENV_HOSTS config map. Adds a raw URL output and
 * an "Open booking widget" button. The selector is env-agnostic to where the
 * operator is logged in — from the dev dashboard you can copy the Live embed.
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckIcon, CopyIcon, ExternalLinkIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  buildGroupTree,
  fetchProductGroupTree,
  flattenTree,
  type ProductGroup,
} from '@/lib/productGroups'
import { fetchProducts, type ProductRow } from '@/lib/products'
import { buildShortcode, fetchWidgetToken } from '@/lib/shortcode'
import {
  buildWidgetUrl,
  EMBED_ENV_HOSTS,
  EMBED_ENV_LABELS,
  EMBED_ENV_ORDER,
  type EmbedEnv,
} from '@/lib/embed-hosts'
import { useOperator } from '@/lib/operator'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'

type Mode = 'all' | 'category' | 'product'

export function EmbedSettings() {
  const { currentOperatorId } = useOperator()

  const titleNode = (
    <PageTitle
      crumbs={[
        { label: t.app.settings, to: '/settings' },
        { label: t.settingsHub.sections.embed },
      ]}
      subtitle={t.settingsHub.sectionDescriptions.embed}
    />
  )

  if (!currentOperatorId) {
    return (
      <div className="flex flex-col gap-6">
        {titleNode}
        <header>
          <h1 className="text-xl font-semibold">{t.embedSettings.title}</h1>
          <p className="text-muted-foreground text-sm">
            {t.embedSettings.subtitle}
          </p>
        </header>
        <p className="text-muted-foreground text-sm">
          {t.embedSettings.noOperator}
        </p>
      </div>
    )
  }

  return (
    <>
      {titleNode}
      <EmbedGenerator operatorId={currentOperatorId} />
    </>
  )
}

type GeneratorProps = {
  operatorId: string
}

export function EmbedGenerator({ operatorId }: GeneratorProps) {
  const [mode, setMode] = useState<Mode>('all')
  const [groupSlug, setGroupSlug] = useState('')
  const [productSlug, setProductSlug] = useState('')
  const [height, setHeight] = useState('')
  const [src, setSrc] = useState('')
  // landr-7zc5.4 — environment selector; defaults to live (production)
  const [env, setEnv] = useState<EmbedEnv>('live')

  // landr-il9f.3 — fetch the opaque widget token for this operator.
  // Owners/staff can read their own operators row via RLS.
  const tokenQuery = useQuery<string | null>({
    queryKey: ['operator-widget-token', operatorId],
    queryFn: () => fetchWidgetToken(operatorId),
    enabled: !!operatorId,
  })
  const widgetToken = tokenQuery.data ?? null

  const groupsQuery = useQuery<ProductGroup[]>({
    queryKey: ['product-group-tree', operatorId],
    queryFn: () => fetchProductGroupTree(operatorId),
    enabled: mode === 'category',
  })
  const productsQuery = useQuery<ProductRow[]>({
    queryKey: ['products', operatorId, 'embed'],
    queryFn: () => fetchProducts(operatorId),
    enabled: mode === 'product',
  })

  const flatGroups = useMemo(
    () => flattenTree(buildGroupTree(groupsQuery.data ?? [])),
    [groupsQuery.data],
  )
  const products = useMemo(
    () => productsQuery.data ?? [],
    [productsQuery.data],
  )

  // landr-7zc5.4: the resolved host for the selected environment.
  // The `src` override field still takes precedence when filled in, to
  // support arbitrary preview deploys. The env selector governs the
  // default host when src is left blank.
  const effectiveHost = src.trim()
    ? src.trim().replace(/\/+$/, '')
    : `https://${EMBED_ENV_HOSTS[env]}`

  const params = useMemo(
    () => ({
      // Fall back to a placeholder while the token is loading so the output
      // is always a valid-looking string. The user sees live results once
      // the token arrives (single fast round-trip).
      token: widgetToken ?? '',
      group: mode === 'category' ? groupSlug : null,
      product: mode === 'product' ? productSlug : null,
      height: height.trim() || null,
      // Pass the env-resolved host as the src for the shortcode builder.
      // When the env is 'live' and no src override is set, the shortcode
      // omits the src attr (matches the default, keeping the output clean).
      src:
        src.trim() ||
        (env !== 'live' ? `https://${EMBED_ENV_HOSTS[env]}/` : null),
    }),
    [widgetToken, mode, groupSlug, productSlug, height, src, env],
  )

  const shortcode = useMemo(() => buildShortcode(params), [params])

  const iframe = useMemo(() => {
    const qs = new URLSearchParams()
    // landr-il9f.3: widget resolves operator by ?w=<token>, not ?operator=<slug>.
    if (params.token) qs.set('w', params.token)
    if (params.group) qs.set('group', params.group)
    if (params.product) qs.set('product', params.product)
    const origin = effectiveHost.replace(/\/+$/, '') + '/'
    const h = parseInt(height.trim(), 10)
    const px = Number.isFinite(h) && h > 0 ? h : 800
    return `<iframe src="${origin}?${qs.toString()}" style="width:100%;height:${px}px;border:none;" loading="lazy" allow="payment" title="LANDR booking widget"></iframe>`
  }, [params, height, effectiveHost])

  // landr-7zc5.4: raw URL for the selected env (ignores src override —
  // the raw URL always reflects the env selector).
  const rawUrl = useMemo(
    () =>
      buildWidgetUrl(env, params.token, {
        group: params.group,
        product: params.product,
      }),
    [env, params.token, params.group, params.product],
  )

  return (
    <div className="flex flex-col gap-6">
      <header>
        <h1 className="text-xl font-semibold">{t.embedSettings.title}</h1>
        <p className="text-muted-foreground text-sm">
          {t.embedSettings.subtitle}
        </p>
      </header>

      {/* ---- Mode picker -------------------------------------------- */}
      <section className="rounded-md border p-4">
        <fieldset className="flex flex-col gap-2">
          <legend className="text-sm font-medium">
            {t.embedSettings.modeLabel}
          </legend>
          {(
            [
              ['all', t.embedSettings.modeAll],
              ['category', t.embedSettings.modeCategory],
              ['product', t.embedSettings.modeProduct],
            ] as const
          ).map(([value, label]) => (
            <label key={value} className="flex items-center gap-2 text-sm">
              <input
                type="radio"
                name="embed-mode"
                value={value}
                checked={mode === value}
                onChange={() => setMode(value)}
                data-testid={`embed-mode-${value}`}
              />
              <span>{label}</span>
            </label>
          ))}
        </fieldset>

        {/* Category picker */}
        {mode === 'category' ? (
          <div className="mt-3 flex flex-col gap-1">
            <Label htmlFor="embed-category" className="text-xs">
              {t.embedSettings.categoryLabel}
            </Label>
            {groupsQuery.isPending ? (
              <p className="text-muted-foreground text-sm">
                {t.embedSettings.loadingCategories}
              </p>
            ) : flatGroups.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t.embedSettings.noCategories}
              </p>
            ) : (
              <select
                id="embed-category"
                value={groupSlug}
                onChange={(e) => setGroupSlug(e.target.value)}
                className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                data-testid="embed-category-select"
              >
                <option value="">{t.embedSettings.categoryPlaceholder}</option>
                {flatGroups.map((g) => (
                  <option key={g.id} value={g.slug}>
                    {' '.repeat(g.depth * 2)}
                    {g.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

        {/* Product picker */}
        {mode === 'product' ? (
          <div className="mt-3 flex flex-col gap-1">
            <Label htmlFor="embed-product" className="text-xs">
              {t.embedSettings.productLabel}
            </Label>
            {productsQuery.isPending ? (
              <p className="text-muted-foreground text-sm">
                {t.embedSettings.loadingProducts}
              </p>
            ) : products.length === 0 ? (
              <p className="text-muted-foreground text-sm">
                {t.embedSettings.noProducts}
              </p>
            ) : (
              <select
                id="embed-product"
                value={productSlug}
                onChange={(e) => setProductSlug(e.target.value)}
                className="border-input bg-background h-8 rounded-md border px-2 text-sm"
                data-testid="embed-product-select"
              >
                <option value="">{t.embedSettings.productPlaceholder}</option>
                {products.map((p) => (
                  <option key={p.id} value={p.slug}>
                    {p.name}
                  </option>
                ))}
              </select>
            )}
          </div>
        ) : null}

        {/* ---- Environment selector (landr-7zc5.4) ------------------- */}
        <div className="mt-4 flex flex-col gap-1">
          <Label htmlFor="embed-env" className="text-xs">
            {t.embedSettings.envLabel}
          </Label>
          <select
            id="embed-env"
            value={env}
            onChange={(e) => setEnv(e.target.value as EmbedEnv)}
            className="border-input bg-background h-8 w-48 rounded-md border px-2 text-sm"
            data-testid="embed-env-select"
          >
            {EMBED_ENV_ORDER.map((e) => (
              <option key={e} value={e}>
                {EMBED_ENV_LABELS[e]}
              </option>
            ))}
          </select>
        </div>

        {/* Optional overrides */}
        <div className="mt-4 flex flex-wrap items-end gap-4">
          <div className="flex flex-col gap-1">
            <Label htmlFor="embed-height" className="text-xs">
              {t.embedSettings.heightLabel}
            </Label>
            <Input
              id="embed-height"
              type="number"
              inputMode="numeric"
              min={1}
              value={height}
              onChange={(e) => setHeight(e.target.value)}
              placeholder="800"
              className="h-8 w-28 text-sm"
              data-testid="embed-height"
            />
            <span className="text-muted-foreground text-[0.7rem]">
              {t.embedSettings.heightHint}
            </span>
          </div>
          <div className="flex flex-1 flex-col gap-1">
            <Label htmlFor="embed-src" className="text-xs">
              {t.embedSettings.srcLabel}
            </Label>
            <Input
              id="embed-src"
              type="url"
              value={src}
              onChange={(e) => setSrc(e.target.value)}
              placeholder={t.embedSettings.srcPlaceholder}
              className="h-8 text-sm"
              data-testid="embed-src"
            />
            <span className="text-muted-foreground text-[0.7rem]">
              {t.embedSettings.srcHint}
            </span>
          </div>
        </div>
      </section>

      {/* ---- Output ------------------------------------------------- */}
      <CodeBlock
        label={t.embedSettings.shortcodeLabel}
        code={shortcode}
        copyAria={t.embedSettings.copyShortcodeAria}
        testId="embed-shortcode"
      />
      <CodeBlock
        label={t.embedSettings.iframeLabel}
        code={iframe}
        copyAria={t.embedSettings.copyIframeAria}
        testId="embed-iframe"
      />

      {/* ---- Raw URL + Open button (landr-7zc5.4) ------------------- */}
      <section className="flex flex-col gap-2" data-testid="embed-raw-url">
        <div className="flex items-center justify-between">
          <p className="text-sm font-medium">{t.embedSettings.rawUrlLabel}</p>
          <div className="flex items-center gap-2">
            <CopyRawUrlButton url={rawUrl} />
            <Button
              type="button"
              size="sm"
              variant="outline"
              asChild
              data-testid="embed-open-widget"
            >
              <a href={rawUrl} target="_blank" rel="noopener noreferrer">
                <ExternalLinkIcon className="size-3.5" />
                <span className="ml-1">{t.embedSettings.openWidgetButton}</span>
              </a>
            </Button>
          </div>
        </div>
        <code
          className="border-border bg-muted block overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs"
          data-testid="embed-raw-url-code"
        >
          {rawUrl}
        </code>
      </section>
    </div>
  )
}

/** Inline copy button for the raw URL, extracted to avoid a useState closure issue. */
function CopyRawUrlButton({ url }: { url: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(url)
      setCopied(true)
      toast.success(t.embedSettings.toastCopied)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t.embedSettings.toastCopyError)
    }
  }
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      onClick={copy}
      aria-label={t.embedSettings.copyRawUrlAria}
      data-testid="embed-raw-url-copy"
    >
      {copied ? (
        <CheckIcon className="size-3.5" />
      ) : (
        <CopyIcon className="size-3.5" />
      )}
      <span className="ml-1">
        {copied ? t.embedSettings.copied : t.embedSettings.copy}
      </span>
    </Button>
  )
}

type CodeBlockProps = {
  label: string
  code: string
  copyAria: string
  testId: string
}

function CodeBlock({ label, code, copyAria, testId }: CodeBlockProps) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(code)
      setCopied(true)
      toast.success(t.embedSettings.toastCopied)
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast.error(t.embedSettings.toastCopyError)
    }
  }
  return (
    <section className="flex flex-col gap-2" data-testid={testId}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium">{label}</p>
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={copy}
          aria-label={copyAria}
          data-testid={`${testId}-copy`}
        >
          {copied ? (
            <CheckIcon className="size-3.5" />
          ) : (
            <CopyIcon className="size-3.5" />
          )}
          <span className="ml-1">
            {copied ? t.embedSettings.copied : t.embedSettings.copy}
          </span>
        </Button>
      </div>
      <code
        className="border-border bg-muted block overflow-x-auto rounded-md border px-3 py-2 font-mono text-xs"
        data-testid={`${testId}-code`}
      >
        {code}
      </code>
    </section>
  )
}
