/**
 * Settings → Embed (landr-up1b / landr-il9f.3).
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
 */
import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckIcon, CopyIcon } from 'lucide-react'

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

  const params = useMemo(
    () => ({
      // Fall back to a placeholder while the token is loading so the output
      // is always a valid-looking string. The user sees live results once
      // the token arrives (single fast round-trip).
      token: widgetToken ?? '',
      group: mode === 'category' ? groupSlug : null,
      product: mode === 'product' ? productSlug : null,
      height: height.trim() || null,
      src: src.trim() || null,
    }),
    [widgetToken, mode, groupSlug, productSlug, height, src],
  )

  const shortcode = useMemo(() => buildShortcode(params), [params])

  const iframe = useMemo(() => {
    const qs = new URLSearchParams()
    // landr-il9f.3: widget resolves operator by ?w=<token>, not ?operator=<slug>.
    if (params.token) qs.set('w', params.token)
    if (params.group) qs.set('group', params.group)
    if (params.product) qs.set('product', params.product)
    const origin = params.src
      ? params.src.replace(/\/+$/, '') + '/'
      : 'https://bw.landr.de/'
    const h = parseInt(height.trim(), 10)
    const px = Number.isFinite(h) && h > 0 ? h : 800
    return `<iframe src="${origin}?${qs.toString()}" style="width:100%;height:${px}px;border:none;" loading="lazy" allow="payment" title="LANDR booking widget"></iframe>`
  }, [params, height])

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
    </div>
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
