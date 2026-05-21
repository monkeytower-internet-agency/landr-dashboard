// landr-r87i — schema + wire conversion for the operator's default
// checklist template (server-side seed list).

import { describe, expect, it } from 'vitest'

import {
  ChecklistTemplateItemSchema,
  ChecklistTemplateSchema,
  wireItemsToTemplate,
} from './checklistTemplate'

describe('ChecklistTemplateItemSchema', () => {
  it('accepts a well-formed item', () => {
    expect(() =>
      ChecklistTemplateItemSchema.parse({
        key: 'default-called-customer',
        label: 'Called customer',
        order: 0,
      }),
    ).not.toThrow()
  })

  it('rejects empty key + empty label', () => {
    expect(() =>
      ChecklistTemplateItemSchema.parse({ key: '', label: 'x', order: 0 }),
    ).toThrow()
    expect(() =>
      ChecklistTemplateItemSchema.parse({ key: 'k', label: '', order: 0 }),
    ).toThrow()
  })

  it('rejects negative order', () => {
    expect(() =>
      ChecklistTemplateItemSchema.parse({ key: 'k', label: 'L', order: -1 }),
    ).toThrow()
  })
})

describe('ChecklistTemplateSchema', () => {
  it('accepts an empty items list (operator chose zero defaults)', () => {
    expect(() => ChecklistTemplateSchema.parse({ items: [] })).not.toThrow()
  })
})

describe('wireItemsToTemplate', () => {
  it('sorts by order ascending and renames key → id', () => {
    const items = [
      { key: 'b', label: 'Second', order: 1 },
      { key: 'a', label: 'First', order: 0 },
      { key: 'c', label: 'Third', order: 2 },
    ]
    expect(wireItemsToTemplate(items)).toEqual([
      { id: 'a', label: 'First' },
      { id: 'b', label: 'Second' },
      { id: 'c', label: 'Third' },
    ])
  })

  it('keeps incoming array intact (does not mutate)', () => {
    const items = [
      { key: 'b', label: 'Second', order: 1 },
      { key: 'a', label: 'First', order: 0 },
    ]
    const snapshot = items.map((i) => ({ ...i }))
    wireItemsToTemplate(items)
    expect(items).toEqual(snapshot)
  })
})
