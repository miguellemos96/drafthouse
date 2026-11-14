import { describe, expect, it } from 'vitest'
import { templateIds, templates, type Part, type TemplateId } from './templates.ts'
import type { Size } from './item.ts'
import type { TemplateGuess } from '../../server/reader/extract.ts'
import { LANGUAGES, STRINGS, type StringKey } from '../i18n/index.ts'

const EPS = 1e-9

function expectInsideSizeBox(parts: Part[], size: Size): void {
  for (const part of parts) {
    const { center: c, size: s } = part
    expect(c.x - s.width / 2).toBeGreaterThanOrEqual(-size.width / 2 - EPS)
    expect(c.x + s.width / 2).toBeLessThanOrEqual(size.width / 2 + EPS)
    expect(c.y - s.height / 2).toBeGreaterThanOrEqual(-EPS)
    expect(c.y + s.height / 2).toBeLessThanOrEqual(size.height + EPS)
    expect(c.z - s.depth / 2).toBeGreaterThanOrEqual(-size.depth / 2 - EPS)
    expect(c.z + s.depth / 2).toBeLessThanOrEqual(size.depth / 2 + EPS)
  }
}

function expectValidParts(parts: Part[]): void {
  expect(parts.length).toBeGreaterThan(0)
  for (const part of parts) {
    expect(['box', 'cylinder']).toContain(part.shape)
    for (const value of [part.size.width, part.size.depth, part.size.height]) {
      expect(Number.isFinite(value)).toBe(true)
      expect(value).toBeGreaterThan(0)
    }
    for (const value of [part.center.x, part.center.y, part.center.z]) {
      expect(Number.isFinite(value)).toBe(true)
    }
  }
}

