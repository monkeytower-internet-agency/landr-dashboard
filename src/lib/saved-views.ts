// landr-v0xg — saved Views API client.
//
// Wraps the Phase 0 (landr-pgqc) endpoints under
//   /api/staff/operators/{operator_id}/saved-views
// with Zod-validated request/response shapes.
//
// Schema notes:
//   - The router's _VIEW_COLUMNS does NOT return `deleted_at` (rows are
//     filtered server-side, so the client never sees soft-deleted rows).
//     We mark it optional here so the schema accepts the actual payload.
//   - `user_state` is attached only on list / get / patch (anything that
//     goes through _attach_user_state). Create + duplicate return the raw
//     insert row without it — we surface those as `SavedView`, not
//     `SavedViewWithState`, so callers don't accidentally read a missing
//     `user_state` field.
//   - The server includes `updated_at` inside `user_state`; we keep our
//     schema tolerant of unknown extra keys via `passthrough`.

import { z } from 'zod'
import { api } from '@/lib/api-client'

export const ENTITY_TYPES = ['booking'] as const
export const VISIBILITIES = ['personal', 'shared'] as const

export const SavedViewSchema = z.object({
  id: z.string().uuid(),
  operator_id: z.string().uuid(),
  creator_user_id: z.string().uuid(),
  entity_type: z.enum(ENTITY_TYPES),
  visibility: z.enum(VISIBILITIES),
  name: z.string(),
  config: z.record(z.string(), z.unknown()).default({}),
  sort_order: z.number().int(),
  // _VIEW_COLUMNS in the router omits deleted_at; keep it optional+nullable
  // so the schema is forward-compatible if the router ever adds it back.
  deleted_at: z.string().nullable().optional(),
  created_at: z.string(),
  updated_at: z.string(),
})
export type SavedView = z.infer<typeof SavedViewSchema>

// Server attaches `updated_at` inside user_state too — accept and ignore.
export const ViewUserStateSchema = z
  .object({
    starred: z.boolean().default(false),
    hidden: z.boolean().default(false),
  })
  .passthrough()

export const SavedViewWithStateSchema = SavedViewSchema.extend({
  user_state: ViewUserStateSchema,
})
export type SavedViewWithState = z.infer<typeof SavedViewWithStateSchema>

// Body shape accepted by POST /saved-views. creator_user_id is server-
// stamped from the JWT — never send it from the client.
export type SavedViewCreate = {
  name: string
  entity_type: (typeof ENTITY_TYPES)[number]
  visibility?: (typeof VISIBILITIES)[number]
  config?: Record<string, unknown>
  sort_order?: number
}

export type SavedViewPatch = Partial<{
  name: string
  visibility: (typeof VISIBILITIES)[number]
  config: Record<string, unknown>
  sort_order: number
}>

function basePath(operatorId: string): string {
  return `/api/staff/operators/${encodeURIComponent(operatorId)}/saved-views`
}

export async function listSavedViews(
  operatorId: string,
): Promise<SavedViewWithState[]> {
  const raw = await api<unknown>('GET', basePath(operatorId))
  return z.array(SavedViewWithStateSchema).parse(raw ?? [])
}

export async function createSavedView(
  operatorId: string,
  body: SavedViewCreate,
): Promise<SavedView> {
  const raw = await api<unknown>('POST', basePath(operatorId), body)
  return SavedViewSchema.parse(raw)
}

export async function getSavedView(
  operatorId: string,
  id: string,
): Promise<SavedViewWithState> {
  const raw = await api<unknown>(
    'GET',
    `${basePath(operatorId)}/${encodeURIComponent(id)}`,
  )
  return SavedViewWithStateSchema.parse(raw)
}

export async function patchSavedView(
  operatorId: string,
  id: string,
  patch: SavedViewPatch,
): Promise<SavedView> {
  const raw = await api<unknown>(
    'PATCH',
    `${basePath(operatorId)}/${encodeURIComponent(id)}`,
    patch,
  )
  return SavedViewSchema.parse(raw)
}

export async function deleteSavedView(
  operatorId: string,
  id: string,
): Promise<void> {
  await api<void>(
    'DELETE',
    `${basePath(operatorId)}/${encodeURIComponent(id)}`,
  )
}

export async function duplicateSavedView(
  operatorId: string,
  id: string,
): Promise<SavedView> {
  const raw = await api<unknown>(
    'POST',
    `${basePath(operatorId)}/${encodeURIComponent(id)}/duplicate`,
  )
  return SavedViewSchema.parse(raw)
}

export async function setViewUserState(
  operatorId: string,
  id: string,
  state: Partial<{ starred: boolean; hidden: boolean }>,
): Promise<void> {
  await api<void>(
    'PUT',
    `${basePath(operatorId)}/${encodeURIComponent(id)}/state`,
    state,
  )
}
