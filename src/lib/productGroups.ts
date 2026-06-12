/**
 * Operator-scoped product-groups CRUD — surface used by the
 * EditTaxonomyButton pen icon next to the Product-group dropdown on
 * ProductForm (landr-19m).
 *
 * Backed by the FastAPI router at
 * `/api/staff/operators/{operator_id}/product-groups` (staff_product_groups.py).
 * The read helper `fetchProductGroups` already lives in `@/lib/products` and
 * hits Supabase directly for the form-level dropdown payload (id/name/slug).
 */
import { api } from '@/lib/api-client'

export type ProductGroup = {
  id: string
  operator_id: string
  slug: string
  name: string
  name_localized: Record<string, string> | null
  description: string | null
  description_localized: Record<string, string> | null
  // landr-up1b — adjacency-list parent. null === root-level category.
  parent_id: string | null
  sort_order: number
  active: boolean
  // landr-d8rg.10, landr-fqni — single cover image (bucket product-images,
  // path {operator_id}/groups/{group_id}/{uuid}.webp).
  // Stored as a host-agnostic STORAGE PATH (not a full URL). The dashboard
  // composes the public URL at display time via getProductImagePublicUrl();
  // the public API (widget-facing) composes it server-side in FastAPI.
  image_path: string | null
  created_at: string
  updated_at: string
}

export type ProductGroupCreate = {
  slug: string
  name: string
  parent_id?: string | null
  sort_order?: number
  active?: boolean
}

export type ProductGroupPatch = {
  name?: string
  // landr-14s4 — per-locale name overrides ({ locale: text }). The widget
  // renders the exact locale → base-language → base `name` (pickLocalized);
  // an absent key inherits `name`. The staff PATCH endpoint accepts these.
  name_localized?: Record<string, string> | null
  description?: string | null
  // landr-14s4 — per-locale description (tagline) overrides; same fallback
  // semantics as name_localized.
  description_localized?: Record<string, string> | null
  sort_order?: number
  active?: boolean
  // landr-fqni: storage path (not a public URL) — FastAPI composes the URL
  image_path?: string | null
}

export async function fetchProductGroupsFull(
  operatorId: string,
): Promise<ProductGroup[]> {
  return api<ProductGroup[]>(
    'GET',
    `/api/staff/operators/${operatorId}/product-groups`,
  )
}

/**
 * landr-up1b — flat list including `parent_id`, ordered by
 * (parent_id, sort_order). The dashboard builds the nested tree
 * client-side from `parent_id`. Server endpoint:
 * GET /product-groups/tree.
 */
export async function fetchProductGroupTree(
  operatorId: string,
): Promise<ProductGroup[]> {
  return api<ProductGroup[]>(
    'GET',
    `/api/staff/operators/${operatorId}/product-groups/tree`,
  )
}

/**
 * landr-up1b — move a group under a new parent (or to the root with
 * null). The server guards against cycles (a node can't become its own
 * descendant) and validates parent tenancy. PATCH /{id}/parent.
 */
export async function reparentProductGroup(
  operatorId: string,
  groupId: string,
  parentId: string | null,
): Promise<ProductGroup> {
  return api<ProductGroup>(
    'PATCH',
    `/api/staff/operators/${operatorId}/product-groups/${groupId}/parent`,
    { parent_id: parentId },
  )
}

// ---- client-side tree helpers ---------------------------------------

export type ProductGroupNode = ProductGroup & {
  children: ProductGroupNode[]
  /** 0 for roots, +1 per level deeper. Convenience for indented render. */
  depth: number
}

/**
 * Build a nested tree from the flat `parent_id` list. Orphans (parent_id
 * pointing at a missing/soft-deleted node) are promoted to roots so they
 * never vanish from the editor. Siblings keep their incoming order
 * (the API already sorts by sort_order within a parent).
 */
export function buildGroupTree(groups: ProductGroup[]): ProductGroupNode[] {
  const byId = new Map<string, ProductGroupNode>()
  for (const g of groups) {
    byId.set(g.id, { ...g, children: [], depth: 0 })
  }
  const roots: ProductGroupNode[] = []
  for (const node of byId.values()) {
    const parent = node.parent_id ? byId.get(node.parent_id) : undefined
    if (parent) {
      parent.children.push(node)
    } else {
      roots.push(node)
    }
  }
  // Stamp depth via DFS.
  const stamp = (nodes: ProductGroupNode[], depth: number) => {
    for (const n of nodes) {
      n.depth = depth
      stamp(n.children, depth + 1)
    }
  }
  stamp(roots, 0)
  return roots
}

/**
 * Flatten a tree depth-first into render order (parents immediately
 * followed by their subtree). Used by the tree editor to render an
 * indented flat list while preserving hierarchy.
 */
export function flattenTree(roots: ProductGroupNode[]): ProductGroupNode[] {
  const out: ProductGroupNode[] = []
  const walk = (nodes: ProductGroupNode[]) => {
    for (const n of nodes) {
      out.push(n)
      walk(n.children)
    }
  }
  walk(roots)
  return out
}

/**
 * Walk parent_id upward from `groupId` to the root, returning the path
 * root→…→node (breadcrumb order). Defensive against cycles. Returns []
 * when the id isn't found.
 */
export function breadcrumbFor(
  groups: ProductGroup[],
  groupId: string,
): ProductGroup[] {
  const byId = new Map(groups.map((g) => [g.id, g]))
  const chain: ProductGroup[] = []
  const seen = new Set<string>()
  let cursor: string | null = groupId
  while (cursor) {
    if (seen.has(cursor)) break
    seen.add(cursor)
    const node = byId.get(cursor)
    if (!node) break
    chain.unshift(node)
    cursor = node.parent_id
  }
  return chain
}

/**
 * Set of ids that are `nodeId` or sit in its subtree — i.e. the set of
 * groups that may NOT be chosen as `nodeId`'s new parent (would form a
 * cycle). Mirrors the server-side guard so the picker can disable them
 * up front rather than surfacing a 400.
 */
export function descendantIds(
  groups: ProductGroup[],
  nodeId: string,
): Set<string> {
  const childrenByParent = new Map<string, ProductGroup[]>()
  for (const g of groups) {
    if (!g.parent_id) continue
    const list = childrenByParent.get(g.parent_id) ?? []
    list.push(g)
    childrenByParent.set(g.parent_id, list)
  }
  const out = new Set<string>([nodeId])
  const stack = [nodeId]
  while (stack.length) {
    const id = stack.pop() as string
    for (const child of childrenByParent.get(id) ?? []) {
      if (!out.has(child.id)) {
        out.add(child.id)
        stack.push(child.id)
      }
    }
  }
  return out
}

export async function createProductGroup(
  operatorId: string,
  body: ProductGroupCreate,
): Promise<ProductGroup> {
  return api<ProductGroup>(
    'POST',
    `/api/staff/operators/${operatorId}/product-groups`,
    body,
  )
}

export async function updateProductGroup(
  operatorId: string,
  groupId: string,
  body: ProductGroupPatch,
): Promise<ProductGroup> {
  return api<ProductGroup>(
    'PATCH',
    `/api/staff/operators/${operatorId}/product-groups/${groupId}`,
    body,
  )
}

export async function deleteProductGroup(
  operatorId: string,
  groupId: string,
): Promise<void> {
  await api<{ status: string }>(
    'DELETE',
    `/api/staff/operators/${operatorId}/product-groups/${groupId}`,
  )
}
