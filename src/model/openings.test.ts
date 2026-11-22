import { describe, expect, it } from 'vitest'
import { newHome } from './home.ts'
import {
  addOpening,
  alongWall,
  editOpening,
  moveOpening,
  newOpening,
  openingAt,
  openingProblems,
  openingsOf,
  removeOpening,
  swingArc,
  wallPieces,
  type Door,
  type Opening,
  type Window,
} from './openings.ts'
import { createRoom, moveCorner, wallsOf, type Plan } from './plan.ts'
import { sampleHome } from './sample.ts'
import { fromFile, toFile } from './saveFile.ts'

// One 400 × 300 room, 250 cm high. Its bottom wall runs from (0, 0) to (400, 0).
const room = (height = 250): Plan => ({
  rooms: [createRoom({ id: 'r', name: 'R', height, corners: [{ x: 0, y: 0 }, { x: 400, y: 0 }, { x: 400, y: 300 }, { x: 0, y: 300 }] })],
})
const BOTTOM = { a: { x: 0, y: 0 }, b: { x: 400, y: 0 } }

const window = (id: string, offset: number, more: Partial<Window> = {}): Window => ({
  id, kind: 'window', wall: BOTTOM, offset, width: 120, height: 120, sillHeight: 90, ...more,
})
const door = (id: string, offset: number, more: Partial<Door> = {}): Door => ({
  id, kind: 'door', wall: BOTTOM, offset, width: 80, height: 210, sillHeight: 0, hinge: 'start', swing: 'in', room: 'r', ...more,
})

const place = (plan: Plan, ...openings: Opening[]) =>
  openings.reduce<Plan>((p, o) => {
    const next = addOpening(p, o)
    if (!next) throw new Error(`could not place ${o.id}`)
    return next
  }, plan)

describe('opening rules', () => {
  it('a 400 cm wall takes a 120 cm window at offset 100; a second one at offset 180 is refused, because it would overlap', () => {
    const plan = place(room(), window('w1', 100))
    expect(openingsOf(plan).map((o) => o.id)).toEqual(['w1'])
    expect(openingProblems(plan, window('w2', 180))).toEqual(['overlap'])
    expect(addOpening(plan, window('w2', 180))).toBeNull()
  })

  it('lets two openings touch edge to edge', () => {
    const plan = place(room(), window('w1', 100))
    expect(addOpening(plan, window('w2', 220))).not.toBeNull()
  })

  it('sees an overlap with an opening that names the same wall the other way round', () => {
    // Reversed, offset 100 from (400, 0) spans 180–300 from (0, 0).
    const plan = place(room(), window('w1', 100, { wall: { a: BOTTOM.b, b: BOTTOM.a } }))
    expect(openingProblems(plan, window('w2', 250))).toEqual(['overlap'])
    expect(openingProblems(plan, window('w2', 50))).toEqual([])
  })

  it('keeps the full width between the wall ends', () => {
    expect(openingProblems(room(), window('w', 300))).toEqual(['past-end'])
    expect(openingProblems(room(), window('w', -1))).toEqual(['past-end'])
    expect(openingProblems(room(), window('w', 280))).toEqual([])
  })

  it('refuses a window with sill 90 and height 200 on a 250 cm wall, because 290 > 250', () => {
    expect(openingProblems(room(250), window('w', 100, { height: 200 }))).toEqual(['too-tall'])
    expect(addOpening(room(250), window('w', 100, { height: 200 }))).toBeNull()
    expect(openingProblems(room(250), window('w', 100, { height: 160 }))).toEqual([])
  })

  it('keeps a door on the floor', () => {
    expect(openingProblems(room(), door('d', 100, { sillHeight: 10 }))).toEqual(['door-sill'])
  })

  it('refuses an opening on a wall the plan does not have, and sizes of 0 or less', () => {
    expect(openingProblems(room(), window('w', 0, { wall: { a: { x: 0, y: 0 }, b: { x: 999, y: 0 } } }))).toEqual(['no-wall'])
    expect(openingProblems(room(), window('w', 100, { width: 0 }))).toEqual(['size'])
    expect(openingProblems(room(), window('w', 100, { sillHeight: -5 }))).toEqual(['size'])
  })
})

