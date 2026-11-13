import { describe, expect, it } from 'vitest'
import { currentVersion } from './home.ts'
import { footprint } from './item.ts'
import { newSampleHome, sampleHome } from './sample.ts'

describe('newSampleHome', () => {
  it('has the sample plan and a sofa and a table in the living room, a bed in the bedroom', () => {
    const home = newSampleHome()
    expect(home.plan).toEqual(sampleHome())
    const items = currentVersion(home).items
    expect(items.map((i) => i.templateId)).toEqual(['sofa', 'table', 'bed'])

    const inside = (xs: number[], [x0, x1]: number[]) => xs.every((x) => x > x0 && x < x1)
    const living = [0, 400]
    const bedroom = [400, 700]
    const xsOf = (id: string) => footprint(items.find((i) => i.templateId === id)!).map((c) => c.x)
    expect(inside(xsOf('sofa'), living)).toBe(true)
    expect(inside(xsOf('table'), living)).toBe(true)
    expect(inside(xsOf('bed'), bedroom)).toBe(true)
  })
})
