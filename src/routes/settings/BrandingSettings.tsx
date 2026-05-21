import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
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
import { OperatorSection } from './_shared'

// landr-yp8x — Settings → Branding. Single page with two independent
// controls:
//   * Logo: upload via Supabase Storage (bucket=operator-logos, layout
//     <operator_id>/<filename>) then PATCH the public URL onto
//     operators.logo_url. Replace = delete-old-then-upload-new so stale
//     files don't accumulate.
//   * Primary colour: HTML5 <input type=color> + a hex Input pinned to
//     the value. Saves via the same patchOperator mutation; no upload
//     round-trip needed.
//
// The Preview card mirrors what the embedded booking widget will render
// with these values so the operator can iterate without hopping repos.
// Default colour 'oklch(0.205 0 0)' from the widget's index.css; we
// fall back to a black equivalent (#101010) for the colour picker default
// because <input type=color> only speaks sRGB hex.

const LOGO_BUCKET = 'operator-logos'
const MAX_LOGO_BYTES = 2 * 1024 * 1024 // 2 MB
const ALLOWED_LOGO_MIME = new Set([
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/svg+xml',
  'image/webp',
])
const DEFAULT_PRIMARY_COLOR = '#101010'

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
            // Re-mount the form when the persisted colour changes (e.g. after
            // a successful save → invalidate → refetch) so the local picker
            // / hex inputs re-seed from props. This replaces a useEffect that
            // synchronously called setState on prop change — flagged by the
            // react-hooks/set-state-in-effect lint rule as a source of
            // cascading renders. `key` is the React-canonical pattern for
            // "reset local state when this prop changes".
            key={operator.primary_color ?? DEFAULT_PRIMARY_COLOR}
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

