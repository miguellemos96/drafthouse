import { describe, expect, it } from 'vitest'
import { createRectRoom, createRoom, wallsOf, type Plan } from './plan.ts'
import { addQuickRoom, placeQuickRoom, QUICK_ROOM_DEFAULTS, quickRoomErrors } from './quickRoom.ts'

const empty = (): Plan => ({ rooms: [] })

describe('placeQuickRoom', () => {
  it('in an empty home, 400 × 300 × 250 gives one room with corners (0,0), (400,0), (400,300), (0,300)', () => {
    const room = placeQuickRoom(empty(), { name: 'Room 1', width: 400, length: 300, height: 250 })
    expect(room.corners).toEqual([{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }])
    expect(room.name).toBe('Room 1')
    expect(room.height).toBe(250)
  })

  it('a second 300 × 300 room shares its left wall with the first room’s right wall', () => {
    const first = addQuickRoom(empty(), { id: 'a', name: 'Room 1', width: 400, length: 300, height: 250 })
    const plan = addQuickRoom(first, { id: 'b', name: 'Room 2', width: 300, length: 300, height: 250 })
    expect(plan.rooms.map((r) => r.id)).toEqual(['a', 'b'])
    expect(plan.rooms[1].corners).toEqual([{ x: 400, y: 0 }, { x: 700, y: 0 }, { x: 700, y: 300 }, { x: 400, y: 300 }])
    const shared = wallsOf(plan).filter((w) => w.rooms.length === 2)
    expect(shared).toHaveLength(1)
    expect(shared[0].rooms.sort()).toEqual(['a', 'b'])
    expect([shared[0].a.x, shared[0].b.x]).toEqual([400, 400])
  })

  it('shares the wall even when the two rooms have different heights', () => {
    const first = addQuickRoom(empty(), { id: 'a', name: 'A', width: 400, length: 300, height: 250 })
    const plan = addQuickRoom(first, { id: 'b', name: 'B', width: 300, length: 300, height: 300 })
    expect(wallsOf(plan).filter((w) => w.rooms.length === 2)).toHaveLength(1)
  })

  it('goes to the right of all existing rooms, level with the top of the rightmost one', () => {
    const plan: Plan = {
      rooms: [
        createRectRoom({ id: 'a', name: 'A', width: 300, length: 300, height: 250 }),
        createRoom({ id: 'b', name: 'B', height: 250, corners: [{ x: 100, y: 300 }, { x: 600, y: 300 }, { x: 600, y: 700 }, { x: 100, y: 700 }] }),
      ],
    }
    const room = placeQuickRoom(plan, { name: 'C', width: 200, length: 400, height: 250 })
    expect(room.corners).toEqual([{ x: 600, y: 300 }, { x: 800, y: 300 }, { x: 800, y: 700 }, { x: 600, y: 700 }])
    expect(wallsOf({ rooms: [...plan.rooms, room] }).filter((w) => w.rooms.length === 2).map((w) => w.rooms.sort())).toContainEqual(['b', room.id].sort())
  })

  it('leaves the plan it was given untouched', () => {
    const plan = addQuickRoom(empty(), { name: 'A', width: 400, length: 300, height: 250 })
    const before = structuredClone(plan)
    addQuickRoom(plan, { name: 'B', width: 300, length: 300, height: 250 })
    expect(plan).toEqual(before)
  })
})

describe('quickRoomErrors', () => {
  it('the defaults are 400 × 300 × 250 and valid', () => {
    expect(QUICK_ROOM_DEFAULTS).toEqual({ width: 400, length: 300, height: 250 })
    expect(quickRoomErrors(QUICK_ROOM_DEFAULTS)).toEqual([])
  })

  it('accepts the ends of each range', () => {
    expect(quickRoomErrors({ width: 50, length: 2000, height: 180 })).toEqual([])
    expect(quickRoomErrors({ width: 2000, length: 50, height: 500 })).toEqual([])
  })

  it('names each field that is out of range', () => {
    expect(quickRoomErrors({ width: 20, length: 300, height: 250 })).toEqual(['width'])
    expect(quickRoomErrors({ width: 400, length: 2001, height: 250 })).toEqual(['length'])
    expect(quickRoomErrors({ width: 400, length: 300, height: 179 })).toEqual(['height'])
    expect(quickRoomErrors({ width: 49, length: 0, height: 501 })).toEqual(['width', 'length', 'height'])
  })

  it('rejects values that are not numbers', () => {
    expect(quickRoomErrors({ width: Number.NaN, length: 300, height: 250 })).toEqual(['width'])
  })
})
