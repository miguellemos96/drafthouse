// Doors and windows on walls. See "Doors and windows" and "Opening" in docs/spec.md.
// An opening names its wall by the wall's two corner points. Its offset is measured from the
// opening's own `wall.a` to its near edge, so the opening spans [offset, offset + width] along a → b.
// Every helper returns a new Plan (or null when the change is refused) and leaves the given one untouched.
import { outwardNormal } from './fade.ts'
import { wallHeight, wallLength, wallsOf, type Plan, type Point, type Wall } from './plan.ts'

export type WallRef = { a: Point; b: Point }

type OpeningBase = {
  id: string
  wall: WallRef
  /** cm from `wall.a` to the opening's near edge. */
  offset: number
  width: number
  height: number
  sillHeight: number
}

export type Window = OpeningBase & { kind: 'window' }

export type Door = OpeningBase & {
  kind: 'door'
  /** The edge the door hangs on: `start` is the edge nearer `wall.a`, `end` the one nearer `wall.b`. */
  hinge: 'start' | 'end'
  /** Into or out of `room`, the room the door was placed from. */
  swing: 'in' | 'out'
  room: string
}

export type Opening = Window | Door
export type OpeningKind = Opening['kind']

export const OPENING_DEFAULTS = {
  door: { width: 80, height: 210, sillHeight: 0 },
  window: { width: 120, height: 120, sillHeight: 90 },
} as const

export type OpeningProblem = 'no-wall' | 'size' | 'past-end' | 'overlap' | 'too-tall' | 'door-sill'

/** The plan's openings; a plan saved before doors and windows existed has none. */
export const openingsOf = (plan: Plan): Opening[] => plan.openings ?? []

const withOpenings = (plan: Plan, openings: Opening[]): Plan => ({ ...plan, openings })

const samePoint = (p: Point, q: Point) => p.x === q.x && p.y === q.y

/** True when `ref` names `wall`, in either direction. */
export const isOnWall = (ref: WallRef, wall: WallRef): boolean =>
  (samePoint(ref.a, wall.a) && samePoint(ref.b, wall.b)) || (samePoint(ref.a, wall.b) && samePoint(ref.b, wall.a))

/** The wall an opening stands on, or undefined when the plan has no such wall. */
export const wallOf = (plan: Plan, ref: WallRef): Wall | undefined => wallsOf(plan).find((wall) => isOnWall(ref, wall))

/** Where `opening` runs along `wall`, measured from `wall.a`. */
export const spanOn = (opening: Opening, wall: WallRef): { start: number; end: number } => {
  if (samePoint(opening.wall.a, wall.a)) return { start: opening.offset, end: opening.offset + opening.width }
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  return { start: length - opening.offset - opening.width, end: length - opening.offset }
}

/** The other openings on the same wall as `opening`, as spans in `opening`'s own direction. */
const neighbourSpans = (plan: Plan, opening: Opening) =>
  openingsOf(plan)
    .filter((other) => other.id !== opening.id && isOnWall(other.wall, opening.wall))
    .map((other) => spanOn(other, opening.wall))

/** Every rule `opening` breaks in `plan`, ignoring an opening with the same id. Empty when it fits. */
export const openingProblems = (plan: Plan, opening: Opening): OpeningProblem[] => {
  const wall = wallOf(plan, opening.wall)
  if (!wall) return ['no-wall']
  const problems: OpeningProblem[] = []
  const { offset, width, height, sillHeight } = opening
  if (![offset, width, height, sillHeight].every(Number.isFinite) || width <= 0 || height <= 0 || sillHeight < 0) return ['size']
  if (offset < 0 || offset + width > wallLength(wall)) problems.push('past-end')
  // Touching edges are fine; only a shared stretch of wall is an overlap.
  if (neighbourSpans(plan, opening).some(({ start, end }) => offset < end && start < offset + width)) problems.push('overlap')
  if (sillHeight + height > wallHeight(plan, wall)) problems.push('too-tall')
  if (opening.kind === 'door' && sillHeight !== 0) problems.push('door-sill')
  return problems
}

/**
 * The valid offset nearest `desired` for `opening` (with its width) on its wall: inside the wall's
 * ends and clear of the other openings. Null when there is no room for it anywhere on that wall.
 */
