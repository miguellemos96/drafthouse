import { describe, expect, it } from 'vitest'
import type { Item } from './item.ts'
import { changeMount, ceilingElevation, flushToWall, nearestWall, placeOnMount, wallElevation, WALL_MOUNT_ELEVATION } from './mounts.ts'
import { createRoom, wallsOf, type Plan } from './plan.ts'

// One 400 × 300 room, 250 cm high, and a 260 cm room next to it at x = 400…700.
const plan: Plan = {
  rooms: [
    createRoom({ id: 'living', name: 'Living', height: 250, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] }),
    createRoom({ id: 'bedroom', name: 'Bedroom', height: 260, corners: [{ x: 400, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 400, y: 300 }] }),
  ],
}

const panel = (changes: Partial<Item> = {}): Item => ({
  id: 'panel',
  name: 'Wall panel',
  templateId: 'wall-panel',
  size: { width: 60, depth: 4, height: 80 },
  colour: '#cccccc',
  position: { x: 200, z: 150 },
  elevation: 120,
  rotation: 0,
  mount: 'wall',
  ...changes,
})

const lamp = (changes: Partial<Item> = {}): Item => ({
  ...panel(),
  id: 'lamp',
  name: 'Lamp',
  templateId: 'lamp',
  size: { width: 40, depth: 40, height: 60 },
  elevation: 0,
  mount: 'ceiling',
  ...changes,
})

const wallAt = (x1: number, y1: number, x2: number, y2: number) =>
  wallsOf(plan).find((w) => (w.a.x === x1 && w.a.y === y1 && w.b.x === x2 && w.b.y === y2) || (w.a.x === x2 && w.a.y === y2 && w.b.x === x1 && w.b.y === y1))!

describe('nearestWall', () => {
  it('is the wall closest to the point', () => {
    expect(nearestWall(plan, { x: 10, z: 150 })).toEqual(wallAt(0, 0, 0, 300))
    expect(nearestWall(plan, { x: 100, z: 290 })).toEqual(wallAt(0, 300, 400, 300))
    expect(nearestWall(plan, { x: 395, z: 150 })).toEqual(wallAt(400, 0, 400, 300))
  })

  it('is undefined in a home without rooms', () => {
    expect(nearestWall({ rooms: [] }, { x: 0, z: 0 })).toBeUndefined()
  })
})

describe('flushToWall', () => {
  it('puts the back on the wall line and turns the front into the room', () => {
    expect(flushToWall(plan, wallAt(0, 0, 0, 300), { x: 10, z: 150 }, panel().size)).toEqual({ position: { x: 2, z: 150 }, rotation: 90 })
    expect(flushToWall(plan, wallAt(0, 300, 400, 300), { x: 100, z: 290 }, panel().size)).toEqual({ position: { x: 100, z: 298 }, rotation: 180 })
    expect(flushToWall(plan, wallAt(400, 0, 700, 0), { x: 500, z: 20 }, panel().size)).toEqual({ position: { x: 500, z: 2 }, rotation: 0 })
    expect(flushToWall(plan, wallAt(700, 0, 700, 300), { x: 690, z: 100 }, panel().size)).toEqual({ position: { x: 698, z: 100 }, rotation: 270 })
  })

  it('faces into the room even from outside it', () => {
    expect(flushToWall(plan, wallAt(0, 0, 0, 300), { x: -30, z: 150 }, panel().size)).toEqual({ position: { x: 2, z: 150 }, rotation: 90 })
    expect(flushToWall(plan, wallAt(0, 0, 0, 300), { x: 0, z: 150 }, panel().size)).toEqual({ position: { x: 2, z: 150 }, rotation: 90 })
  })

  it('faces the side the point is on, for a wall between two rooms', () => {
    const shared = wallAt(400, 0, 400, 300)
    expect(flushToWall(plan, shared, { x: 390, z: 150 }, panel().size)).toEqual({ position: { x: 398, z: 150 }, rotation: 270 })
    expect(flushToWall(plan, shared, { x: 410, z: 150 }, panel().size)).toEqual({ position: { x: 402, z: 150 }, rotation: 90 })
  })

  it('keeps the item within the wall’s ends', () => {
    expect(flushToWall(plan, wallAt(0, 0, 0, 300), { x: 5, z: 295 }, panel().size).position).toEqual({ x: 2, z: 270 })
    expect(flushToWall(plan, wallAt(0, 0, 0, 300), { x: 5, z: -40 }, panel().size).position).toEqual({ x: 2, z: 30 })
    // Wider than the wall: centred on it.
    expect(flushToWall(plan, wallAt(0, 0, 0, 300), { x: 5, z: 10 }, { width: 400, depth: 4, height: 80 }).position).toEqual({ x: 2, z: 150 })
  })
})

