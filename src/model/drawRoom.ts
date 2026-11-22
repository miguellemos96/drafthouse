// Drawing a room corner by corner, and dragging a room's corners. See "Rooms" → "Draw" in docs/spec.md.
// Corners snap to whole centimetres, to an existing corner within 15 cm, and to 15° angles from the
// previous corner; holding Alt (`free`) keeps only the whole centimetres.
import { createRoom, moveCorner, outlineError, type Plan, type Point, type Room } from './plan.ts'
import { QUICK_ROOM_DEFAULTS } from './quickRoom.ts'

/** How close a click must come to an existing corner to land on it, in cm. */
export const CORNER_SNAP_DISTANCE = 15
/** The angle step from the previous corner, in degrees. */
export const ANGLE_STEP = 15
/** A drawn room's wall height, in cm: the same as a quick room's. */
export const DRAWN_ROOM_HEIGHT = QUICK_ROOM_DEFAULTS.height

export type CornerSnap = {
  /** Corners a click can land on: every room's, and the ones drawn so far. */
  targets: Point[]
  /** The corner before this one, for the 15° angles; `null` for the first. */
  previous: Point | null
  /** Alt held: whole centimetres only. */
  free?: boolean
}

const samePoint = (p: Point, q: Point) => p.x === q.x && p.y === q.y
const whole = (p: Point): Point => ({ x: Math.round(p.x) + 0, y: Math.round(p.y) + 0 }) // + 0: no -0

/**
 * Where a corner goes for a pointer at `raw`. The first that applies wins: the nearest target
 * corner within 15 cm; else the point on the nearest 15° line from the previous corner; else
 * `raw` itself. Always whole centimetres.
 */
export const snapCorner = (raw: Point, { targets, previous, free = false }: CornerSnap): Point => {
  if (free) return whole(raw)
  let nearest: Point | null = null
  let best = CORNER_SNAP_DISTANCE
  for (const corner of targets) {
    const distance = Math.hypot(corner.x - raw.x, corner.y - raw.y)
    if (distance <= best) {
      best = distance
      nearest = corner
    }
  }
  if (nearest) return { ...nearest }
  if (!previous) return whole(raw)
  const dx = raw.x - previous.x
  const dy = raw.y - previous.y
  if (dx === 0 && dy === 0) return whole(raw)
  const step = (ANGLE_STEP * Math.PI) / 180
  const angle = Math.round(Math.atan2(dy, dx) / step) * step
  const along = dx * Math.cos(angle) + dy * Math.sin(angle)
  return whole({ x: previous.x + along * Math.cos(angle), y: previous.y + along * Math.sin(angle) })
}

/** Every room's corners, once each. */
export const planCorners = (plan: Plan): Point[] => {
  const seen = new Map<string, Point>()
  for (const room of plan.rooms) for (const c of room.corners) seen.set(`${c.x},${c.y}`, c)
  return [...seen.values()]
}

/**
 * What a click at the (snapped) `point` does to the corners drawn so far: adds a corner, or asks to
 * close the room when it lands on the first corner. A click on the last corner again does nothing.
 */
export const sketchClick = (corners: Point[], point: Point): { close: boolean; corners: Point[] } => {
  if (corners.length > 0 && samePoint(point, corners[corners.length - 1])) return { close: false, corners }
  if (corners.length > 1 && samePoint(point, corners[0])) return { close: true, corners }
  return { close: false, corners: [...corners, { ...point }] }
}

/** Why a drawn outline isn't added: fewer than 3 corners, or it crosses itself. */
export type DrawError = 'too-few' | 'crosses'

/** What is wrong with a drawn outline, or `null` when it makes a room. */
export const drawError = (corners: Point[]): DrawError | null => {
  const error = outlineError(corners)
  return error === null ? null : error === 'too-few' ? 'too-few' : 'crosses'
}

/**
 * The plan with the drawn room added, `height` 250 cm, or the reason it can't be. An edge on another
 * room's edge becomes one shared wall through `wallsOf`.
 */
export const closeRoom = (plan: Plan, corners: Point[], { id, name }: { id?: string; name: string }): { plan: Plan } | { error: DrawError } => {
  const error = drawError(corners)
  if (error) return { error }
  return { plan: { ...plan, rooms: [...plan.rooms, createRoom({ id, name, height: DRAWN_ROOM_HEIGHT, corners })] } }
}

/** The corner before `point` in the room's outline, or `null` when the room hasn't got that corner. */
export const previousCorner = (room: Room, point: Point): Point | null => {
  const i = room.corners.findIndex((c) => samePoint(c, point))
  return i < 0 ? null : room.corners[(i + room.corners.length - 1) % room.corners.length]
}

/**
 * Where a dragged corner of `room` goes for a pointer at `raw`, with the same snapping as drawing:
 * to other corners (not the one being dragged) and to 15° angles from the corner before it.
 */
export const snapDraggedCorner = (plan: Plan, room: Room, from: Point, raw: Point, free = false): Point =>
  snapCorner(raw, { targets: planCorners(plan).filter((c) => !samePoint(c, from)), previous: previousCorner(room, from), free })

/**
 * The plan with the corner at `from` moved to `to` in every room that has it, so shared walls stay
 * shared; `null` when that would make any room cross itself.
 */
export const dragCorner = (plan: Plan, from: Point, to: Point): Plan | null => {
  for (const room of plan.rooms) {
    if (!room.corners.some((c) => samePoint(c, from))) continue
    if (outlineError(room.corners.map((c) => (samePoint(c, from) ? to : c)))) return null
  }
  return moveCorner(plan, from, to)
}
