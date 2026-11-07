import { describe, expect, it } from 'vitest'
import { templateIds, templates, type Part } from './templates.ts'
import type { Size } from './item.ts'

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
    expect([...templateIds].sort()).toEqual(['armchair', 'bed', 'box', 'chair', 'desk', 'sofa', 'table'])
    for (const id of templateIds) {
      expect(templates[id].defaultMount).toBe('floor')
    }
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
    })
  }
})
