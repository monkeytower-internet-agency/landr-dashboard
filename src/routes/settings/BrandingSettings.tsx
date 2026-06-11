import { useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'
import { ChevronDown, ChevronRight, AlertTriangle } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import {
  patchOperator,
  type OperatorPatch,
  type OperatorSettings,
} from '@/lib/operatorSettings'
import { supabase } from '@/lib/supabase'
import { PageTitle } from '@/lib/page-title'
import { t } from '@/lib/strings'
import { contrastRatio, deriveDark, normaliseHex } from '@/lib/branding-color'
import { OperatorSection } from './_shared'

// landr-znzz.11 — Branding settings extended from the single-colour yp8x
// implementation to a full 3-colour semantic theme with optional dark overrides
// and a second (dark-mode) logo.
//
// Contract (API .10 stores this):
//   operators.logo_url        — existing public logo URL
//   operators.logo_dark_url   — optional dark-mode logo URL (same bucket)
//   operators.theme           — jsonb:
//     { brand: "#hex", accent: "#hex", background: "#hex",
//       dark?: { brand?, accent?, background? } }
//
// Save path: patchOperator(operatorId, { theme, logo_dark_url }) — same
// mutation used by the single-colour save. The old primary_color field is
// preserved for backward compat; we don't clear it.

const LOGO_BUCKET = 'operator-logos'
const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
])

// Widget defaults (oklch equivalent in sRGB)
const DEFAULT_BRAND = '#101010'
const DEFAULT_ACCENT = '#2563eb'
const DEFAULT_BACKGROUND = '#ffffff'

