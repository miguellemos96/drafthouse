// Showing and hiding rooms: a view setting, not part of the home. It is never saved and never an undo step.
// A hidden room hides its floor, its walls that aren't shared with a shown room, and the items inside it.
// See "Looking around" in docs/spec.md.
import type { Item } from './item.ts'
import type { Plan, Wall } from './plan.ts'
import { containsPoint } from './room.ts'

/** The ids of the hidden rooms. */
export type HiddenRooms = ReadonlySet<string>

/** A wall shows while any of its rooms does, so a shared wall stays until both rooms are hidden. */
export const wallVisible = (wall: Wall, hidden: HiddenRooms): boolean => wall.rooms.some((id) => !hidden.has(id))

/**
 * An item hides when its footprint centre is inside a hidden room and inside no shown one.
 * An item outside every room always shows.
 */
export const itemVisible = (plan: Plan, item: Item, hidden: HiddenRooms): boolean => {
  const p = { x: item.position.x, y: item.position.z }
  const rooms = plan.rooms.filter((room) => containsPoint(room.corners, p))
  return rooms.length === 0 || rooms.some((room) => !hidden.has(room.id))
}

/** The hidden rooms that still exist in `plan`: a deleted room is forgotten. */
export const pruneHidden = (plan: Plan, hidden: HiddenRooms): Set<string> =>
  new Set(plan.rooms.filter((room) => hidden.has(room.id)).map((room) => room.id))
