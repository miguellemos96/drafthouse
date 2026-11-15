// Free move and rotation of items on the floor. See "Placing and moving items" in docs/spec.md.
// Angles are in degrees, in the same sense as Item.rotation (Three.js `rotation.y`).
import type { FloorPoint } from './item.ts'

/** How far `Q` and `E` turn an item. */
export const ROTATION_STEP = 5

/** An angle in degrees, brought into [0, 360). */
export const normaliseAngle = (degrees: number): number => {
  const angle = ((degrees % 360) + 360) % 360
  return angle === 0 ? 0 : angle // no -0
}

/** Where a dragged item goes: its start position, moved as far as the pointer moved on the floor. */
export const dragPosition = (start: FloorPoint, pointerStart: FloorPoint, pointerNow: FloorPoint): FloorPoint => ({
  x: start.x + (pointerNow.x - pointerStart.x),
  z: start.z + (pointerNow.z - pointerStart.z),
})

/** The rotation after `steps` presses of a rotate key (negative steps turn the other way). */
export const stepRotation = (angle: number, steps: number): number => normaliseAngle(angle + steps * ROTATION_STEP)

/**
 * The angle of a floor point around a centre, in the item's rotation sense:
 * 0° along +X, 90° along -Z.
 */
export const pointerAngle = (centre: FloorPoint, point: FloorPoint): number =>
  normaliseAngle((Math.atan2(-(point.z - centre.z), point.x - centre.x) * 180) / Math.PI)

/** The rotation while the rotate handle is dragged: the start angle, turned as far as the pointer turned around the centre. */
export const rotateByHandle = (startAngle: number, pointerStartAngle: number, pointerNowAngle: number): number =>
  normaliseAngle(startAngle + pointerNowAngle - pointerStartAngle)