describe('wallElevation', () => {
  it('clamps to 0 … wall height minus the item height', () => {
    const wall = wallAt(0, 0, 0, 300)
    expect(wallElevation(plan, wall, 80, 300)).toBe(170)
    expect(wallElevation(plan, wall, 80, -10)).toBe(0)
    expect(wallElevation(plan, wall, 80, 120)).toBe(120)
    expect(wallElevation(plan, wall, 400, 120)).toBe(0)
  })

  it('uses the taller room for a shared wall', () => {
    expect(wallElevation(plan, wallAt(400, 0, 400, 300), 80, 300)).toBe(180)
  })
})

describe('ceilingElevation', () => {
  it('puts the top at the height of the room the point is in', () => {
    expect(ceilingElevation(plan, { x: 550, z: 150 }, 60)).toBe(200)
    expect(ceilingElevation(plan, { x: 200, z: 150 }, 60)).toBe(190)
  })

  it('is 0 for an item taller than the room, and undefined outside every room', () => {
    expect(ceilingElevation(plan, { x: 200, z: 150 }, 300)).toBe(0)
    expect(ceilingElevation(plan, { x: -50, z: 150 }, 60)).toBeUndefined()
  })
})

describe('placeOnMount', () => {
  it('slides a wall item along a wall and moves it to the next wall', () => {
    const first = placeOnMount(plan, panel(), { x: 10, z: 150 })
    expect(first).toMatchObject({ position: { x: 2, z: 150 }, rotation: 90, elevation: 120 })
    const along = placeOnMount(plan, first, { x: 2, z: 250 })
    expect(along).toMatchObject({ position: { x: 2, z: 250 }, rotation: 90 })
    const next = placeOnMount(plan, along, { x: 100, z: 290 })
    expect(next).toMatchObject({ position: { x: 100, z: 298 }, rotation: 180 })
  })

  it('clamps a wall item’s elevation to its wall', () => {
    expect(placeOnMount(plan, panel({ elevation: 300 })).elevation).toBe(170)
  })

  it('hangs a ceiling item from the room it is over and lets it move freely', () => {
    expect(placeOnMount(plan, lamp(), { x: 550, z: 120 })).toMatchObject({ position: { x: 550, z: 120 }, elevation: 200 })
    expect(placeOnMount(plan, lamp({ elevation: 190 }), { x: -50, z: 120 })).toMatchObject({ position: { x: -50, z: 120 }, elevation: 190 })
  })

  it('stands a floor item on the floor', () => {
    expect(placeOnMount(plan, panel({ mount: 'floor', elevation: 30 }), { x: 50, z: 60 })).toMatchObject({ position: { x: 50, z: 60 }, elevation: 0, rotation: 0 })
  })

  it('leaves a wall item alone in a home without walls', () => {
    const item = panel()
    expect(placeOnMount({ rooms: [] }, item, { x: 10, z: 10 })).toEqual({ ...item, position: { x: 10, z: 10 } })
  })
})

describe('changeMount', () => {
  it('floor to wall: the nearest wall, at 120 cm', () => {
    const moved = changeMount(plan, panel({ mount: 'floor', elevation: 0, position: { x: 30, z: 150 } }), 'wall')
    expect(moved).toMatchObject({ mount: 'wall', position: { x: 2, z: 150 }, rotation: 90, elevation: WALL_MOUNT_ELEVATION })
    expect(WALL_MOUNT_ELEVATION).toBe(120)
  })

  it('to wall keeps a raised item’s elevation, clamped', () => {
    expect(changeMount(plan, lamp({ mount: 'ceiling', elevation: 200, position: { x: 30, z: 150 } }), 'wall')).toMatchObject({ elevation: 190 })
  })

  it('wall to floor: elevation 0', () => {
    expect(changeMount(plan, panel({ position: { x: 2, z: 150 }, rotation: 90 }), 'floor')).toMatchObject({ mount: 'floor', elevation: 0, position: { x: 2, z: 150 }, rotation: 90 })
  })

  it('to ceiling: the top at the room height', () => {
    expect(changeMount(plan, lamp({ mount: 'floor', position: { x: 550, z: 150 } }), 'ceiling')).toMatchObject({ mount: 'ceiling', elevation: 200 })
  })
})
