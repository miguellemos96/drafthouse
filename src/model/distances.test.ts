import { describe, expect, it } from 'vitest'
import { dragDistances, emptyTape, nearestItem, pointDistance, tapeClick, tapeLength, wallDistances, type Side } from './distances.ts'
import type { Item } from './item.ts'
import { createRectRoom, wallsOf } from './plan.ts'

// A 400 × 300 room: walls at x = 0, x = 400, z = 0 and z = 300.
const walls = wallsOf({ rooms: [createRectRoom({ id: 'room', name: 'Room', width: 400, length: 300, height: 250 })] })

const box = (changes: Partial<Item> = {}): Item => ({
  id: 'box',
  name: 'Box',
  templateId: 'box',
  size: { width: 100, depth: 50, height: 50 },
  colour: '#888888',
  position: { x: 100, z: 100 },
  elevation: 0,
  rotation: 0,
  mount: 'floor',
  ...changes,
})

const bySide = (item: Item) => {
  const result: Partial<Record<Side, number>> = {}
  for (const { side, distance } of wallDistances(item, walls)) result[side] = distance
  return result
}

describe('wallDistances', () => {
  it('measures a 100 × 50 box at (100, 100): 50 left, 250 right, 75 back, 175 front', () => {
    const d = bySide(box())
    expect(d.left).toBeCloseTo(50)
    expect(d.right).toBeCloseTo(250)
    expect(d.back).toBeCloseTo(75)
    expect(d.front).toBeCloseTo(175)
  })

  it('turned 90°, the same box is 75 from the x = 0 wall and 275 from the x = 400 wall', () => {
    const lines = wallDistances(box({ rotation: 90 }), walls)
    // Turned 90°, the box's front faces +X and its back faces -X (see footprint() in item.ts).
    const toLeftWall = lines.find((line) => Math.abs(line.to.x) < 1e-6)!
    const toRightWall = lines.find((line) => Math.abs(line.to.x - 400) < 1e-6)!
    expect(toLeftWall.distance).toBeCloseTo(75)
    expect(toRightWall.distance).toBeCloseTo(275)
    expect(toLeftWall.side).toBe('back')
    expect(toRightWall.side).toBe('front')
    // Its sides now face the z walls: 100 - 50 to z = 0 and 300 - 150 to z = 300.
    const d = bySide(box({ rotation: 90 }))
    expect(d.right).toBeCloseTo(50)
    expect(d.left).toBeCloseTo(150)
  })

  it('draws each line straight from the middle of the side to the wall', () => {
    const front = wallDistances(box(), walls).find((line) => line.side === 'front')!
    expect(front.from.x).toBeCloseTo(100)
    expect(front.from.z).toBeCloseTo(125)
    expect(front.to.x).toBeCloseTo(100)
    expect(front.to.z).toBeCloseTo(300)
  })

  it('at an angle, measures from the side to the nearest wall along the item’s own direction', () => {
    // A 100 × 100 box turned 45° at (200, 150): its corners point at the walls, so each side
    // slides along a diagonal until a corner of the side meets a wall.
    const item = box({ size: { width: 100, depth: 100, height: 50 }, position: { x: 200, z: 150 }, rotation: 45 })
    for (const line of wallDistances(item, walls)) {
      expect(line.distance).toBeGreaterThan(0)
      expect(line.distance).toBeCloseTo(Math.hypot(line.to.x - line.from.x, line.to.z - line.from.z))
    }
    // The front faces (sin 45°, cos 45°). Its front-left corner (local (-50, 50)) sits at x = 200,
    // z = 150 + 50√2 ≈ 220.7, and reaches z = 300 first, after (300 - 220.7)√2 ≈ 112.1.
    expect(bySide(item).front).toBeCloseTo((300 - 150 - 50 * Math.SQRT2) * Math.SQRT2)
  })

  it('touching a wall reads 0', () => {
    expect(bySide(box({ position: { x: 50, z: 100 } })).left).toBeCloseTo(0)
  })

  it('leaves out a side with no wall ahead', () => {
    expect(wallDistances(box({ position: { x: 1000, z: 100 } }), walls).map((line) => line.side)).toEqual(['left'])
    expect(wallDistances(box(), [])).toEqual([])
  })
})

describe('nearestItem', () => {
  it('finds the closest other item, measured between footprints', () => {
    const near = box({ id: 'near', position: { x: 250, z: 100 } }) // its left edge is at x = 200
    const far = box({ id: 'far', position: { x: 100, z: 250 } }) // its back edge is at z = 225
    const result = nearestItem(box(), [box(), near, far])!
    expect(result.itemId).toBe('near')
    expect(result.distance).toBeCloseTo(50)
    expect(result.from.x).toBeCloseTo(150)
    expect(result.to.x).toBeCloseTo(200)
  })

  it('measures to a turned item by its corners', () => {
    // A 100 × 100 box turned 45° at (300, 100) reaches left to x = 300 - 50√2.
    const diamond = box({ id: 'diamond', size: { width: 100, depth: 100, height: 50 }, position: { x: 300, z: 100 }, rotation: 45 })
    expect(nearestItem(box(), [diamond])!.distance).toBeCloseTo(300 - 50 * Math.SQRT2 - 150)
  })

  it('is 0 for overlapping items and null with no other item', () => {
    expect(nearestItem(box(), [box({ id: 'other', position: { x: 120, z: 110 } })])!.distance).toBe(0)
    expect(nearestItem(box(), [box({ id: 'cross', size: { width: 20, depth: 200, height: 50 } })])!.distance).toBe(0)
    expect(nearestItem(box(), [box()])).toBeNull()
  })
})

describe('dragDistances', () => {
  it('gives the wall lines and the nearest item together', () => {
    const result = dragDistances(box(), walls, [box({ id: 'other', position: { x: 300, z: 100 } })])
    expect(result.walls).toHaveLength(4)
    expect(result.item?.distance).toBeCloseTo(100)
  })
})

describe('tape measure', () => {
  it('clicking (0, 0) then (300, 400) on the floor measures 500 cm', () => {
    let tape = emptyTape()
    expect(tapeLength(tape)).toBeNull()
    tape = tapeClick(tape, { x: 0, y: 0, z: 0 })
    expect(tapeLength(tape)).toBeNull()
    tape = tapeClick(tape, { x: 300, y: 0, z: 400 })
    expect(tapeLength(tape)).toBe(500)
  })

  it('a third click starts a new measurement', () => {
    const tape = [{ x: 0, y: 0, z: 0 }, { x: 10, y: 0, z: 0 }, { x: 5, y: 5, z: 5 }].reduce(tapeClick, emptyTape())
    expect(tape).toEqual({ start: { x: 5, y: 5, z: 5 }, end: null })
  })

  it('measures in 3D, between points on item surfaces', () => {
    expect(pointDistance({ x: 0, y: 0, z: 0 }, { x: 20, y: 30, z: 60 })).toBe(70)
  })
})