export const nearestValidOffset = (plan: Plan, opening: Opening, desired: number): number | null => {
  const wall = wallOf(plan, opening.wall)
  if (!wall) return null
  const max = wallLength(wall) - opening.width
  if (max < 0) return null
  const spans = neighbourSpans(plan, opening)
  // The nearest point of a union of closed intervals is the desired point itself or an interval end.
  const candidates = [Math.min(Math.max(desired, 0), max), ...spans.flatMap(({ start, end }) => [start - opening.width, end])]
  const fits = (offset: number) => offset >= 0 && offset <= max && spans.every(({ start, end }) => offset >= end || offset + opening.width <= start)
  let best: number | null = null
  for (const offset of candidates) {
    if (fits(offset) && (best === null || Math.abs(offset - desired) < Math.abs(best - desired))) best = offset
  }
  return best
}

/** The plan with `opening` added, or null when it breaks a rule. */
export const addOpening = (plan: Plan, opening: Opening): Plan | null =>
  openingProblems(plan, opening).length > 0 ? null : withOpenings(plan, [...openingsOf(plan), opening])

const findOpening = (plan: Plan, id: string) => openingsOf(plan).find((o) => o.id === id)

const replace = (plan: Plan, opening: Opening) => withOpenings(plan, openingsOf(plan).map((o) => (o.id === opening.id ? opening : o)))

export type OpeningChanges = Partial<Pick<Opening, 'width' | 'height' | 'sillHeight'>> & Partial<Pick<Door, 'hinge' | 'swing'>>

/** The opening with `changes` applied; hinge and swing only apply to a door. Check it with `openingProblems`. */
export const changeOpening = (opening: Opening, changes: OpeningChanges): Opening => {
  const { hinge, swing, ...sizes } = changes
  return opening.kind === 'door' ? { ...opening, ...sizes, ...(hinge && { hinge }), ...(swing && { swing }) } : { ...opening, ...sizes }
}

/** The plan with the opening's sizes, hinge or swing changed, or null when the change breaks a rule. */
export const editOpening = (plan: Plan, id: string, changes: OpeningChanges): Plan | null => {
  const opening = findOpening(plan, id)
  if (!opening) return null
  const edited = changeOpening(opening, changes)
  return openingProblems(plan, edited).length > 0 ? null : replace(plan, edited)
}

/**
 * The plan with the opening moved to `offset` along its wall. A move that breaks a rule is clamped to
 * the nearest valid offset; null when there is none.
 */
export const moveOpening = (plan: Plan, id: string, offset: number): Plan | null => {
  const opening = findOpening(plan, id)
  if (!opening) return null
  const valid = nearestValidOffset(plan, opening, offset)
  return valid === null ? null : replace(plan, { ...opening, offset: valid })
}

export const removeOpening = (plan: Plan, id: string): Plan => withOpenings(plan, openingsOf(plan).filter((o) => o.id !== id))

/** How far along `wall` (from `wall.a`) the point nearest `point` lies, kept between the wall's ends. */
export const alongWall = (wall: WallRef, point: Point): number => {
  const length = Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)
  const t = ((point.x - wall.a.x) * (wall.b.x - wall.a.x) + (point.y - wall.a.y) * (wall.b.y - wall.a.y)) / length
  return Math.min(Math.max(t, 0), length)
}

/** The opening on `wall` that covers the point `along` cm from `wall.a`, if any. */
export const openingAt = (plan: Plan, wall: WallRef, along: number): Opening | undefined =>
  openingsOf(plan).find((o) => {
    if (!isOnWall(o.wall, wall)) return false
    const { start, end } = spanOn(o, wall)
    return along >= start && along <= end
  })

/**
 * A new door or window with the default sizes, centred on the point `along` cm from `wall.a`, or as
 * near it as it fits. A door is placed from the room on the clicked side (`side`, a point near the
 * wall), and swings into it. Null when the wall has no room for it.
 */
