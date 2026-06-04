/**
 * ProductGroupManager — list / add / rename / cover-image / tagline / delete
 * UI for the per-operator `product_groups` taxonomy.
 *
 * Rendered inside a Sheet opened by the pen icon next to the Product-group
 * select in ProductForm. After a successful mutation the
 * `['product_groups', operatorId]` query is invalidated so the parent
 * dropdown picks up the change without a manual reload.
 *
 * landr-19m, landr-d8rg.10.
 *
 * Cover image upload (landr-d8rg.10):
 *   file → processImage (hero rendition only; thumb discarded) →
 *   supabase.storage.from('product-images').upload(hero blob) →
 *   PATCH product_groups.image_url with the public URL via direct Supabase REST.
 *
 * Storage bucket:  'product-images' (public)
 * Path pattern:    {operator_id}/groups/{group_id}/{uuid}.webp
 */
import { useRef, useMemo, useState } from 'react'
import {
  ImageIcon,
  PencilIcon,
  PlusIcon,
  Trash2Icon,
  XIcon,
} from 'lucide-react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { processImage } from '@/lib/image-pipeline'
import { nameToSlug } from '@/lib/products'
import {
  createProductGroup,
  deleteProductGroup,
  fetchProductGroupsFull,
  updateProductGroup,
  type ProductGroup,
} from '@/lib/productGroups'
import {
  PRODUCT_IMAGES_BUCKET,
  getProductImagePublicUrl,
} from '@/lib/product-images'
import { supabase } from '@/lib/supabase'
import { t } from '@/lib/strings'

type Props = {
  operatorId: string
}

// ── Storage helper ────────────────────────────────────────────────────────────

/**
 * Upload a File as the group cover image (hero rendition only — 1600 w or
 * the source width if narrower). Returns the public URL.
 */
async function uploadGroupCover(
  file: File,
  operatorId: string,
  groupId: string,
): Promise<string> {
  // Run through the shared pipeline. We only use the hero rendition (or the
  // thumb blob when the source is narrower than 1600 px — processImage never
  // upscales, so hero is null in that case).
  const { thumb, hero } = await processImage(file)
  const blob = hero?.blob ?? thumb.blob

  const uuid = crypto.randomUUID()
  const storagePath = `${operatorId}/groups/${groupId}/${uuid}.webp`

  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .upload(storagePath, blob, {
      contentType: 'image/webp',
      upsert: false,
    })
  if (error) throw new Error(error.message)

  return getProductImagePublicUrl(storagePath)
}

/**
 * Extract the storage path from a public URL so we can call storage.remove().
 * The URL is of the form:
 *   https://<project>.supabase.co/storage/v1/object/public/product-images/<path>
 * Returns null when the URL doesn't match the expected shape (storage delete
 * is then skipped gracefully).
 */
function storagePathFromPublicUrl(
  publicUrl: string,
  bucket: string,
): string | null {
  const marker = `/object/public/${bucket}/`
  const idx = publicUrl.indexOf(marker)
  return idx !== -1 ? publicUrl.slice(idx + marker.length) : null
}

// ── Component ─────────────────────────────────────────────────────────────────

