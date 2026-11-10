import { describe, expect, it } from 'vitest'
import { createRectRoom, createRoom, moveCorner, roomArea, wallHeight, wallLength, wallsOf, type Plan } from './plan.ts'

const sideBySide = (): Plan => ({
  rooms: [
    createRectRoom({ id: 'a', name: 'A', width: 300, length: 300, height: 250 }),
    createRoom({ id: 'b', name: 'B', height: 250, corners: [{ x: 300, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 300 }, { x: 300, y: 300 }] }),
  ],
})

describe('createRectRoom', () => {
  it('puts the 4 corners at (0,0), (w,0), (w,l), (0,l)', () => {
    const room = createRectRoom({ name: 'Kitchen', width: 400, length: 300, height: 250 })
    expect(room.name).toBe('Kitchen')
    expect(room.height).toBe(250)
    expect(room.corners).toEqual([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }])
  })

  it('gives each room its own id', () => {
    const a = createRectRoom({ name: 'A', width: 100, length: 100, height: 250 })
    const b = createRectRoom({ name: 'B', width: 100, length: 100, height: 250 })
    expect(a.id).not.toBe(b.id)
  })

  it('a 400 × 300 room has walls of 400, 300, 400, 300 and an area of 12 m²', () => {
    const room = createRectRoom({ name: 'Living', width: 400, length: 300, height: 250 })
    expect(wallsOf({ rooms: [room] }).map(wallLength)).toEqual([400, 300, 400, 300])
    expect(roomArea(room)).toBe(12)
  })
})

describe('room validation', () => {
  it('needs at least 3 corners', () => {
    expect(() => createRoom({ name: 'X', height: 250, corners: [{ x: 0, y: 0 }, { x: 100, y: 0 }] })).toThrow(
      'Room outline needs at least 3 corners.',
    )
  })

  it('rejects zero-length edges', () => {
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }]
    expect(() => createRoom({ name: 'X', height: 250, corners })).toThrow('Room outline has a zero-length edge.')
  })

  it('rejects a zero-length closing edge', () => {
    const corners = [{ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 100 }, { x: 0, y: 0 }]
    expect(() => createRoom({ name: 'X', height: 250, corners })).toThrow('Room outline has a zero-length edge.')
  })

  it('throws when the edges cross', () => {
    const bowtie = [{ x: 0, y: 0 }, { x: 100, y: 100 }, { x: 100, y: 0 }, { x: 0, y: 100 }]
    expect(() => createRoom({ name: 'X', height: 250, corners: bowtie })).toThrow('Room outline crosses itself.')
  })

  it('throws when the outline touches itself at a corner', () => {
    const corners = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 100 }, { x: 200, y: 200 }, { x: 0, y: 200 }, { x: 100, y: 100 }]
    expect(() => createRoom({ name: 'X', height: 250, corners })).toThrow('Room outline crosses itself.')
  })

  it('throws when an edge doubles back on the previous one', () => {
    const corners = [{ x: 0, y: 0 }, { x: 200, y: 0 }, { x: 100, y: 0 }, { x: 100, y: 100 }]
    expect(() => createRoom({ name: 'X', height: 250, corners })).toThrow('Room outline crosses itself.')
  })

  it('accepts an L-shaped room', () => {
    const corners = [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 200 }, { x: 200, y: 200 }, { x: 200, y: 400 }, { x: 0, y: 400 }]
    const room = createRoom({ name: 'L', height: 250, corners })
    expect(roomArea(room)).toBe(12)
  })

  it('area does not depend on the winding direction', () => {
    const corners = [{ x: 0, y: 0 }, { x: 0, y: 300 }, { x: 400, y: 300 }, { x: 400, y: 0 }]
    expect(roomArea(createRoom({ name: 'X', height: 250, corners }))).toBe(12)
  })
})

describe('wallsOf', () => {
  it('two 300 × 300 rooms side by side give 7 walls, one shared', () => {
    const walls = wallsOf(sideBySide())
    expect(walls).toHaveLength(7)
    const shared = walls.filter((w) => w.rooms.length === 2)
    expect(shared).toHaveLength(1)
    expect(shared[0].rooms).toEqual(['a', 'b'])
    expect(wallLength(shared[0])).toBe(300)
  })
})

describe('moveCorner', () => {
  it('moving a shared corner by 50 cm changes both rooms and keeps one shared wall', () => {
    const plan = sideBySide()
    const moved = moveCorner(plan, { x: 300, y: 0 }, { x: 350, y: 0 })
    expect(moved.rooms[0].corners[1]).toEqual({ x: 350, y: 0 })
    expect(moved.rooms[1].corners[0]).toEqual({ x: 350, y: 0 })
    const walls = wallsOf(moved)
    expect(walls).toHaveLength(7)
    const shared = walls.filter((w) => w.rooms.length === 2)
    expect(shared).toHaveLength(1)
    expect(shared[0].rooms).toEqual(['a', 'b'])
    expect(roomArea(moved.rooms[0])).toBeCloseTo(9.75)
    expect(roomArea(moved.rooms[1])).toBeCloseTo(8.25)
  })

  it('does not change the original plan', () => {
    const plan = sideBySide()
    moveCorner(plan, { x: 300, y: 0 }, { x: 350, y: 0 })
    expect(plan.rooms[0].corners[1]).toEqual({ x: 300, y: 0 })
  })

  it('throws when the move makes an outline cross itself', () => {
    const plan = { rooms: [createRectRoom({ name: 'A', width: 300, length: 300, height: 250 })] }
    expect(() => moveCorner(plan, { x: 300, y: 0 }, { x: -100, y: 150 })).toThrow('Room outline crosses itself.')
  })
})

describe('wallHeight', () => {
  it('is the room height, and the taller room for a shared wall', () => {
    const plan: Plan = {
      rooms: [
        createRoom({ id: 'A', name: 'A', height: 250, corners: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }] }),
        createRoom({ id: 'B', name: 'B', height: 270, corners: [{ x: 300, y: 0 }, { x: 600, y: 0 }, { x: 600, y: 300 }, { x: 300, y: 300 }] }),
      ],
    }
    const heights = wallsOf(plan).map((w) => [w.rooms.join('+'), wallHeight(plan, w)])
    expect(heights.filter(([rooms]) => rooms === 'A').every(([, h]) => h === 250)).toBe(true)
    expect(heights.find(([rooms]) => rooms === 'A+B')).toEqual(['A+B', 270])
  })
})
