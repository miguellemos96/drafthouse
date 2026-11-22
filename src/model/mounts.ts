// Mounts: where wall and ceiling items go. See "Mount" under "Placing and moving items" and
// "Assumptions to check" in docs/spec.md. Items never float: a wall item's back is flat against
// a wall's inner face, a ceiling item's top is at its room's height, and a floor item stands on the floor.
// Walls are lines with no thickness, so a wall's inner face is the wall line itself.
import type { FloorPoint, Item, Mount, Size } from './item.ts'
import { normaliseAngle } from './move.ts'
import { roomAt } from './newItem.ts'
import { wallHeight, wallsOf, type Plan, type Point, type Wall } from './plan.ts'

/** Where an item moved onto a wall from the floor goes up to, in cm. */
export const WALL_MOUNT_ELEVATION = 120

/** How far to either side of a wall to look for its room, in cm. */
const PROBE = 1

/** Rounds away float noise (and turns -0 into 0). */
const tidy = (n: number) => Math.round(n * 1e6) / 1e6 + 0

const distanceToWall = ({ a, b }: Wall, { x, z }: FloorPoint): number => {
  const dx = b.x - a.x
  const dz = b.y - a.y
  const t = Math.max(0, Math.min(1, ((x - a.x) * dx + (z - a.y) * dz) / (dx * dx + dz * dz)))
  return Math.hypot(x - (a.x + t * dx), z - (a.y + t * dz))
}

/** The wall closest to a floor point, or undefined in a home without walls. */
export const nearestWall = (plan: Plan, point: FloorPoint): Wall | undefined => {
  let best: Wall | undefined
  let bestDistance = Infinity
  for (const wall of wallsOf(plan)) {
    const distance = distanceToWall(wall, point)
    if (distance < bestDistance) {
      best = wall
      bestDistance = distance
    }
  }
  return best
}

const insideRoomOf = (plan: Plan, wall: Wall, point: FloorPoint): boolean => {
  const room = roomAt({ rooms: plan.rooms.filter((r) => wall.rooms.includes(r.id)) }, point)
  return room !== undefined
}

/**
 * Where an item goes flush to a wall, for a floor point near it: its back on the wall line, its centre
 * half its depth into the room, and its front (+Z in item space) facing into the room. The point slides
 * the item along the wall, which keeps the whole width between the wall's ends (an item wider than the
 * wall is centred on it). For a wall between two rooms, the item faces the room the point is on.
 */
export const flushToWall = (plan: Plan, wall: Wall, point: FloorPoint, size: Size): { position: FloorPoint; rotation: number } => {
  const { a, b } = wall
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const along: Point = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const half = size.width / 2
  const projected = (point.x - a.x) * along.x + (point.z - a.y) * along.y
  const t = length >= size.width ? Math.max(half, Math.min(length - half, projected)) : length / 2
  const foot = { x: a.x + along.x * t, z: a.y + along.y * t }

  // The two sides of the wall, the point's side first; the first one with a room of this wall wins.
  const left = { x: -along.y, z: along.x }
  const side = (point.x - foot.x) * left.x + (point.z - foot.z) * left.z
  const sides = side < 0 ? [-1, 1] : [1, -1]
  const middle = { x: (a.x + b.x) / 2, z: (a.y + b.y) / 2 }
  const sign = sides.find((s) => insideRoomOf(plan, wall, { x: middle.x + s * PROBE * left.x, z: middle.z + s * PROBE * left.z })) ?? sides[0]
  const normal = { x: sign * left.x, z: sign * left.z }

  return {
    position: { x: tidy(foot.x + (normal.x * size.depth) / 2), z: tidy(foot.z + (normal.z * size.depth) / 2) },
    // Item space +Z turned by the rotation points along (sin, cos); see toHome in placement.ts.
    rotation: tidy(normaliseAngle((Math.atan2(normal.x, normal.z) * 180) / Math.PI)),
  }
}

/** A wall item's elevation, kept from 0 to the wall height minus the item's height. */
export const wallElevation = (plan: Plan, wall: Wall, itemHeight: number, elevation: number): number =>
  Math.max(0, Math.min(wallHeight(plan, wall) - itemHeight, elevation))

/** A ceiling item's elevation: its top at the height of the room the point is in. Undefined outside every room. */
export const ceilingElevation = (plan: Plan, point: FloorPoint, itemHeight: number): number | undefined => {
  const room = roomAt(plan, point)
  return room ? Math.max(0, room.height - itemHeight) : undefined
}

/**
 * The item placed by its mount's rule, at or near a floor point (its own position by default):
 * - floor: at the point, on the floor;
 * - wall: flush to the wall nearest the point, at its elevation clamped to that wall;
 * - ceiling: at the point, hanging from the ceiling of the room it's over (outside every room it keeps its elevation);
 * - on another item: at the point, otherwise unchanged.
 */
export const placeOnMount = (plan: Plan, item: Item, point: FloorPoint = item.position): Item => {
  const position = { x: point.x, z: point.z }
  switch (item.mount) {
    case 'floor':
      return { ...item, position, elevation: 0 }
    case 'wall': {
      const wall = nearestWall(plan, point)
      if (!wall) return { ...item, position }
      return { ...item, ...flushToWall(plan, wall, point, item.size), elevation: wallElevation(plan, wall, item.size.height, item.elevation) }
    }
    case 'ceiling':
      return { ...item, position, elevation: ceilingElevation(plan, point, item.size.height) ?? item.elevation }
    default:
      return { ...item, position }
  }
}

/**
 * The item with a new mount, re-placed by its rule. Onto a wall it keeps its elevation, or goes to
 * 120 cm when it stood on the floor. Onto the floor its elevation is 0.
 */
export const changeMount = (plan: Plan, item: Item, mount: Mount): Item => {
  const elevation = mount === 'wall' && item.elevation <= 0 ? WALL_MOUNT_ELEVATION : item.elevation
  return placeOnMount(plan, { ...item, mount, elevation })
}
