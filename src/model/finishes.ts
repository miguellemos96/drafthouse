// Finishes: each room's floor material and colour, and a colour per wall, per room. See "Finishes"
// under "Rooms" and "Version" in docs/spec.md. A version holds its own finishes, so "Plan A" can have new paint.
// Every finish is optional and falls back to a default, so homes saved before finishes load unchanged.
//
// A wall colour is keyed by the room's id and the wall's two corners (`wallKey`), so each room has its own
// colour for a wall it shares: Room 1's side of a shared wall can be blue while Room 2's stays off-white.
// Moving a corner changes the key, so a moved wall goes back to the default colour.
import { currentVersion, type Home } from './home.ts'
import type { Plan, Point, Room, Wall } from './plan.ts'
import { containsPoint } from './room.ts'

export const FLOOR_MATERIALS = ['wood', 'tile', 'carpet', 'concrete'] as const
export type FloorMaterial = (typeof FLOOR_MATERIALS)[number]

export const DEFAULT_FLOOR_MATERIAL: FloorMaterial = 'wood'
/** Light oak. */
export const DEFAULT_FLOOR_COLOUR = '#d9c6a5'
/** Off-white. */
export const DEFAULT_WALL_COLOUR = '#f2efe9'

/** One room's finishes. `walls` maps `wallKey(a, b)` to a colour. */
export type RoomFinish = { floor?: FloorMaterial; floorColour?: string; walls?: Record<string, string> }

/** A version's finishes, by room id. */
export type Finishes = { rooms?: Record<string, RoomFinish> }

export type Floor = { material: FloorMaterial; colour: string }

/** The key of the wall between `a` and `b`, whichever way round they are given. */
export const wallKey = (a: Point, b: Point): string => [`${a.x},${a.y}`, `${b.x},${b.y}`].sort().join('|')

const roomFinish = (finishes: Finishes | undefined, roomId: string): RoomFinish => finishes?.rooms?.[roomId] ?? {}

/** A room's floor, with the defaults for what isn't set. */
export const floorOf = (finishes: Finishes | undefined, roomId: string): Floor => {
  const finish = roomFinish(finishes, roomId)
  return { material: finish.floor ?? DEFAULT_FLOOR_MATERIAL, colour: finish.floorColour ?? DEFAULT_FLOOR_COLOUR }
}

/** A room's colour for its wall between `a` and `b`, or the default. */
export const wallColourOf = (finishes: Finishes | undefined, roomId: string, a: Point, b: Point): string =>
  roomFinish(finishes, roomId).walls?.[wallKey(a, b)] ?? DEFAULT_WALL_COLOUR

const withRoomFinish = (home: Home, roomId: string, change: (finish: RoomFinish) => RoomFinish): Home => {
  const current = currentVersion(home)
  const finishes = current.finishes ?? {}
  const rooms = { ...finishes.rooms, [roomId]: change(roomFinish(finishes, roomId)) }
  return { ...home, versions: home.versions.map((v) => (v === current ? { ...v, finishes: { ...finishes, rooms } } : v)) }
}

/** The home with a room's floor material and/or colour changed in the current version. */
export const setFloor = (home: Home, roomId: string, changes: Partial<Floor>): Home =>
  withRoomFinish(home, roomId, (finish) => ({
    ...finish,
    ...(changes.material !== undefined && { floor: changes.material }),
    ...(changes.colour !== undefined && { floorColour: changes.colour }),
  }))

/** The home with a room's colour for its wall between `a` and `b` changed in the current version. */
export const setWallColour = (home: Home, roomId: string, a: Point, b: Point, colour: string): Home =>
  withRoomFinish(home, roomId, (finish) => ({ ...finish, walls: { ...finish.walls, [wallKey(a, b)]: colour } }))

/** A room's walls in outline order, as numbered in its panel: "Wall 1" runs from the first corner to the second. */
export const roomWalls = (room: Room): { a: Point; b: Point; length: number }[] =>
  room.corners.map((a, i) => {
    const b = room.corners[(i + 1) % room.corners.length]
    return { a, b, length: Math.hypot(b.x - a.x, b.y - a.y) }
  })

/**
 * The colours of a wall's two faces. `left` is the face on the left going from `wall.a` to `wall.b` in the
 * plan (the side of the normal (-dy, dx)), `right` the other. Each face takes the colour that the room on its
 * side gives the wall; a face with no room on its side (the outside of the home) is the default.
 */
export const wallFaceColours = (plan: Plan, finishes: Finishes | undefined, wall: Wall): { left: string; right: string } => {
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
  const normal = { x: -(wall.b.y - wall.a.y) / length, y: (wall.b.x - wall.a.x) / length }
  const colourOn = (sign: number) => {
    const p = { x: mid.x + sign * normal.x, y: mid.y + sign * normal.y }
    const room = plan.rooms.find((r) => wall.rooms.includes(r.id) && containsPoint(r.corners, p))
    return room ? wallColourOf(finishes, room.id, wall.a, wall.b) : DEFAULT_WALL_COLOUR
  }
  return { left: colourOn(1), right: colourOn(-1) }
}
