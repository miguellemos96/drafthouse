import { describe, expect, it } from 'vitest'
import type { Item } from './item.ts'
import { itemPlacement, partCentre, partsOf, shadeColour, templateFor, toHome } from './placement.ts'
import { templates } from './templates.ts'

const sofa = (changes: Partial<Item> = {}): Item => ({
  id: 'sofa',
  name: 'Sofa',
  templateId: 'sofa',
  size: { width: 200, depth: 90, height: 80 },
  colour: '#5b7083',
  position: { x: 100, z: 50 },
  elevation: 0,
  rotation: 0,
  mount: 'floor',
  ...changes,
})

// The extent of the item's parts in the home, from each part's world centre and rotated size.
const extent = (item: Item) => {
  const xs: number[] = []
  const zs: number[] = []
  const ys: number[] = []
  for (const part of partsOf(item)) {
    for (const dx of [-1, 1]) {
      for (const dz of [-1, 1]) {
        for (const dy of [-1, 1]) {
          const p = toHome(item, {
            x: part.center.x + (dx * part.size.width) / 2,
            y: part.center.y + (dy * part.size.height) / 2,
            z: part.center.z + (dz * part.size.depth) / 2,
          })
          xs.push(p.x)
          ys.push(p.y)
          zs.push(p.z)
        }
      }
    }
  }
  return {
    minX: Math.min(...xs), maxX: Math.max(...xs),
    minY: Math.min(...ys), maxY: Math.max(...ys),
    minZ: Math.min(...zs), maxZ: Math.max(...zs),
  }
}

describe('toHome', () => {
  it('a 200 × 90 × 80 sofa at (100, 50) rotated 90° is centred there, 90 cm along x and 200 cm along z', () => {
    const e = extent(sofa({ rotation: 90 }))
    expect((e.minX + e.maxX) / 2).toBeCloseTo(100)
    expect((e.minZ + e.maxZ) / 2).toBeCloseTo(50)
    expect(e.maxX - e.minX).toBeCloseTo(90)
    expect(e.maxZ - e.minZ).toBeCloseTo(200)
    expect(e.minY).toBeCloseTo(0)
    expect(e.maxY).toBeCloseTo(80)
  })

  it('lifts every part by the elevation', () => {
    const e = extent(sofa({ elevation: 30 }))
    expect(e.minY).toBeCloseTo(30)
    expect(e.maxY).toBeCloseTo(110)
  })

  it('turns the same way as Three.js rotation.y: +X goes to −Z at 90°', () => {
    const p = toHome(sofa({ rotation: 90, position: { x: 0, z: 0 } }), { x: 10, y: 0, z: 0 })
    expect(p.x).toBeCloseTo(0)
    expect(p.z).toBeCloseTo(-10)
  })

  it('puts the sofa back (at −Z in item space) behind it after a 180° turn', () => {
    const item = sofa({ rotation: 180 })
    const back = partsOf(item)[1]
    expect(back.center.z).toBeLessThan(0)
    expect(partCentre(item, back).z).toBeGreaterThan(50)
    expect(partCentre(item, back).x).toBeCloseTo(100)
  })
})

describe('itemPlacement', () => {
  it('gives the base origin and the turn in radians', () => {
    const { origin, angle } = itemPlacement(sofa({ rotation: 90, elevation: 12 }))
    expect(origin).toEqual({ x: 100, y: 12, z: 50 })
    expect(angle).toBeCloseTo(Math.PI / 2)
  })
})

describe('templateFor', () => {
  it('falls back to box for an unknown template id', () => {
    expect(templateFor('unknown')).toBe(templates.box)
    expect(templateFor('toString')).toBe(templates.box)
    const parts = partsOf(sofa({ templateId: 'unknown' }))
    expect(parts).toEqual([{ shape: 'box', center: { x: 0, y: 40, z: 0 }, size: { width: 200, depth: 90, height: 80 } }])
  })

  it('finds a known template', () => {
    expect(templateFor('bed')).toBe(templates.bed)
  })
})

describe('shadeColour', () => {
  it('keeps the colour without a shade', () => {
    expect(shadeColour('#a0522d')).toBe('#a0522d')
    expect(shadeColour('#a0522d', 0)).toBe('#a0522d')
  })

  it('goes to black at -1 and white at 1', () => {
    expect(shadeColour('#a0522d', -1)).toBe('#000000')
    expect(shadeColour('#a0522d', 1)).toBe('#ffffff')
  })

  it('moves part of the way for smaller shades', () => {
    expect(shadeColour('#808080', -0.5)).toBe('#404040')
    expect(shadeColour('#808080', 0.5)).toBe('#c0c0c0')
  })
})
