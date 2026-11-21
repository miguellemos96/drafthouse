// Measuring: the distances shown while an item is dragged, and the tape measure.
// See "Measuring" under "Items" → "Placing and moving items" in docs/spec.md.
// Plan points (x, y) are floor points (x, z). All lengths are in cm.
import { footprint, type FloorPoint, type Item } from './item.ts'
import type { Point3 } from './placement.ts'
import type { Wall } from './plan.ts'

/** A side of an item's footprint, in the item's own frame: its front faces +Z, its right is +X. */
export type Side = 'front' | 'back' | 'left' | 'right'

/** A straight line on the floor and its length. */
export type FloorMeasure = { from: FloorPoint; to: FloorPoint; distance: number }

export type WallDistance = FloorMeasure & { side: Side }

export type ItemDistance = FloorMeasure & { itemId: string }

const EPSILON = 1e-9

const SIDES: { side: Side; corners: [number, number]; local: FloorPoint }[] = [
  // Corner indices into footprint(): back-left, back-right, front-right, front-left.
  { side: 'front', corners: [2, 3], local: { x: 0, z: 1 } },
  { side: 'back', corners: [0, 1], local: { x: 0, z: -1 } },
  { side: 'left', corners: [3, 0], local: { x: -1, z: 0 } },
  { side: 'right', corners: [1, 2], local: { x: 1, z: 0 } },
]

const toWorldDirection = (item: Item, { x, z }: FloorPoint): FloorPoint => {
  const angle = (item.rotation * Math.PI) / 180
  const cos = Math.cos(angle)
  const sin = Math.sin(angle)
  return { x: x * cos + z * sin, z: -x * sin + z * cos }
}

const cross = (a: FloorPoint, b: FloorPoint) => a.x * b.z - a.z * b.x
const sub = (a: FloorPoint, b: FloorPoint): FloorPoint => ({ x: a.x - b.x, z: a.z - b.z })
const along = (p: FloorPoint, d: FloorPoint, t: number): FloorPoint => ({ x: p.x + d.x * t, z: p.z + d.z * t })
const mid = (a: FloorPoint, b: FloorPoint): FloorPoint => ({ x: (a.x + b.x) / 2, z: (a.z + b.z) / 2 })

/** How far a ray from `p` along unit `d` travels before it meets the segment a–b, or null if it never does. */
const rayToSegment = (p: FloorPoint, d: FloorPoint, a: FloorPoint, b: FloorPoint): number | null => {
  const e = sub(b, a)
  const denom = cross(d, e)
  if (Math.abs(denom) < EPSILON) return null // parallel: the segment's own ends cover this case
  const ap = sub(a, p)
  const t = cross(ap, e) / denom
  const s = cross(ap, d) / denom
  if (t < -EPSILON || s < -EPSILON || s > 1 + EPSILON) return null
  return Math.max(0, t)
}

/**
 * How far segment p1–p2 can slide along unit `d` before it meets segment a–b, with the two points
 * where it meets. Rays from the side's middle come first, so a straight wall ahead is measured from the middle.
 */
const sweep = (p1: FloorPoint, p2: FloorPoint, d: FloorPoint, a: FloorPoint, b: FloorPoint): FloorMeasure | null => {
  let best: FloorMeasure | null = null
  const consider = (from: FloorPoint, to: FloorPoint, distance: number) => {
    if (!best || distance < best.distance - EPSILON) best = { from, to, distance }
  }
  for (const p of [mid(p1, p2), p1, p2]) {
    const t = rayToSegment(p, d, a, b)
    if (t !== null) consider(p, along(p, d, t), t)
  }
  const back = { x: -d.x, z: -d.z }
  for (const q of [a, b]) {
    const t = rayToSegment(q, back, p1, p2)
    if (t !== null) consider(along(q, back, t), q, t)
  }
  return best
}

const floorEnds = (wall: Wall): [FloorPoint, FloorPoint] => [
  { x: wall.a.x, z: wall.a.y },
  { x: wall.b.x, z: wall.b.y },
]

/**
 * From each side of the item's footprint to the nearest wall straight ahead of that side, in the
 * item's own frame. A side with no wall ahead is left out.
 */
export const wallDistances = (item: Item, walls: Wall[]): WallDistance[] => {
  const corners = footprint(item)
  const result: WallDistance[] = []
  for (const { side, corners: [i, j], local } of SIDES) {
    const d = toWorldDirection(item, local)
    let best: FloorMeasure | null = null
    for (const wall of walls) {
      const [a, b] = floorEnds(wall)
      const hit = sweep(corners[i], corners[j], d, a, b)
      if (hit && (!best || hit.distance < best.distance)) best = hit
    }
    if (best) result.push({ side, ...best })
  }
  return result
}

