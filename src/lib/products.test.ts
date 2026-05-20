import { describe, expect, it } from 'vitest'

import { suggestRoomCapacity } from './products'

// landr-knm0 — name/slug-based capacity heuristic. Matches the Para42
// hotel-room seed (single→1, double→2, premium variants follow their root
// token) and the dashboard ProductForm's create-time pre-fill.
describe('suggestRoomCapacity (landr-knm0)', () => {
  it.each([
    ['Single Room', 1],
    ['single-room', 1],
    ['Premium Single Room w/ Breakfast', 1],
    ['Double Room', 2],
    ['double-room', 2],
    ['Premium Double Room w/ Breakfast', 2],
    ['Twin Room', 2],
    ['Triple Suite', 3],
    ['Family Apartment', 4],
  ])('maps %j → %i', (input, expected) => {
    expect(suggestRoomCapacity(input)).toBe(expected)
  })

  it('returns null when no token matches', () => {
    expect(suggestRoomCapacity('Penthouse')).toBeNull()
    expect(suggestRoomCapacity('')).toBeNull()
  })

  it('is case-insensitive', () => {
    expect(suggestRoomCapacity('SINGLE ROOM')).toBe(1)
    expect(suggestRoomCapacity('double')).toBe(2)
  })
})