describe('moveOpening', () => {
  it('dragging a door past the wall end stops it with its edge at the end', () => {
    const plan = place(room(), door('d', 100))
    expect(openingsOf(moveOpening(plan, 'd', 500)!)[0].offset).toBe(320)
    expect(openingsOf(moveOpening(plan, 'd', -50)!)[0].offset).toBe(0)
  })

  it('stops a door against its neighbour, on the side nearest the drag', () => {
    const plan = place(room(), window('w', 200), door('d', 0))
    expect(openingsOf(moveOpening(plan, 'd', 150)!).find((o) => o.id === 'd')!.offset).toBe(120)
    expect(openingsOf(moveOpening(plan, 'd', 300)!).find((o) => o.id === 'd')!.offset).toBe(320)
  })

  it('is refused when the wall has no free place wide enough', () => {
    // A window fills 0–300; then the wall shrinks to 350 cm, leaving 50 cm for an 80 cm door.
    const plan = moveCorner(place(room(), window('w', 0, { width: 300 }), door('d', 310)), { x: 400, y: 0 }, { x: 350, y: 0 })
    expect(moveOpening(plan, 'd', 310)).toBeNull()
    expect(newOpening(plan, 'door', wallsOf(plan)[0], 320, 'x')).toBeNull()
  })

  it('leaves the plan it was given untouched', () => {
    const plan = place(room(), door('d', 100))
    moveOpening(plan, 'd', 200)
    expect(openingsOf(plan)[0].offset).toBe(100)
  })
})

describe('editOpening and removeOpening', () => {
  it('changes the sizes, hinge and swing, and refuses a change that breaks a rule', () => {
    const plan = place(room(), door('d', 100), window('w', 250))
    const edited = editOpening(plan, 'd', { width: 90, hinge: 'end', swing: 'out' })!
    expect(openingsOf(edited)[0]).toMatchObject({ width: 90, hinge: 'end', swing: 'out' })
    expect(editOpening(plan, 'd', { width: 200 })).toBeNull() // runs into the window
    expect(editOpening(plan, 'w', { height: 200 })).toBeNull() // 90 + 200 > 250
    expect(editOpening(plan, 'd', { sillHeight: 5 })).toBeNull()
  })

  it('deletes one opening', () => {
    const plan = place(room(), door('d', 100), window('w', 250))
    expect(openingsOf(removeOpening(plan, 'd')).map((o) => o.id)).toEqual(['w'])
  })
})

describe('newOpening', () => {
  const bottom = () => wallsOf(room())[0]

  it('uses the defaults: door 80 × 210 with sill 0, window 120 × 120 with sill 90, centred where clicked', () => {
    expect(newOpening(room(), 'door', bottom(), 200, 'd')).toMatchObject({ kind: 'door', offset: 160, width: 80, height: 210, sillHeight: 0, room: 'r' })
    expect(newOpening(room(), 'window', bottom(), 200, 'w')).toMatchObject({ kind: 'window', offset: 140, width: 120, height: 120, sillHeight: 90 })
  })

  it('slides in from the wall end when clicked near it', () => {
    expect(newOpening(room(), 'window', bottom(), 390, 'w')!.offset).toBe(280)
  })

  it('is refused on a wall too low for a window', () => {
    expect(newOpening(room(200), 'window', wallsOf(room(200))[0], 200, 'w')).toBeNull()
  })

  it('places a door on a shared wall from the room on the clicked side', () => {
    const plan = sampleHome()
    const shared = wallsOf(plan).find((w) => w.rooms.length === 2)!
    expect((newOpening(plan, 'door', shared, 150, 'd', { x: 410, y: 150 }) as Door).room).toBe('bedroom')
    expect((newOpening(plan, 'door', shared, 150, 'd', { x: 390, y: 150 }) as Door).room).toBe('living')
  })
})

