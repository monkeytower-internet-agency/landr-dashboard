// landr-jb1k — Settings → Booking widget.
//
// Operator-facing configurator for the embedded booking widget's
// presentation. Four controls, each persisted independently via a plain
// PATCH on the operators row (same patchOperator helper BrandingSettings
// uses — the API treats these as plain column writes; no side effects):
//
//   * widget_variant          — showcased layout. Operator-facing labels are
//                               descriptive (Text overlay / Text below image /
//                               Compact cards); the stored values stay
//                               aurora / summit / alpine. NULL = aurora.
//   * widget_category_columns — clamp the >=md category grid to 1..4 columns.
//                               NULL = the widget's count-aware auto.
//   * widget_tile_font        — title font family (system / serif / rounded).
//                               NULL = system.
//   * widget_title_case       — CSS text-transform on titles
//                               (uppercase / lowercase / capitalize).
//                               NULL = render as entered.
//
// landr-ylvp — also owns the booking-widget text card (widget_headline /
// widget_description / widget_footer), moved here from Brand: it is the copy
// shown IN the widget, so it belongs with the widget's presentation. Unlike
// the four controls above (each saves on change), the text card batches all
// three fields behind an explicit Save button (empty = NULL clears the field).
//
// Each save is optimistic-feeling (toast on success, toast on error, refetch
// on settle via invalidate) and never silent. The ?variant= URL param still
// overrides widget_variant at preview time (widget side, landr-jb1k.2).

