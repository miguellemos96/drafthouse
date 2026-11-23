import { describe, expect, it } from 'vitest'
import { blockedDoorIds, clashesOf, clashingItemIds, findClashes, itemsClash, overlapDepth } from './clashes.ts'
import type { Item } from './item.ts'
import type { Door, Window } from './openings.ts'
import { createRectRoom, type Plan } from './plan.ts'

// A 400 × 300 room: walls at x = 0, x = 400, z = 0 and z = 300.
const room = createRectRoom({ id: 'r', name: 'Room', width: 400, length: 300, height: 250 })
const plan = (openings: (Door | Window)[] = []): Plan => ({ rooms: [room], openings })
const FRONT = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } }

const box = (id: string, changes: Partial<Item> = {}): Item => ({
  id,
  name: id,
  templateId: 'box',
  size: { width: 100, depth: 100, height: 100 },
  colour: '#888888',
  position: { x: 200, z: 150 },
  elevation: 0,
  rotation: 0,
  mount: 'floor',
  ...changes,
})

// An 80 cm door in the front wall, hinged at x = 100 and swinging into the room (towards +z).
const door: Door = { id: 'd', kind: 'door', wall: FRONT, offset: 100, width: 80, height: 210, sillHeight: 0, hinge: 'start', swing: 'in', room: 'r' }
// A window in the front wall from x = 250 to 370, with its sill 90 cm up.
const window: Window = { id: 'w', kind: 'window', wall: FRONT, offset: 250, width: 120, height: 120, sillHeight: 90 }

describe('overlapping items', () => {
  it('two 100 × 100 boxes 50 cm apart clash; 100 cm apart they touch and do not', () => {
    expect(itemsClash(box('a', { position: { x: 100, z: 150 } }), box('b', { position: { x: 150, z: 150 } }))).toBe(true)
    expect(itemsClash(box('a', { position: { x: 100, z: 150 } }), box('b', { position: { x: 200, z: 150 } }))).toBe(false)
  })

  it('needs more than 1 cm of overlap: 1 cm is a touch, 2 cm a clash', () => {
    expect(itemsClash(box('a', { position: { x: 100, z: 150 } }), box('b', { position: { x: 199, z: 150 } }))).toBe(false)
    expect(itemsClash(box('a', { position: { x: 100, z: 150 } }), box('b', { position: { x: 198, z: 150 } }))).toBe(true)
  })

  it('a box turned 45° clashes only where its corners really overlap', () => {
    const square = box('a', { position: { x: 0, z: 0 } })
    // The turned box reaches 70.7 cm from its centre along x and z.
    expect(itemsClash(square, box('b', { position: { x: 115, z: 0 }, rotation: 45 }))).toBe(true) // its corner pokes 5.7 cm in
    expect(itemsClash(square, box('b', { position: { x: 125, z: 0 }, rotation: 45 }))).toBe(false)
    // Their bounding boxes overlap here, but the turned box's edge passes 49 cm clear of the square's corner.
    expect(itemsClash(square, box('b', { position: { x: 110, z: 110 }, rotation: 45 }))).toBe(false)
  })

  it('a lamp standing on the table does not clash with it, but one sunk into it does', () => {
    const table = box('table', { templateId: 'table', size: { width: 160, depth: 90, height: 75 } })
    const lamp = box('lamp', { templateId: 'lamp', size: { width: 30, depth: 30, height: 50 }, mount: 'on-item', elevation: 75 })
    expect(itemsClash(table, lamp)).toBe(false)
    expect(itemsClash(table, { ...lamp, elevation: 40 })).toBe(true)
  })

  it('items one above the other do not clash', () => {
    expect(itemsClash(box('a'), box('b', { elevation: 150 }))).toBe(false)
  })

  it('lists each overlapping pair once', () => {
    const items = [box('a', { position: { x: 100, z: 150 } }), box('b', { position: { x: 150, z: 150 } }), box('c', { position: { x: 320, z: 150 } })]
    expect(findClashes(plan(), items)).toEqual([{ kind: 'items', a: 'a', b: 'b' }])
  })
})