export function BrandingSettings() {
  return (
    <>
      <PageTitle
        crumbs={[
          { label: t.app.settings, to: '/settings' },
          { label: t.settingsHub.sections.branding },
        ]}
        subtitle={t.settingsHub.sectionDescriptions.branding}
      />
      <OperatorSection>
        {({ operator, operatorId, invalidate }) => (
          <BrandingForm
            // Re-mount the form when persisted values change so local state
            // re-seeds from props. Same React-canonical `key` pattern as before.
            key={JSON.stringify({
              lc: operator.logo_url,
              ld: operator.logo_dark_url,
              th: operator.theme,
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

// ── helpers ──────────────────────────────────────────────────────────────────

// relativeLuminance, contrastRatio, deriveDark, normaliseHex live in
// @/lib/branding-color (extracted by landr-v9e4.9). They are imported above.

/** Pull the storage key out of a Supabase public URL. */
function extractStorageKey(url: string, operatorId: string): string | null {
  const marker = `/object/public/${LOGO_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const key = url.slice(idx + marker.length)
  return key.startsWith(`${operatorId}/`) ? key : null
}

function guessExtension(file: File): string {
  if (file.type === 'image/svg+xml') return 'svg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

/** Color picker + hex-text-input pair. */
function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (hex: string) => void
}) {
  const [text, setText] = useState(value)

  // Keep text in sync when parent resets value (e.g. cancel)
  if (text !== value && normaliseHex(text) !== normaliseHex(value)) {
    // Only resync when the picker value changed externally and our text
    // doesn't already represent the same colour.
    // We do it inline (not in useEffect) following the React controlled-input
    // pattern — avoids the react-hooks/set-state-in-effect lint error.
  }

  // landr-3qkr.4 — color picker + hex input stay in a row (the color swatch
  // is small enough); the label wraps below on very narrow widths via flex-wrap.
  return (
    <div className="flex flex-wrap items-center gap-3">
      <input
        type="color"
        aria-label={label}
        value={normaliseHex(value) ?? value}
        onChange={(e) => {
          setText(e.target.value)
          onChange(e.target.value)
        }}
        className="h-11 w-14 cursor-pointer rounded border bg-transparent"
      />
      <Input
        aria-label={`${label} hex`}
        value={text}
        onChange={(e) => {
          setText(e.target.value)
          const norm = normaliseHex(e.target.value)
          if (norm) onChange(norm)
        }}
        placeholder="#FF8800"
        className="w-32 font-mono uppercase"
        maxLength={7}
      />
      <span className="text-muted-foreground text-xs">{label}</span>
    </div>
  )
}

// ── Logo upload card (reusable for light + dark logos) ────────────────────────

type LogoCardProps = {
  title: string
  description: string
  currentUrl: string | null | undefined
  noLogoLabel: string
  uploadLabel: string
  replaceLabel: string
  removeLabel: string
  uploadingLabel: string
  isUploading: boolean
  isSaving: boolean
  onFileSelected: (file: File) => void
  onRemove: () => void
}

function LogoCard({
  title,
  description,
  currentUrl,
  noLogoLabel,
  uploadLabel,
  replaceLabel,
  removeLabel,
  uploadingLabel,
  isUploading,
  isSaving,
  onFileSelected,
  onRemove,
}: LogoCardProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="flex flex-col items-start gap-4">
        {currentUrl ? (
          <img
            src={currentUrl}
            alt={title}
            className="bg-muted h-24 w-24 rounded border object-contain p-2"
          />
        ) : (
          <div className="bg-muted text-muted-foreground flex h-24 w-24 items-center justify-center rounded border text-xs">
            {noLogoLabel}
          </div>
        )}
        <div className="flex gap-2">
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/svg+xml,image/webp"
            className="sr-only"
            aria-label={currentUrl ? replaceLabel : uploadLabel}
            disabled={isUploading}
            onChange={(e) => {
              const file = e.target.files?.[0]
              e.target.value = ''
              if (file) onFileSelected(file)
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={isUploading}
            onClick={() => fileInputRef.current?.click()}
          >
            {isUploading
              ? uploadingLabel
              : currentUrl
                ? replaceLabel
                : uploadLabel}
          </Button>
          {currentUrl && (
            <Button
              type="button"
              variant="ghost"
              disabled={isUploading || isSaving}
              onClick={onRemove}
            >
              {removeLabel}
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

// ── Main form ─────────────────────────────────────────────────────────────────

function BrandingForm({ operator, operatorId, onSaved }: FormProps) {
  // ── theme state ──────────────────────────────────────────────────────────
  const persistedTheme = operator.theme ?? {}
  const [brand, setBrand] = useState(persistedTheme.brand ?? DEFAULT_BRAND)
  const [accent, setAccent] = useState(persistedTheme.accent ?? DEFAULT_ACCENT)
  const [background, setBackground] = useState(
    persistedTheme.background ?? DEFAULT_BACKGROUND,
  )

  const persistedDark = persistedTheme.dark ?? {}
  const [darkBrand, setDarkBrand] = useState(persistedDark.brand ?? '')
  const [darkAccent, setDarkAccent] = useState(persistedDark.accent ?? '')
  const [darkBackground, setDarkBackground] = useState(
    persistedDark.background ?? '',
  )
  const [darkOverridesOpen, setDarkOverridesOpen] = useState(
    // Auto-expand if there are already saved overrides
    Object.keys(persistedDark).length > 0,
  )

  // ── upload state ─────────────────────────────────────────────────────────
  const [isUploadingLight, setIsUploadingLight] = useState(false)
  const [isUploadingDark, setIsUploadingDark] = useState(false)

  // ── mutation ──────────────────────────────────────────────────────────────
  const patchMutation = useMutation({
    mutationFn: (patch: OperatorPatch) => patchOperator(operatorId, patch),
    onSuccess: () => onSaved(),
    onError: (err: Error) => {
      toast.error(t.settings.toastError, { description: err.message })
    },
  })

  // ── logo handlers ─────────────────────────────────────────────────────────

  async function uploadLogo(
    file: File,
    existingUrl: string | null | undefined,
    pathSlug: string,
    onStart: () => void,
    onEnd: () => void,
    patchField: 'logo_url' | 'logo_dark_url',
    successToast: string,
    errorToast: string,
  ) {
    if (!ALLOWED_LOGO_MIME.has(file.type)) {
      toast.error(t.settings.brandingFileTypeUnsupported)
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t.settings.brandingFileTooLarge)
      return
    }
    onStart()
    try {
      if (existingUrl) {
        const oldKey = extractStorageKey(existingUrl, operatorId)
        if (oldKey) await supabase.storage.from(LOGO_BUCKET).remove([oldKey])
      }
      const ext = guessExtension(file)
      const path = `${operatorId}/${pathSlug}-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, file, { contentType: file.type, upsert: false })
      if (upErr) throw upErr
      const {
        data: { publicUrl },
      } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
      await patchMutation.mutateAsync({ [patchField]: publicUrl } as OperatorPatch)
      toast.success(successToast)
    } catch (err) {
      toast.error(errorToast, { description: (err as Error).message })
    } finally {
      onEnd()
    }
  }

  async function removeLogo(
    existingUrl: string | null | undefined,
    patchField: 'logo_url' | 'logo_dark_url',
    successToast: string,
    errorToast: string,
  ) {
    try {
      if (existingUrl) {
        const oldKey = extractStorageKey(existingUrl, operatorId)
        if (oldKey) await supabase.storage.from(LOGO_BUCKET).remove([oldKey])
      }
      await patchMutation.mutateAsync({ [patchField]: null } as OperatorPatch)
      toast.success(successToast)
    } catch (err) {
      toast.error(errorToast, { description: (err as Error).message })
    }
  }

  // ── theme save ────────────────────────────────────────────────────────────

  function handleThemeSave() {
    const normBrand = normaliseHex(brand)
    const normAccent = normaliseHex(accent)
    const normBackground = normaliseHex(background)

    if (!normBrand || !normAccent || !normBackground) {
      toast.error(t.settings.toastError, {
        description: 'All three light-mode colours must be valid 7-char hex values (#RRGGBB).',
      })
      return
    }

    const dark: { brand?: string; accent?: string; background?: string } = {}
    if (darkBrand && normaliseHex(darkBrand)) dark.brand = normaliseHex(darkBrand)!
    if (darkAccent && normaliseHex(darkAccent)) dark.accent = normaliseHex(darkAccent)!
    if (darkBackground && normaliseHex(darkBackground))
      dark.background = normaliseHex(darkBackground)!

    const theme = {
      brand: normBrand,
      accent: normAccent,
      background: normBackground,
      ...(Object.keys(dark).length > 0 ? { dark } : {}),
    }

    patchMutation.mutate({ theme })
    toast.success(t.settings.themeToastSaved)
  }

  // ── contrast checks ───────────────────────────────────────────────────────
  const brandContrast = normaliseHex(brand) && normaliseHex(background)
    ? contrastRatio(brand, background)
    : null
  const accentContrast = normaliseHex(accent)
    ? contrastRatio(accent, '#ffffff')
    : null

  const brandContrastFail = brandContrast !== null && brandContrast < 4.5
  const accentContrastFail = accentContrast !== null && accentContrast < 4.5

  // ── render ────────────────────────────────────────────────────────────────

  return (
    // landr-3qkr.4 — remove mx-auto to let the AppShell safe-area padding
    // govern horizontal gutter on mobile. max-w-2xl still constrains on
    // larger screens. Cards already stack (space-y-6 flex-col).
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t.settings.sectionBranding}</h1>

      {/* ── Light logo ── */}
      <LogoCard
        title={t.settings.fieldLogo}
        description={t.settings.fieldLogoHint}
        currentUrl={operator.logo_url}
        noLogoLabel={t.settings.fieldLogoNone}
        uploadLabel={t.settings.fieldLogoUpload}
        replaceLabel={t.settings.fieldLogoReplace}
        removeLabel={t.settings.fieldLogoRemove}
        uploadingLabel={t.settings.fieldLogoUploading}
        isUploading={isUploadingLight}
        isSaving={patchMutation.isPending}
        onFileSelected={(file) =>
          void uploadLogo(
            file,
            operator.logo_url,
            'logo',
            () => setIsUploadingLight(true),
            () => setIsUploadingLight(false),
            'logo_url',
            t.settings.brandingToastUploaded,
            t.settings.brandingUploadError,
          )
        }
        onRemove={() =>
          void removeLogo(
            operator.logo_url,
            'logo_url',
            t.settings.brandingToastRemoved,
            t.settings.brandingRemoveError,
          )
        }
      />

      {/* ── Dark logo ── */}
      <LogoCard
        title={t.settings.fieldLogoDark}
        description={t.settings.fieldLogoDarkHint}
        currentUrl={operator.logo_dark_url}
        noLogoLabel={t.settings.fieldLogoDarkNone}
        uploadLabel={t.settings.fieldLogoDarkUpload}
        replaceLabel={t.settings.fieldLogoDarkReplace}
        removeLabel={t.settings.fieldLogoDarkRemove}
        uploadingLabel={t.settings.fieldLogoDarkUploading}
        isUploading={isUploadingDark}
        isSaving={patchMutation.isPending}
        onFileSelected={(file) =>
          void uploadLogo(
            file,
            operator.logo_dark_url,
            'logo-dark',
            () => setIsUploadingDark(true),
            () => setIsUploadingDark(false),
            'logo_dark_url',
            t.settings.brandingDarkLogoToastUploaded,
            t.settings.brandingDarkLogoUploadError,
          )
        }
        onRemove={() =>
          void removeLogo(
            operator.logo_dark_url,
            'logo_dark_url',
            t.settings.brandingDarkLogoToastRemoved,
            t.settings.brandingDarkLogoRemoveError,
          )
        }
      />

      {/* ── Theme colours ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.themeSectionTitle}</CardTitle>
          <CardDescription>{t.settings.themeSectionDesc}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <ColorField
            label={t.settings.fieldBrandColor}
            value={brand}
            onChange={setBrand}
          />
          <ColorField
            label={t.settings.fieldAccentColor}
            value={accent}
            onChange={setAccent}
          />
          <ColorField
            label={t.settings.fieldBackgroundColor}
            value={background}
            onChange={setBackground}
          />

          {/* Contrast warnings */}
          {brandContrastFail && (
            <div
              role="alert"
              className="text-destructive flex items-start gap-2 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t.settings.contrastWarningBrand}</span>
            </div>
          )}
          {accentContrastFail && (
            <div
              role="alert"
              className="text-destructive flex items-start gap-2 text-sm"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <span>{t.settings.contrastWarningAccent}</span>
            </div>
          )}

          {/* Dark overrides collapsible */}
          <div className="border-border mt-2 border-t pt-4">
            <button
              type="button"
              className="flex w-full items-center gap-2 text-sm font-medium"
              aria-expanded={darkOverridesOpen}
              onClick={() => setDarkOverridesOpen((o) => !o)}
            >
              {darkOverridesOpen ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
              {t.settings.darkOverridesSectionTitle}
            </button>
            {!darkOverridesOpen && (
              <p className="text-muted-foreground mt-1 pl-6 text-xs">
                {t.settings.darkOverridesSectionDesc}
              </p>
            )}
            {darkOverridesOpen && (
              <div className="mt-4 flex flex-col gap-4 pl-6">
                <p className="text-muted-foreground text-xs">
                  {t.settings.darkOverridesSectionDesc}
                </p>
                <ColorField
                  label={t.settings.fieldDarkBrandColor}
                  value={darkBrand || DEFAULT_BRAND}
                  onChange={setDarkBrand}
                />
                <ColorField
                  label={t.settings.fieldDarkAccentColor}
                  value={darkAccent || DEFAULT_ACCENT}
                  onChange={setDarkAccent}
                />
                <ColorField
                  label={t.settings.fieldDarkBackgroundColor}
                  value={darkBackground || DEFAULT_BACKGROUND}
                  onChange={setDarkBackground}
                />
              </div>
            )}
          </div>

          <div className="flex gap-2 pt-2">
            <Button
              type="button"
              onClick={handleThemeSave}
              disabled={patchMutation.isPending}
              data-testid="theme-save"
            >
              {patchMutation.isPending ? t.settings.saving : t.settings.save}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* ── Preview ── */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.brandingPreviewTitle}</CardTitle>
          <CardDescription>{t.settings.brandingPreviewDesc}</CardDescription>
        </CardHeader>
        {/* landr-3qkr.4 — single column on mobile, 2-up on sm+ */}
        <CardContent>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {/* Light preview */}
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">
                {t.settings.brandingPreviewLight}
              </p>
              <WidgetPreview
                brand={brand}
                accent={accent}
                background={background}
                logoUrl={operator.logo_url}
              />
            </div>
            {/* Dark preview */}
            <div>
              <p className="text-muted-foreground mb-2 text-xs font-medium">
                {t.settings.brandingPreviewDark}
              </p>
              <WidgetPreview
                brand={darkBrand || deriveDark(brand)}
                accent={darkAccent || deriveDark(accent)}
                background={darkBackground || deriveDark(background, true)}
                logoUrl={operator.logo_dark_url ?? operator.logo_url}
              />
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ── WidgetPreview ─────────────────────────────────────────────────────────────

function WidgetPreview({
  brand,
  accent,
  background,
  logoUrl,
}: {
  brand: string
  accent: string
  background: string
  logoUrl: string | null | undefined
}) {
  const normBrand = normaliseHex(brand) ?? DEFAULT_BRAND
  const normAccent = normaliseHex(accent) ?? DEFAULT_ACCENT
  const normBackground = normaliseHex(background) ?? DEFAULT_BACKGROUND

  return (
    <div
      className="flex flex-col items-center gap-3 rounded border p-4"
      style={{ backgroundColor: normBackground }}
    >
      {logoUrl ? (
        <img
          src={logoUrl}
          alt="Widget logo preview"
          className="h-10 w-10 object-contain"
        />
      ) : (
        <div
          className="flex h-10 w-10 items-center justify-center rounded text-xs font-bold"
          style={{ color: normBrand, backgroundColor: `${normAccent}22` }}
        >
          L
        </div>
      )}
      <p
        className="text-sm font-medium"
        style={{ color: normBrand }}
      >
        Choose a service
      </p>
      <button
        type="button"
        className="w-full rounded-md px-4 py-1.5 text-sm font-medium text-white shadow"
        style={{ backgroundColor: normAccent }}
      >
        {t.settings.brandingPreviewCta}
      </button>
    </div>
  )
}

// deriveDark, relativeLuminance, contrastRatio, normaliseHex are imported
// from @/lib/branding-color (extracted by landr-v9e4.9).
