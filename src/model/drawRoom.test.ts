import { describe, expect, it } from 'vitest'
import { closeRoom, dragCorner, drawError, planCorners, previousCorner, sketchClick, snapCorner, snapDraggedCorner } from './drawRoom.ts'
import { createRectRoom, createRoom, roomArea, wallsOf, type Plan, type Point } from './plan.ts'

const empty = (): Plan => ({ rooms: [] })

/** Clicks each point in turn, snapping as the draw tool does, and returns the corners and whether it closed. */
const draw = (plan: Plan, clicks: Point[], free = false) => {
  let corners: Point[] = []
  for (const raw of clicks) {
    const point = snapCorner(raw, { targets: [...planCorners(plan), ...corners], previous: corners.at(-1) ?? null, free })
    const result = sketchClick(corners, point)
    if (result.close) return { corners: result.corners, closed: true }
    corners = result.corners
  }
  return { corners, closed: false }
}

describe('snapCorner', () => {
  it('rounds to whole centimetres', () => {
    expect(snapCorner({ x: 12.4, y: -7.6 }, { targets: [], previous: null })).toEqual({ x: 12, y: -8 })
  })

  it('lands on an existing corner within 15 cm: (203, 4) is 5 cm from (200, 0)', () => {
    expect(snapCorner({ x: 203, y: 4 }, { targets: [{ x: 200, y: 0 }], previous: null })).toEqual({ x: 200, y: 0 })
  })

  it('ignores corners farther than 15 cm', () => {
    expect(snapCorner({ x: 216, y: 0 }, { targets: [{ x: 200, y: 0 }], previous: null })).toEqual({ x: 216, y: 0 })
  })

  it('takes the nearest of two corners in reach', () => {
    const targets = [{ x: 0, y: 0 }, { x: 20, y: 0 }]
    expect(snapCorner({ x: 12, y: 0 }, { targets, previous: null })).toEqual({ x: 20, y: 0 })
  })

  it('from (0,0), a click at (300, 12) snaps to (300, 0), the 0° line', () => {
    expect(snapCorner({ x: 300, y: 12 }, { targets: [{ x: 0, y: 0 }], previous: { x: 0, y: 0 } })).toEqual({ x: 300, y: 0 })
  })

  it('snaps to 15° steps, not just right angles', () => {
    // 100 cm along 45°, a little off it.
    const p = snapCorner({ x: 74, y: 68 }, { targets: [], previous: { x: 0, y: 0 } })
    expect(p.x).toBe(p.y)
    // 30° from (100, 100).
    const q = snapCorner({ x: 100 + 173, y: 100 + 102 }, { targets: [], previous: { x: 100, y: 100 } })
    expect(Math.atan2(q.y - 100, q.x - 100) * (180 / Math.PI)).toBeCloseTo(30, 0)
  })

  it('a corner in reach wins over the angle', () => {
    expect(snapCorner({ x: 203, y: 30 }, { targets: [{ x: 200, y: 25 }], previous: { x: 0, y: 0 } })).toEqual({ x: 200, y: 25 })
  })

  it('with Alt held, only rounds to whole centimetres', () => {
    expect(snapCorner({ x: 203.2, y: 4.4 }, { targets: [{ x: 200, y: 0 }], previous: { x: 0, y: 0 }, free: true })).toEqual({ x: 203, y: 4 })
  })
})

