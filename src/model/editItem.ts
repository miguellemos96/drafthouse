// Editing a placed item: its size, and duplicating it. See "Placing and moving items" in docs/spec.md.
import type { FloorPoint, Item, Size } from './item.ts'
import { ITEM_SIZE_LIMITS } from './newItem.ts'

/** How far a duplicate lands from the original, in cm: this far to the right and this far towards the camera. */
export const DUPLICATE_OFFSET = 20

/** Whether a size, in cm, is a number from 1 to 1000. */
export const isValidSize = (value: number): boolean =>
  Number.isFinite(value) && value >= ITEM_SIZE_LIMITS.min && value <= ITEM_SIZE_LIMITS.max

/** The item with a new size. The position is the footprint's centre, so the centre stays where it is. */
export const resizeItem = (item: Item, size: Partial<Size>): Item => ({ ...item, size: { ...item.size, ...size } })

/** The name of a copy: the original's name with " (2)". */
export const duplicateName = (name: string): string => `${name} (2)`

/**
 * Where a copy goes relative to the original, given the camera's right direction on the floor:
 * 20 cm to the right and 20 cm towards the camera. Towards the camera is the right direction
 * turned a quarter turn: a camera whose right is +X looks along -Z, so it faces from +Z.
 */
export const duplicateOffset = (cameraRight: FloorPoint): FloorPoint => {
  const length = Math.hypot(cameraRight.x, cameraRight.z)
  const right = length > 1e-9 ? { x: cameraRight.x / length, z: cameraRight.z / length } : { x: 1, z: 0 }
  const towards = { x: -right.z, z: right.x }
  return { x: DUPLICATE_OFFSET * (right.x + towards.x), z: DUPLICATE_OFFSET * (right.z + towards.z) }
}

/** A copy of the item with a new id and name, moved by `duplicateOffset`. */
export const duplicateItem = (item: Item, id: string, cameraRight: FloorPoint): Item => {
  const offset = duplicateOffset(cameraRight)
  const copy: Item = {
    ...item,
    id,
    name: duplicateName(item.name),
    size: { ...item.size },
    position: { x: item.position.x + offset.x, z: item.position.z + offset.z },
  }
  if (item.product) copy.product = { ...item.product }
  return copy
}