import { useEffect, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useQuery } from '@tanstack/react-query'
import { toast } from 'sonner'
import { CheckIcon, ExternalLinkIcon } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { NativeSelect } from '@/components/ui/native-select'
import { cn } from '@/lib/utils'
import {
  patchOperator,
  type OperatorPatch,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { fetchWidgetToken } from '@/lib/shortcode'
import { buildWidgetUrl } from '@/lib/embed-hosts'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { OperatorSection } from './_shared'
import {
  loadWidgetFonts,
  WIDGET_FONT_STACKS,
  type WidgetFont,
} from './widgetFonts'

// ── domain enums (stored values; UI labels are descriptive) ──────────────────

type Variant = 'aurora' | 'summit' | 'alpine'
// widget_tile_font stored value === WidgetFont; 'system' persists as NULL.
type TileFont = WidgetFont
type TitleCase = 'uppercase' | 'lowercase' | 'capitalize'
// landr-jb1k.4 — tile-style enums. null = Auto (the widget's current behaviour).
type TileRadius = 'sharp' | 'rounded' | 'round'
type TileAspect = 'square' | 'landscape' | 'wide'
type TileScrim = 'dark' | 'brand' | 'light'
type TileHover = 'lift' | 'zoom' | 'none'

// NULL widget_variant resolves to aurora on the widget side, so the picker
// treats null as aurora-selected and surfaces a "Default" hint on that card.
const DEFAULT_VARIANT: Variant = 'aurora'

const VARIANTS: {
  value: Variant
  label: string
  desc: string
}[] = [
  {
    value: 'aurora',
    label: t.settings.widgetVariantAuroraLabel,
    desc: t.settings.widgetVariantAuroraDesc,
  },
  {
    value: 'summit',
    label: t.settings.widgetVariantSummitLabel,
    desc: t.settings.widgetVariantSummitDesc,
  },
  {
    value: 'alpine',
    label: t.settings.widgetVariantAlpineLabel,
    desc: t.settings.widgetVariantAlpineDesc,
  },
]

// Title-font options. Each option label AND the live preview line render in
// the actual font (self-hosted via @fontsource, loaded lazily on mount). The
// stored value drives the widget's own font resolution; 'system' = NULL.
const FONT_OPTIONS: { value: TileFont; label: string }[] = [
  { value: 'system', label: t.settings.widgetFontSystem },
  { value: 'playfair', label: t.settings.widgetFontPlayfair },
  { value: 'montserrat', label: t.settings.widgetFontMontserrat },
  { value: 'bebas', label: t.settings.widgetFontBebas },
  { value: 'space-grotesk', label: t.settings.widgetFontSpaceGrotesk },
  { value: 'caveat', label: t.settings.widgetFontCaveat },
]

// Text-case segmented options. null = 'as entered' (no transform).
const CASE_OPTIONS: { value: TitleCase | null; label: string }[] = [
  { value: null, label: t.settings.widgetCaseAsEntered },
  { value: 'uppercase', label: t.settings.widgetCaseUppercase },
  { value: 'lowercase', label: t.settings.widgetCaseLowercase },
  { value: 'capitalize', label: t.settings.widgetCaseCapitalize },
]

// ── landr-jb1k.4: tile-style option sets. Each leads with the null = Auto
// (current/auto behaviour) state, followed by the explicit choices. radius and
// aspect carry a tiny CSS swatch (a class string applied to a mini preview box);
// scrim carries a mini gradient overlay; hover is a plain select.

const RADIUS_OPTIONS: {
  value: TileRadius | null
  label: string
  // Tailwind rounding class for the mini swatch box.
  swatch: string
}[] = [
  { value: null, label: t.settings.widgetTileAuto, swatch: 'rounded-md' },
  { value: 'sharp', label: t.settings.widgetTileRadiusSharp, swatch: 'rounded-none' },
  { value: 'rounded', label: t.settings.widgetTileRadiusRounded, swatch: 'rounded-lg' },
  { value: 'round', label: t.settings.widgetTileRadiusRound, swatch: 'rounded-2xl' },
]

const ASPECT_OPTIONS: {
  value: TileAspect | null
  label: string
  // Aspect class for the mini swatch box.
  swatch: string
}[] = [
  { value: null, label: t.settings.widgetTileAuto, swatch: 'aspect-[4/3]' },
  { value: 'square', label: t.settings.widgetTileAspectSquare, swatch: 'aspect-square' },
  { value: 'landscape', label: t.settings.widgetTileAspectLandscape, swatch: 'aspect-[4/3]' },
  { value: 'wide', label: t.settings.widgetTileAspectWide, swatch: 'aspect-video' },
]

const SCRIM_OPTIONS: {
  value: TileScrim | null
  label: string
  // Gradient class for the mini overlay swatch; textDark flips the sample title
  // to dark text (mirrors the widget's AA enforcement for the 'light' scrim).
  overlay: string
  textDark: boolean
}[] = [
  {
    value: null,
    label: t.settings.widgetTileAuto,
    overlay: 'bg-gradient-to-t from-black/70 via-black/25 to-transparent',
    textDark: false,
  },
  {
    value: 'dark',
    label: t.settings.widgetTileScrimDark,
    overlay: 'bg-gradient-to-t from-black/70 via-black/25 to-transparent',
    textDark: false,
  },
  {
    value: 'brand',
    label: t.settings.widgetTileScrimBrand,
    overlay: 'bg-gradient-to-t from-primary/80 via-black/30 to-transparent',
    textDark: false,
  },
  {
    value: 'light',
    label: t.settings.widgetTileScrimLight,
    overlay: 'bg-gradient-to-t from-white/85 via-white/35 to-transparent',
    textDark: true,
  },
]

const HOVER_OPTIONS: { value: TileHover | null; label: string }[] = [
  { value: null, label: t.settings.widgetTileAuto },
  { value: 'lift', label: t.settings.widgetTileHoverLift },
  { value: 'zoom', label: t.settings.widgetTileHoverZoom },
  { value: 'none', label: t.settings.widgetTileHoverNone },
]

// ── page wrapper ─────────────────────────────────────────────────────────────

export function WidgetSettings() {
  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.widget },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.widget}
      />
      <OperatorSection>
        {({ operator, operatorId, invalidate }) => (
          <WidgetForm
            // Re-seed local state from props whenever the persisted values
            // change (same key-remount pattern BrandingSettings uses).
            key={JSON.stringify({
              v: operator.widget_variant,
              c: operator.widget_category_columns,
              f: operator.widget_tile_font,
              tc: operator.widget_title_case,
              // landr-jb1k.4 — re-seed when any tile-style field changes.
              tr: operator.widget_tile_radius,
              ta: operator.widget_tile_aspect,
              ts: operator.widget_tile_scrim,
              th: operator.widget_tile_hover,
              // landr-ylvp — widget text card moved here from Brand; re-seed
              // when any of the headline/description/footer change.
              wh: operator.widget_headline,
              wd: operator.widget_description,
              wf: operator.widget_footer,
            })}
            operator={operator}
            operatorId={operatorId}
            onSaved={invalidate}
          />
        )}
      </OperatorSection>
    </>
  )
}

