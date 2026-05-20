import { describe, expect, it } from 'vitest'

import { SETTINGS_SECTIONS } from './sections'

// landr-sydf — Products moved out of the main sidebar into Settings. The
// data-level assertions below pin the contract: the sub-sidebar exposes a
// Products entry at /settings/products and the section list is the only
// place that controls it (no per-component conditional rendering).
describe('SETTINGS_SECTIONS', () => {
  it('includes a Products entry at /settings/products', () => {
    const entry = SETTINGS_SECTIONS.find((s) => s.to === '/settings/products')
    expect(entry).toBeDefined()
    expect(entry?.label).toBe('Products')
  })

  it('has no duplicate routes', () => {
    const tos = SETTINGS_SECTIONS.map((s) => s.to)
    expect(new Set(tos).size).toBe(tos.length)
  })
})