export const newOpening = (plan: Plan, kind: OpeningKind, wall: Wall, along: number, id: string, side?: Point): Opening | null => {
  const sizes = OPENING_DEFAULTS[kind]
  const base = { id, wall: { a: { ...wall.a }, b: { ...wall.b } }, offset: along - sizes.width / 2, ...sizes }
  const opening: Opening = kind === 'window' ? { ...base, kind } : { ...base, kind, hinge: 'start', swing: 'in', room: roomOnSide(plan, wall, side) }
  const offset = nearestValidOffset(plan, opening, opening.offset)
  if (offset === null) return null
  const placed = { ...opening, offset }
  return openingProblems(plan, placed).length > 0 ? null : placed
}

/** Of the wall's rooms, the one on the same side as `side`; the first when there's no side or no match. */
const roomOnSide = (plan: Plan, wall: Wall, side?: Point): string => {
  if (side) {
    const mid = { x: (wall.a.x + wall.b.x) / 2, y: (wall.a.y + wall.b.y) / 2 }
    for (const room of plan.rooms.filter((r) => wall.rooms.includes(r.id))) {
      const n = outwardNormal(room, wall)
      if ((side.x - mid.x) * n.x + (side.y - mid.y) * n.y < 0) return room.id
    }
  }
  return wall.rooms[0]
}

/** The arc a door sweeps on the floor: a quarter circle around its hinge, as wide as the door. Plan coordinates, radians. */
export type SwingArc = { centre: Point; radius: number; startAngle: number; endAngle: number }

export const swingArc = (plan: Plan, door: Door): SwingArc | null => {
  const wall = wallOf(plan, door.wall)
  if (!wall) return null
  const { a, b } = door.wall
  const length = Math.hypot(b.x - a.x, b.y - a.y)
  const dir = { x: (b.x - a.x) / length, y: (b.y - a.y) / length }
  const hingeAt = door.hinge === 'start' ? door.offset : door.offset + door.width
  const centre = { x: a.x + dir.x * hingeAt, y: a.y + dir.y * hingeAt }
  // Closed, the door lies along the wall towards its other edge; open, it points into (or out of) its room.
  const closed = door.hinge === 'start' ? dir : { x: -dir.x, y: -dir.y }
  const room = plan.rooms.find((r) => r.id === door.room && wall.rooms.includes(r.id)) ?? plan.rooms.find((r) => r.id === wall.rooms[0])!
  const out = outwardNormal(room, wall)
  const open = door.swing === 'in' ? { x: -out.x, y: -out.y } : out
  return { centre, radius: door.width, startAngle: Math.atan2(closed.y, closed.x), endAngle: Math.atan2(closed.y, closed.x) + quarterTurn(closed, open) }
}

/** +π/2 when `to` is a quarter turn counter-clockwise from `from`, else −π/2. */
const quarterTurn = (from: Point, to: Point) => (from.x * to.y - from.y * to.x > 0 ? Math.PI / 2 : -Math.PI / 2)

/** One box of a wall: from `from` to `to` cm along the wall (from `wall.a`), `bottom` to `top` cm high. */
export type WallPiece = { from: number; to: number; bottom: number; top: number; opening?: string }

/**
 * The boxes a wall is built from: full-height stretches between its openings, plus the part under
 * each opening (its sill) and above it (its lintel). A wall without openings is one piece.
 */
export const wallPieces = (plan: Plan, wall: Wall): WallPiece[] => {
  const length = wallLength(wall)
  const height = wallHeight(plan, wall)
  const holes = openingsOf(plan)
    .filter((o) => isOnWall(o.wall, wall))
    .map((o) => ({ ...spanOn(o, wall), opening: o }))
    .sort((p, q) => p.start - q.start)
  const pieces: WallPiece[] = []
  let cursor = 0
  for (const { start, end, opening } of holes) {
    if (start > cursor) pieces.push({ from: cursor, to: start, bottom: 0, top: height })
    if (opening.sillHeight > 0) pieces.push({ from: start, to: end, bottom: 0, top: opening.sillHeight, opening: opening.id })
    const head = opening.sillHeight + opening.height
    if (head < height) pieces.push({ from: start, to: end, bottom: head, top: height, opening: opening.id })
    cursor = Math.max(cursor, end)
  }
  if (cursor < length) pieces.push({ from: cursor, to: length, bottom: 0, top: height })
  return pieces
}
