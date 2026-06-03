// ProductImageManager.tsx — per-product image gallery editor (landr-d8rg.9).
//
// Wired into ProductForm as a sibling component (one import + render call);
// the form is intentionally kept lean per landr-v9e4 review.
//
// Features:
//   - 4-slot horizontal strip with thumb previews (public URLs from path).
//   - Add button (file pick; drag-drop on the strip via onDrop).
//   - Per-image: alt-text input (PATCH row), up/down reorder (swap sort_order),
//     delete (row DELETE + remove BOTH storage objects).
//   - Counter '2/4'. Disabled while product is unsaved/new (needs product_id).
//   - All errors surfaced via toast — NEVER silent.
//   - Strings via t.products.images* block.
//
// Upload pipeline (client-side, reused by landr-d8rg.10):
//   file -> processImage -> thumb (800w) + hero (1600w) blobs ->
//   supabase.storage.from('product-images').upload() x2 ->
//   createProductImage row (operator_id, product_id, thumb_path, hero_path, alt, sort_order).

import { useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowDownIcon,
  ArrowUpIcon,
  ImageIcon,
  PlusIcon,
  Trash2Icon,
} from 'lucide-react'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { processImage } from '@/lib/image-pipeline'
import {
  createProductImage,
  deleteProductImage,
  fetchProductImages,
  getProductImagePublicUrl,
  MAX_IMAGES_PER_PRODUCT,
  patchProductImage,
  PRODUCT_IMAGES_BUCKET,
  removeProductImageStorageObjects,
  type ProductImage,
} from '@/lib/product-images'
import { supabase } from '@/lib/supabase'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
  productId: string
}

// ── query key ────────────────────────────────────────────────────────────────
const qKey = (productId: string) => ['product-images', productId] as const

// ── upload helper ─────────────────────────────────────────────────────────────

/**
 * Process + upload a file, then insert the product_images row.
 * Returns the new row on success; throws on any step failure.
 */
