import { describe, expect, it } from 'vitest'
import { frameRoom, roomBounds } from './focus.ts'
import { createRoom, createRectRoom } from './plan.ts'

type V = { x: number; y: number; z: number }
const sub = (a: V, b: V): V => ({ x: a.x - b.x, y: a.y - b.y, z: a.z - b.z })
const dot = (a: V, b: V) => a.x * b.x + a.y * b.y + a.z * b.z
const crossV = (a: V, b: V): V => ({ x: a.y * b.z - a.z * b.y, y: a.z * b.x - a.x * b.z, z: a.x * b.y - a.y * b.x })
const unit = (a: V): V => {
  const l = Math.hypot(a.x, a.y, a.z)
  return { x: a.x / l, y: a.y / l, z: a.z / l }
}

/** True when `point` is inside the view of a camera at `eye` looking at `target`, with this vertical fov and aspect. */
const inView = (eye: V, target: V, fov: number, aspect: number, point: V) => {
  const forward = unit(sub(target, eye))
  const right = unit(crossV(forward, { x: 0, y: 1, z: 0 }))
  const up = crossV(right, forward)
  const d = sub(point, eye)
  const depth = dot(d, forward)
  const tanV = Math.tan((fov * Math.PI) / 360)
  return depth > 0 && Math.abs(dot(d, up)) / depth <= tanV + 1e-9 && Math.abs(dot(d, right)) / depth <= tanV * aspect + 1e-9
}

const boxCorners = (minX: number, maxX: number, minZ: number, maxZ: number, height: number): V[] =>
  [minX, maxX].flatMap((x) => [minZ, maxZ].flatMap((z) => [0, height].map((y) => ({ x, y, z }))))

describe('frameRoom', () => {
  // A 400 × 300 room centred at (200, 150).
  const room = createRectRoom({ name: 'Room 1', width: 400, length: 300, height: 250 })

  it('orbits around the centre of a 400 × 300 room at (200, 150)', () => {
    const { target } = frameRoom(room, 50, 16 / 9)
    expect(target.x).toBe(200)
    expect(target.z).toBe(150)
  })

  // From any angle the camera keeps, the whole room, floor to wall tops, is in view.
  const angles: [string, V][] = [
    ['straight down', { x: 0, y: 1, z: 0.0001 }],
    ['from the front, high', { x: 0.6, y: 0.9, z: 1.1 }],
    ['from the side, low', { x: -1, y: 0.2, z: 0 }],
  ]
  for (const aspect of [16 / 9, 0.5]) {
    for (const [name, direction] of angles) {
      it(`keeps the whole room in view ${name}, aspect ${aspect.toFixed(2)}`, () => {
        const { target, distance } = frameRoom(room, 50, aspect)
        const d = unit(direction)
        const eye = { x: target.x + d.x * distance, y: target.y + d.y * distance, z: target.z + d.z * distance }
        for (const corner of boxCorners(0, 400, 0, 300, 250)) expect(inView(eye, target, 50, aspect, corner)).toBe(true)
      })
    }
  }

  it('stands further back for a bigger room and for a narrower screen', () => {
    const big = createRectRoom({ name: 'Big', width: 800, length: 600, height: 250 })
    expect(frameRoom(big, 50, 1.5).distance).toBeGreaterThan(frameRoom(room, 50, 1.5).distance)
    expect(frameRoom(room, 50, 0.5).distance).toBeGreaterThan(frameRoom(room, 50, 1.5).distance)
  })

  it('frames an L-shaped room by its bounding box', () => {
    const l = createRoom({ name: 'L', height: 250, corners: [{ x: 100, y: 0 }, { x: 500, y: 0 }, { x: 500, y: 200 }, { x: 300, y: 200 }, { x: 300, y: 400 }, { x: 100, y: 400 }] })
    expect(roomBounds(l)).toEqual({ minX: 100, maxX: 500, minY: 0, maxY: 400 })
    expect(frameRoom(l, 50, 1).target).toEqual({ x: 300, y: 0, z: 200 })
  })
})