describe('templates', () => {
  it('has the first seven templates, all mounted on the floor by default', () => {
    const first = ['armchair', 'bed', 'box', 'chair', 'desk', 'sofa', 'table'] as const
    for (const id of first) {
      expect(templateIds).toContain(id)
      expect(templates[id].defaultMount).toBe('floor')
    }
  })

  it('has the bathroom, kitchen and laundry templates with their default mounts', () => {
    const mounts = {
      toilet: 'floor',
      bidet: 'floor',
      sink: 'floor',
      'shower-tray': 'floor',
      bathtub: 'floor',
      hob: 'on-item',
      oven: 'floor',
      'cooker-hood': 'wall',
      fridge: 'floor',
      washer: 'floor',
    } as const
    for (const [id, mount] of Object.entries(mounts)) {
      expect(templateIds).toContain(id)
      expect(templates[id as TemplateId].defaultMount).toBe(mount)
    }
  })

  it('uses the same ids as the link reader guesses (checked by the typechecker)', () => {
    // Every id except `box` must be a TemplateGuess, so a guessed id never names a template that is not there.
    const everyIdIsAGuess: Exclude<TemplateId, 'box'> extends TemplateGuess ? true : false = true
    expect(everyIdIsAGuess).toBe(true)
  })

  const cylinders = (parts: Part[]) => parts.filter((p) => p.shape === 'cylinder')
  const top = (p: Part) => p.center.y + p.size.height / 2
  const bottom = (p: Part) => p.center.y - p.size.height / 2

  it('builds a toilet from a bowl, a seat on the bowl and a tank behind', () => {
    const parts = templates.toilet.parts(templates.toilet.defaultSize)
    expect(parts).toHaveLength(3)
    const [bowl, seat, tank] = parts
    expect(bottom(seat)).toBeCloseTo(top(bowl))
    expect(tank.center.z).toBeLessThan(bowl.center.z)
    expect(top(tank)).toBeGreaterThan(top(seat))
  })

  it('builds a bidet from a pedestal and a bowl', () => {
    const [pedestal, bowl] = templates.bidet.parts(templates.bidet.defaultSize)
    expect(bottom(bowl)).toBeCloseTo(top(pedestal))
    expect(bowl.size.width).toBeGreaterThan(pedestal.size.width)
  })

  it('builds a sink from a basin on a pedestal', () => {
    const size = templates.sink.defaultSize
    const [pedestal, basin] = templates.sink.parts(size)
    expect(bottom(pedestal)).toBeCloseTo(0)
    expect(bottom(basin)).toBeCloseTo(top(pedestal))
    expect(top(basin)).toBeCloseTo(size.height)
    expect(basin.size.width).toBeGreaterThan(pedestal.size.width)
  })

  it('builds a shower tray from one flat box, 4 cm high by default', () => {
    expect(templates['shower-tray'].defaultSize.height).toBe(4)
    const parts = templates['shower-tray'].parts(templates['shower-tray'].defaultSize)
    expect(parts).toHaveLength(1)
    expect(parts[0].size.height).toBe(4)
  })

  it('builds a bathtub with a hollow inside: a bottom lower than its four sides', () => {
    const size = templates.bathtub.defaultSize
    const parts = templates.bathtub.parts(size)
    expect(parts.every((p) => p.shape === 'box')).toBe(true)
    const [floor, ...sides] = parts
    expect(sides).toHaveLength(4)
    for (const side of sides) expect(top(side)).toBeCloseTo(size.height)
    expect(top(floor)).toBeLessThan(size.height / 2)
    // The bottom lies between the sides, so nothing covers the hollow from above.
    expect(floor.size.width).toBeLessThan(size.width)
    expect(floor.size.depth).toBeLessThan(size.depth)
  })

  it('builds a hob from a thin slab and 4 burner discs on top', () => {
    const size = templates.hob.defaultSize
    expect(size.height).toBeLessThan(10)
    const [slab, ...burners] = templates.hob.parts(size)
    expect(slab.shape).toBe('box')
    expect(burners).toHaveLength(4)
    expect(cylinders(burners)).toHaveLength(4)
    for (const burner of burners) {
      expect(bottom(burner)).toBeCloseTo(top(slab))
      expect(top(burner)).toBeCloseTo(size.height)
    }
  })

  it('builds an oven from a body and a door panel on the front', () => {
    const [body, door] = templates.oven.parts(templates.oven.defaultSize)
    expect(door.center.z).toBeGreaterThan(body.center.z)
    expect(door.size.depth).toBeLessThan(body.size.depth)
  })

  it('builds a cooker hood from a canopy and a narrower chimney above it, against the wall', () => {
    const size = templates['cooker-hood'].defaultSize
    const [canopy, chimney] = templates['cooker-hood'].parts(size)
    expect(bottom(canopy)).toBeCloseTo(0)
    expect(bottom(chimney)).toBeCloseTo(top(canopy))
    expect(top(chimney)).toBeCloseTo(size.height)
    expect(chimney.size.width).toBeLessThan(canopy.size.width)
    // The back of the item (-Z) is against the wall.
    expect(chimney.center.z - chimney.size.depth / 2).toBeCloseTo(-size.depth / 2)
  })

  it('builds a fridge from a body and two doors, one above the other', () => {
    const [body, lower, upper] = templates.fridge.parts(templates.fridge.defaultSize)
    expect(lower.center.z).toBeGreaterThan(body.center.z)
    expect(upper.center.z).toBeGreaterThan(body.center.z)
    expect(bottom(upper)).toBeGreaterThan(top(lower))
  })

  it('builds a washer from a body and a round door facing the front', () => {
    const size = templates.washer.defaultSize
    const [body, door] = templates.washer.parts(size)
    expect(body.shape).toBe('box')
    expect(door.shape).toBe('cylinder')
    expect(door.axis).toBe('z')
    expect(door.size.width).toBeCloseTo(door.size.height)
    expect(door.center.z + door.size.depth / 2).toBeCloseTo(size.depth / 2)
  })

  it('keeps every part of a 210 × 95 × 83 sofa inside its size box', () => {
    const size = { width: 210, depth: 95, height: 83 }
    const parts = templates.sofa.parts(size)
    expectValidParts(parts)
    expectInsideSizeBox(parts, size)
  })

  it('builds a sofa from a base, a back and two arms', () => {
    expect(templates.sofa.parts(templates.sofa.defaultSize)).toHaveLength(4)
  })

  it('builds a chair from a seat, a back and four legs', () => {
    expect(templates.chair.parts(templates.chair.defaultSize)).toHaveLength(6)
  })

  it('builds a table from a top and four legs', () => {
    expect(templates.table.parts(templates.table.defaultSize)).toHaveLength(5)
  })

  it('builds a bed from a frame, a mattress and a headboard', () => {
    expect(templates.bed.parts(templates.bed.defaultSize)).toHaveLength(3)
  })

  const sizes: Size[] = [
    { width: 1, depth: 1, height: 1 },
    { width: 210, depth: 95, height: 83 },
    { width: 30, depth: 300, height: 10 },
    { width: 500, depth: 20, height: 250 },
  ]

  for (const id of templateIds) {
    describe(id, () => {
      it('has a positive default size', () => {
        const { width, depth, height } = templates[id].defaultSize
        expect(width).toBeGreaterThan(0)
        expect(depth).toBeGreaterThan(0)
        expect(height).toBeGreaterThan(0)
      })

      it('fits all parts inside its default size box', () => {
        const size = templates[id].defaultSize
        const parts = templates[id].parts(size)
        expectValidParts(parts)
        expectInsideSizeBox(parts, size)
      })

      for (const size of sizes) {
        it(`returns valid parts inside the box for ${size.width} × ${size.depth} × ${size.height}`, () => {
          const parts = templates[id].parts(size)
          expectValidParts(parts)
          expectInsideSizeBox(parts, size)
        })
      }

      it('fits all parts inside the box for any size from 10 to 400 cm', () => {
        const lengths = [10, 17, 35, 52, 100, 173, 250, 333, 400]
        for (const width of lengths) {
          for (const depth of lengths) {
            for (const height of lengths) {
              const size = { width, depth, height }
              const parts = templates[id].parts(size)
              expectValidParts(parts)
              expectInsideSizeBox(parts, size)
            }
          }
        }
      })
    })
  }
})

describe('template names', () => {
  for (const lang of LANGUAGES) {
    it(`names every template in ${lang}`, () => {
      const missing = templateIds.filter((id) => !STRINGS[lang][`template.${id}` as StringKey])
      expect(missing).toEqual([])
    })
  }
})