/** The closest point to `p` on segment a–b. */
const closestOnSegment = (p: FloorPoint, a: FloorPoint, b: FloorPoint): FloorPoint => {
  const e = sub(b, a)
  const lengthSq = e.x * e.x + e.z * e.z
  const s = lengthSq === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x) * e.x + (p.z - a.z) * e.z) / lengthSq))
  return along(a, e, s)
}

const floorDistance = (a: FloorPoint, b: FloorPoint) => Math.hypot(a.x - b.x, a.z - b.z)

const edges = (polygon: FloorPoint[]): [FloorPoint, FloorPoint][] => polygon.map((p, i) => [p, polygon[(i + 1) % polygon.length]])

/** True when `p` lies inside or on the convex polygon. */
const insideConvex = (p: FloorPoint, polygon: FloorPoint[]): boolean => {
  let sign = 0
  for (const [a, b] of edges(polygon)) {
    const c = cross(sub(b, a), sub(p, a))
    if (Math.abs(c) < EPSILON) continue
    if (sign === 0) sign = Math.sign(c)
    else if (Math.sign(c) !== sign) return false
  }
  return true
}

const segmentsCross = (p1: FloorPoint, p2: FloorPoint, q1: FloorPoint, q2: FloorPoint): FloorPoint | null => {
  const d = sub(p2, p1)
  const e = sub(q2, q1)
  const denom = cross(d, e)
  if (Math.abs(denom) < EPSILON) return null
  const qp = sub(q1, p1)
  const t = cross(qp, e) / denom
  const s = cross(qp, d) / denom
  return t >= 0 && t <= 1 && s >= 0 && s <= 1 ? along(p1, d, t) : null
}

/** The shortest line between two footprints. Footprints that overlap are 0 apart. */
const footprintGap = (a: FloorPoint[], b: FloorPoint[]): FloorMeasure => {
  for (const p of a) if (insideConvex(p, b)) return { from: p, to: p, distance: 0 }
  for (const p of b) if (insideConvex(p, a)) return { from: p, to: p, distance: 0 }
  for (const [p1, p2] of edges(a)) {
    for (const [q1, q2] of edges(b)) {
      const hit = segmentsCross(p1, p2, q1, q2)
      if (hit) return { from: hit, to: hit, distance: 0 }
    }
  }
  let best: FloorMeasure | null = null
  const consider = (from: FloorPoint, to: FloorPoint) => {
    const distance = floorDistance(from, to)
    if (!best || distance < best.distance) best = { from, to, distance }
  }
  for (const p of a) for (const [q1, q2] of edges(b)) consider(p, closestOnSegment(p, q1, q2))
  for (const q of b) for (const [p1, p2] of edges(a)) consider(closestOnSegment(q, p1, p2), q)
  return best!
}

/** The nearest other item to `item`, measured between their footprints, or null when there is none. */
export const nearestItem = (item: Item, items: Item[]): ItemDistance | null => {
  const own = footprint(item)
  let best: ItemDistance | null = null
  for (const other of items) {
    if (other.id === item.id) continue
    const gap = footprintGap(own, footprint(other))
    if (!best || gap.distance < best.distance) best = { itemId: other.id, ...gap }
  }
  return best
}

/** Everything shown while `item` is dragged: the walls on each side and the nearest item. */
export const dragDistances = (item: Item, walls: Wall[], items: Item[]): { walls: WallDistance[]; item: ItemDistance | null } => ({
  walls: wallDistances(item, walls),
  item: nearestItem(item, items),
})

// ── tape measure ────────────────────────────────────────────────────

/** The straight-line distance between two points in the home. */
export const pointDistance = (a: Point3, b: Point3): number => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z)

/** The tape measure: no points yet, a first point, or two points and the distance between them. */
export type Tape = { start: Point3 | null; end: Point3 | null }

export const emptyTape = (): Tape => ({ start: null, end: null })

/** A click with the tape: the first click sets the start, the second the end; a third starts again. */
export const tapeClick = (tape: Tape, point: Point3): Tape =>
  tape.start && !tape.end ? { start: tape.start, end: { ...point } } : { start: { ...point }, end: null }

/** The measured distance, once both points are set. */
export const tapeLength = (tape: Tape): number | null => (tape.start && tape.end ? pointDistance(tape.start, tape.end) : null)
