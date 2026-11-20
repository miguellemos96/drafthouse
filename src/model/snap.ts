// Snap: when the toggle is on, a dragged item snaps to wall faces, to other items' edges and to a
// 5 cm grid, and rotation steps by 15°. See "Placing and moving items" in docs/spec.md.
// The setting is remembered per browser, not in the home file.
import { footprint, type FloorPoint, type Item } from './item.ts'
import { normaliseAngle } from './move.ts'
import { WALL_THICKNESS, type Wall } from './plan.ts'

/** How close an item edge must come to a wall face or another item's edge to snap to it, in cm. */
export const SNAP_DISTANCE = 10
/** The grid a position snaps to when nothing else is in reach, in cm. */
export const SNAP_GRID = 5
/** The rotation step while snap is on, in degrees. */
export const SNAP_ROTATION_STEP = 15

/** A line on the floor that shows what an item snapped to. */
export type Guide = { a: FloorPoint; b: FloorPoint }

/** What one axis of the position snapped to. */
export type SnapTarget = { kind: 'wall'; guide: Guide } | { kind: 'item'; itemId: string; guide: Guide } | { kind: 'grid' }

export type SnapResult = { position: FloorPoint; x: SnapTarget; z: SnapTarget }

type Axis = 'x' | 'z'
type Range = { min: number; max: number }
type Box = Record<Axis, Range>

const other = (axis: Axis): Axis => (axis === 'x' ? 'z' : 'x')

const boxOf = (corners: FloorPoint[]): Box => ({
  x: { min: Math.min(...corners.map((p) => p.x)), max: Math.max(...corners.map((p) => p.x)) },
  z: { min: Math.min(...corners.map((p) => p.z)), max: Math.max(...corners.map((p) => p.z)) },
})

/** The gap between two ranges; 0 or less when they overlap. */
const gap = (a: Range, b: Range) => Math.max(a.min - b.max, b.min - a.max)

const EPSILON = 1e-6

/**
 * The faces of the axis-aligned walls that face along `axis`: each wall has one on either side,
 * half a thickness from its centre line. `facing` is +1 when the face looks towards +axis,
 * so an item on that side touches it with its low edge.
 */
const wallFaces = (walls: Wall[], axis: Axis) =>
  walls.flatMap((wall) => {
    // Plan (x, y) is floor (x, z).
    const [a, b] = [{ x: wall.a.x, z: wall.a.y }, { x: wall.b.x, z: wall.b.y }]
    if (Math.abs(a[axis] - b[axis]) > EPSILON) return [] // not a wall facing along this axis
    const along = other(axis)
    const span = { min: Math.min(a[along], b[along]), max: Math.max(a[along], b[along]) }
    return [1, -1].map((facing) => ({ at: a[axis] + (facing * WALL_THICKNESS) / 2, facing, span }))
  })

const point = (axis: Axis, value: number, alongValue: number): FloorPoint =>
  axis === 'x' ? { x: value, z: alongValue } : { x: alongValue, z: value }

const guideAt = (axis: Axis, value: number, span: Range): Guide => ({ a: point(axis, value, span.min), b: point(axis, value, span.max) })

/** The shift along `axis` and what it snaps to, by the first rule that applies. */
const snapAxis = (axis: Axis, mine: Box, others: { id: string; box: Box }[], walls: Wall[]): { shift: number; target: SnapTarget } | null => {
  const along = other(axis)
  let best: { shift: number; target: SnapTarget } | null = null
  const consider = (shift: number, target: () => SnapTarget) => {
    if (Math.abs(shift) <= SNAP_DISTANCE && (!best || Math.abs(shift) < Math.abs(best.shift))) best = { shift, target: target() }
  }

  // 1. Wall faces the item faces, along a wall that reaches the item.
  for (const face of wallFaces(walls, axis)) {
    if (gap(face.span, mine[along]) > SNAP_DISTANCE) continue
    const edge = face.facing > 0 ? mine[axis].min : mine[axis].max
    consider(face.at - edge, () => ({ kind: 'wall', guide: guideAt(axis, face.at, face.span) }))
  }
  if (best) return best

  // 2. Other items' edges: flush (touching) or aligned, for items next to this one.
  for (const { id, box } of others) {
    if (gap(box[along], mine[along]) > SNAP_DISTANCE) continue
    for (const theirs of [box[axis].min, box[axis].max]) {
      for (const edge of [mine[axis].min, mine[axis].max]) {
        consider(theirs - edge, () => {
          const span = { min: Math.min(mine[along].min, box[along].min), max: Math.max(mine[along].max, box[along].max) }
          return { kind: 'item', itemId: id, guide: guideAt(axis, theirs, span) }
        })
      }
    }
  }
  return best
}

/**
 * Where a dragged item goes while snap is on. `raw` is the position the drag would give without
 * snap. For each of x and z, the first that applies wins: an item edge within 10 cm of a wall face
 * snaps flush to it; else an edge within 10 cm of another item's edge snaps flush or aligned;
 * else the position snaps to the 5 cm grid. The item's rotated footprint is used throughout.
 * Only walls that run along x or z are snapped to.
 */
export function snapPosition(item: Item, raw: FloorPoint, others: Item[], walls: Wall[]): SnapResult {
  const mine = boxOf(footprint({ ...item, position: raw }))
  const neighbours = others.filter((o) => o.id !== item.id).map((o) => ({ id: o.id, box: boxOf(footprint(o)) }))
  const position = { ...raw }
  const targets = {} as Record<Axis, SnapTarget>
  for (const axis of ['x', 'z'] as const) {
    const snapped = snapAxis(axis, mine, neighbours, walls)
    if (snapped) {
      // Rounded past floating-point noise from the rotated footprint, so flush lands on clean numbers.
      position[axis] = Math.round((raw[axis] + snapped.shift) * 1e6) / 1e6 + 0
      targets[axis] = snapped.target
    } else {
      position[axis] = Math.round(raw[axis] / SNAP_GRID) * SNAP_GRID + 0 // + 0: no -0
      targets[axis] = { kind: 'grid' }
    }
  }
  return { position, x: targets.x, z: targets.z }
}

/** The handle's angle while snap is on: the nearest multiple of 15°. */
export const snapRotation = (angle: number): number => normaliseAngle(Math.round(angle / SNAP_ROTATION_STEP) * SNAP_ROTATION_STEP)

/**
 * The rotation after `steps` presses of a rotate key while snap is on: 15° a press,
 * landing on multiples of 15° (from 7°, one press each way gives 15° and 0°).
 */
export const snapStepRotation = (angle: number, steps: number): number => {
  const units = angle / SNAP_ROTATION_STEP
  // Close enough to a multiple counts as on it, so floating-point noise never skips a step.
  const nearest = Math.round(units)
  const base = Math.abs(units - nearest) < EPSILON ? nearest : steps > 0 ? Math.floor(units) : Math.ceil(units)
  return normaliseAngle((base + steps) * SNAP_ROTATION_STEP)
}

export const SNAP_KEY = 'drafthouse.snap'

/** Whether snap was left on in this browser. Off when nothing is saved or storage is blocked. */
export function loadSnap(): boolean {
  try {
    return localStorage.getItem(SNAP_KEY) === 'on'
  } catch {
    return false
  }
}

export function saveSnap(on: boolean): void {
  try {
    localStorage.setItem(SNAP_KEY, on ? 'on' : 'off')
  } catch {
    // Storage blocked or unavailable: the setting lasts until the page closes.
  }
}
