import { describe, expect, it } from 'vitest'
import { footprint, type Item } from './item.ts'

function table(rotation: number, x = 0, z = 0): Item {
  return {
    id: 'item-1',
    name: 'Dining table',
    templateId: 'table',
    size: { width: 160, depth: 90, height: 75 },
    colour: '#a0522d',
    position: { x, z },
    elevation: 0,
    rotation,
    mount: 'floor',
  }
}

function extent(corners: { x: number; z: number }[]): { x: number; z: number } {
  const xs = corners.map((c) => c.x)
  const zs = corners.map((c) => c.z)
  return { x: Math.max(...xs) - Math.min(...xs), z: Math.max(...zs) - Math.min(...zs) }
}

describe('footprint', () => {
  it('returns the four corners of an unrotated item around its position', () => {
    const corners = footprint(table(0, 100, 50))
    expect(corners).toHaveLength(4)
    expect(corners).toEqual([
      { x: 20, z: 5 },
      { x: 180, z: 5 },
      { x: 180, z: 95 },
      { x: 20, z: 95 },
    ])
  })

  it('swaps width and depth for a table rotated 90°', () => {
    const corners = footprint(table(90))
    const e = extent(corners)
    expect(e.x).toBeCloseTo(90)
    expect(e.z).toBeCloseTo(160)
  })

  it('keeps the centre at the item position for any angle', () => {
    for (const angle of [0, 17, 45, 90, 135, 200, -30, 360]) {
      const corners = footprint(table(angle, 40, -25))
      const cx = corners.reduce((sum, c) => sum + c.x, 0) / 4
      const cz = corners.reduce((sum, c) => sum + c.z, 0) / 4
      expect(cx).toBeCloseTo(40)
      expect(cz).toBeCloseTo(-25)
    }
  })

  it('keeps the side lengths at any angle', () => {
    const [a, b, c] = footprint(table(33))
    expect(Math.hypot(b.x - a.x, b.z - a.z)).toBeCloseTo(160)
    expect(Math.hypot(c.x - b.x, c.z - b.z)).toBeCloseTo(90)
  })
})
