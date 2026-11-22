// Quick start: a rectangular room from a width, length and height. See "Rooms" → "Quick start" in docs/spec.md.
import { createRectRoom, createRoom, type Plan, type Room } from './plan.ts'

export type QuickRoomSize = { width: number; length: number; height: number }
export type QuickRoomField = keyof QuickRoomSize

export const QUICK_ROOM_DEFAULTS: QuickRoomSize = { width: 400, length: 300, height: 250 }

/** Allowed values in cm, both ends included. */
export const QUICK_ROOM_LIMITS: Record<QuickRoomField, { min: number; max: number }> = {
  width: { min: 50, max: 2000 },
  length: { min: 50, max: 2000 },
  height: { min: 180, max: 500 },
}

/** The fields whose value is not a number in its range, in form order. Empty when the size is valid. */
export const quickRoomErrors = (size: QuickRoomSize): QuickRoomField[] =>
  (['width', 'length', 'height'] as const).filter((field) => {
    const value = size[field]
    const { min, max } = QUICK_ROOM_LIMITS[field]
    return !Number.isFinite(value) || value < min || value > max
  })

/**
 * The new room, placed: the first room goes at the origin; each later room goes to the right of all
 * existing rooms, its top-left corner on the top end of the rightmost wall. A room of the same length
 * as its neighbour then shares that wall (see `wallsOf`). The width runs along x, the length along y.
 */
export const placeQuickRoom = (plan: Plan, { id, name, width, length, height }: QuickRoomSize & { id?: string; name: string }): Room => {
  const corners = plan.rooms.flatMap((room) => room.corners)
  if (corners.length === 0) return createRectRoom({ id, name, width, length, height })
  const x = Math.max(...corners.map((p) => p.x))
  const y = Math.min(...corners.filter((p) => p.x === x).map((p) => p.y))
  return createRoom({
    id,
    name,
    height,
    corners: [{ x, y }, { x: x + width, y }, { x: x + width, y: y + length }, { x, y: y + length }],
  })
}

/** The plan with the quick room added. Returns a new plan. */
export const addQuickRoom = (plan: Plan, room: QuickRoomSize & { id?: string; name: string }): Plan => ({
  ...plan,
  rooms: [...plan.rooms, placeQuickRoom(plan, room)],
})
