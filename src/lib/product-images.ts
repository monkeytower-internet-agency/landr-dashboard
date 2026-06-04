// product-images.ts — product_images CRUD client (landr-d8rg.9).
//
// Per write-routing-convention: plain row writes that RLS + the audit
// trigger already cover go DIRECT to Supabase REST — no FastAPI detour.
//
// Schema (migration 20260603100000_product_images.sql):
//   id           uuid pk (gen_random_uuid)
//   operator_id  uuid fk operators  (not null)
//   product_id   uuid fk products   (not null)
//   thumb_path   text not null  — storage path (no leading slash, no hostname)
//   hero_path    text not null  — storage path
//   alt          text null
//   sort_order   int  not null default 0
//   created_at   timestamptz
//
// Storage bucket: 'product-images' (PUBLIC read).
// Path pattern: {operator_id}/products/{product_id}/{uuid}-{thumb|hero}.webp

import { supabase } from '@/lib/supabase'

export const PRODUCT_IMAGES_BUCKET = 'product-images'
export const MAX_IMAGES_PER_PRODUCT = 4

export type ProductImage = {
  id: string
  operator_id: string
  product_id: string
  thumb_path: string
  hero_path: string
  alt: string | null
  sort_order: number
  created_at: string
}

const SELECT = `
  id,
  operator_id,
  product_id,
  thumb_path,
  hero_path,
  alt,
  sort_order,
  created_at
`

export async function fetchProductImages(
  productId: string,
): Promise<ProductImage[]> {
  const { data, error } = await supabase
    .from('product_images')
    .select(SELECT)
    .eq('product_id', productId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true })

  if (error) throw new Error(error.message)
  return (data ?? []) as unknown as ProductImage[]
}

export type ProductImageCreate = {
  operator_id: string
  product_id: string
  thumb_path: string
  hero_path: string
  alt?: string | null
  sort_order?: number
}

export async function createProductImage(
  payload: ProductImageCreate,
): Promise<ProductImage> {
  const { data, error } = await supabase
    .from('product_images')
    .insert(payload)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as ProductImage
}

export type ProductImagePatch = {
  alt?: string | null
  sort_order?: number
}

export async function patchProductImage(
  id: string,
  payload: ProductImagePatch,
): Promise<ProductImage> {
  const { data, error } = await supabase
    .from('product_images')
    .update(payload)
    .eq('id', id)
    .select(SELECT)
    .single()
  if (error) throw new Error(error.message)
  return data as unknown as ProductImage
}

export async function deleteProductImage(id: string): Promise<void> {
  const { error } = await supabase
    .from('product_images')
    .delete()
    .eq('id', id)
  if (error) throw new Error(error.message)
}

/** Remove one or more storage objects from the product-images bucket.
 *  Caller is responsible for surfacing errors via toast — never swallow. */
export async function removeProductImageStorageObjects(
  paths: string[],
): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage
    .from(PRODUCT_IMAGES_BUCKET)
    .remove(paths)
  if (error) throw new Error(error.message)
}

/** Resolve a storage path to a public URL (bucket is public). */
export function getProductImagePublicUrl(path: string): string {
  const {
    data: { publicUrl },
  } = supabase.storage.from(PRODUCT_IMAGES_BUCKET).getPublicUrl(path)
  return publicUrl
}