describe('drawing a room', () => {
  it('clicking (0,0), (400,0), (400,300), (0,300) and (0,0) again gives a 400 × 300 room', () => {
    const plan = empty()
    const drawn = draw(plan, [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }, { x: 0, y: 0 }])
    expect(drawn.closed).toBe(true)
    const result = closeRoom(plan, drawn.corners, { id: 'r', name: 'Room 1' })
    if (!('plan' in result)) throw new Error('not closed')
    const [room] = result.plan.rooms
    expect(room).toEqual({ id: 'r', name: 'Room 1', height: 250, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] })
    expect(roomArea(room)).toBe(12)
  })

  it('a click near the first corner closes the room', () => {
    const drawn = draw(empty(), [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 6, y: 8 }])
    expect(drawn).toEqual({ closed: true, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }] })
  })

  it('a second click on the last corner adds nothing', () => {
    expect(sketchClick([{ x: 0, y: 0 }], { x: 0, y: 0 })).toEqual({ close: false, corners: [{ x: 0, y: 0 }] })
  })

  it('an L-shaped room has 6 corners', () => {
    const clicks = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 }, { x: 0, y: 0 }]
    const drawn = draw(empty(), clicks)
    const result = closeRoom(empty(), drawn.corners, { name: 'L' })
    if (!('plan' in result)) throw new Error('not closed')
    expect(result.plan.rooms[0].corners).toHaveLength(6)
    expect(roomArea(result.plan.rooms[0])).toBe(12)
  })

  it('refuses a bow-tie outline', () => {
    const bowTie = [{ x: 0, y: 0 }, { x: 300, y: 300 }, { x: 300, y: 0 }, { x: 0, y: 300 }]
    expect(drawError(bowTie)).toBe('crosses')
    expect(closeRoom(empty(), bowTie, { name: 'X' })).toEqual({ error: 'crosses' })
  })

  it('refuses fewer than 3 corners', () => {
    expect(closeRoom(empty(), [{ x: 0, y: 0 }, { x: 100, y: 0 }], { name: 'X' })).toEqual({ error: 'too-few' })
  })

  it('closing on the first corner with only 2 corners asks to close, and is refused', () => {
    const drawn = draw(empty(), [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }])
    expect(drawn.closed).toBe(true)
    expect(closeRoom(empty(), drawn.corners, { name: 'X' })).toEqual({ error: 'too-few' })
  })

  it('an edge on another room’s edge becomes one shared wall', () => {
    const plan: Plan = { rooms: [createRectRoom({ id: 'a', name: 'A', width: 400, length: 300, height: 250 })] }
    const drawn = draw(plan, [{ x: 403, y: 2 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 398, y: 297 }, { x: 401, y: 1 }])
    const result = closeRoom(plan, drawn.corners, { id: 'b', name: 'B' })
    if (!('plan' in result)) throw new Error('not closed')
    const shared = wallsOf(result.plan).filter((w) => w.rooms.length === 2)
    expect(shared).toHaveLength(1)
    expect(shared[0].rooms.sort()).toEqual(['a', 'b'])
  })
})

describe('dragging a corner', () => {
  const twoRooms = (): Plan => ({
    rooms: [
      createRectRoom({ id: 'a', name: 'A', width: 400, length: 300, height: 250 }),
      createRoom({ id: 'b', name: 'B', height: 250, corners: [{ x: 400, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 400, y: 300 }] }),
    ],
  })

  it('moves a corner shared by two rooms in both rooms', () => {
    const moved = dragCorner(twoRooms(), { x: 400, y: 0 }, { x: 450, y: 0 })
    expect(moved?.rooms[0].corners[1]).toEqual({ x: 450, y: 0 })
    expect(moved?.rooms[1].corners[0]).toEqual({ x: 450, y: 0 })
    expect(wallsOf(moved!).filter((w) => w.rooms.length === 2)).toHaveLength(1)
  })

  it('refuses a drag that makes a room cross itself', () => {
    expect(dragCorner(twoRooms(), { x: 0, y: 0 }, { x: 500, y: 150 })).toBeNull()
  })

  it('refuses a drag onto another corner of the same room', () => {
    expect(dragCorner(twoRooms(), { x: 0, y: 0 }, { x: 400, y: 0 })).toBeNull()
  })

  it('snaps with the same rules, never to the corner being dragged', () => {
    const plan = twoRooms()
    const room = plan.rooms[0]
    expect(previousCorner(room, { x: 400, y: 300 })).toEqual({ x: 400, y: 0 })
    // Near its own spot: stays free of it, and snaps to the 90° line from (400, 0).
    expect(snapDraggedCorner(plan, room, { x: 400, y: 300 }, { x: 405, y: 310 })).toEqual({ x: 400, y: 310 })
    // Near another room's corner: lands on it.
    expect(snapDraggedCorner(plan, room, { x: 0, y: 300 }, { x: 395, y: 292 })).toEqual({ x: 400, y: 300 })
    // Alt: whole centimetres only.
    expect(snapDraggedCorner(plan, room, { x: 400, y: 300 }, { x: 405.4, y: 310.2 }, true)).toEqual({ x: 405, y: 310 })
  })
})
