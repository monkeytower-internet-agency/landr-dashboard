/**
 * Unit tests for the client-side product-group tree helpers (landr-up1b):
 * buildGroupTree / flattenTree / breadcrumbFor / descendantIds. These back
 * the Categories editor (indented render + legal-parent gating) and the
 * per-product breadcrumb shortcode menu.
 */
import { describe, expect, it } from 'vitest'
import {
  breadcrumbFor,
  buildGroupTree,
  descendantIds,
  flattenTree,
  type ProductGroup,
} from './productGroups'

function g(
  id: string,
  parent_id: string | null,
  sort_order = 0,
  name = id,
): ProductGroup {
  return {
    id,
    operator_id: 'op-1',
    slug: id,
    name,
    name_localized: null,
    description: null,
    description_localized: null,
    parent_id,
    sort_order,
    active: true,
    created_at: '2026-05-22T00:00:00Z',
    updated_at: '2026-05-22T00:00:00Z',
  }
}

// courses → beginner → kids ; courses → advanced ; guided (root)
const FIXTURE: ProductGroup[] = [
  g('courses', null, 10),
  g('beginner', 'courses', 10),
  g('kids', 'beginner', 10),
  g('advanced', 'courses', 20),
  g('guided', null, 20),
]

describe('buildGroupTree + flattenTree', () => {
  it('nests by parent_id and stamps depth', () => {
    const roots = buildGroupTree(FIXTURE)
    expect(roots.map((r) => r.id)).toEqual(['courses', 'guided'])
    const courses = roots[0]
    expect(courses.depth).toBe(0)
    expect(courses.children.map((c) => c.id).sort()).toEqual([
      'advanced',
      'beginner',
    ])
    const beginner = courses.children.find((c) => c.id === 'beginner')!
    expect(beginner.depth).toBe(1)
    expect(beginner.children[0].id).toBe('kids')
    expect(beginner.children[0].depth).toBe(2)
  })

  it('flattens depth-first into render order', () => {
    const flat = flattenTree(buildGroupTree(FIXTURE))
    expect(flat.map((n) => n.id)).toEqual([
      'courses',
      'beginner',
      'kids',
      'advanced',
      'guided',
    ])
  })

  it('promotes orphans (missing parent) to roots so they never vanish', () => {
    const orphaned = [...FIXTURE, g('lost', 'no-such-parent')]
    const roots = buildGroupTree(orphaned)
    expect(roots.map((r) => r.id)).toContain('lost')
  })
})

describe('breadcrumbFor', () => {
  it('walks parent_id up to the root in root→leaf order', () => {
    expect(breadcrumbFor(FIXTURE, 'kids').map((c) => c.id)).toEqual([
      'courses',
      'beginner',
      'kids',
    ])
  })

  it('returns just the node for a root', () => {
    expect(breadcrumbFor(FIXTURE, 'guided').map((c) => c.id)).toEqual([
      'guided',
    ])
  })

  it('returns [] for an unknown id', () => {
    expect(breadcrumbFor(FIXTURE, 'nope')).toEqual([])
  })
})

describe('descendantIds', () => {
  it('includes the node and its whole subtree', () => {
    expect([...descendantIds(FIXTURE, 'courses')].sort()).toEqual([
      'advanced',
      'beginner',
      'courses',
      'kids',
    ])
  })

  it('a leaf is its own only descendant', () => {
    expect([...descendantIds(FIXTURE, 'kids')]).toEqual(['kids'])
  })
})
