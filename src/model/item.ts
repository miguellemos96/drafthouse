// An item is anything placed in the home: existing furniture or a product.
// Item space: the origin is the centre of the item's footprint at its base,
// +X runs along the width, +Y is up along the height, +Z runs along the depth
// and the item's front faces +Z. All lengths are in cm.

export type Mount = 'floor' | 'wall' | 'ceiling' | 'on-item'

export interface Size {
  width: number
  depth: number
  height: number
}

export interface Product {
  url: string
  price?: number
  currency?: string
  photoUrl?: string
}

export interface Item {
  id: string
  name: string
  templateId: string
  size: Size
  /** Hex colour, for example `#a0522d`. */
  colour: string
  /** Centre of the footprint on the floor plan. */
  position: { x: number; z: number }
  /** Height of the item's base above the floor. */
  elevation: number
  /** Rotation about the vertical axis in degrees, any angle. Same sense as Three.js `rotation.y`. */
  rotation: number
  mount: Mount
  product?: Product
}

export interface FloorPoint {
  x: number
  z: number
}

/** The 4 corners of the item's rotated footprint on the floor, in order around it. */
export function footprint(item: Item): FloorPoint[] {
  const hw = item.size.width / 2
  const hd = item.size.depth / 2
  const angle = (item.rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  const local: FloorPoint[] = [
    { x: -hw, z: -hd },
    { x: hw, z: -hd },
    { x: hw, z: hd },
    { x: -hw, z: hd },
  ]
  return local.map(({ x, z }) => ({
    x: item.position.x + x * cos + z * sin,
    z: item.position.z - x * sin + z * cos,
  }))
}
