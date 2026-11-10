import { describe, expect, it } from 'vitest'
import { createRoom, wallsOf, type Plan, type Point, type Wall } from './plan.ts'
import { outwardNormal, wallFades } from './fade.ts'

// Two 300 × 300 rooms side by side: A spans x 0..300, B spans x 300..600.
const sideBySide = (): Plan => ({
  rooms: [
    createRoom({ id: 'A', name: 'A', height: 250, corners: [{ x: 0, y: 0 }, { x: 300, y: 0 }, { x: 300, y: 300 }, { x: 0, y: 300 }] }),
    // Drawn clockwise on purpose: the rule must not depend on winding.
    createRoom({ id: 'B', name: 'B', height: 250, corners: [{ x: 300, y: 0 }, { x: 300, y: 300 }, { x: 600, y: 300 }, { x: 600, y: 0 }] }),
  ],
})

const wallAt = (plan: Plan, a: Point, b: Point): Wall => {
  const same = (p: Point, q: Point) => p.x === q.x && p.y === q.y
  const wall = wallsOf(plan).find((w) => (same(w.a, a) && same(w.b, b)) || (same(w.a, b) && same(w.b, a)))
  if (!wall) throw new Error('no such wall')
  return wall
}

describe('outwardNormal', () => {
  it('points away from the room, whatever the winding', () => {
    const plan = sideBySide()
    expect(outwardNormal(plan.rooms[0], wallAt(plan, { x: 0, y: 0 }, { x: 300, y: 0 }))).toEqual({ x: 0, y: -1 })
    expect(outwardNormal(plan.rooms[0], wallAt(plan, { x: 0, y: 0 }, { x: 0, y: 300 }))).toEqual({ x: -1, y: 0 })
    expect(outwardNormal(plan.rooms[1], wallAt(plan, { x: 600, y: 0 }, { x: 600, y: 300 }))).toEqual({ x: 1, y: 0 })
    expect(outwardNormal(plan.rooms[1], wallAt(plan, { x: 300, y: 300 }, { x: 600, y: 300 }))).toEqual({ x: 0, y: 1 })
  })

  it('a shared wall faces out of each of its rooms', () => {
    const plan = sideBySide()
    const shared = wallAt(plan, { x: 300, y: 0 }, { x: 300, y: 300 })
    expect(outwardNormal(plan.rooms[0], shared)).toEqual({ x: 1, y: 0 })
    expect(outwardNormal(plan.rooms[1], shared)).toEqual({ x: -1, y: 0 })
  })
})

describe('wallFades', () => {
  it('fades the outside walls that face the camera, and keeps the far ones', () => {
    const plan = sideBySide()
    const camera = { x: 300, y: -1000 } // in front of the y = 0 side
    expect(wallFades(plan, wallAt(plan, { x: 0, y: 0 }, { x: 300, y: 0 }), camera)).toBe(true)
    expect(wallFades(plan, wallAt(plan, { x: 300, y: 0 }, { x: 600, y: 0 }), camera)).toBe(true)
    expect(wallFades(plan, wallAt(plan, { x: 0, y: 300 }, { x: 300, y: 300 }), camera)).toBe(false)
    expect(wallFades(plan, wallAt(plan, { x: 300, y: 300 }, { x: 600, y: 300 }), camera)).toBe(false)
  })

  it('fades a side wall only when the camera is on its side', () => {
    const plan = sideBySide()
    const left = wallAt(plan, { x: 0, y: 0 }, { x: 0, y: 300 })
    const right = wallAt(plan, { x: 600, y: 0 }, { x: 600, y: 300 })
    expect(wallFades(plan, left, { x: -500, y: 150 })).toBe(true)
    expect(wallFades(plan, right, { x: -500, y: 150 })).toBe(false)
    expect(wallFades(plan, right, { x: 1200, y: 150 })).toBe(true)
  })

  it('fades a shared wall when it stands between the camera and the far room', () => {
    const plan = sideBySide()
    const shared = wallAt(plan, { x: 300, y: 0 }, { x: 300, y: 300 })
    expect(wallFades(plan, shared, { x: -500, y: 150 })).toBe(true) // hides B from a camera on A's side
    expect(wallFades(plan, shared, { x: 1200, y: 150 })).toBe(true) // hides A from a camera on B's side
  })

  it('fades nothing when the camera is square in a wall’s plane', () => {
    const plan = sideBySide()
    expect(wallFades(plan, wallAt(plan, { x: 0, y: 0 }, { x: 300, y: 0 }), { x: -500, y: 0 })).toBe(false)
  })
})
