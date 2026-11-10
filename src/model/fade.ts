// Which walls fade so you can see inside: a wall fades when its outward normal points toward
// the camera. A shared wall has one outward normal per room; it fades when either one does,
// because it then stands between the camera and that room.
// Works in plan coordinates: pass the camera's position seen from above.
import type { Plan, Point, Room, Wall } from './plan.ts'

const samePoint = (p: Point, q: Point) => p.x === q.x && p.y === q.y

// Twice the signed area: positive when the corners run counter-clockwise (x right, y up).
const signedArea2 = (corners: Point[]) =>
  corners.reduce((sum, p, i) => {
    const q = corners[(i + 1) % corners.length]
    return sum + p.x * q.y - q.x * p.y
  }, 0)

/** The unit normal of `wall` that points out of `room`. The wall must be one of the room's edges. */
export const outwardNormal = (room: Room, wall: Wall): Point => {
  const n = room.corners.length
  const i = room.corners.findIndex((p, k) => {
    const q = room.corners[(k + 1) % n]
    return (samePoint(p, wall.a) && samePoint(q, wall.b)) || (samePoint(p, wall.b) && samePoint(q, wall.a))
  })
  if (i < 0) throw new Error(`Wall is not an edge of room ${room.id}.`)
  const a = room.corners[i]
  const b = room.corners[(i + 1) % n]
  const len = Math.hypot(b.x - a.x, b.y - a.y)
  const dx = (b.x - a.x) / len
  const dy = (b.y - a.y) / len
  // Counter-clockwise: the outside is on the right of each edge.
  const normal = signedArea2(room.corners) > 0 ? { x: dy, y: -dx } : { x: -dy, y: dx }
  return { x: normal.x + 0, y: normal.y + 0 } // drop -0
}

/** True when `wall` should fade for a camera at `camera` (plan coordinates, cm). */
export const wallFades = (plan: Plan, wall: Wall, camera: Point): boolean => {
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const toCamera = { x: camera.x - mid.x, y: camera.y - mid.y }
  return plan.rooms
    .filter((room) => wall.rooms.includes(room.id))
    .some((room) => {
      const n = outwardNormal(room, wall)
      return n.x * toCamera.x + n.y * toCamera.y > 0
    })
}
