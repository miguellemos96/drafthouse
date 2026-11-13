import { describe, expect, it } from 'vitest'
import { shelfCount, templateIds, templates, type Part, type TemplateId } from './templates.ts'
import type { Mount, Size } from './item.ts'
import type { TemplateGuess } from '../../server/reader/extract.ts'
import { LANGUAGES, STRINGS, type StringKey } from '../i18n/index.ts'

const mounts: Mount[] = ['floor', 'wall', 'ceiling', 'on-item']

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

  it('has the living-room, lighting and generic templates', () => {
    expect([...templateIds].sort()).toEqual([
      'armchair', 'bed', 'box', 'chair', 'desk', 'lamp', 'rug', 'shelf', 'sofa', 'table', 'tv-unit', 'wall-panel', 'wardrobe',
    ])
    expect(templates.lamp.defaultMount).toBe('floor')
    expect(templates['wall-panel'].defaultMount).toBe('wall')
    for (const id of ['wardrobe', 'shelf', 'tv-unit', 'rug'] as const) {
      expect(templates[id].defaultMount).toBe('floor')
    }
  })

  it('uses the same ids as the link reader guesses (checked by the typechecker)', () => {
    // Every id except `box` must be a TemplateGuess, so a guessed template is always a real one.
    const everyIdIsAGuess: Exclude<TemplateId, 'box'> extends TemplateGuess ? true : false = true
    expect(everyIdIsAGuess).toBe(true)
  })

  it('builds a wardrobe from a body and two doors', () => {
    expect(templates.wardrobe.parts(templates.wardrobe.defaultSize)).toHaveLength(3)
  })

  it('gives a shelf two sides and 4 shelves, one more per ~35 cm of height', () => {
    expect(templates.shelf.defaultSize.height).toBe(140)
    expect(templates.shelf.parts(templates.shelf.defaultSize)).toHaveLength(2 + 4)
    expect(shelfCount(140)).toBe(4)
    expect(shelfCount(210)).toBe(6)
    expect(shelfCount(10)).toBe(1)
    const tall = templates.shelf.parts({ width: 80, depth: 30, height: 210 })
    expect(tall).toHaveLength(2 + 6)
  })

  it('builds a TV unit from one low body', () => {
    const parts = templates['tv-unit'].parts(templates['tv-unit'].defaultSize)
    expect(parts).toHaveLength(1)
    expect(templates['tv-unit'].defaultSize.height).toBeLessThan(templates['tv-unit'].defaultSize.width)
  })

  it('builds a rug from one flat box 1 cm high', () => {
    const parts = templates.rug.parts(templates.rug.defaultSize)
    expect(parts).toHaveLength(1)
    expect(parts[0].shape).toBe('box')
    expect(parts[0].size.height).toBe(1)
    expect(templates.rug.defaultSize.height).toBe(1)
  })

  it('builds a wall panel from one thin box', () => {
    const { defaultSize } = templates['wall-panel']
    const parts = templates['wall-panel'].parts(defaultSize)
    expect(parts).toHaveLength(1)
    expect(parts[0].size.depth).toBeLessThan(parts[0].size.width)
    expect(parts[0].size.depth).toBeLessThan(parts[0].size.height)
  })

  describe('lamp', () => {
    const size = templates.lamp.defaultSize
    const top = (p: Part) => p.center.y + p.size.height / 2
    const bottom = (p: Part) => p.center.y - p.size.height / 2

    for (const mount of ['floor', 'on-item'] as const) {
      it(`stands a ${mount} lamp on its base, with the shade at the top`, () => {
        const [base, pole, shade] = templates.lamp.parts(size, mount)
        expect(bottom(base)).toBeCloseTo(0)
        expect(bottom(pole)).toBeCloseTo(top(base))
        expect(bottom(shade)).toBeCloseTo(top(pole))
        expect(top(shade)).toBeCloseTo(size.height)
      })
    }

    it('hangs a ceiling lamp from the top, with the shade at the bottom', () => {
      const parts = templates.lamp.parts(size, 'ceiling')
      expect(parts).toHaveLength(3)
      const [shade, cord, canopy] = parts
      expect(top(canopy)).toBeCloseTo(size.height)
      expect(top(cord)).toBeCloseTo(bottom(canopy))
      expect(top(shade)).toBeCloseTo(bottom(cord))
      expect(bottom(shade)).toBeCloseTo(0)
      expect(shade.size.width).toBeGreaterThan(cord.size.width)
    })

    it('uses the default mount when none is given', () => {
      expect(templates.lamp.parts(size)).toEqual(templates.lamp.parts(size, 'floor'))
    })
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

      it('fits all parts inside the box for any size from 10 to 400 cm, on every mount', () => {
        const lengths = [10, 17, 35, 52, 100, 173, 250, 333, 400]
        for (const width of lengths) {
          for (const depth of lengths) {
            for (const height of lengths) {
              for (const mount of mounts) {
                const size = { width, depth, height }
                const parts = templates[id].parts(size, mount)
                expectValidParts(parts)
                expectInsideSizeBox(parts, size)
              }
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