describe('picking', () => {
  it('finds how far along a wall a point lies, and the opening there', () => {
    const plan = place(room(), window('w', 100))
    expect(alongWall(BOTTOM, { x: 150, y: 4 })).toBe(150)
    expect(alongWall(BOTTOM, { x: -30, y: 0 })).toBe(0)
    expect(openingAt(plan, BOTTOM, 150)?.id).toBe('w')
    expect(openingAt(plan, BOTTOM, 50)).toBeUndefined()
  })
})

describe('swingArc', () => {
  it('is a quarter circle around the hinge, as wide as the door, into the room for "in"', () => {
    const plan = place(room(), door('d', 100))
    const arc = swingArc(plan, openingsOf(plan)[0] as Door)!
    expect(arc.centre).toEqual({ x: 100, y: 0 })
    expect(arc.radius).toBe(80)
    expect(arc.startAngle).toBeCloseTo(0) // closed: along the wall towards x = 180
    expect(arc.endAngle).toBeCloseTo(Math.PI / 2) // open: into the room, towards +y
  })

  it('moves to the other edge for an "end" hinge, and outside for "out"', () => {
    const plan = place(room(), door('d', 100, { hinge: 'end', swing: 'out' }))
    const arc = swingArc(plan, openingsOf(plan)[0] as Door)!
    expect(arc.centre).toEqual({ x: 180, y: 0 })
    expect(Math.cos(arc.startAngle)).toBeCloseTo(-1)
    expect(Math.sin(arc.endAngle)).toBeCloseTo(-1) // out of the room, towards −y
  })
})

describe('wallPieces', () => {
  it('builds a wall without openings as one piece', () => {
    const plan = room()
    expect(wallPieces(plan, wallsOf(plan)[0])).toEqual([{ from: 0, to: 400, bottom: 0, top: 250 }])
  })

  it('builds boxes around each hole: beside it, under a window and above it', () => {
    const plan = place(room(), door('d', 20), window('w', 200))
    expect(wallPieces(plan, wallsOf(plan)[0])).toEqual([
      { from: 0, to: 20, bottom: 0, top: 250 },
      { from: 20, to: 100, bottom: 210, top: 250, opening: 'd' },
      { from: 100, to: 200, bottom: 0, top: 250 },
      { from: 200, to: 320, bottom: 0, top: 90, opening: 'w' },
      { from: 200, to: 320, bottom: 210, top: 250, opening: 'w' },
      { from: 320, to: 400, bottom: 0, top: 250 },
    ])
  })

  it('makes one hole for a door on a wall shared by two rooms', () => {
    const plan = sampleHome()
    const shared = wallsOf(plan).find((w) => w.rooms.length === 2)!
    const withDoor = place(plan, newOpening(plan, 'door', shared, 150, 'd')!)
    expect(wallsOf(withDoor).filter((w) => w.rooms.length === 2)).toHaveLength(1)
    expect(wallPieces(withDoor, shared).filter((p) => p.bottom === 0 && p.top === 250)).toHaveLength(2)
  })
})

describe('saving', () => {
  it('a home saved before this change loads, with no openings', () => {
    const old = JSON.stringify({ ...newHome(room()), plan: { rooms: room().rooms } })
    const read = fromFile(old)
    expect(read.ok).toBe(true)
    if (read.ok) expect(openingsOf(read.home.plan)).toEqual([])
  })

  it('keeps doors and windows through export and import', () => {
    const home = newHome(place(room(), door('d', 20), window('w', 200)))
    expect(fromFile(toFile(home))).toEqual({ ok: true, home })
  })

  it('rejects a file with a broken opening', () => {
    const home = JSON.parse(toFile(newHome(place(room(), door('d', 20)))))
    home.plan.openings[0].swing = 'sideways'
    expect(fromFile(JSON.stringify(home))).toEqual({ ok: false, error: 'not-a-home' })
  })
})

describe('moveCorner', () => {
  it('takes the openings on the moved wall with it', () => {
    const plan = place(room(), window('w', 100))
    const moved = moveCorner(plan, { x: 400, y: 0 }, { x: 450, y: 0 })
    expect(openingsOf(moved)[0].wall).toEqual({ a: { x: 0, y: 0 }, b: { x: 450, y: 0 } })
    expect(openingProblems(moved, openingsOf(moved)[0])).toEqual([])
  })
})