function BrandingForm({ operator, operatorId, onSaved }: FormProps) {
  const initialColor = operator.primary_color ?? DEFAULT_PRIMARY_COLOR
  const [color, setColor] = useState(initialColor)
  // The hex Input is kept as a free-text mirror so users can type/paste
  // a colour directly without going through the native picker; we
  // validate on save.
  const [colorInput, setColorInput] = useState(initialColor)
  const [isUploading, setIsUploading] = useState(false)

  // Re-seeding from props on refetch happens via the `key` prop on
  // <BrandingForm> in the parent — see BrandingSettings above.

  const patchMutation = useMutation({
    mutationFn: (patch: OperatorPatch) => patchOperator(operatorId, patch),
    onSuccess: () => onSaved(),
    onError: (err: Error) => {
      toast.error(t.settings.toastError, { description: err.message })
    },
  })

  async function handleLogoSelected(file: File) {
    if (!ALLOWED_LOGO_MIME.has(file.type)) {
      toast.error(t.settings.brandingFileTypeUnsupported)
      return
    }
    if (file.size > MAX_LOGO_BYTES) {
      toast.error(t.settings.brandingFileTooLarge)
      return
    }
    setIsUploading(true)
    try {
      // Strip the operator id prefix off any pre-existing logo URL and
      // delete it first so the bucket doesn't accumulate stale files.
      if (operator.logo_url) {
        const oldKey = extractStorageKey(operator.logo_url, operatorId)
        if (oldKey) {
          await supabase.storage.from(LOGO_BUCKET).remove([oldKey])
        }
      }
      // Cache-bust on path so the widget's <img src> doesn't serve a
      // stale cached version after the operator re-uploads.
      const ext = guessExtension(file)
      const path = `${operatorId}/logo-${Date.now()}.${ext}`
      const { error: upErr } = await supabase.storage
        .from(LOGO_BUCKET)
        .upload(path, file, {
          contentType: file.type,
          upsert: false,
        })
      if (upErr) throw upErr
      const {
        data: { publicUrl },
      } = supabase.storage.from(LOGO_BUCKET).getPublicUrl(path)
      await patchMutation.mutateAsync({ logo_url: publicUrl })
      toast.success(t.settings.brandingToastUploaded)
    } catch (err) {
      toast.error(t.settings.brandingUploadError, {
        description: (err as Error).message,
      })
    } finally {
      setIsUploading(false)
    }
  }

  async function handleLogoRemove() {
    try {
      if (operator.logo_url) {
        const oldKey = extractStorageKey(operator.logo_url, operatorId)
        if (oldKey) {
          await supabase.storage.from(LOGO_BUCKET).remove([oldKey])
        }
      }
      await patchMutation.mutateAsync({ logo_url: null })
      toast.success(t.settings.brandingToastRemoved)
    } catch (err) {
      toast.error(t.settings.brandingRemoveError, {
        description: (err as Error).message,
      })
    }
  }

  function handleColorSave() {
    const normalised = normaliseHex(colorInput)
    if (!normalised) {
      toast.error(t.settings.toastError, {
        description: 'Must be a 7-char hex colour like #FF8800.',
      })
      return
    }
    setColor(normalised)
    setColorInput(normalised)
    patchMutation.mutate({ primary_color: normalised })
    toast.success(t.settings.brandingToastColorSaved)
  }

  function handleColorReset() {
    setColor(DEFAULT_PRIMARY_COLOR)
    setColorInput(DEFAULT_PRIMARY_COLOR)
    patchMutation.mutate({ primary_color: null })
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold">{t.settings.sectionBranding}</h1>

      {/* --- Logo --- */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.fieldLogo}</CardTitle>
          <CardDescription>{t.settings.fieldLogoHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col items-start gap-4">
          {operator.logo_url ? (
            <img
              src={operator.logo_url}
              alt="Operator logo"
              className="bg-muted h-24 w-24 rounded border object-contain p-2"
            />
          ) : (
            <div className="bg-muted text-muted-foreground flex h-24 w-24 items-center justify-center rounded border text-xs">
              {t.settings.fieldLogoNone}
            </div>
          )}
          <div className="flex gap-2">
            <Label asChild>
              <Button asChild variant="outline" disabled={isUploading}>
                <span className="cursor-pointer">
                  {isUploading
                    ? t.settings.fieldLogoUploading
                    : operator.logo_url
                      ? t.settings.fieldLogoReplace
                      : t.settings.fieldLogoUpload}
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    className="sr-only"
                    aria-label={t.settings.fieldLogoUpload}
                    disabled={isUploading}
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      // Reset input so re-selecting the same file fires
                      // the change event again.
                      e.target.value = ''
                      if (file) void handleLogoSelected(file)
                    }}
                  />
                </span>
              </Button>
            </Label>
            {operator.logo_url && (
              <Button
                type="button"
                variant="ghost"
                disabled={isUploading || patchMutation.isPending}
                onClick={() => void handleLogoRemove()}
              >
                {t.settings.fieldLogoRemove}
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* --- Primary colour --- */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.fieldPrimaryColor}</CardTitle>
          <CardDescription>{t.settings.fieldPrimaryColorHint}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-3">
            <input
              type="color"
              aria-label={t.settings.fieldPrimaryColor}
              value={color}
              onChange={(e) => {
                setColor(e.target.value)
                setColorInput(e.target.value)
              }}
              className="h-10 w-14 cursor-pointer rounded border bg-transparent"
            />
            <Input
              aria-label="Primary colour hex"
              value={colorInput}
              onChange={(e) => setColorInput(e.target.value)}
              placeholder="#FF8800"
              className="w-32 font-mono uppercase"
              maxLength={7}
            />
            <Button
              type="button"
              onClick={handleColorSave}
              disabled={patchMutation.isPending}
            >
              {patchMutation.isPending ? t.settings.saving : t.settings.save}
            </Button>
            <Button
              type="button"
              variant="ghost"
              onClick={handleColorReset}
              disabled={patchMutation.isPending}
            >
              {t.settings.fieldPrimaryColorReset}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* --- Preview --- */}
      <Card>
        <CardHeader>
          <CardTitle>{t.settings.brandingPreviewTitle}</CardTitle>
          <CardDescription>{t.settings.brandingPreviewDesc}</CardDescription>
        </CardHeader>
        <CardContent>
          <div
            className="bg-card flex flex-col items-center gap-4 rounded border p-6"
            // Inline style so the preview reflects the picker's current
            // value even before the operator hits Save.
            style={{ ['--brand-primary' as string]: color }}
          >
            {operator.logo_url ? (
              <img
                src={operator.logo_url}
                alt="Operator logo preview"
                className="h-12 w-12 object-contain"
              />
            ) : (
              <div className="text-muted-foreground text-sm">
                {t.settings.fieldLogoNone}
              </div>
            )}
            <button
              type="button"
              className="rounded-md px-6 py-2 font-medium text-white shadow"
              style={{ backgroundColor: color }}
            >
              {t.settings.brandingPreviewCta}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}

// ---- helpers ---------------------------------------------------------

/**
 * Pull the storage object key (path within the bucket) out of a Supabase
 * public URL so we can call storage.remove() on the previous logo before
 * uploading a new one. Returns null if the URL doesn't look like one of
 * our operator-logos bucket URLs — in that case the caller skips the
 * delete (we don't want to no-op-then-orphan unrelated URLs operators
 * might paste in via direct PATCH).
 */
function extractStorageKey(url: string, operatorId: string): string | null {
  const marker = `/object/public/${LOGO_BUCKET}/`
  const idx = url.indexOf(marker)
  if (idx === -1) return null
  const key = url.slice(idx + marker.length)
  // Defensive: only delete files under this operator's folder; the RLS
  // policy would reject cross-tenant deletes anyway but failing fast is
  // friendlier than a surprise 403 on the network tab.
  return key.startsWith(`${operatorId}/`) ? key : null
}

function guessExtension(file: File): string {
  if (file.type === 'image/svg+xml') return 'svg'
  if (file.type === 'image/png') return 'png'
  if (file.type === 'image/webp') return 'webp'
  return 'jpg'
}

/**
 * Accept '#abcdef', 'ABCDEF', '#ABCDEF', etc. and normalise to '#aabbcc'
 * (lowercase, leading #). Returns null when the string isn't 6 hex chars.
 */
function normaliseHex(raw: string): string | null {
  const trimmed = raw.trim().replace(/^#/, '')
  if (!/^[0-9a-fA-F]{6}$/.test(trimmed)) return null
  return `#${trimmed.toLowerCase()}`
}
