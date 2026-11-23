// Clash warnings: items that overlap each other, go through a wall, or stand in a door's swing.
// See "Overlaps are allowed but flagged" under "Items" → "Placing and moving items" in docs/spec.md.
// A clash is only a warning: it is worked out from the home whenever it is drawn, never saved, and never blocks a move.
// Plan points (x, y) are floor points (x, z). All lengths are in cm.
import { footprint, type FloorPoint, type Item } from './item.ts'
import { openingsOf, swingArc, wallPieces, type Door, type WallRef } from './openings.ts'
import { wallsOf, type Plan, type Wall } from './plan.ts'

/** Shapes must overlap by more than this, in every direction, to clash; touching is fine. */
export const CLASH_TOLERANCE = 1

/** The steps a door's quarter circle is drawn with; the chord error is far below the tolerance. */
const ARC_STEPS = 32

export type Clash =
  | { kind: 'items'; a: string; b: string }
  | { kind: 'wall'; item: string; wall: WallRef }
  | { kind: 'door'; item: string; door: string }

/** How deep two ranges overlap: the shortest push that parts them. Zero or less when they don't. */
const rangeOverlap = (loA: number, hiA: number, loB: number, hiB: number) => Math.min(hiA - loB, hiB - loA)

const project = (shape: FloorPoint[], axis: FloorPoint) => {
  let lo = Infinity
  let hi = -Infinity
  for (const p of shape) {
    const d = p.x * axis.x + p.z * axis.z
    lo = Math.min(lo, d)
    hi = Math.max(hi, d)
  }
  return { lo, hi }
}

/** The axes to test a convex shape on: its edges' normals, plus its own direction when it is a line. */
const axesOf = (shape: FloorPoint[]): FloorPoint[] => {
  const axes: FloorPoint[] = []
  shape.forEach((p, i) => {
    const q = shape[(i + 1) % shape.length]
    const length = Math.hypot(q.x - p.x, q.z - p.z)
    if (length === 0) return
    axes.push({ x: -(q.z - p.z) / length, z: (q.x - p.x) / length })
    if (shape.length === 2) axes.push({ x: (q.x - p.x) / length, z: (q.z - p.z) / length })
  })
  return axes
}

/**
 * How deep two convex shapes on the floor overlap: the shortest push, in any direction, that parts them
 * (separating axes). Zero or less when they don't overlap. A shape of two points is a line, such as a wall.
 */
export const overlapDepth = (a: FloorPoint[], b: FloorPoint[]): number => {
  let depth = Infinity
  for (const axis of [...axesOf(a), ...axesOf(b)]) {
    const pa = project(a, axis)
    const pb = project(b, axis)
    depth = Math.min(depth, rangeOverlap(pa.lo, pa.hi, pb.lo, pb.hi))
    if (depth <= 0) return depth
  }
  return depth
}

const heightOverlap = (item: Item, bottom: number, top: number) => rangeOverlap(item.elevation, item.elevation + item.size.height, bottom, top)

/** True when two items' boxes overlap by more than the tolerance in every direction. */
export const itemsClash = (a: Item, b: Item): boolean =>
  heightOverlap(a, b.elevation, b.elevation + b.size.height) > CLASH_TOLERANCE && overlapDepth(footprint(a), footprint(b)) > CLASH_TOLERANCE

const floorPoint = (p: { x: number; y: number }): FloorPoint => ({ x: p.x, z: p.y })

/** The stretch of floor line from `from` to `to` cm along the wall. */
const wallLine = (wall: Wall, from: number, to: number): FloorPoint[] => {
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  const at = (d: number): FloorPoint => ({ x: wall.a.x + ((wall.b.x - wall.a.x) * d) / length, z: wall.a.y + ((wall.b.y - wall.a.y) * d) / length })
  return [at(from), at(to)]
}

/**
 * True when the item goes through the wall: its footprint crosses the wall's line by more than the
 * tolerance, at a height where the wall is solid (not through a door or window's hole).
 */
export const itemThroughWall = (plan: Plan, item: Item, wall: Wall): boolean => {
  const shape = footprint(item)
  return wallPieces(plan, wall).some(
    (piece) => heightOverlap(item, piece.bottom, piece.top) > CLASH_TOLERANCE && overlapDepth(shape, wallLine(wall, piece.from, piece.to)) > CLASH_TOLERANCE,
  )
}