export function ProductGroupManager({ operatorId }: Props) {
  const qc = useQueryClient()
  const [draftName, setDraftName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [editingDescription, setEditingDescription] = useState('')
  const [uploadingGroupId, setUploadingGroupId] = useState<string | null>(null)
  const fileInputRefs = useRef<Map<string, HTMLInputElement>>(new Map())

  const query = useQuery<ProductGroup[]>({
    queryKey: ['product-groups', operatorId],
    queryFn: () => fetchProductGroupsFull(operatorId),
    enabled: !!operatorId,
  })

  const groups = useMemo(() => query.data ?? [], [query.data])

  // Keep both query keys fresh: the manager uses ['product-groups', op] (full
  // rows incl. sort_order / active), while ProductForm + ProductsManager +
  // Step5Products consume the lighter ['product_groups', op] (id/name/slug)
  // fetched directly from Supabase. Both need to update after mutations.
  function invalidate() {
    qc.invalidateQueries({ queryKey: ['product-groups', operatorId] })
    qc.invalidateQueries({ queryKey: ['product_groups', operatorId] })
  }

  // ── Create ──────────────────────────────────────────────────────────────────

  const createMutation = useMutation({
    mutationFn: () => {
      const name = draftName.trim()
      const slug = nameToSlug(name)
      return createProductGroup(operatorId, {
        name,
        slug: slug || name.toLowerCase(),
      })
    },
    onSuccess: () => {
      setDraftName('')
      invalidate()
      toast.success(t.products.productGroupManagerToastCreated)
    },
    onError: (err: Error) =>
      toast.error(t.products.productGroupManagerToastError, {
        description: err.message,
      }),
  })

  // ── Rename + description patch ──────────────────────────────────────────────

  const patchMutation = useMutation({
    mutationFn: (vars: { id: string; name: string; description: string }) =>
      updateProductGroup(operatorId, vars.id, {
        name: vars.name.trim(),
        description: vars.description.trim() || null,
      }),
    onSuccess: () => {
      setEditingId(null)
      setEditingName('')
      setEditingDescription('')
      invalidate()
      toast.success(t.products.productGroupManagerToastUpdated)
    },
    onError: (err: Error) =>
      toast.error(t.products.productGroupManagerToastError, {
        description: err.message,
      }),
  })

  // ── Delete ──────────────────────────────────────────────────────────────────

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteProductGroup(operatorId, id),
    onSuccess: () => {
      invalidate()
      toast.success(t.products.productGroupManagerToastDeleted)
    },
    onError: (err: Error) =>
      toast.error(t.products.productGroupManagerToastError, {
        description: err.message,
      }),
  })

  // ── Cover image upload / replace ────────────────────────────────────────────

  const coverUploadMutation = useMutation({
    mutationFn: async (vars: { groupId: string; file: File }) => {
      const publicUrl = await uploadGroupCover(
        vars.file,
        operatorId,
        vars.groupId,
      )
      // PATCH product_groups.image_url via direct Supabase REST
      const { error } = await supabase
        .from('product_groups')
        .update({ image_url: publicUrl })
        .eq('id', vars.groupId)
      if (error) throw new Error(error.message)
      return publicUrl
    },
    onMutate: (vars) => setUploadingGroupId(vars.groupId),
    onSuccess: () => {
      invalidate()
      toast.success(t.products.productGroupCoverToastUploaded)
    },
    onError: (err: Error) =>
      toast.error(t.products.productGroupCoverToastError, {
        description: err.message,
      }),
    onSettled: () => setUploadingGroupId(null),
  })

  // ── Cover image remove ──────────────────────────────────────────────────────

  const coverRemoveMutation = useMutation({
    mutationFn: async (vars: { groupId: string; imageUrl: string }) => {
      // PATCH image_url → NULL first; row is the source of truth.
      const { error: patchErr } = await supabase
        .from('product_groups')
        .update({ image_url: null })
        .eq('id', vars.groupId)
      if (patchErr) throw new Error(patchErr.message)

      // Best-effort storage object delete.
      const storagePath = storagePathFromPublicUrl(
        vars.imageUrl,
        PRODUCT_IMAGES_BUCKET,
      )
      if (storagePath) {
        const { error: storageErr } = await supabase.storage
          .from(PRODUCT_IMAGES_BUCKET)
          .remove([storagePath])
        if (storageErr) {
          // Row already cleared — surface via toast but don't re-throw.
          toast.error(t.products.productGroupCoverToastRemoveError, {
            description: storageErr.message,
          })
        }
      }
    },
    onSuccess: () => {
      invalidate()
      toast.success(t.products.productGroupCoverToastRemoved)
    },
    onError: (err: Error) =>
      toast.error(t.products.productGroupCoverToastRemoveError, {
        description: err.message,
      }),
  })

  // ── Event handler ────────────────────────────────────────────────────────────

  function handleCoverFilePick(groupId: string, files: FileList | null) {
    if (!files || files.length === 0) return
    coverUploadMutation.mutate({ groupId, file: files[0] })
  }

  // Derive the active edit row from the live list — if the row vanishes
  // (deleted concurrently or filtered out by a refetch) we silently drop
  // back to the add form on the next render rather than calling setState
  // inside an effect.
  const activeEditId =
    editingId && groups.some((g) => g.id === editingId) ? editingId : null

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="flex flex-col gap-4">
      {query.isPending ? (
        <p className="text-muted-foreground text-sm">Loading…</p>
      ) : query.isError ? (
        <p className="text-destructive text-sm">
          {query.error instanceof Error
            ? query.error.message
            : 'Failed to load product groups'}
        </p>
      ) : (
        <ul className="flex flex-col gap-2">
          {groups.length === 0 ? (
            <li className="text-muted-foreground text-sm">
              {t.products.productGroupManagerEmpty}
            </li>
          ) : (
            groups.map((g) => (
              <li
                key={g.id}
                className="flex flex-col gap-2 rounded-md border p-2"
              >
                {activeEditId === g.id ? (
                  // ── Edit form ─────────────────────────────────────────────
                  <form
                    className="flex flex-col gap-2"
                    aria-label={t.products.productGroupManagerEditTitle}
                    onSubmit={(e) => {
                      e.preventDefault()
                      if (editingName.trim())
                        patchMutation.mutate({
                          id: g.id,
                          name: editingName,
                          description: editingDescription,
                        })
                    }}
                  >
                    <Input
                      autoFocus
                      aria-label={t.products.productGroupManagerNameLabel}
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="h-8"
                      placeholder={t.products.productGroupManagerNameLabel}
                    />
                    <Textarea
                      aria-label={t.products.productGroupDescriptionLabel}
                      value={editingDescription}
                      onChange={(e) => setEditingDescription(e.target.value)}
                      placeholder={
                        t.products.productGroupDescriptionPlaceholder
                      }
                      className="min-h-[4rem] resize-none text-sm"
                      rows={2}
                    />
                    <div className="flex gap-2">
                      <Button
                        type="submit"
                        size="sm"
                        disabled={patchMutation.isPending}
                      >
                        {t.products.productGroupManagerSave}
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingId(null)
                          setEditingName('')
                          setEditingDescription('')
                        }}
                      >
                        {t.products.productGroupManagerCancel}
                      </Button>
                    </div>
                  </form>
                ) : (
                  // ── View row ──────────────────────────────────────────────
                  <div className="flex items-start gap-2">
                    {/* Cover image thumbnail or placeholder */}
                    <div
                      className="bg-muted flex h-14 w-14 shrink-0 items-center justify-center overflow-hidden rounded border"
                      data-testid={`group-cover-${g.id}`}
                    >
                      {g.image_url ? (
                        <img
                          src={g.image_url}
                          alt={t.products.productGroupCoverAlt(g.name)}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <ImageIcon className="text-muted-foreground size-6" />
                      )}
                    </div>

                    {/* Name + description + cover actions */}
                    <div className="flex flex-1 flex-col gap-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex-1 text-sm font-medium">
                          {g.name}{' '}
                          <span className="text-muted-foreground text-xs font-normal">
                            ({g.slug})
                          </span>
                        </span>
                        <div className="flex items-center gap-1">
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t.products.productGroupManagerEditAria(
                              g.name,
                            )}
                            onClick={() => {
                              setEditingId(g.id)
                              setEditingName(g.name)
                              setEditingDescription(g.description ?? '')
                            }}
                          >
                            <PencilIcon className="size-3.5" />
                          </Button>
                          <Button
                            type="button"
                            size="icon-sm"
                            variant="ghost"
                            aria-label={t.products.productGroupManagerDeleteAria(
                              g.name,
                            )}
                            disabled={deleteMutation.isPending}
                            onClick={() => {
                              if (
                                window.confirm(
                                  t.products.productGroupManagerDeleteConfirm(
                                    g.name,
                                  ),
                                )
                              ) {
                                deleteMutation.mutate(g.id)
                              }
                            }}
                          >
                            <Trash2Icon className="size-3.5" />
                          </Button>
                        </div>
                      </div>

                      {/* Description tagline */}
                      {g.description && (
                        <p className="text-muted-foreground text-xs">
                          {g.description}
                        </p>
                      )}

                      {/* Cover image controls */}
                      <div className="flex flex-wrap items-center gap-2">
                        {/* Hidden file input per group */}
                        <input
                          ref={(el) => {
                            if (el) fileInputRefs.current.set(g.id, el)
                            else fileInputRefs.current.delete(g.id)
                          }}
                          type="file"
                          accept="image/jpeg,image/png,image/webp,image/heic,image/heif"
                          className="sr-only"
                          aria-label={t.products.productGroupCoverLabel}
                          data-testid={`cover-file-input-${g.id}`}
                          onChange={(e) => {
                            handleCoverFilePick(g.id, e.target.files)
                            e.target.value = ''
                          }}
                        />

                        {g.image_url ? (
                          <>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="h-7 px-2 text-xs"
                              disabled={uploadingGroupId === g.id}
                              data-testid={`cover-replace-${g.id}`}
                              onClick={() =>
                                fileInputRefs.current.get(g.id)?.click()
                              }
                            >
                              {uploadingGroupId === g.id
                                ? t.products.productGroupCoverUploading
                                : t.products.productGroupCoverReplace}
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="sm"
                              className="text-destructive h-7 px-2 text-xs"
                              disabled={
                                coverRemoveMutation.isPending &&
                                coverRemoveMutation.variables?.groupId === g.id
                              }
                              data-testid={`cover-remove-${g.id}`}
                              onClick={() =>
                                coverRemoveMutation.mutate({
                                  groupId: g.id,
                                  imageUrl: g.image_url!,
                                })
                              }
                            >
                              <XIcon className="mr-1 size-3" />
                              {t.products.productGroupCoverRemove}
                            </Button>
                          </>
                        ) : (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            disabled={uploadingGroupId === g.id}
                            data-testid={`cover-upload-${g.id}`}
                            onClick={() =>
                              fileInputRefs.current.get(g.id)?.click()
                            }
                          >
                            <ImageIcon className="mr-1 size-3" />
                            {uploadingGroupId === g.id
                              ? t.products.productGroupCoverUploading
                              : t.products.productGroupCoverUpload}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                )}
              </li>
            ))
          )}
        </ul>
      )}

      <form
        className="flex flex-col gap-2 rounded-md border p-3"
        aria-label={t.products.productGroupManagerAddTitle}
        onSubmit={(e) => {
          e.preventDefault()
          if (draftName.trim()) createMutation.mutate()
        }}
      >
        <p className="text-sm font-medium">
          {t.products.productGroupManagerAddTitle}
        </p>
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <Label htmlFor="pg-new-name" className="text-xs">
              {t.products.productGroupManagerNameLabel}
            </Label>
            <Input
              id="pg-new-name"
              value={draftName}
              onChange={(e) => setDraftName(e.target.value)}
              placeholder="e.g. Courses"
            />
          </div>
          <Button
            type="submit"
            disabled={!draftName.trim() || createMutation.isPending}
          >
            <PlusIcon className="size-4" />
            {t.products.productGroupManagerSave}
          </Button>
        </div>
      </form>
    </div>
  )
}