async function uploadImage(
  file: File,
  operatorId: string,
  productId: string,
  nextSortOrder: number,
): Promise<ProductImage> {
  // 1. Client-side pipeline: decode + resize + WebP compress.
  const { thumb, hero } = await processImage(file)

  // 2. Generate UUID-based paths.
  const uuid = crypto.randomUUID()
  const thumbPath = `${operatorId}/products/${productId}/${uuid}-thumb.webp`
  const heroPath = `${operatorId}/products/${productId}/${uuid}-hero.webp`

  // 3. Upload thumb.
  const { error: thumbErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(thumbPath, thumb.blob, {
      contentType: 'image/webp',
      upsert: false,
    })
  if (thumbErr) throw new Error(thumbErr.message)

  // 4. Upload hero (or thumb blob if source too narrow to produce hero rendition).
  const heroBlob = hero?.blob ?? thumb.blob
  const { error: heroErr } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(heroPath, heroBlob, {
      contentType: 'image/webp',
      upsert: false,
    })
  if (heroErr) {
    // Roll back thumb if hero upload fails.
    await supabase.storage.from(PRODUCT_IMAGES_BUCKET).remove([thumbPath])
    throw new Error(heroErr.message)
  }

  // 5. Insert product_images row.
  return createProductImage({
    operator_id: operatorId,
    product_id: productId,
    thumb_path: thumbPath,
    hero_path: heroPath,
    alt: null,
    sort_order: nextSortOrder,
  })
}

// ── component ─────────────────────────────────────────────────────────────────

export function ProductImageManager({ operatorId, productId }: Props) {
  const qc = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploadingCount, setUploadingCount] = useState(0)
  const [draggingOver, setDraggingOver] = useState(false)

  const { data: images = [], isLoading, isError } = useQuery({
    queryKey: qKey(productId),
    queryFn: () => fetchProductImages(productId),
  })

  const isUploading = uploadingCount > 0
  const atMax = images.length >= MAX_IMAGES_PER_PRODUCT

  // ── Upload mutation ──────────────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const nextSortOrder = images.length > 0
        ? Math.max(...images.map((i) => i.sort_order)) + 1
        : 0
      return uploadImage(file, operatorId, productId, nextSortOrder)
    },
    onMutate: () => setUploadingCount((c) => c + 1),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qKey(productId) })
      toast.success(t.products.imagesToastUploaded)
    },
    onError: (err: Error) => {
      toast.error(t.products.imagesToastUploadError, {
        description: err.message,
      })
    },
    onSettled: () => setUploadingCount((c) => Math.max(0, c - 1)),
  })

  // ── Delete mutation ──────────────────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: async (img: ProductImage) => {
      // Delete row first; if that fails we surface immediately.
      await deleteProductImage(img.id)
      // Remove BOTH storage objects; surface failure via toast but don't
      // re-throw — the row is already gone.
      try {
        await removeProductImageStorageObjects([img.thumb_path, img.hero_path])
      } catch (storageErr) {
        toast.error(t.products.imagesToastDeleteStorageError, {
          description: (storageErr as Error).message,
        })
      }
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qKey(productId) })
      toast.success(t.products.imagesToastDeleted)
    },
    onError: (err: Error) => {
      toast.error(t.products.imagesToastUploadError, {
        description: err.message,
      })
    },
  })

  // ── Alt-text mutation ────────────────────────────────────────────────────
  const altMutation = useMutation({
    mutationFn: ({ id, alt }: { id: string; alt: string }) =>
      patchProductImage(id, { alt: alt.trim() || null }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qKey(productId) })
      toast.success(t.products.imagesToastAltSaved)
    },
    onError: (err: Error) => {
      toast.error(t.products.imagesToastAltError, {
        description: err.message,
      })
    },
  })

  // ── Reorder mutation ─────────────────────────────────────────────────────
  const reorderMutation = useMutation({
    mutationFn: async ({
      idA,
      orderA,
      idB,
      orderB,
    }: {
      idA: string
      orderA: number
      idB: string
      orderB: number
    }) => {
      await Promise.all([
        patchProductImage(idA, { sort_order: orderB }),
        patchProductImage(idB, { sort_order: orderA }),
      ])
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: qKey(productId) })
    },
    onError: (err: Error) => {
      toast.error(t.products.imagesToastReorderError, {
        description: err.message,
      })
    },
  })

  // ── Event handlers ───────────────────────────────────────────────────────

  function handleFilePick(files: FileList | null) {
    if (!files || files.length === 0) return
    const file = files[0]
    if (atMax) return
    uploadMutation.mutate(file)
  }

  function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    setDraggingOver(false)
    if (atMax || isUploading) return
    const file = e.dataTransfer.files[0]
    if (file) uploadMutation.mutate(file)
  }

  function handleMoveUp(idx: number) {
    if (idx === 0) return
    const a = images[idx]
    const b = images[idx - 1]
    reorderMutation.mutate({
      idA: a.id,
      orderA: a.sort_order,
      idB: b.id,
      orderB: b.sort_order,
    })
  }

  function handleMoveDown(idx: number) {
    if (idx >= images.length - 1) return
    const a = images[idx]
    const b = images[idx + 1]
    reorderMutation.mutate({
      idA: a.id,
      orderA: a.sort_order,
      idB: b.id,
      orderB: b.sort_order,
    })
  }

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle>{t.products.imagesSectionTitle}</CardTitle>
          <span className="text-muted-foreground text-sm tabular-nums">
            {t.products.imagesCounter(images.length, MAX_IMAGES_PER_PRODUCT)}
          </span>
        </div>
      </CardHeader>

      <CardContent className="flex flex-col gap-4">
        {isLoading && (
          <p className="text-muted-foreground text-sm">{t.products.imagesLoading}</p>
        )}

        {isError && (
          <p className="text-destructive text-sm">{t.products.imagesLoadError}</p>
        )}

        {/* Image strip */}
        {images.length > 0 && (
          <div
            className="flex gap-3 overflow-x-auto pb-1"
            role="list"
            aria-label={t.products.imagesSectionTitle}
          >
            {images.map((img, idx) => (
              <ImageSlot
                key={img.id}
                img={img}
                idx={idx}
                total={images.length}
                onMoveUp={() => handleMoveUp(idx)}
                onMoveDown={() => handleMoveDown(idx)}
                onDelete={() => deleteMutation.mutate(img)}
                onAltSave={(alt) => altMutation.mutate({ id: img.id, alt })}
                isDeleting={
                  deleteMutation.isPending &&
                  deleteMutation.variables?.id === img.id
                }
                isReordering={reorderMutation.isPending}
              />
            ))}
          </div>
        )}

        {images.length === 0 && !isLoading && !isError && (
          <p className="text-muted-foreground text-sm">{t.products.imagesEmpty}</p>
        )}

        {/* Drop zone + add button */}
        <div
          className={[
            'flex items-center gap-3',
            draggingOver ? 'rounded border-2 border-dashed border-blue-400 p-2' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onDragOver={(e) => {
            e.preventDefault()
            setDraggingOver(true)
          }}
          onDragLeave={() => setDraggingOver(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
            className="sr-only"
            aria-label={t.products.imagesAddAriaLabel}
            disabled={atMax || isUploading}
            onChange={(e) => {
              handleFilePick(e.target.files)
              e.target.value = ''
            }}
          />
          <Button
            type="button"
            variant="outline"
            disabled={atMax || isUploading}
            onClick={() => fileInputRef.current?.click()}
            data-testid="add-product-image-btn"
          >
            <PlusIcon className="mr-1 size-4" />
            {isUploading
              ? t.products.imagesUploading
              : t.products.imagesAddButton}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}

// ── Slot sub-component ────────────────────────────────────────────────────────

type SlotProps = {
  img: ProductImage
  idx: number
  total: number
  onMoveUp: () => void
  onMoveDown: () => void
  onDelete: () => void
  onAltSave: (alt: string) => void
  isDeleting: boolean
  isReordering: boolean
}

function ImageSlot({
  img,
  idx,
  total,
  onMoveUp,
  onMoveDown,
  onDelete,
  onAltSave,
  isDeleting,
  isReordering,
}: SlotProps) {
  const [altDraft, setAltDraft] = useState(img.alt ?? '')
  const thumbUrl = getProductImagePublicUrl(img.thumb_path)

  function commitAlt() {
    if (altDraft !== (img.alt ?? '')) {
      onAltSave(altDraft)
    }
  }

  return (
    <div
      role="listitem"
      className="bg-muted flex w-40 shrink-0 flex-col gap-2 rounded border p-2"
      data-testid={`image-slot-${img.id}`}
    >
      {/* Preview */}
      <div className="bg-background flex h-24 items-center justify-center overflow-hidden rounded border">
        <img
          src={thumbUrl}
          alt={img.alt ?? ''}
          className="h-full w-full object-cover"
          onError={(e) => {
            // Replace broken image with fallback icon.
            ;(e.currentTarget as HTMLImageElement).style.display = 'none'
            const parent = e.currentTarget.parentElement
            if (parent && !parent.querySelector('.img-fallback')) {
              const icon = document.createElement('div')
              icon.className =
                'img-fallback text-muted-foreground flex h-full w-full items-center justify-center'
              icon.innerHTML =
                '<svg xmlns="http://www.w3.org/2000/svg" class="h-8 w-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>'
              parent.appendChild(icon)
            }
          }}
        />
      </div>

      {/* Alt text */}
      <Input
        value={altDraft}
        aria-label={t.products.imagesAltLabel}
        placeholder={t.products.imagesAltPlaceholder}
        className="h-7 text-xs"
        onChange={(e) => setAltDraft(e.target.value)}
        onBlur={commitAlt}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault()
            commitAlt()
          }
        }}
      />

      {/* Controls */}
      <div className="flex items-center justify-between gap-1">
        <div className="flex gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={idx === 0 || isReordering}
            aria-label={t.products.imagesMoveUp}
            onClick={onMoveUp}
            data-testid={`move-up-${img.id}`}
          >
            <ArrowUpIcon className="size-3" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="h-6 w-6"
            disabled={idx >= total - 1 || isReordering}
            aria-label={t.products.imagesMoveDown}
            onClick={onMoveDown}
            data-testid={`move-down-${img.id}`}
          >
            <ArrowDownIcon className="size-3" />
          </Button>
        </div>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="text-destructive h-6 w-6"
          disabled={isDeleting}
          aria-label={t.products.imagesDelete}
          onClick={onDelete}
          data-testid={`delete-image-${img.id}`}
        >
          <Trash2Icon className="size-3" />
        </Button>
      </div>
    </div>
  )
}

// ── Disabled placeholder (new product) ───────────────────────────────────────

/**
 * Rendered by ProductForm when product is null (unsaved/new).
 * Matches the same pattern as ProductAddonsManager's save-first hint.
 */
export function ProductImageManagerDisabledHint() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <ImageIcon className="text-muted-foreground size-4" />
          <CardTitle>{t.products.imagesSectionTitle}</CardTitle>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-muted-foreground text-sm">
          {t.products.imagesSaveFirstHint}
        </p>
      </CardContent>
    </Card>
  )
}
