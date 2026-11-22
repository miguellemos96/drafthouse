import { describe, expect, it } from 'vitest'
import { addItem, currentVersion, newHome, type Home } from './home.ts'
import type { Item } from './item.ts'
import { wallHeight, wallsOf } from './plan.ts'
import { containsPoint, itemsGoingWith, itemsInRoom, removeRoom, ROOM_HEIGHT_LIMITS, roomAt, roomHeightError, updateRoom } from './room.ts'
import { newSampleHome, sampleHome } from './sample.ts'

const item = (id: string, x: number, z: number): Item => ({
  id,
  name: id,
  templateId: 'box',
  size: { width: 40, depth: 40, height: 40 },
  colour: '#888888',
  position: { x, z },
  elevation: 0,
  rotation: 0,
  mount: 'floor',
})

/** The sample home with a second version, "Plan A", holding a copy of the items. */
const twoVersions = (): Home => {
  const home = newSampleHome()
  const copy = { id: 'plan-a', name: 'Plan A', items: currentVersion(home).items.map((i) => ({ ...i })) }
  return { ...home, versions: [...home.versions, copy] }
}

describe('containsPoint', () => {
  const l = [
    { x: 0, y: 0 },
    { x: 200, y: 0 },
    { x: 200, y: 100 },
    { x: 100, y: 100 },
    { x: 100, y: 200 },
    { x: 0, y: 200 },
  ]
  it('is true inside an L-shaped outline and false in its notch and outside', () => {
    expect(containsPoint(l, { x: 50, y: 150 })).toBe(true)
    expect(containsPoint(l, { x: 150, y: 50 })).toBe(true)
    expect(containsPoint(l, { x: 150, y: 150 })).toBe(false)
    expect(containsPoint(l, { x: -1, y: 50 })).toBe(false)
  })
  it('counts the outline itself as inside', () => {
    expect(containsPoint(l, { x: 0, y: 50 })).toBe(true)
    expect(containsPoint(l, { x: 200, y: 100 })).toBe(true)
    expect(containsPoint(l, { x: 150, y: 100 })).toBe(true)
  })
})

describe('roomAt', () => {
  const plan = sampleHome()
  it('finds the room whose floor is at a point', () => {
    expect(roomAt(plan, { x: 100, y: 100 })?.id).toBe('living')
    expect(roomAt(plan, { x: 650, y: 280 })?.id).toBe('bedroom')
  })
  it('is null outside every room', () => {
    expect(roomAt(plan, { x: 800, y: 100 })).toBeNull()
    expect(roomAt(plan, { x: 100, y: -5 })).toBeNull()
  })
})

describe('itemsInRoom', () => {
  it('lists the items whose centre is inside the room, even when they stick out', () => {
    const bedroom = sampleHome().rooms[1]
    const items = [item('in', 500, 100), item('edge', 690, 150), item('out', 300, 100), item('straddles', 390, 150)]
    expect(itemsInRoom(bedroom, items).map((i) => i.id)).toEqual(['in', 'edge'])
  })
  it('finds the bed in the sample bedroom', () => {
    const home = newSampleHome()
    expect(itemsInRoom(home.plan.rooms[1], currentVersion(home).items).map((i) => i.id)).toEqual(['sample-bed'])
  })
})

describe('updateRoom', () => {
  it('renames a room and changes its height without touching the others', () => {
    const plan = sampleHome()
    const next = updateRoom(plan, 'bedroom', { name: 'Room 2', height: 270 })
    expect(next.rooms[1]).toMatchObject({ id: 'bedroom', name: 'Room 2', height: 270 })
    expect(next.rooms[0]).toBe(plan.rooms[0])
    expect(plan.rooms[1].name).toBe('Bedroom')
  })
  it('makes the walls that are only the room’s as high as the room; the shared wall takes the taller', () => {
    const plan = updateRoom(sampleHome(), 'bedroom', { height: 270 })
    const walls = wallsOf(plan)
    const own = walls.filter((w) => w.rooms.length === 1 && w.rooms[0] === 'bedroom')
    expect(own).toHaveLength(3)
    for (const wall of own) expect(wallHeight(plan, wall)).toBe(270)
    const shared = walls.find((w) => w.rooms.length === 2)!
    expect(wallHeight(plan, shared)).toBe(270)
    for (const wall of walls.filter((w) => w.rooms.length === 1 && w.rooms[0] === 'living')) expect(wallHeight(plan, wall)).toBe(250)
  })
})

describe('roomHeightError', () => {
  it('accepts 180 to 500 cm and refuses anything else', () => {
    expect(ROOM_HEIGHT_LIMITS).toEqual({ min: 180, max: 500 })
    expect(roomHeightError(180)).toBe(false)
    expect(roomHeightError(270)).toBe(false)
    expect(roomHeightError(500)).toBe(false)
    expect(roomHeightError(120)).toBe(true)
    expect(roomHeightError(501)).toBe(true)
    expect(roomHeightError(Number.NaN)).toBe(true)
  })
})

describe('removeRoom', () => {
  it('removes the room and the items inside it in every version', () => {
    const home = twoVersions()
    const next = removeRoom(home, 'bedroom')
    expect(next.plan.rooms.map((r) => r.id)).toEqual(['living'])
    for (const version of next.versions) expect(version.items.map((i) => i.id)).toEqual(['sample-sofa', 'sample-table'])
    expect(next.currentVersionId).toBe(home.currentVersionId)
    // The home it was given is untouched.
    expect(home.plan.rooms).toHaveLength(2)
    expect(home.versions[1].items).toHaveLength(3)
  })
  it('keeps a wall the room shared as the other room’s wall', () => {
    const next = removeRoom(newSampleHome(), 'bedroom')
    const walls = wallsOf(next.plan)
    expect(walls).toHaveLength(4)
    const kept = walls.find((w) => w.a.x === 400 && w.b.x === 400)!
    expect(kept.rooms).toEqual(['living'])
  })
  it('leaves items outside every room alone', () => {
    const home = addItem(newHome(sampleHome()), item('outside', 900, 100))
    expect(currentVersion(removeRoom(home, 'living')).items.map((i) => i.id)).toEqual(['outside'])
  })
  it('counts the items going with the room in every version', () => {
    expect(itemsGoingWith(twoVersions(), 'bedroom')).toBe(2)
    expect(itemsGoingWith(newSampleHome(), 'bedroom')).toBe(1)
    expect(itemsGoingWith(newSampleHome(), 'nope')).toBe(0)
  })
  it('is the same home for an unknown room', () => {
    const home = newSampleHome()
    expect(removeRoom(home, 'nope')).toBe(home)
  })
})