const distanceToLine = (p: FloorPoint, [a, b]: FloorPoint[]) => {
  const ex = b.x - a.x
  const ez = b.z - a.z
  const lengthSq = ex * ex + ez * ez
  const s = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * ex + (p.z - a.z) * ez) / lengthSq))
  return Math.hypot(p.x - (a.x + ex * s), p.z - (a.z + ez * s))
}

/** The wall a wall-mounted item hangs on: the one nearest the middle of its back. */
const wallItHangsOn = (item: Item, walls: Wall[]): Wall | undefined => {
  const [backLeft, backRight] = footprint(item)
  const back = { x: (backLeft.x + backRight.x) / 2, z: (backLeft.z + backRight.z) / 2 }
  let best: Wall | undefined
  let bestDistance = Infinity
  for (const wall of walls) {
    const distance = distanceToLine(back, [floorPoint(wall.a), floorPoint(wall.b)])
    if (distance < bestDistance) {
      best = wall
      bestDistance = distance
    }
  }
  return best
}

/** The floor a door sweeps as it opens, as a convex shape: its hinge, then points along its arc. */
const swingShape = (plan: Plan, door: Door): FloorPoint[] | null => {
  const arc = swingArc(plan, door)
  if (!arc) return null
  const { centre, radius, startAngle, endAngle } = arc
  const points = Array.from({ length: ARC_STEPS + 1 }, (_, i) => {
    const angle = startAngle + ((endAngle - startAngle) * i) / ARC_STEPS
    return { x: centre.x + radius * Math.cos(angle), z: centre.y + radius * Math.sin(angle) }
  })
  return [floorPoint(centre), ...points]
}

/**
 * Every clash among `items` in `plan`: each pair of overlapping items once, each wall an item goes
 * through, and each door whose swing an item stands in (below the door's top).
 *
 * An item stacked on another stands on its top, so their boxes only touch and they don't clash.
 * A wall-mounted item doesn't clash with the wall it hangs on.
 */
export const findClashes = (plan: Plan, items: Item[]): Clash[] => {
  const clashes: Clash[] = []
  items.forEach((a, i) => {
    for (const b of items.slice(i + 1)) if (itemsClash(a, b)) clashes.push({ kind: 'items', a: a.id, b: b.id })
  })
  const walls = wallsOf(plan)
  for (const item of items) {
    const own = item.mount === 'wall' ? wallItHangsOn(item, walls) : undefined
    for (const wall of walls) {
      if (wall !== own && itemThroughWall(plan, item, wall)) clashes.push({ kind: 'wall', item: item.id, wall: { a: { ...wall.a }, b: { ...wall.b } } })
    }
  }
  for (const door of openingsOf(plan)) {
    if (door.kind !== 'door') continue
    const swing = swingShape(plan, door)
    if (!swing) continue
    for (const item of items) {
      if (heightOverlap(item, door.sillHeight, door.sillHeight + door.height) > CLASH_TOLERANCE && overlapDepth(footprint(item), swing) > CLASH_TOLERANCE) {
        clashes.push({ kind: 'door', item: item.id, door: door.id })
      }
    }
  }
  return clashes
}

/** The ids of the items in any clash. */
export const clashingItemIds = (clashes: Clash[]): Set<string> =>
  new Set(clashes.flatMap((c) => (c.kind === 'items' ? [c.a, c.b] : [c.item])))

/** The ids of the doors an item stands in the swing of. */
export const blockedDoorIds = (clashes: Clash[]): Set<string> => new Set(clashes.flatMap((c) => (c.kind === 'door' ? [c.door] : [])))

/** One thing an item clashes with, as its panel lists it. */
export type ItemClash = { kind: 'item'; itemId: string; name: string } | { kind: 'wall' } | { kind: 'door'; doorId: string }

/** What the item `id` clashes with: the other items (by name), each wall it goes through, each door it blocks. */
export const clashesOf = (clashes: Clash[], items: Item[], id: string): ItemClash[] => {
  const result: ItemClash[] = []
  for (const clash of clashes) {
    if (clash.kind === 'items' && (clash.a === id || clash.b === id)) {
      const other = clash.a === id ? clash.b : clash.a
      result.push({ kind: 'item', itemId: other, name: items.find((item) => item.id === other)?.name ?? '' })
    } else if (clash.kind === 'wall' && clash.item === id) {
      result.push({ kind: 'wall' })
    } else if (clash.kind === 'door' && clash.item === id) {
      result.push({ kind: 'door', doorId: clash.door })
    }
  }
  return result
}
