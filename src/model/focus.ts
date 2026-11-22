// Focusing the camera on a room: where the camera orbits and how far back it stands so the whole
// room is in view. See "Looking around" in docs/spec.md. The scene moves the camera; this only says where.
import type { Room } from './plan.ts'

export type RoomFrame = {
  /** The point the camera orbits around afterwards: the room's centre, on the floor. */
  target: { x: number; y: number; z: number }
  /** How far the camera stands from the target, in cm. */
  distance: number
}

/** The room's bounding box on the plan, in cm. */
export const roomBounds = (room: Room) => {
  const xs = room.corners.map((p) => p.x)
  const ys = room.corners.map((p) => p.y)
  return { minX: Math.min(...xs), maxX: Math.max(...xs), minY: Math.min(...ys), maxY: Math.max(...ys) }
}

/**
 * The orbit target and camera distance that frame `room` in a camera with this vertical field of
 * view (degrees) and aspect ratio (width / height), from any angle. The box from the floor to the top of
 * the walls fits in a sphere around the target; the distance puts that sphere inside the narrower of
 * the two fields of view.
 */
export const frameRoom = (room: Room, fov: number, aspect: number): RoomFrame => {
  const { minX, maxX, minY, maxY } = roomBounds(room)
  const target = { x: (minX + maxX) / 2, y: 0, z: (minY + maxY) / 2 }
  const radius = Math.hypot((maxX - minX) / 2, (maxY - minY) / 2, room.height)
  const halfVertical = (fov * Math.PI) / 360
  const halfHorizontal = Math.atan(Math.tan(halfVertical) * aspect)
  return { target, distance: radius / Math.sin(Math.min(halfVertical, halfHorizontal)) }
}
