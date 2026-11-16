// Editing one room: which room is at a floor point, which items it holds, renaming it,
// changing its height and deleting it. See "Rooms" in docs/spec.md.
import type { Home } from './home.ts'
import type { Item } from './item.ts'
import type { Plan, Point, Room } from './plan.ts'
import { QUICK_ROOM_LIMITS } from './quickRoom.ts'

/** Allowed wall heights in cm, both ends included: the same as for a new room. */
export const ROOM_HEIGHT_LIMITS = QUICK_ROOM_LIMITS.height

/** True when `height` is not a number from 180 to 500 cm. */
export const roomHeightError = (height: number): boolean =>
  !Number.isFinite(height) || height < ROOM_HEIGHT_LIMITS.min || height > ROOM_HEIGHT_LIMITS.max

const onEdge = (p: Point, a: Point, b: Point) =>
  (b.x - a.x) * (p.y - a.y) === (b.y - a.y) * (p.x - a.x) &&
  Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)

/** True when `p` is inside the outline or on it. */
export const containsPoint = (corners: Point[], p: Point): boolean => {
  let inside = false
  for (let i = 0, j = corners.length - 1; i < corners.length; j = i++) {
    const a = corners[i]
    const b = corners[j]
    if (onEdge(p, a, b)) return true
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside
  }
  return inside
}

/** The room whose floor is at `p` on the plan, or `null` outside every room. The first one wins on a shared wall. */
export const roomAt = (plan: Plan, p: Point): Room | null => plan.rooms.find((room) => containsPoint(room.corners, p)) ?? null

/** The items whose footprint centre is inside the room or on its outline. */
export const itemsInRoom = (room: Room, items: Item[]): Item[] =>
  items.filter((item) => containsPoint(room.corners, { x: item.position.x, y: item.position.z }))

/** The plan with one room renamed or given a new height. Returns a new plan. */
export const updateRoom = (plan: Plan, id: string, changes: Partial<Pick<Room, 'name' | 'height'>>): Plan => ({
  rooms: plan.rooms.map((room) => (room.id === id ? { ...room, ...changes } : room)),
})

/** How many items go with the room if it is deleted, counting every version. */
export const itemsGoingWith = (home: Home, id: string): number => {
  const room = home.plan.rooms.find((r) => r.id === id)
  return room ? home.versions.reduce((n, version) => n + itemsInRoom(room, version.items).length, 0) : 0
}

/**
 * The home without the room and without the items inside it, in every version, because rooms are
 * shared by all versions. Walls are derived from the rooms, so a wall it shared stays as the other
 * room's wall. Returns the same home for an unknown room.
 */
export const removeRoom = (home: Home, id: string): Home => {
  const room = home.plan.rooms.find((r) => r.id === id)
  if (!room) return home
  return {
    ...home,
    plan: { rooms: home.plan.rooms.filter((r) => r !== room) },
    versions: home.versions.map((version) => {
      const going = new Set(itemsInRoom(room, version.items))
      return { ...version, items: version.items.filter((item) => !going.has(item)) }
    }),
  }
}