describe('items through walls', () => {
  const small = (changes: Partial<Item>) => box('i', { size: { width: 60, depth: 50, height: 50 }, ...changes })
  const wallClashes = (p: Plan, item: Item) => findClashes(p, [item]).filter((c) => c.kind === 'wall')

  it('clashes when the footprint crosses a wall line by more than 1 cm', () => {
    expect(wallClashes(plan(), small({ position: { x: 200, z: 20 } }))).toEqual([{ kind: 'wall', item: 'i', wall: FRONT }])
    expect(wallClashes(plan(), small({ position: { x: 200, z: 24 } }))).toEqual([]) // 1 cm over the line
    expect(wallClashes(plan(), small({ position: { x: 200, z: 25 } }))).toEqual([]) // against the line
  })

  it('does not clash through a door or window hole, but does under the sill', () => {
    expect(wallClashes(plan([door]), small({ position: { x: 140, z: 0 } }))).toEqual([])
    expect(wallClashes(plan([window]), small({ position: { x: 310, z: 0 } }))).toHaveLength(1)
    expect(wallClashes(plan([window]), small({ position: { x: 310, z: 0 }, elevation: 100 }))).toEqual([])
  })

  it('a wall item does not clash with the wall it hangs on, but does with another', () => {
    const shelf = box('s', { size: { width: 100, depth: 30, height: 40 }, mount: 'wall', elevation: 150, position: { x: 200, z: 10 } })
    expect(wallClashes(plan(), shelf)).toEqual([])
    expect(wallClashes(plan(), { ...shelf, mount: 'floor' })).toHaveLength(1)
    const intoSide = { ...shelf, position: { x: 30, z: 10 } } // also reaches 20 cm past the wall at x = 0
    expect(wallClashes(plan(), intoSide)).toEqual([{ kind: 'wall', item: 's', wall: { a: { x: 0, y: 300 }, b: { x: 0, y: 0 } } }])
  })
})

describe('blocked doors', () => {
  const chair = (x: number, z: number) => box('chair', { size: { width: 45, depth: 45, height: 90 }, position: { x, z } })

  it('a chair inside the swing of an 80 cm door makes both the door and the chair red', () => {
    const clashes = findClashes(plan([door]), [chair(130, 35)])
    expect(clashes).toEqual([{ kind: 'door', item: 'chair', door: 'd' }])
    expect(blockedDoorIds(clashes)).toEqual(new Set(['d']))
    expect(clashingItemIds(clashes)).toEqual(new Set(['chair']))
  })

  it('a chair clear of the arc, or past its curve, does not block the door', () => {
    expect(findClashes(plan([door]), [chair(140, 150)])).toEqual([])
    // Near the arc's far corner: inside the square around the quarter circle, outside the circle.
    expect(findClashes(plan([door]), [chair(185, 85)])).toEqual([])
  })

  it('a door that swings out of the room is not blocked by a chair inside it', () => {
    expect(findClashes(plan([{ ...door, swing: 'out' }]), [chair(130, 35)])).toEqual([])
  })

  it('an item hung above the door does not block it', () => {
    expect(findClashes(plan([door]), [box('shelf', { size: { width: 45, depth: 45, height: 20 }, position: { x: 130, z: 35 }, elevation: 215 })])).toEqual([])
  })
})

describe('clashesOf', () => {
  it('says what an item clashes with: other items by name, walls and doors', () => {
    const sofa = box('sofa', { name: 'Sofa', position: { x: 160, z: 60 } })
    const table = box('table', { name: 'Table', position: { x: 250, z: 100 } })
    const items = [sofa, table]
    const clashes = findClashes(plan([door]), items)
    expect(clashesOf(clashes, items, 'table')).toEqual([{ kind: 'item', itemId: 'sofa', name: 'Sofa' }])
    expect(clashesOf(clashes, items, 'sofa')).toEqual([{ kind: 'item', itemId: 'table', name: 'Table' }, { kind: 'door', doorId: 'd' }])
    expect(clashesOf(findClashes(plan(), [box('x', { position: { x: 0, z: 150 } })]), [], 'x')).toEqual([{ kind: 'wall' }])
  })
})

describe('overlapDepth', () => {
  it('is the shortest push that parts two shapes', () => {
    const square = (x: number) => [{ x, z: 0 }, { x: x + 10, z: 0 }, { x: x + 10, z: 10 }, { x, z: 10 }]
    expect(overlapDepth(square(0), square(7))).toBeCloseTo(3)
    expect(overlapDepth(square(0), square(12))).toBeLessThan(0)
  })
})