type FormProps = {
  operator: OperatorSettings
  operatorId: string
  onSaved: () => void
}

function WidgetForm({ operator, operatorId, onSaved }: FormProps) {
  // null variant resolves to the default (aurora) for the selected-state UI.
  const [variant, setVariant] = useState<Variant>(
    operator.widget_variant ?? DEFAULT_VARIANT,
  )
  // Track whether the operator has explicitly chosen — drives the "Default"
  // hint on the aurora card (null = inheriting the default).
  const [variantExplicit, setVariantExplicit] = useState(
    operator.widget_variant != null,
  )
  const [columns, setColumns] = useState<number | null>(
    operator.widget_category_columns ?? null,
  )
  const [font, setFont] = useState<TileFont>(
    operator.widget_tile_font ?? 'system',
  )
  const [titleCase, setTitleCase] = useState<TitleCase | null>(
    operator.widget_title_case ?? null,
  )
  // landr-jb1k.4 — tile-style state. null = Auto (current/auto behaviour).
  const [tileRadius, setTileRadius] = useState<TileRadius | null>(
    operator.widget_tile_radius ?? null,
  )
  const [tileAspect, setTileAspect] = useState<TileAspect | null>(
    operator.widget_tile_aspect ?? null,
  )
  const [tileScrim, setTileScrim] = useState<TileScrim | null>(
    operator.widget_tile_scrim ?? null,
  )
  const [tileHover, setTileHover] = useState<TileHover | null>(
    operator.widget_tile_hover ?? null,
  )

  // ── widget embed text state (landr-nils; moved here from Brand by
  // landr-ylvp — it's the copy shown IN the widget, alongside layout). ──
  const [headline, setHeadline] = useState(operator.widget_headline ?? '')
  const [description, setDescription] = useState(
    operator.widget_description ?? '',
  )
  const [footer, setFooter] = useState(operator.widget_footer ?? '')
  const widgetTextDirty =
    headline.trim() !== (operator.widget_headline ?? '') ||
    description.trim() !== (operator.widget_description ?? '') ||
    footer.trim() !== (operator.widget_footer ?? '')

  // Self-hosted showcase fonts (GDPR — no Google CDN) are pulled in lazily
  // only once this section mounts, so the rest of the dashboard never pays
  // for them. The dynamic imports inject the @font-face rules; the browser
  // fetches each woff2 the moment a preview first uses that family.
  useEffect(() => {
    void loadWidgetFonts()
  }, [])

  const patchMutation = useMutation({
    mutationFn: (patch: OperatorPatch) => patchOperator(operatorId, patch),
    // Refetch on settle so local state re-seeds from the server's truth.
    onSettled: () => onSaved(),
    onError: (err: Error) => {
      toast.error(t.settings.toastError, { description: err.message })
    },
  })

  function save(patch: OperatorPatch, successToast: string) {
    patchMutation.mutate(patch, {
      onSuccess: () => toast.success(successToast),
    })
  }

  function selectVariant(next: Variant) {
    setVariant(next)
    setVariantExplicit(true)
    save({ widget_variant: next }, t.settings.widgetVariantToastSaved)
  }

  function selectColumns(next: number | null) {
    setColumns(next)
    save(
      { widget_category_columns: next },
      t.settings.widgetColumnsToastSaved,
    )
  }

  function selectFont(next: TileFont) {
    setFont(next)
    // 'system' is the default → persist null so the widget falls back cleanly.
    save(
      { widget_tile_font: next === 'system' ? null : next },
      t.settings.widgetFontToastSaved,
    )
  }

  function selectCase(next: TitleCase | null) {
    setTitleCase(next)
    save({ widget_title_case: next }, t.settings.widgetCaseToastSaved)
  }

  // landr-jb1k.4 — tile-style savers. Each PATCHes its key (null = Auto) via
  // the same patchOperator path; the toast confirms the save.
  function selectTileRadius(next: TileRadius | null) {
    setTileRadius(next)
    save({ widget_tile_radius: next }, t.settings.widgetTileRadiusToastSaved)
  }

  function selectTileAspect(next: TileAspect | null) {
    setTileAspect(next)
    save({ widget_tile_aspect: next }, t.settings.widgetTileAspectToastSaved)
  }

  function selectTileScrim(next: TileScrim | null) {
    setTileScrim(next)
    save({ widget_tile_scrim: next }, t.settings.widgetTileScrimToastSaved)
  }

  function selectTileHover(next: TileHover | null) {
    setTileHover(next)
    save({ widget_tile_hover: next }, t.settings.widgetTileHoverToastSaved)
  }

  // ── widget embed text save (landr-nils; moved from Brand by landr-ylvp) ──
  // Same save path as before: empty string clears the field (sends null) — an
  // intentional clear the API preserves via exclude_unset.
  function handleWidgetTextSave() {
    const trimOrNull = (s: string) => {
      const v = s.trim()
      return v.length > 0 ? v : null
    }
    save(
      {
        widget_headline: trimOrNull(headline),
        widget_description: trimOrNull(description),
        widget_footer: trimOrNull(footer),
      },
      t.settings.widgetTextToastSaved,
    )
  }

  const saving = patchMutation.isPending

  return (
    // landr-3qkr.4 — full-bleed on mobile (no horizontal padding that fights
    // the AppShell safe-area padding); constrained to 2xl on larger screens.
    <div className="flex max-w-2xl flex-col gap-6">
      <h1 className="text-2xl font-semibold">{t.settings.widgetConfigTitle}</h1>

      {/* ── Layout variant picker ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.widgetLayoutTitle}</CardTitle>
          <CardDescription>{t.settings.widgetLayoutDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          {/* landr-3qkr.4 — single column on mobile, 3-up on sm+ */}
          <div
            role="radiogroup"
            aria-label={t.settings.widgetLayoutTitle}
            className="grid grid-cols-1 gap-4 sm:grid-cols-3"
          >
            {VARIANTS.map((v) => {
              const selected = variant === v.value
              const isDefaultCard = v.value === DEFAULT_VARIANT
              return (
                <button
                  key={v.value}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  aria-label={v.label}
                  disabled={saving}
                  onClick={() => selectVariant(v.value)}
                  data-testid={`widget-variant-${v.value}`}
                  className={cn(
                    'group focus-visible:ring-ring relative flex flex-col gap-3 rounded-xl border p-3 text-left transition focus-visible:ring-2 focus-visible:outline-none',
                    selected
                      ? 'border-primary ring-primary/40 ring-2'
                      : 'border-border hover:border-primary/50',
                    saving && 'opacity-60',
                  )}
                >
                  {selected && (
                    <span className="bg-primary text-primary-foreground absolute top-2 right-2 z-10 flex size-5 items-center justify-center rounded-full shadow">
                      <CheckIcon className="size-3" />
                      <span className="sr-only">
                        {t.settings.widgetVariantSelected}
                      </span>
                    </span>
                  )}
                  <VariantSwatch variant={v.value} />
                  <div className="flex flex-col gap-0.5">
                    <span className="text-sm font-medium">{v.label}</span>
                    <span className="text-muted-foreground text-xs">
                      {v.desc}
                    </span>
                    {isDefaultCard && !variantExplicit && (
                      <span className="text-primary mt-1 text-[0.7rem] font-medium">
                        {t.settings.widgetVariantDefaultHint}
                      </span>
                    )}
                  </div>
                </button>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* ── Category columns ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.widgetColumnsTitle}</CardTitle>
          <CardDescription>{t.settings.widgetColumnsDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-1.5">
          <Label htmlFor="widget-columns">{t.settings.widgetColumnsLabel}</Label>
          <NativeSelect
            id="widget-columns"
            value={columns === null ? 'auto' : String(columns)}
            disabled={saving}
            onChange={(e) =>
              selectColumns(
                e.target.value === 'auto' ? null : Number(e.target.value),
              )
            }
            data-testid="widget-columns-select"
            className="sm:max-w-xs"
          >
            <option value="auto">{t.settings.widgetColumnsAuto}</option>
            {[1, 2, 3, 4].map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </NativeSelect>
          <p className="text-muted-foreground text-xs">
            {t.settings.widgetColumnsHelper}
          </p>
        </CardContent>
      </Card>

      {/* ── Title style (font + case) ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.widgetTitleStyleTitle}</CardTitle>
          <CardDescription>{t.settings.widgetTitleStyleDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-5">
          {/* Font select — each option label renders in its own stack. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-font">{t.settings.widgetFontLabel}</Label>
            <NativeSelect
              id="widget-font"
              value={font}
              disabled={saving}
              onChange={(e) => selectFont(e.target.value as TileFont)}
              data-testid="widget-font-select"
              className="sm:max-w-xs"
            >
              {FONT_OPTIONS.map((o) => (
                <option
                  key={o.value}
                  value={o.value}
                  style={{ fontFamily: WIDGET_FONT_STACKS[o.value] }}
                >
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>

          {/* Text-case segmented control. */}
          <div className="flex flex-col gap-1.5">
            <Label asChild>
              <span>{t.settings.widgetCaseLabel}</span>
            </Label>
            <div
              role="radiogroup"
              aria-label={t.settings.widgetCaseLabel}
              className="border-input bg-muted/40 inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-1"
            >
              {CASE_OPTIONS.map((o) => {
                const selected = titleCase === o.value
                return (
                  <button
                    key={o.label}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving}
                    onClick={() => selectCase(o.value)}
                    data-testid={`widget-case-${o.value ?? 'none'}`}
                    className={cn(
                      'rounded-md px-3 py-1 text-xs font-medium transition',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                      saving && 'opacity-60',
                    )}
                  >
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Live preview line: sample rendered with BOTH active settings —
              the selected font AND the selected text case combined. */}
          <div className="border-border flex flex-col gap-1 rounded-lg border border-dashed p-4">
            <span className="text-muted-foreground text-[0.7rem] tracking-wide uppercase">
              {t.settings.brandingPreviewTitle}
            </span>
            <span
              className="text-2xl leading-tight"
              data-testid="widget-title-preview"
              style={{
                fontFamily: WIDGET_FONT_STACKS[font],
                textTransform: titleCase ?? 'none',
              }}
            >
              {t.settings.widgetCasePreviewSample}
            </span>
          </div>
        </CardContent>
      </Card>

      {/* ── Tile style (radius / aspect / scrim / hover) ── landr-jb1k.4 ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.widgetTileStyleTitle}</CardTitle>
          <CardDescription>{t.settings.widgetTileStyleDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-6">
          {/* Corners — segmented control with a tiny rounded-box swatch. */}
          <div className="flex flex-col gap-1.5">
            <Label asChild>
              <span>{t.settings.widgetTileRadiusLabel}</span>
            </Label>
            <div
              role="radiogroup"
              aria-label={t.settings.widgetTileRadiusLabel}
              className="border-input bg-muted/40 inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-1"
            >
              {RADIUS_OPTIONS.map((o) => {
                const selected = tileRadius === o.value
                return (
                  <button
                    key={o.value ?? 'auto'}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving}
                    onClick={() => selectTileRadius(o.value)}
                    data-testid={`widget-tile-radius-${o.value ?? 'auto'}`}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                      saving && 'opacity-60',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(selected ? 'bg-primary-foreground/90' : 'bg-primary/70', 'size-3.5', o.swatch)}
                    />
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Shape — segmented control with an aspect-ratio swatch box. */}
          <div className="flex flex-col gap-1.5">
            <Label asChild>
              <span>{t.settings.widgetTileAspectLabel}</span>
            </Label>
            <div
              role="radiogroup"
              aria-label={t.settings.widgetTileAspectLabel}
              className="border-input bg-muted/40 inline-flex w-fit max-w-full flex-wrap gap-1 rounded-lg border p-1"
            >
              {ASPECT_OPTIONS.map((o) => {
                const selected = tileAspect === o.value
                return (
                  <button
                    key={o.value ?? 'auto'}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    disabled={saving}
                    onClick={() => selectTileAspect(o.value)}
                    data-testid={`widget-tile-aspect-${o.value ?? 'auto'}`}
                    className={cn(
                      'flex items-center gap-1.5 rounded-md px-3 py-1 text-xs font-medium transition',
                      selected
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground',
                      saving && 'opacity-60',
                    )}
                  >
                    <span
                      aria-hidden="true"
                      className={cn(selected ? 'bg-primary-foreground/90' : 'bg-primary/70', 'w-4 rounded-[2px]', o.swatch)}
                    />
                    {o.label}
                  </button>
                )
              })}
            </div>
          </div>

          {/* Text overlay scrim — three mini overlay swatches (radiogroup).
              Each swatch shows the gradient over a faux image with a sample
              title, so the operator sees the contrast at a glance. The 'light'
              swatch renders a dark title (AA — mirrors the widget). */}
          <div className="flex flex-col gap-1.5">
            <Label asChild>
              <span>{t.settings.widgetTileScrimLabel}</span>
            </Label>
            <div
              role="radiogroup"
              aria-label={t.settings.widgetTileScrimLabel}
              className="grid grid-cols-2 gap-2 sm:grid-cols-4"
            >
              {SCRIM_OPTIONS.map((o) => {
                const selected = tileScrim === o.value
                return (
                  <button
                    key={o.value ?? 'auto'}
                    type="button"
                    role="radio"
                    aria-checked={selected}
                    aria-label={o.label}
                    disabled={saving}
                    onClick={() => selectTileScrim(o.value)}
                    data-testid={`widget-tile-scrim-${o.value ?? 'auto'}`}
                    className={cn(
                      'focus-visible:ring-ring relative overflow-hidden rounded-lg border transition focus-visible:ring-2 focus-visible:outline-none',
                      selected
                        ? 'border-primary ring-primary/40 ring-2'
                        : 'border-border hover:border-primary/50',
                      saving && 'opacity-60',
                    )}
                  >
                    {/* faux image area */}
                    <div className="relative h-12 bg-gradient-to-br from-sky-200 to-slate-300">
                      <div
                        aria-hidden="true"
                        className={cn('absolute inset-0', o.overlay)}
                      />
                      <span
                        className={cn(
                          'absolute bottom-1 left-1.5 text-[0.6rem] font-semibold',
                          o.textDark ? 'text-foreground' : 'text-white',
                        )}
                      >
                        {t.settings.widgetCasePreviewSample}
                      </span>
                    </div>
                    <span className="block px-1.5 py-1 text-[0.7rem] font-medium">
                      {o.label}
                    </span>
                  </button>
                )
              })}
            </div>
            <p className="text-muted-foreground text-xs">
              {t.settings.widgetTileScrimHelper}
            </p>
          </div>

          {/* Hover effect — plain select. */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-tile-hover">
              {t.settings.widgetTileHoverLabel}
            </Label>
            <NativeSelect
              id="widget-tile-hover"
              value={tileHover ?? 'auto'}
              disabled={saving}
              onChange={(e) =>
                selectTileHover(
                  e.target.value === 'auto'
                    ? null
                    : (e.target.value as TileHover),
                )
              }
              data-testid="widget-tile-hover-select"
              className="sm:max-w-xs"
            >
              {HOVER_OPTIONS.map((o) => (
                <option key={o.value ?? 'auto'} value={o.value ?? 'auto'}>
                  {o.label}
                </option>
              ))}
            </NativeSelect>
          </div>
        </CardContent>
      </Card>

      {/* ── Booking widget text (landr-nils; moved here from Brand by
          landr-ylvp — headline/description/footer shown around the widget) ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.widgetTextSectionTitle}</CardTitle>
          <CardDescription>{t.settings.widgetTextSectionDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-headline">
              {t.settings.widgetHeadlineLabel}
            </Label>
            <Input
              id="widget-headline"
              value={headline}
              maxLength={200}
              placeholder={t.settings.widgetHeadlinePlaceholder}
              onChange={(e) => setHeadline(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t.settings.widgetHeadlineHint}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-description">
              {t.settings.widgetDescriptionLabel}
            </Label>
            <Textarea
              id="widget-description"
              value={description}
              maxLength={2000}
              rows={3}
              placeholder={t.settings.widgetDescriptionPlaceholder}
              onChange={(e) => setDescription(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t.settings.widgetDescriptionHint}
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <Label htmlFor="widget-footer">
              {t.settings.widgetFooterLabel}
            </Label>
            <Textarea
              id="widget-footer"
              value={footer}
              maxLength={2000}
              rows={3}
              placeholder={t.settings.widgetFooterPlaceholder}
              onChange={(e) => setFooter(e.target.value)}
            />
            <p className="text-muted-foreground text-xs">
              {t.settings.widgetFooterHint}
            </p>
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              onClick={handleWidgetTextSave}
              disabled={!widgetTextDirty || saving}
              data-testid="widget-text-save"
            >
              {saving ? t.settings.saving : t.settings.save}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Preview widget external link ── */}
      <PreviewWidgetLink operatorId={operatorId} variant={variant} />
    </div>
  )
}

// ── Variant swatches ─────────────────────────────────────────────────────────
//
// Pure CSS previews (~120px tall) that visually match the descriptive labels:
//   aurora → "Text overlay": a title block sitting ON a layered brand
//            gradient, rounded-2xl with a soft glow.
//   summit → "Text below image": editorial — an image area on top, text rows
//            underneath, generous whitespace.
//   alpine → "Compact cards": a dense grid of small bordered tiles, sharp
//            corners.

function VariantSwatch({ variant }: { variant: Variant }) {
  if (variant === 'aurora') {
    return (
      <div className="relative h-[120px] overflow-hidden rounded-2xl shadow-[0_8px_24px_-6px_rgba(99,102,241,0.45)]">
        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500 via-fuchsia-500 to-amber-400" />
        <div className="absolute inset-0 bg-[radial-gradient(120%_80%_at_20%_0%,rgba(255,255,255,0.35),transparent)]" />
        {/* Title block overlaid on the gradient. */}
        <div className="absolute inset-x-0 bottom-0 flex flex-col gap-1 p-3">
          <div className="h-2.5 w-3/5 rounded-full bg-white/90" />
          <div className="h-1.5 w-2/5 rounded-full bg-white/60" />
        </div>
      </div>
    )
  }
  if (variant === 'summit') {
    return (
      <div className="flex h-[120px] flex-col overflow-hidden rounded-lg border bg-white">
        {/* Image area on top. */}
        <div className="h-3/5 bg-gradient-to-br from-sky-100 to-slate-200">
          <div className="flex h-full items-center justify-center">
            <div className="size-7 rounded-md bg-slate-300/70" />
          </div>
        </div>
        {/* Text rows below, with whitespace. */}
        <div className="flex flex-1 flex-col justify-center gap-1.5 px-3">
          <div className="h-2 w-3/4 rounded-full bg-slate-700/80" />
          <div className="h-1.5 w-1/2 rounded-full bg-slate-400/70" />
        </div>
      </div>
    )
  }
  // alpine — dense bordered mini-cards, sharp corners.
  return (
    <div className="grid h-[120px] grid-cols-2 grid-rows-2 gap-1.5 rounded-lg border bg-slate-50 p-1.5">
      {Array.from({ length: 4 }).map((_, i) => (
        <div
          key={i}
          className="flex flex-col gap-1 rounded-none border border-slate-300 bg-white p-1.5"
        >
          <div className="h-1.5 w-2/3 bg-slate-400" />
          <div className="h-1 w-1/2 bg-slate-300" />
        </div>
      ))}
    </div>
  )
}

// ── Preview widget link ──────────────────────────────────────────────────────
//
// The opaque widget_token is cheaply available via fetchWidgetToken (same
// helper EmbedSettings uses). When present we render an outbound link to the
// live widget with ?preview=1 (and ?variant= echoing the current selection so
// the operator sees this layout immediately). When the token isn't available
// yet (still loading / missing), we render nothing — the rest of the page is
// fully usable without it.

function PreviewWidgetLink({
  operatorId,
  variant,
}: {
  operatorId: string
  variant: Variant
}) {
  const tokenQuery = useQuery<string | null>({
    queryKey: ['operator-widget-token', operatorId],
    queryFn: () => fetchWidgetToken(operatorId),
    enabled: !!operatorId,
  })
  const widgetToken = tokenQuery.data ?? null
  if (!widgetToken) return null

  // buildWidgetUrl gives us the env host + ?w=<token>; append preview + the
  // current variant so the link reflects the unsaved-but-just-saved selection.
  const base = buildWidgetUrl('live', widgetToken)
  const url = `${base}&preview=1&variant=${variant}`

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t.settings.widgetPreviewLinkTitle}</CardTitle>
        <CardDescription>{t.settings.widgetPreviewLinkDesc}</CardDescription>
      </CardHeader>
      {/* landr-3qkr.4 — preview link is full-width on mobile (≥44px touch
          target is satisfied by Button's default py-2 + text-sm). */}
      <CardContent>
        <Button type="button" variant="outline" asChild data-testid="widget-preview-link" className="w-full sm:w-auto">
          <a href={url} target="_blank" rel="noopener noreferrer">
            <ExternalLinkIcon className="size-4" />
            <span className="ml-1.5">{t.settings.widgetPreviewLinkButton}</span>
          </a>
        </Button>
      </CardContent>
    </Card>
  )
}
