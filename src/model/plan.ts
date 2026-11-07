// The 2D plan: rooms as polygons and the walls derived from their edges.
// Units are centimetres; areas are returned in square metres.

export type Point = { x: number; y: number }

export type Room = {
  id: string
  name: string
  height: number
  corners: Point[]
}

export type Plan = { rooms: Room[] }

// One edge of one or more room polygons. A shared edge lists both rooms.
export type Wall = { a: Point; b: Point; rooms: string[] }

export const createRoom = ({ id = crypto.randomUUID(), name, height, corners }: Omit<Room, 'id'> & { id?: string }): Room => {
  validateOutline(corners)
  return { id, name, height, corners: corners.map((p) => ({ ...p })) }
}

export const createRectRoom = ({ id, name, width, length, height }: { id?: string; name: string; width: number; length: number; height: number }): Room =>
  createRoom({ id, name, height, corners: [{ x: 0, y: 0 }, { x: width, y: 0 }, { x: width, y: length }, { x: 0, y: length }] })

const samePoint = (p: Point, q: Point) => p.x === q.x && p.y === q.y

const edgesOf = (corners: Point[]): [Point, Point][] => corners.map((p, i) => [p, corners[(i + 1) % corners.length]])

export const wallsOf = (plan: Plan): Wall[] => {
  const byKey = new Map<string, Wall>()
  const walls: Wall[] = []
  for (const room of plan.rooms) {
    for (const [a, b] of edgesOf(room.corners)) {
      const ends = [`${a.x},${a.y}`, `${b.x},${b.y}`].sort()
      const key = ends.join('|')
      const existing = byKey.get(key)
      if (existing) {
        if (!existing.rooms.includes(room.id)) existing.rooms.push(room.id)
        continue
      }
      const wall = { a: { ...a }, b: { ...b }, rooms: [room.id] }
      byKey.set(key, wall)
      walls.push(wall)
    }
  }
  return walls
}

export const wallLength = (wall: Wall): number => Math.hypot(wall.b.x - wall.a.x, wall.b.y - wall.a.y)

export const roomArea = (room: Room): number => {
  let twice = 0
  for (const [p, q] of edgesOf(room.corners)) twice += p.x * q.y - q.x * p.y
  return Math.abs(twice) / 2 / 10_000
}

// Moves every corner at `point`, in every room, to `to`. Returns a new plan.
export const moveCorner = (plan: Plan, point: Point, to: Point): Plan => ({
  rooms: plan.rooms.map((room) =>
    room.corners.some((c) => samePoint(c, point))
      ? createRoom({ ...room, corners: room.corners.map((c) => (samePoint(c, point) ? { ...to } : c)) })
      : room,
  ),
})

// ── validation ──────────────────────────────────────────────────────

const cross = (o: Point, a: Point, b: Point) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

const onSegment = (p: Point, a: Point, b: Point) =>
  cross(a, b, p) === 0 && Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) && Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y)

// True when the closed segments share any point.
const segmentsTouch = (p1: Point, p2: Point, q1: Point, q2: Point) => {
  const d1 = cross(q1, q2, p1)
  const d2 = cross(q1, q2, p2)
  const d3 = cross(p1, p2, q1)
  const d4 = cross(p1, p2, q2)
  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0)) && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) return true
  return onSegment(p1, q1, q2) || onSegment(p2, q1, q2) || onSegment(q1, p1, p2) || onSegment(q2, p1, p2)
}

const validateOutline = (corners: Point[]) => {
  if (corners.length < 3) throw new Error('Room outline needs at least 3 corners.')
  const edges = edgesOf(corners)
  if (edges.some(([a, b]) => samePoint(a, b))) throw new Error('Room outline has a zero-length edge.')
  const n = edges.length
  for (let i = 0; i < n; i++) {
    for (let j = i + 1; j < n; j++) {
      const [a, b] = edges[i]
      const [c, d] = edges[j]
      const adjacent = j === i + 1 || (i === 0 && j === n - 1)
      if (!adjacent) {
        if (segmentsTouch(a, b, c, d)) throw new Error('Room outline crosses itself.')
        continue
      }
      // Adjacent edges share one corner; they may only meet there, so the far end of
      // either edge must not lie on the other (an edge doubling back on itself).
      const [farI, farJ] = j === i + 1 ? [a, d] : [b, c]
      if (onSegment(farJ, a, b) || onSegment(farI, c, d)) throw new Error('Room outline crosses itself.')
    }
  }
}
